import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const baseEnv = {
  TELEGRAM_BOT_TOKEN: "TOKEN",
  TELEGRAM_WEBHOOK_SECRET: "WEBHOOK_SECRET",
  OWNER_TELEGRAM_ID: "123",
  TODOIST_API_TOKEN: "TODOIST_TOKEN",
  TODOIST_PROJECT_ID: "PROJECT",
  AI: {
    async run(model, args) {
      if (model.includes("whisper")) return { text: "задача: проверить склад" };
      assert.equal(args.messages[0].role, "system");
      return { choices: [{ message: { content: "План: три действия." } }] };
    }
  }
};

function event(payload, secret = "WEBHOOK_SECRET") {
  return new Request("https://example.workers.dev/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(payload)
  });
}

function ctx() {
  const promises = [];
  return {
    promises,
    waitUntil(promise) { promises.push(promise); }
  };
}

function mockApis() {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const payload = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url, payload });
    if (url.endsWith("/getFile")) {
      return Response.json({ ok: true, result: { file_path: "voice.ogg" } });
    }
    if (url.includes("/file/bot")) {
      return new Response(Uint8Array.from([79, 103, 103, 83]));
    }
    if (url.includes("api.todoist.com")) {
      return Response.json({ id: "TASK-1" });
    }
    return Response.json({ ok: true, result: true });
  };
  return { calls, restore() { globalThis.fetch = previous; } };
}

