import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function harness() {
  const calls=[];
  const values=new Map();
  const tasks=[
    {id:"TASK-A",content:"Позвонить Андрею",project_id:"PROJECT",due:{date:"2026-11-04T10:00:00"},priority:4},
    {id:"TASK-B",content:"Купить саморезы",project_id:"PROJECT",due:null,priority:4}
  ];
  const kv={
    async get(key){return values.get(key)||null;},
    async put(key,value){values.set(key,value);},
    async delete(key){values.delete(key);}
  };
  let planner=null,update=100;
  const env={
    TELEGRAM_BOT_TOKEN:"BOT_TEST",TELEGRAM_WEBHOOK_SECRET:"WEBHOOK",
    OWNER_TELEGRAM_ID:"123",TODOIST_API_TOKEN:"TODOIST_TEST",
    TODOIST_PROJECT_ID:"PROJECT",HISTORY:kv,
    AI:{async run(model){
      if(model.includes("whisper"))return {text:"Эдриан, напомни сегодня в 12.30 оплатить платные дороги"};
      return {response:JSON.stringify(planner||{operation:"chat",title:"",target:"",date:"",time:"",remind:false,priority:4})};
    }}
  };
  const realFetch=globalThis.fetch;
  globalThis.fetch=async (input,opts={})=>{
    const url=String(input),body=opts.body?JSON.parse(opts.body):null;
    calls.push({url,method:opts.method||"GET",body});
    if(url.endsWith("/getFile"))return Response.json({ok:true,result:{file_path:"voice.ogg"}});
    if(url.includes("/file/bot"))return new Response(Uint8Array.from([79,103,103,83]));
    if(url.endsWith("/sendMessage")||url.endsWith("/answerCallbackQuery")||url.endsWith("/sendChatAction"))
      return Response.json({ok:true,result:true});
    if(url.includes("/api/v1/projects?"))return Response.json({results:[{id:"PROJECT",name:"Эдриан"},{id:"KSB",name:"КСБ-МОДУЛЬ"}]});
    if(url.includes("/api/v1/tasks?"))return Response.json({results:tasks,next_cursor:null});
    if(url.includes("/api/v1/tasks/")&&opts.method==="GET")
      return Response.json(tasks.find(t=>url.endsWith("/"+t.id)));
    if(url.includes("/api/v1/tasks/")&&opts.method==="POST"){
      const id=url.split("/").pop();
      if(url.endsWith("/close"))return new Response(null,{status:204});
      const t=tasks.find(t=>t.id===id);Object.assign(t,{due:{date:body.due_datetime||body.due_date}});
      return Response.json(t);
    }
    if(url.includes("/api/v1/tasks/")&&opts.method==="DELETE")return new Response(null,{status:204});
    if(url.includes("/api/v1/tasks")&&opts.method==="POST"){
      const row={id:"TASK-NEW",content:body.content,project_id:body.project_id||"PROJECT",due:(body.due_datetime||body.due_date)?{date:body.due_datetime||body.due_date}:null};
      tasks.push(row);
      return Response.json(row);
    }
    if(url.endsWith("/api/v1/reminders"))return Response.json({id:"REMINDER-1"});
    throw new Error("Unexpected HTTP "+url);
  };
  async function send(text,{id=123,voice=false}={}){
    const msg={from:{id},chat:{id,type:"private"}};
    if(voice)msg.voice={file_id:"VOICE",file_size:20};
    else msg.text=text;
    const pending=[];
    const req=new Request("https://example.workers.dev/webhook",{
      method:"POST",headers:{"x-telegram-bot-api-secret-token":"WEBHOOK"},
      body:JSON.stringify({update_id:++update,message:msg})
    });
    const response=await worker.fetch(req,env,{waitUntil:p=>pending.push(p)});
    await Promise.all(pending);
    assert.equal(response.status,200);
    return calls.filter(c=>c.url.endsWith("/sendMessage")).at(-1)?.body?.text||"";
  }
  async function callback(data,id=123){
    const pending=[];
    const req=new Request("https://example.workers.dev/webhook",{
      method:"POST",headers:{"x-telegram-bot-api-secret-token":"WEBHOOK"},
      body:JSON.stringify({update_id:++update,callback_query:{
        id:"cb-"+update,from:{id},data,message:{chat:{id,type:"private"}}
      }})
    });
    await worker.fetch(req,env,{waitUntil:p=>pending.push(p)});
    await Promise.all(pending);
    return calls.filter(c=>c.url.endsWith("/sendMessage")).at(-1)?.body?.text||"";
  }
  return {env,tasks,calls,values,send,callback,plan(p){planner=p;},restore(){globalThis.fetch=realFetch;}};
}

test("task listing displays real due dates from Todoist",async()=>{
  const h=harness();
  try{
    const out=await h.send("/tasks");
    assert.match(out,/Позвонить Андрею/);
    assert.match(out,/TASK-A/);
    assert.equal(h.calls.filter(c=>c.url.includes("/api/v1/tasks?")).length,1);
  }finally{h.restore();}
});

