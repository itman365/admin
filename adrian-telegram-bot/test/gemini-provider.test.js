import test from "node:test";
import assert from "node:assert/strict";
import {generateWithGemini} from "../src/gemini-provider.js";
import {safePlan} from "../src/task-engine.js";
import worker from "../src/index.js";

test("Gemini uses free-tier model and never places API key in body", async () => {
  const old = globalThis.fetch;
  let called=0;
  globalThis.fetch=async (url, options={})=>{
    called++;
    assert.match(String(url),/models\/gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(options.headers["x-goog-api-key"],"PRIVATE_FAKE_KEY");
    assert.doesNotMatch(options.body,/PRIVATE_FAKE_KEY/);
    const body=JSON.parse(options.body);
    assert.equal(body.generationConfig.responseMimeType,"application/json");
    assert.equal(body.contents[0].role,"user");
    return Response.json({candidates:[{content:{parts:[{text:'{"operation":"chat"}'}]}}]});
  };
  try {
    const reply=await generateWithGemini({GEMINI_API_KEY:"PRIVATE_FAKE_KEY"},
      [{role:"system",content:"JSON only"},{role:"user",content:"hi"}],{json:true});
    assert.equal(reply,'{"operation":"chat"}');
    assert.equal(called,1);
  } finally { globalThis.fetch=old; }
});
test("Without Gemini secret, no Gemini HTTP request is attempted",async()=>{
  const old=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error("unexpected network call")};
  try{assert.equal(await generateWithGemini({},[{role:"user",content:"hi"}]),null);}
  finally{globalThis.fetch=old;}
});
test("Gemini API refuses dynamic model endpoint injection",async()=>{
  await assert.rejects(()=>generateWithGemini({GEMINI_API_KEY:"FAKE",GEMINI_MODEL:"https://evil.example/"},
    [{role:"user",content:"hi"}]),/model name rejected/);
});
test("Planner rejects weekday mismatch and relative-date hallucination",()=>{
  const today="2026-11-05";
  const p={operation:"create",title:"Позвонить",date:"2026-11-08",time:"12:00"};
  assert.match(safePlan(p,"Поставь задачу в субботу позвонить",today).reason,/днём недели/);
  assert.match(safePlan(p,"Поставь задачу завтра позвонить",today).reason,/Дата не соответствует/);
});
test("Recurring instruction cannot be accidentally created as one-off task",()=>{
  const p=safePlan({operation:"create",title:"Позвонить",date:"2026-11-07",time:"12:00"},
    "Поставь задачу каждую субботу позвонить", "2026-11-05");
  assert.equal(p.operation,"unknown");
  assert.match(p.reason,/Повторяющийся/);
});
test("Worker falls back to existing Workers AI chat if Gemini free quota is reached",async()=>{
  const original=globalThis.fetch;
  let workersCalls=0,geminiCalls=0;
  const out=[];
  globalThis.fetch=async(url,opts={})=>{
    const u=String(url);
    if(u.includes("generativelanguage.googleapis.com")){
      geminiCalls++;
      return Response.json({error:{message:"quota"}},{status:429});
    }
    if(u.endsWith("/sendChatAction"))return Response.json({ok:true,result:true});
    if(u.endsWith("/sendMessage")){
      out.push(JSON.parse(opts.body).text);
      return Response.json({ok:true,result:true});
    }
    throw Error("Unexpected call "+u);
  };
  try {
    const env={TELEGRAM_BOT_TOKEN:"FAKE_BOT",TELEGRAM_WEBHOOK_SECRET:"FAKE_WEBHOOK",
      OWNER_TELEGRAM_ID:"123",GEMINI_API_KEY:"PRIVATE_FAKE_KEY",
      AI:{async run(){workersCalls++;return {response:"Резервная модель на связи."}}}};
    const request=new Request("https://test.example/webhook",{method:"POST",headers:{"x-telegram-bot-api-secret-token":"FAKE_WEBHOOK"},
      body:JSON.stringify({update_id:501,message:{text:"Привет! Как дела?",from:{id:123},chat:{id:123,type:"private"}}})});
    const pending=[];
    const response=await worker.fetch(request,env,{waitUntil:p=>pending.push(p)});
    await Promise.all(pending);
    assert.equal(response.status,200);
    assert.equal(geminiCalls,1);
    assert.equal(workersCalls,1);
    assert.ok(out.some(t=>t.includes("Резервная модель на связи.")));
    assert.ok(out.every(t=>!t.includes("PRIVATE_FAKE_KEY")));
  } finally{globalThis.fetch=original;}
});

[executed on device: MSI (f4bae329-0864-4381-bcba-d34ec4443a6f)]