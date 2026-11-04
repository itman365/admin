import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function fixture({gemini=true,workers=false}={}){
  const store=new Map();
  const sent=[];
  const requests=[];
  const env={
    TELEGRAM_BOT_TOKEN:"MOCK_TELEGRAM",
    TELEGRAM_WEBHOOK_SECRET:"MOCK_WEBHOOK",
    OWNER_TELEGRAM_ID:"123",
    ...(gemini?{GEMINI_API_KEY:"MOCK_GEMINI"}:{}),
    GEMINI_MODEL:"gemini-3.5-flash-lite",
    HISTORY:{
      async get(key){return store.get(key)||null;},
      async put(key,value){store.set(key,String(value));},
      async delete(key){store.delete(key);}
    },
    ...(workers?{AI:{async run(){return {response:"Резервный ответ Workers AI"}}}}:{})
  };
  async function invoke(text,id,from=123){
    const pending=[];
    const req=new Request("https://unit.example/webhook",{
      method:"POST",headers:{"x-telegram-bot-api-secret-token":"MOCK_WEBHOOK"},
      body:JSON.stringify({update_id:id,message:{from:{id:from},chat:{id:from,type:"private"},text}})
    });
    const res=await worker.fetch(req,env,{waitUntil:p=>pending.push(p)});
    await Promise.all(pending);
    assert.equal(res.status,200);
  }
  return {env,store,sent,requests,invoke};
}
test("agent command list is owner-only and requires no model",async()=>{
  const s=fixture({gemini:false});
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>{
    assert.ok(String(url).includes("api.telegram.org"));
    if(String(url).endsWith("/sendMessage"))s.sent.push(JSON.parse(opts.body).text);
    return Response.json({ok:true,result:true});
  };
  try{
    await s.invoke("/agents",801);
    assert.match(s.sent[0],/\/ksb/);
    assert.match(s.sent[0],/\/cito/);
    assert.match(s.sent[0],/\/dev/);
    await s.invoke("/agents",802,999);
    assert.match(s.sent[1],/Закрытый бот/);
  }finally{globalThis.fetch=original;}
});
test("KSB and CITO use isolated KV memory, never call Todoist",async()=>{
  const s=fixture();
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts={})=>{
    const u=String(url);s.requests.push(u);
    if(u.includes("generativelanguage.googleapis.com")){
      const body=JSON.parse(opts.body);
      s.requests.push(JSON.stringify(body));
      return Response.json({candidates:[{content:{parts:[{text:"Рекомендация готова"}]}}]});
    }
    if(u.endsWith("/sendChatAction"))return Response.json({ok:true,result:true});
    if(u.endsWith("/sendMessage")){s.sent.push(JSON.parse(opts.body).text);return Response.json({ok:true,result:true});}
    throw Error("Unexpected url "+u);
  };
  try{
    await s.invoke("/ksb оцени загрузку производства",803);
    await s.invoke("/cito сделай позиционирование",804);
    assert.ok(s.sent.some(x=>x.includes("[КСБ — операционный штаб]")));
    assert.ok(s.sent.some(x=>x.includes("[ЦИТО — шеф-маркетолог]")));
    assert.ok(s.store.has("role:ksb:123"));
    assert.ok(s.store.has("role:cito:123"));
    assert.ok(!s.store.get("role:cito:123").includes("загрузку производства"));
    assert.ok(!s.requests.some(x=>x.includes("api.todoist.com")));
    const prompts=s.requests.filter(x=>x.startsWith("{"));
    assert.match(prompts[0],/КСБ-МОДУЛЬ/);
    assert.doesNotMatch(prompts[0],/инфоцыганские обещания/);
    assert.match(prompts[1],/ЦИТО/);
    assert.ok(s.sent.every(x=>!x.includes("MOCK_GEMINI")));
  }finally{globalThis.fetch=original;}
});
test("Developer agent falls back to Workers AI on free-tier 429",async()=>{
  const s=fixture({workers:true});
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts={})=>{
    const u=String(url);
    if(u.includes("generativelanguage.googleapis.com"))return Response.json({error:{message:"quota"}},{status:429});
    if(u.endsWith("/sendChatAction"))return Response.json({ok:true,result:true});
    if(u.endsWith("/sendMessage")){s.sent.push(JSON.parse(opts.body).text);return Response.json({ok:true,result:true});}
    throw Error("Unexpected url "+u);
  };
  try{
    await s.invoke("/dev проверь безопасность бота",805);
    assert.match(s.sent[0],/Резервный ответ Workers AI/);
    assert.ok(s.store.has("role:dev:123"));
  }finally{globalThis.fetch=original;}
});
test("Role commands without a question do not consume model quota",async()=>{
  const s=fixture({gemini:false});
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts={})=>{
    assert.ok(String(url).includes("api.telegram.org"));
    if(String(url).endsWith("/sendMessage"))s.sent.push(JSON.parse(opts.body).text);
    return Response.json({ok:true,result:true});
  };
  try {
    await s.invoke("/ksb",806);
    assert.match(s.sent[0],/Напиши вопрос после команды/);
  }finally{globalThis.fetch=original;}
});