test("completing a task waits for second confirmation",async()=>{
  const h=harness();
  try{
    const p=await h.send("/done TASK-A");
    assert.match(p,/Подтвердить|Отметить выполненной/);
    assert.equal(h.calls.some(c=>c.url.endsWith("/close")),false);
    const out=await h.send("/confirm");
    assert.match(out,/Todoist подтвердил выполнение/);
    assert.ok(h.calls.some(c=>c.url.endsWith("/TASK-A/close")));
  }finally{h.restore();}
});

test("delete cancellation never hits Todoist delete API",async()=>{
  const h=harness();
  try{
    await h.send("/delete TASK-B");
    const o=await h.send("/cancel");
    assert.match(o,/отменено/i);
    assert.equal(h.calls.some(c=>c.method==="DELETE"),false);
  }finally{h.restore();}
});

test("natural plan creates and confirms push reminder",async()=>{
  const h=harness();
  try{
    h.plan({operation:"create",title:"Оплатить платные дороги",target:"",date:"2026-11-04",time:"12:30",remind:true,priority:4});
    const reply=await h.send("Эдриан, напомни сегодня в 12:30 оплатить платные дороги");
    assert.match(reply,/задача создана и подтверждена/);
    assert.match(reply,/Напоминание: создано/);
    assert.ok(h.calls.some(c=>c.url.endsWith("/api/v1/tasks")&&c.body.due_datetime==="2026-11-04T09:30:00.000Z"));
    assert.ok(h.calls.some(c=>c.url.endsWith("/api/v1/reminders")));
  }finally{h.restore();}
});

test("ambiguous plan cannot write to Todoist",async()=>{
  const h=harness();
  try{
    h.plan({operation:"unknown",ambiguous:true,reason:"Неясное время"});
    const reply=await h.send("Напомни сегодня как-нибудь вечером");
    assert.match(reply,/Ничего не менял/);
    assert.equal(h.calls.some(c=>c.method==="POST"&&c.url.endsWith("/api/v1/tasks")),false);
  }finally{h.restore();}
});

test("move task verifies fetched new deadline",async()=>{
  const h=harness();
  try{
    h.plan({operation:"reschedule",title:"",target:"Купить саморезы",date:"2026-11-07",time:"11:00",remind:false,priority:4});
    const out=await h.send("Перенеси задачу купить саморезы на субботу в 11");
    assert.match(out,/подтвердил перенос/);
    assert.ok(h.calls.some(c=>c.url.includes("/TASK-B")&&c.body?.due_datetime));
  }finally{h.restore();}
});

test("private KV note is stored and retrieved",async()=>{
  const h=harness();
  try{
    const saved=await h.send("/note Список идей для ЦИТО: диагностика");
    assert.match(saved,/Сохранил заметку/);
    const recalled=await h.send("/notes");
    assert.match(recalled,/диагностика/);
  }finally{h.restore();}
});

test("unauthorized Telegram user cannot access task data",async()=>{
  const h=harness();
  try{
    const out=await h.send("/tasks",{id:777});
    assert.match(out,/Закрытый бот/);
    assert.equal(h.calls.some(c=>c.url.includes("api.todoist.com")),false);
  }finally{h.restore();}
});


test("duplicate recently created task is not recreated",async()=>{
  const h=harness();
  try{
    h.tasks[1].created_at=new Date().toISOString();
    h.plan({operation:"create",title:"Купить саморезы",date:"",time:"",remind:false,priority:4});
    const response=await h.send("Поставь задачу купить саморезы");
    assert.match(response,/НЕ создавалась/);
    assert.match(response,/TASK-B/);
    assert.equal(h.calls.some(c=>c.method==="POST"&&c.url.endsWith("/api/v1/tasks")),false);
  }finally{h.restore();}
});

test("check verifies a real Todoist read and does not merely look at settings",async()=>{
  const h=harness();
  try{
    const reply=await h.send("/check");
    assert.match(reply,/API доступен, чтение задач успешно/);
    assert.match(reply,/KV HISTORY: чтение доступно/);
    assert.ok(h.calls.some(c=>c.url.includes("/api/v1/tasks?")));
  }finally{h.restore();}
});

test("last reports only a verified creation receipt",async()=>{
  const h=harness();
  try{
    let reply=await h.send("/last");
    assert.match(reply,/Нет сохранённого подтверждения/);
    h.plan({operation:"create",title:"Подготовить рекламу",date:"",time:"",remind:false,priority:4});
    reply=await h.send("Поставь задачу подготовить рекламу");
    assert.match(reply,/создана и подтверждена/);
    reply=await h.send("/last");
    assert.match(reply,/Последнее подтверждённое действие/);
    assert.match(reply,/Подготовить рекламу/);
  }finally{h.restore();}
});
