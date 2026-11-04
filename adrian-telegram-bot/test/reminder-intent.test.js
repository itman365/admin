import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("spoken reminder creates verified Todoist task and push", async () => {
 const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 const prior=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async (url, opts={})=>{
   const endpoint=String(url), payload=opts.body?JSON.parse(opts.body):{};
   calls.push({endpoint,payload});
   if(endpoint.endsWith("/getFile")) return Response.json({ok:true,result:{file_path:"voice.ogg"}});
   if(endpoint.includes("/file/bot")) return new Response(Uint8Array.from([79,103,103,83]));
   if(endpoint.includes("/api/v1/tasks")) return Response.json({id:"TASK",due:{date:payload.due_datetime}});
   if(endpoint.includes("/api/v1/reminders")) return Response.json({id:"REMINDER"});
   return Response.json({ok:true,result:true});
 };
 try {
  const pending=[];
  const env={TELEGRAM_BOT_TOKEN:"TEST",TELEGRAM_WEBHOOK_SECRET:"TEST_SECRET",OWNER_TELEGRAM_ID:"123",TODOIST_API_TOKEN:"TEST_TODOIST",TODOIST_PROJECT_ID:"PROJECT",AI:{run:async model=>model.includes("whisper")?{text:"Андрей, напомни, "+day+" в 12.30 днём по Москве, чтобы я оплатил платные дороги."}:{response:JSON.stringify({operation:"create",title:"Оплатить платные дороги",target:"",date:day,time:"12:30",remind:true,priority:4,ambiguous:false})} }};
  const req=new Request("https://worker.example/webhook",{method:"POST",headers:{"x-telegram-bot-api-secret-token":"TEST_SECRET"},body:JSON.stringify({update_id:9091,message:{from:{id:123},chat:{id:123,type:"private"},voice:{file_id:"VOICE",file_size:4}}})});
  const response=await worker.fetch(req,env,{waitUntil:p=>pending.push(p)});
  assert.equal(response.status,200);
  await Promise.all(pending);
  const task=calls.find(c=>c.endpoint.includes("/api/v1/tasks"));
  assert.ok(task,"Missing Todoist create call");
  assert.equal(task.payload.content,"Оплатить платные дороги");
  assert.equal(task.payload.due_datetime,new Date(day+"T12:30:00+03:00").toISOString());
  assert.ok(calls.some(c=>c.endpoint.includes("/api/v1/reminders")),"Missing reminder API call");
  assert.ok(calls.some(c=>c.endpoint.endsWith("/sendMessage")&&c.payload.text.includes("задача создана и подтверждена")));
 } finally { globalThis.fetch=prior; }
});
