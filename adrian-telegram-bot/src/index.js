// Adrian Telegram bot — Cloudflare Workers, no external npm runtime dependencies.
// Runtime secrets are set in Cloudflare. Never commit them to GitHub.

import {handleAgent,handleAgentCallback} from "./agent-router.js";

const VERSION = "2.0.0";
const CHAT_MODEL = "@cf/zai-org/glm-4.7-flash";
const SPEECH_MODEL = "@cf/openai/whisper-large-v3-turbo";
const MAX_VOICE_BYTES = 4 * 1024 * 1024;
const HISTORY_TTL = 14 * 24 * 60 * 60;
const SYSTEM_PROMPT = [
  "Тебя зовут Эдриан. Ты цифровой помощник предпринимателя Валентина.",
  "Отвечай по-русски, на ты, внятно и живо. Помогай как маркетолог и стратег, без лести, псевдомотивации и канцелярита.",
  "Давай готовое решение, когда хватает данных; при необходимости задай один конкретный вопрос.",
  "Запросы по КСБ-МОДУЛЬ и ЦИТО — разные проекты, не смешивай их самовольно.",
  "Не изображай человека, не утверждай, что спишь или живёшь отдельно от общения.",
  "Не утверждай, что помнишь прошлые чаты ChatGPT или имеешь доступ к чужим аккаунтам.",
  "Если контекста не хватает, честно уточни; не придумывай факты и сделанные действия.",
  "Для Todoist есть /task, список команд — /help.",
  "Ты никогда не создаёшь задачи и не вызываешь внешние сервисы самостоятельно.",
  "Задачи создаёт отдельная программа до обращения к тебе; не говори «задача создана», «записал», «отправил», «сделано» без подтверждённого результата внешнего сервиса.",
  "Не выдумывай тарифы, правила конфиденциальности и отсутствие хранения записей. Если не знаешь — скажи об этом."
].join(" ");

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

async function telegram(env, method, payload) {
  const response = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error("Telegram " + method + ": " + (result.description || response.status));
  }
  return result.result;
}

async function say(env, chatId, text) {
  const chunks = String(text || "Нет ответа.").match(/[\s\S]{1,3800}/g) || ["Нет ответа."];
  for (const chunk of chunks) {
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: chunk,
      link_preview_options: { is_disabled: true }
    });
  }
}

function localISODate(now = new Date(), timezone = "Europe/Moscow") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const get = (name) => parts.find(part => part.type === name)?.value;
  return get("year") + "-" + get("month") + "-" + get("day");
}