test("health endpoint works without secrets", async () => {
  const response = await worker.fetch(new Request("https://example.workers.dev/health"), {}, ctx());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test("Telegram webhook rejects incorrect secret", async () => {
  const c = ctx();
  const response = await worker.fetch(event({ update_id: 1 }, "INVALID"), baseEnv, c);
  assert.equal(response.status, 403);
  assert.equal(c.promises.length, 0);
});

test("setup calls Telegram setWebhook with secret header", async () => {
  const { calls, restore } = mockApis();
  try {
    const req = new Request("https://example.workers.dev/setup", {
      method: "POST",
      headers: { authorization: "Bearer WEBHOOK_SECRET" }
    });
    const response = await worker.fetch(req, baseEnv, ctx());
    assert.equal(response.status, 200);
    const setWebhook = calls.find(c => c.url.endsWith("/setWebhook"));
    assert.equal(setWebhook.payload.secret_token, "WEBHOOK_SECRET");
    assert.equal(setWebhook.payload.url, "https://example.workers.dev/webhook");
  } finally { restore(); }
});

test("private /id works before owner configuration", async () => {
  const { calls, restore } = mockApis();
  try {
    const c = ctx();
    const update = { update_id: 2, message: {
      from: { id: 123 }, chat: { id: 123, type: "private" }, text: "/id"
    } };
    const response = await worker.fetch(event(update), { ...baseEnv, OWNER_TELEGRAM_ID: "" }, c);
    assert.equal(response.status, 200);
    await Promise.all(c.promises);
    assert.match(calls.find(c => c.url.endsWith("/sendMessage")).payload.text, /123/);
  } finally { restore(); }
});

test("owner can create a scheduled Todoist task", async () => {
  const { calls, restore } = mockApis();
  try {
    const c = ctx();
    const update = { update_id: 3, message: {
      from: { id: 123 }, chat: { id: 123, type: "private" },
      text: "/task завтра в 10:00 | Позвонить Андрею"
    } };
    await worker.fetch(event(update), baseEnv, c);
    await Promise.all(c.promises);
    const task = calls.find(c => c.url.includes("api.todoist.com"));
    assert.equal(task.payload.content, "Позвонить Андрею");
    assert.equal(task.payload.project_id, "PROJECT");
    assert.equal(task.payload.due_string, "завтра в 10:00");
  } finally { restore(); }
});

test("unapproved Telegram user cannot access Todoist or AI", async () => {
  const { calls, restore } = mockApis();
  try {
    const c = ctx();
    const update = { update_id: 4, message: {
      from: { id: 999 }, chat: { id: 999, type: "private" }, text: "/task купить"
    } };
    await worker.fetch(event(update), baseEnv, c);
    await Promise.all(c.promises);
    assert.equal(calls.some(c => c.url.includes("api.todoist.com")), false);
  } finally { restore(); }
});

test("owner can ask AI questions", async () => {
  const { calls, restore } = mockApis();
  try {
    const c = ctx();
    const update = { update_id: 5, message: {
      from: { id: 123 }, chat: { id: 123, type: "private" }, text: "Привет!"
    } };
    await worker.fetch(event(update), baseEnv, c);
    await Promise.all(c.promises);
    assert.match(calls.find(c => c.url.endsWith("/sendMessage")).payload.text, /План/);
  } finally { restore(); }
});

test("voice task gets transcribed and saved", async () => {
  const { calls, restore } = mockApis();
  try {
    const c = ctx();
    const update = { update_id: 6, message: {
      from: { id: 123 }, chat: { id: 123, type: "private" },
      voice: { file_id: "VOICE_1", file_size: 4 }
    } };
    await worker.fetch(event(update), baseEnv, c);
    await Promise.all(c.promises);
    assert.equal(calls.find(c => c.url.includes("api.todoist.com")).payload.content, "проверить склад");
  } finally { restore(); }
});


test("fallback answers when primary model gives empty completion", async () => {
  const { calls, restore } = mockApis();
  const requestedModels = [];
  try {
    const c = ctx();
    const customEnv = {
      ...baseEnv,
      AI: {
        async run(model, args) {
          requestedModels.push({ model, args });
          if (model.includes("glm-4.7-flash")) {
            return { choices: [{ message: { content: "" } }] };
          }
          return { response: "Подбор названия: Сырный дом." };
        }
      }
    };
    const update = { update_id: 7, message: {
      from: { id: 123 }, chat: { id: 123, type: "private" },
      text: "Предложи название для продажи сырной пасты"
    } };
    await worker.fetch(event(update), customEnv, c);
    await Promise.all(c.promises);
    assert.equal(requestedModels.length, 2);
    assert.equal(requestedModels[0].args.chat_template_kwargs.enable_thinking, false);
    assert.match(calls.find(c => c.url.endsWith("/sendMessage")).payload.text, /Сырный дом/);
  } finally { restore(); }
});


test("natural-language voice task calls Todoist with weekend due date", async () => {
  const { calls, restore } = mockApis();
  try {
    const c = ctx();
    const env = {
      ...baseEnv,
      AI: {
        async run(model) {
          if (model.includes("whisper")) {
            return { text: "Так, поставь туда и задачу на выходных в субботу закрыть подавало." };
          }
          throw new Error("Task creation should bypass conversational AI");
        }
      }
    };
    const update = { update_id: 51, message: {
      from: { id: 123 }, chat: { id: 123, type: "private" },
      voice: { file_id: "VOICE_TASK", file_size: 40 }
    } };
    await worker.fetch(event(update), env, c);
    await Promise.all(c.promises);
    const task = calls.find(c => c.url.includes("api.todoist.com"));
    assert.ok(task, "The bot must call Todoist, not just the language model");
    assert.equal(task.payload.content, "закрыть подавало");
    assert.equal(task.payload.due_string, "в субботу");
    const message = calls.find(c => c.url.endsWith("/sendMessage"));
    assert.match(message.payload.text, /Todoist подтвердил создание задачи/);
    assert.match(message.payload.text, /TASK-1/);
  } finally { restore(); }
});

test("status follow-up without a receipt does not claim a task was created", async () => {
  const { calls, restore } = mockApis();
  try {
    const c = ctx();
    const env = {
      ...baseEnv,
      AI: {
        async run() { throw new Error("AI must not answer tool-status question"); }
      }
    };
    const update = { update_id: 52, message: {
      from: { id: 123 }, chat: { id: 123, type: "private" }, text: "Поставил?"
    } };
    await worker.fetch(event(update), env, c);
    await Promise.all(c.promises);
    const msg = calls.find(c => c.url.endsWith("/sendMessage")).payload.text;
    assert.match(msg, /Подтверждения от Todoist нет/);
    assert.equal(calls.filter(c => c.url.includes("api.todoist.com")).length, 0);
  } finally { restore(); }
});

test("a failed Todoist response is never called success", async () => {
  const { calls, restore } = mockApis();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.todoist.com")) {
      return new Response("Unauthorized", { status: 401 });
    }
    return oldFetch(url, init);
  };
  try {
    const c = ctx();
    const update = { update_id: 53, message: {
      from: { id: 123 }, chat: { id: 123, type: "private" },
      text: "Поставь задачу: проверить склад"
    } };
    await worker.fetch(event(update), baseEnv, c);
    await Promise.all(c.promises);
    const msg = calls.find(c => c.url.endsWith("/sendMessage")).payload.text;
    assert.match(msg, /НЕ подтверждена/);
    assert.doesNotMatch(msg, /Todoist подтвердил создание/);
  } finally {
    globalThis.fetch = oldFetch;
    restore();
  }
});
