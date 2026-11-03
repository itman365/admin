// Adrian Telegram bot — Cloudflare Workers, no external npm runtime dependencies.
// Runtime secrets are set in Cloudflare. Never commit them to GitHub.

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
  "Для Todoist есть /task, список команд — /help."
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

function parseTask(text) {
  const raw = text.trim();
  const divider = raw.indexOf("|");
  if (divider < 0) return { title: raw };
  return {
    due: raw.slice(0, divider).trim(),
    title: raw.slice(divider + 1).trim()
  };
}

async function createTask(env, task) {
  if (!env.TODOIST_API_TOKEN) {
    return "Todoist ещё не подключён. Добавь TODOIST_API_TOKEN в секреты Cloudflare.";
  }
  if (!task.title) return "Пустая задача. Пример: /task завтра в 10:00 | Позвонить клиенту";
  const payload = { content: task.title.slice(0, 1000) };
  if (task.due) {
    payload.due_string = task.due;
    payload.due_lang = "ru";
  }
  if (env.TODOIST_PROJECT_ID) payload.project_id = env.TODOIST_PROJECT_ID;
  const response = await fetch("https://api.todoist.com/api/v1/tasks", {
    method: "POST",
    headers: {
      "authorization": "Bearer " + env.TODOIST_API_TOKEN,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 250);
    throw new Error("Todoist " + response.status + " " + detail);
  }
  const result = await response.json();
  return "Задача добавлена" + (env.TODOIST_PROJECT_ID ? " в проект Эдриан" : " во Входящие") +
    ":\n" + task.title + (task.due ? "\nКогда: " + task.due : "") +
    (result.id ? "\nID: " + result.id : "");
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
      "Голосом можно сказать: «Задача: позвонить клиенту».\n" +
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

  let taskText = null;
  if (isCommand(text, "task")) {
    taskText = text.replace(/^\/task(?:@\w+)?\s*/i, "");
  } else {
    const match = text.match(/^\s*(?:задача\s*[:—-]|поставь задачу\s*[:—-]?|запиши задачу\s*[:—-]?|создай задачу\s*[:—-]?)[\s]*(.+)$/i);
    if (match) taskText = match[1];
  }
  if (taskText !== null) {
    const result = await createTask(env, parseTask(taskText));
    await say(env, chatId, result);
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
    await processMessage(env, update);
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
      return json({ ok: true, service: "adrian-telegram-bot" });
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
          allowed_updates: ["message"],
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