function shiftISODate(iso, delta) {
  const date = new Date(iso + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function nextWeekdayISO(dayName, now = new Date()) {
  // 0 = Sunday, 6 = Saturday. Explicit date prevents Todoist's
  // natural-language parser from silently losing a due date.
  const weekdays = {
    "воскресенье": 0, "понедельник": 1, "вторник": 2,
    "среду": 3, "четверг": 4, "пятницу": 5, "субботу": 6
  };
  const target = weekdays[dayName.toLowerCase()];
  if (target === undefined) return null;
  const todayISO = localISODate(now);
  const todayDay = new Date(todayISO + "T12:00:00Z").getUTCDay();
  return shiftISODate(todayISO, (target - todayDay + 7) % 7);
}

function normalizeTaskAction(raw) {
  let title = String(raw || "").trim().replace(/^[,;:—\s]+/, "");
  // "напомни, чтобы я оплатил дороги" -> "оплатить дороги"
  const purpose = title.match(/^(?:чтоб|чтобы)\s+(?:я\s+)?(оплатил|заплатил|купил|сделал|позвонил|заехал|проверил|отправил|забрал|заказал|передал)\s+(.+)$/i);
  if (purpose) {
    const verbs = {
      "оплатил": "Оплатить", "заплатил": "Заплатить", "купил": "Купить",
      "сделал": "Сделать", "позвонил": "Позвонить", "заехал": "Заехать",
      "проверил": "Проверить", "отправил": "Отправить", "забрал": "Забрать",
      "заказал": "Заказать", "передал": "Передать"
    };
    title = verbs[purpose[1].toLowerCase()] + " " + purpose[2];
  } else if (/^чтоб(?:ы)?\s/i.test(title)) {
    // Do not save a malformed subordinate clause as a task.
    return { title: title, needsClarification: true };
  }
  return { title, needsClarification: false };
}

function parseTask(text, now = new Date()) {
  let raw = String(text || "").trim().replace(/[.?!]+$/, "");
  const wantsReminder = /напомни|напоминани|уведомлен|звуков|сигнал|пилик|оповещен/i.test(raw);
  // Voice transcription frequently includes the destination as part of the title.
  raw = raw.replace(/^(?:(?:в|на)\s+)?(?:todoist|тудуист[еи]?|тудуист|тудаист[еи]?)(?:\s+|$)/i, "").trim();

  const divider = raw.indexOf("|");
  if (divider >= 0) {
    const dueText = raw.slice(0, divider).trim();
    const parsed = parseTask(dueText + " " + raw.slice(divider + 1).trim(), now);
    if (parsed.dueDate || parsed.dueDateTime) return { ...parsed, wantsReminder };
    return { title: raw.slice(divider + 1).trim(), due: dueText, wantsReminder };
  }

  // Strip a trailing reminder instruction, not the action itself.
  raw = raw.replace(/\s+пусть\s+вот\s+.*(?:звуков|пилик|напоминани|уведомлен).*$/i, "").trim();
  raw = raw.replace(/\s+чтоб(?:ы)?\s+.*(?:звуков|пилик|напоминани|уведомлен).*$/i, "").trim();
  raw = raw.replace(/\s+чтобы\s+(?:пришло|было|был)\s+(?:мне\s+)?(?:звуковое\s+)?(?:напоминание|уведомление|звуковой\s+сигнал)(?:\s.*)?$/i, "").trim();

  const prefix = raw.match(/^(?:(?:на\s+выходных\s+)?(?:в\s+эту\s+|в\s+следующую\s+|на\s+эту\s+|на\s+следующую\s+|в\s+|на\s+)?(?:субботу|воскресенье|понедельник|вторник|среду|четверг|пятницу)|(?:на\s+)?(?:сегодня|завтра|послезавтра))(?=[\s,;:.—-]|$)/i);
  let day = null;
  if (prefix) {
    const label = prefix[0].trim();
    const weekday = label.match(/субботу|воскресенье|понедельник|вторник|среду|четверг|пятницу/i);
    if (weekday) {
      day = nextWeekdayISO(weekday[0], now);
      if (/следующую/i.test(label)) day = shiftISODate(day, 7);
    } else {
      day = shiftISODate(localISODate(now), /послезавтра/i.test(label) ? 2 : /завтра/i.test(label) ? 1 : 0);
    }
    raw = raw.slice(prefix[0].length).trim().replace(/^[,:—-]\s*/, "");
  }

  // Handle "сегодня в 9.05", "на сегодня 9:05", "в 905", and "9.05 по Москве".
  // Accept natural spoken qualifier order:
  // "в 12.30 днём по Москве", "часов на 11 по Москве дня", "в 905".
  const clock = raw.match(/^(?:(?:часов|часа|час)\s+)?(?:(?:в|к|на)\s+)?(\d{1,2})(?:[.:](\d{1,2}))?(?:\s*(?:часов|часа|ч))?(?:\s+(?:по\s+Москве|по\s+московскому\s+времени|МСК|дн[её]м|дня|утра|вечера|ночи)){0,3}(?=[\s,;:.—-]|$)/i) ||
    raw.match(/^(?:(?:часов|часа|час)\s+)?(?:(?:в|к|на)\s+)?(\d{3,4})(?:\s+(?:по\s+Москве|по\s+московскому\s+времени|МСК|дн[её]м|дня|утра|вечера|ночи)){0,3}(?=[\s,;:.—-]|$)/i);
  let clockValue = null;
  if (clock) {
    const digits = clock[1];
    const compact = digits.length >= 3;
    const hour = compact ? Number(digits.slice(0, -2)) : Number(digits);
    const minute = compact ? Number(digits.slice(-2)) : Number(clock[2] || "0");
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      clockValue = String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
      raw = raw.slice(clock[0].length).trim().replace(/^[,:—-]\s*/, "");
      if (!day) day = localISODate(now);
    }
  }

  // The action is the title; date, time and destination are NEVER saved in it.
  const suspiciousSchedule = /^(?:(?:на|в)\s+)?(?:сегодня|завтра|послезавтра)(?=[\s,;:.—-]|$)|^(?:(?:часов|часа|час)\s+)?(?:в|к|на)\s+\d+(?=[\s,;:.—-]|$)/i;
  if (suspiciousSchedule.test(raw)) return { title: raw, needsClarification: true, wantsReminder };
  const action = normalizeTaskAction(raw);
  const title = action.title;
  if (action.needsClarification) {
    return { title, wantsReminder, needsClarification: true };
  }
  if (!title) return { title: "", wantsReminder };
  if (!day) return { title, due: null, wantsReminder };
  if (!clockValue) return { title, due: day, dueDate: day, wantsReminder };

  // Fixed clock time in Moscow (UTC+03:00). Due datetime is sent to Todoist
  // as a proper UTC ISO timestamp, independent of Worker server timezone.
  const dueDateTime = new Date(day + "T" + clockValue + ":00+03:00").toISOString();
  return { title, due: day + " " + clockValue + " МСК", dueDateTime, wantsReminder };
}

function extractTaskRequest(text) {
  if (isCommand(text, "task")) {
    return { raw: text.replace(/^\/task(?:@\w+)?\s*/i, ""), forceReminder: false };
  }
  const original = String(text || "").trim();
  // Whisper can mishear the wake name ("Андрей" instead of "Эдриан").
  // Don't correct the name in an actionable instruction; strip vocatives.
  const cleaned = original
    .replace(/^(?:(?:так|ну|слушай|эдриан|адриан|андрей)\s*[,!.:—-]*\s+)+/i, "")
    .replace(/^[А-ЯЁ][а-яё]+\s*[,!:—-]\s*(?=(?:напомни|поставь|создай|добавь|запиши|внеси)\b)/iu, "")
    .trim();
  const direct = cleaned.match(/^задача\s*[:—-]\s*(.*)$/i);
  if (direct) return { raw: direct[1], forceReminder: false };

  const reminder = cleaned.match(/^(?:напомни(?:-ка)?|напомнить|сделай\s+напоминание|не\s+дай\s+мне\s+забыть)(?:\s+(?:мне|пожалуйста))?[\s,:—-]*(.+)$/i);
  if (reminder) return { raw: reminder[1], forceReminder: true };

  const imperative = cleaned.match(/^(?:поставь|добавь|создай|запиши|внеси|закинь)(?:\s+\S+){0,12}?\s+(?:задачу|задачку)\s*[:—-]?\s*(.*)$/i);
  return imperative ? { raw: imperative[1], forceReminder: false } : null;
}

async function rememberTaskReceipt(env, userId, data) {
  if (!env.HISTORY) return;
  try {
    await env.HISTORY.put("last_task:" + userId, JSON.stringify(data), {
      expirationTtl: 7 * 24 * 60 * 60
    });
  } catch (error) {
    console.error("Could not save task receipt", String(error));
  }
}

async function getTaskReceipt(env, userId) {
  if (!env.HISTORY) return null;
  try {
    const raw = await env.HISTORY.get("last_task:" + userId);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

async function createTask(env, task) {
  if (!env.TODOIST_API_TOKEN) {
    return { ok: false, message: "Todoist ещё не подключён. Добавь TODOIST_API_TOKEN в секреты Cloudflare. Задача НЕ создана." };
  }
  if (!task.title) {
    return { ok: false, message: "Пустая задача. Например: /task сегодня в 9.05 заехать к клиенту" };
  }
  const payload = { content: task.title.slice(0, 1000) };
  if (task.dueDateTime) {
    payload.due_datetime = task.dueDateTime;
  } else if (task.dueDate) {
    payload.due_date = task.dueDate;
  } else if (task.due) {
    payload.due_string = task.due;
    payload.due_lang = "ru";
  }
  if (env.TODOIST_PROJECT_ID) payload.project_id = env.TODOIST_PROJECT_ID;
  const headers = {
    authorization: "Bearer " + env.TODOIST_API_TOKEN,
    "content-type": "application/json"
  };
  const response = await fetch("https://api.todoist.com/api/v1/tasks", {
    method: "POST", headers, body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 150);
    throw new Error("Todoist отклонил создание (" + response.status + "). Задача НЕ подтверждена. " + detail);
  }
  const result = await response.json();
  if (!result?.id) {
    throw new Error("Todoist не вернул ID задачи. Проверь список до повтора.");
  }
  if (env.TODOIST_PROJECT_ID && result.project_id && result.project_id !== env.TODOIST_PROJECT_ID) {
    throw new Error("Todoist создал задачу в другом проекте (ID " + result.id + "). Проверь список.");
  }

  const dateVerified = !task.due || Boolean(result.due?.date);
  let message = "Todoist подтвердил создание задачи (ID " + result.id + "):\n" +
    task.title + "\nПроект: " + (env.TODOIST_PROJECT_ID ? "Эдриан" : "Входящие");
  if (task.due) message += dateVerified
    ? "\nВремя/дата: " + task.due
    : "\nВНИМАНИЕ: Todoist не вернул дату/время, проверь задачу.";

  if (task.wantsReminder) {
    if (!task.dueDateTime) {
      message += "\nPush-напоминание НЕ создано: назови конкретное время.";
    } else if (!dateVerified) {
      message += "\nPush-напоминание НЕ создано: Todoist не подтвердил время задачи.";
    } else {
      try {
        const reminderRes = await fetch("https://api.todoist.com/api/v1/reminders", {
          method: "POST", headers,
          body: JSON.stringify({
            task_id: String(result.id),
            reminder_type: "relative",
            minute_offset: 0,
            service: "push"
          })
        });
        const data = await reminderRes.json().catch(() => ({}));
        if (!reminderRes.ok || !data?.id) throw new Error("Todoist не подтвердил напоминание");
        message += "\nPush-напоминание создано на момент задачи (ID " + data.id + ")." +
          "\nЗвук зависит от настроек Todoist и телефона.";
      } catch (error) {
        console.error("Reminder creation failed", String(error));
        message += "\nPush-напоминание НЕ создано. Проверь разрешения и возможности Todoist.";
      }
    }
  }
  return { ok: true, id: String(result.id), message };
}

function toBase64(bytes) {
  let encoded = "";
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 16384) {
    encoded += String.fromCharCode.apply(null, view.subarray(i, i + 16384));
  }
  return btoa(encoded);
}

async function transcribeVoice(env, voice) {
  if (voice.file_size && voice.file_size > MAX_VOICE_BYTES) {
    throw new Error("Голосовое слишком большое (лимит 4 МБ).");
  }
  const file = await telegram(env, "getFile", { file_id: voice.file_id });
  if (!file.file_path) throw new Error("Telegram не вернул путь голосового.");
  const response = await fetch("https://api.telegram.org/file/bot" +
    env.TELEGRAM_BOT_TOKEN + "/" + file.file_path);
  if (!response.ok) throw new Error("Не удалось скачать голосовое из Telegram.");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_VOICE_BYTES) throw new Error("Голосовое слишком большое (лимит 4 МБ).");
  const result = await env.AI.run(SPEECH_MODEL, {
    audio: toBase64(buffer),
    task: "transcribe",
    language: "ru"
  });
  const transcript = (result && result.text || "").trim();
  if (!transcript) throw new Error("Не удалось распознать речь. Попробуй записать ещё раз.");
  return transcript;
}

async function getHistory(env, userId) {
  if (!env.HISTORY) return [];
  try {
    const data = await env.HISTORY.get("chat:" + userId);
    const history = JSON.parse(data || "[]");
    return Array.isArray(history) ? history.slice(-10) : [];
  } catch (_) {
    return [];
  }
}

async function remember(env, userId, history) {
  if (!env.HISTORY) return;
  try {
    await env.HISTORY.put("chat:" + userId, JSON.stringify(history.slice(-10)), {
      expirationTtl: HISTORY_TTL
    });
  } catch (error) {
    console.error("History storage failed", String(error));
  }
}

function getTextFromAIResult(result) {
  if (!result || typeof result !== "object") return "";
  const message = result.choices?.[0]?.message;
  const content = message?.content ?? result.response ?? result.output_text ?? "";
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.filter(part => part?.type === "text" && typeof part.text === "string")
      .map(part => part.text).join("\n").trim();
  }
  return "";
}

