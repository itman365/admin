import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("reminder voice creates Todoist task and push, never chats", async () => {
 const realFetch=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async (url, opts={})=>{
   const addr=String(url), body=opts.body?JSON.parse(opts.body):{};
   calls.push({addr,body});
   if(addr.includes("/api/v1/tasks")) return Response.json({id:"TASK",due:{date:body.due_datetime}});
   if(addr.includes("/api/v1/reminders")) return Response.json({id:"REMINDER"});
   return Response.json({ok:true,result:true});
 };
 try {
   const jobs=[];
   const env={TELEGRAM_BOT_TOKEN:"x",TELEGRAM_WEBHOOK_SECRET:"y",OWNER_TELEGRAM_ID:"123",TODOIST_API_TOKEN:"z",TODOIST_PROJECT_ID:"PROJECT",AI:{run:async (model)=>model.includes("whisper")?{text:"Андрей, напомни, сегодня в 12.30 днём по Москве, чтобы я оплатил платные дороги."}:{response:"NO MODEL"}}};
   const req=new Request("https://example.com/webhook",{method:"POST",headers:{"x-telegram-bot-api-secret-token":"y"},body:JSON.stringify({update_id:9091,message:{chat:{id:123,type:"private"},from:{id:123},voice:{file_id:"V",file_size:10}}})});
   const response=await worker.fetch(req,env,{waitUntil:p=>jobs.push(p)});
   assert.equal(response.status,200);
   await Promise.all(jobs);
   const task=calls.find(c=>c.addr.includes("/api/v1/tasks"));
   assert.ok(task,"Todoist task request required");
   assert.equal(task.body.content,"Оплатить платные дороги");
   assert.match(task.body.due_datetime,/T09:30:00/);
   const reminder=calls.find(c=>c.addr.includes("/api/v1/reminders"));
   assert.ok(reminder,"Todoist reminder request required");
 } finally {globalThis.fetch=realFetch;}
});