async function askAI(env, userId, prompt) {
  const history = await getHistory(env, userId);
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: prompt }
  ];

  // GLM reasoning is enabled by default; small generation limits can be spent
  // entirely on reasoning, leaving assistant content empty. Disable thinking.
  let clean = "";
  let primaryError = null;
  try {
    const response = await env.AI.run(CHAT_MODEL, {
      messages,
      max_completion_tokens: 1100,
      chat_template_kwargs: { enable_thinking: false },
      temperature: 0.55
    });
    clean = getTextFromAIResult(response);
  } catch (error) {
    primaryError = error;
    console.error("Primary Workers AI call failed", String(error));
  }

  // One fallback keeps the bot responsive if the primary returns an empty answer.
  if (!clean) {
    try {
      const response = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
        messages,
        max_completion_tokens: 900,
        chat_template_kwargs: { enable_thinking: false },
        temperature: 0.6
      });
      clean = getTextFromAIResult(response);
    } catch (error) {
      console.error("Fallback Workers AI call failed", String(error));
      if (primaryError) console.error("Original model failed too");
    }
  }

  if (!clean) throw new Error("ИИ не вернул текст. Повтори запрос через минуту.");
  await remember(env, userId, [...history,
    { role: "user", content: prompt.slice(0, 6000) },
    { role: "assistant", content: clean.slice(0, 6000) }
  ]);
  return clean;
}

function isCommand(text, command) {
  return new RegExp("^/" + command + "(?:@\\w+)?(?:\\s|$)", "i").test(text);
}

async function processMessage(env, update) {
  const msg = update && update.message;
  if (!msg || !msg.from || !msg.chat || msg.chat.type !== "private") return;
  const userId = String(msg.from.id);
  const chatId = msg.chat.id;
  let text = typeof msg.text === "string" ? msg.text.trim() : "";

  // The identity command is the only one available before owner configuration.
  if (isCommand(text, "id")) {
    await say(env, chatId, "Твой Telegram ID: " + userId);
    return;
  }
  if (!env.OWNER_TELEGRAM_ID || userId !== String(env.OWNER_TELEGRAM_ID)) {
    await say(env, chatId, "Закрытый бот. Напиши /id, чтобы узнать свой Telegram ID.");
    return;
  }

  if (isCommand(text, "start") || isCommand(text, "help")) {
    await say(env, chatId,
      "Эдриан на связи.\n\n" +
      "Просто пиши или отправляй голосовые — отвечу.\n" +
      "/task Купить материалы — создать задачу в Todoist\n" +
      "/task завтра в 10:00 | Позвонить Андрею — задача со сроком\n" +
      "Голосом можно сказать: «Напомни завтра в 12:30 оплатить дороги».\n" +
      "/tasks — активные задачи, /today — на сегодня\n" +
      "/digest — сегодня и просрочка, /projects — проекты\n" +
      "/done <ID> — завершить с подтверждением\n" +
      "/delete <ID> — удалить с подтверждением\n" +
      "/move <ID> | завтра в 12:00 — перенести срок\n" +
      "/confirm — подтвердить последнее действие, /cancel — отменить\n" +
      "/note текст — сохранить заметку, /notes — прочитать\n" +
      "/status — диагностика подключений\n" +
      "/reset — стереть краткую историю переписки\n" +
      "/id — узнать свой Telegram ID\n" +
      "/help — эта подсказка");
    return;
  }
  if (isCommand(text, "reset")) {
    if (env.HISTORY) await env.HISTORY.delete("chat:" + userId);
    await say(env, chatId, "История этого Telegram-бота сброшена.");
    return;
  }

  let fromVoice = false;
  if (msg.voice) {
    fromVoice = true;
    await telegram(env, "sendChatAction", { chat_id: chatId, action: "typing" });
    text = await transcribeVoice(env, msg.voice);
  }
  if (!text) {
    await say(env, chatId, "Пока понимаю текстовые и голосовые сообщения.");
    return;
  }
  if (text.length > 16000) {
    await say(env, chatId, "Сообщение слишком длинное. Раздели его на части.");
    return;
  }

  const newAgentHandled = await handleAgent(env,userId,chatId,text,{say,telegram});
  if (newAgentHandled) return;

  const request = extractTaskRequest(text);
  if (request) {
    const task = parseTask(request.raw);
    task.wantsReminder = task.wantsReminder || request.forceReminder || /напомни|напоминани|уведомлен|звуков|сигнал|пилик|оповещен/i.test(text);
    if (task.needsClarification) {
      await say(env, chatId, "Не удалось разобрать дату или время. Задача НЕ создана. Повтори: «Сегодня в 11:00 купить Виктору свёрла и перо».");
      return;
    }
    if (!task.title) {
      await say(env, chatId, "Не расслышал название задачи. Скажи ещё раз: «Поставь задачу: позвонить Андрею».");
      return;
    }
    if (task.wantsReminder && !task.dueDateTime) {
      await say(env, chatId, "Это напоминание, но я не разобрал точную дату и время. Ничего не создавал. Скажи: «Напомни сегодня в 12:30 оплатить платные дороги».");
      return;
    }
    let result;
    try {
      result = await createTask(env, task);
    } catch (error) {
      await rememberTaskReceipt(env, userId, { ok: false, message: String(error.message || error) });
      throw error;
    }
    await rememberTaskReceipt(env, userId, result);
    await say(env, chatId, fromVoice ? "Распознал: " + text + "\n\n" + result.message : result.message);
    return;
  }

  // Answer follow-up status questions from a real Todoist receipt, not from
  // model-generated prose that may falsely claim completion.
  if (/^\s*(?:ну\s+)?(?:поставил(?:а)?|записал(?:а)?|добавил(?:а)?|создал(?:а)?|задач[ау]\s+(?:создал|добавил|поставил))\s*[?!.\s]*$/i.test(text)) {
    const receipt = await getTaskReceipt(env, userId);
    await say(env, chatId, receipt
      ? receipt.message
      : "Подтверждения от Todoist нет. Раньше бот мог ошибочно написать, что задача создана. Повтори поручение с фразой «поставь задачу».");
    return;
  }

  // Never let a missed command become a fabricated "done" from the chat model.
  if (/(?:^|[\\s,!:—-])(?:напомни|напомнить|напоминание|поставь\\s+задачу|создай\\s+задачу|запиши\\s+задачу)(?=[\\s,!:—-]|$)/i.test(text)) {
    await say(env, chatId, "Похоже на поручение, но я не смог разобрать его надёжно. Задачу и напоминание НЕ создавал. Переформулируй: «Напомни сегодня в 12:30 оплатить платные дороги».");
    return;
  }

  await telegram(env, "sendChatAction", { chat_id: chatId, action: "typing" });
  const answer = await askAI(env, userId, text);
  await say(env, chatId, fromVoice ? "Распознал: " + text + "\n\n" + answer : answer);
}

async function processUpdate(env, update) {
  try {
    if (env.HISTORY && Number.isSafeInteger(update.update_id)) {
      const key = "update:" + update.update_id;
      if (await env.HISTORY.get(key)) return;
      await env.HISTORY.put(key, "1", { expirationTtl: 86400 });
    }
    if (update.callback_query) {
      await handleAgentCallback(env,update.callback_query,{say,telegram});
    } else {
      await processMessage(env, update);
    }
  } catch (error) {
    console.error("Bot processing error", String(error));
    const id = update && update.message && update.message.chat && update.message.chat.id;
    if (id && update.message.chat.type === "private" &&
        String(update.message.from && update.message.from.id) === String(env.OWNER_TELEGRAM_ID)) {
      try { await say(env, id, "Ошибка обработки: " + String(error.message || error).slice(0, 220)); }
      catch (_) { /* no fallback channel */ }
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === "/health" && request.method === "GET") {
      return json({ ok: true, service: "adrian-telegram-bot", version: VERSION });
    }
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
      return json({ ok: false, error: "Telegram secrets not configured" }, 503);
    }
    if (path === "/setup" && request.method === "POST") {
      if (request.headers.get("authorization") !== "Bearer " + env.TELEGRAM_WEBHOOK_SECRET) {
        return json({ ok: false }, 403);
      }
      const webhook = new URL("/webhook", request.url).toString();
      try {
        const result = await telegram(env, "setWebhook", {
          url: webhook,
          secret_token: env.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: ["message", "callback_query"],
          drop_pending_updates: true,
          max_connections: 10
        });
        return json({ ok: Boolean(result), webhook });
      } catch (error) {
        return json({ ok: false, error: String(error.message || error) }, 502);
      }
    }
    if (path === "/webhook" && request.method === "POST") {
      if (request.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
        return json({ ok: false }, 403);
      }
      let update;
      try { update = await request.json(); }
      catch (_) { return json({ ok: false, error: "Invalid JSON" }, 400); }
      ctx.waitUntil(processUpdate(env, update));
      return json({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  }
};
