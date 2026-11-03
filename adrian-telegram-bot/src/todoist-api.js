// Minimal allowlisted Todoist REST v1 client, no user-provided URLs.
const API="https://api.todoist.com/api/v1";

export async function todoist(env,method,path,body) {
  if(!env.TODOIST_API_TOKEN)throw new Error("TODOIST_API_TOKEN не подключён. Действие не выполнялось.");
  if(!path.startsWith("/")||path.includes("://"))throw new Error("Недопустимый путь API");
  const headers={authorization:"Bearer "+env.TODOIST_API_TOKEN};
  if(body!==undefined)headers["content-type"]="application/json";
  const response=await fetch(API+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
  if(!response.ok){
    const detail=(await response.text()).slice(0,170);
    throw new Error("Todoist: HTTP "+response.status+". "+detail);
  }
  const raw=await response.text();
  if(!raw)return null;
  try{return JSON.parse(raw);}catch{throw new Error("Todoist вернул неизвестный формат данных");}
}

export async function listTasks(env,projectId="",limit=150) {
  const items=[];
  let cursor="";
  for(let pages=0;pages<5&&items.length<limit;pages++){
    const query=new URLSearchParams({limit:String(Math.min(limit-items.length,100))});
    if(projectId)query.set("project_id",projectId);
    if(cursor)query.set("cursor",cursor);
    const data=await todoist(env,"GET","/tasks?"+query.toString());
    if(!data||!Array.isArray(data.results))throw new Error("Todoist не вернул список задач");
    items.push(...data.results);
    if(!data.next_cursor)break;
    cursor=data.next_cursor;
  }
  return items.slice(0,limit);
}

export async function listProjects(env) {
  const items=[];
  let cursor="";
  for(let page=0;page<4;page++){
    const query=new URLSearchParams({limit:"100"});
    if(cursor)query.set("cursor",cursor);
    const data=await todoist(env,"GET","/projects?"+query);
    if(!data||!Array.isArray(data.results))throw new Error("Todoist не вернул список проектов");
    items.push(...data.results);
    if(!data.next_cursor)break;
    cursor=data.next_cursor;
  }
  return items;
}

export function taskDate(item) {
  return String(item?.due?.date||"");
}

export function formatTask(item) {
  const due=taskDate(item);
  const p=Number(item?.priority||4);
  return (due?"["+due.replace("T"," ").slice(0,16)+"] ":"[без срока] ")+
   String(item?.content||"Без названия").slice(0,240)+(p===1?"  (!)":"");
}

function normalize(s) {
  return String(s||"").toLowerCase().replace(/ё/g,"е").replace(/[^\p{L}\p{N}]+/gu," ").trim();
}

export function matchTask(items,search) {
  const key=normalize(search);
  if(!key)return {state:"missing"};
  const byId=items.filter(t=>String(t.id)===String(search).trim());
  if(byId.length===1)return {state:"found",task:byId[0]};
  const exact=items.filter(t=>normalize(t.content)===key);
  if(exact.length===1)return {state:"found",task:exact[0]};
  if(exact.length>1)return {state:"ambiguous",tasks:exact.slice(0,5)};
  const partial=items.filter(t=>normalize(t.content).includes(key));
  if(partial.length===1)return {state:"found",task:partial[0]};
  if(partial.length>1)return {state:"ambiguous",tasks:partial.slice(0,5)};
  return {state:"missing"};
}

export async function createPlannedTask(env,plan,projectId) {
  if(!plan.title||plan.title.length>700)throw new Error("Не удалось определить название задачи");
  const body={content:plan.title};
  if(projectId)body.project_id=projectId;
  if(plan.date){
    if(plan.time){
      const utc=new Date(plan.date+"T"+plan.time+":00+03:00");
      if(Number.isNaN(utc.valueOf()))throw new Error("Некорректное время");
      body.due_datetime=utc.toISOString();
    } else body.due_date=plan.date;
  }
  if([1,2,3,4].includes(plan.priority))body.priority=plan.priority;
  const result=await todoist(env,"POST","/tasks",body);
  if(!result?.id)throw new Error("Todoist не подтвердил создание задачи. Проверь список до повторения.");
  if(projectId&&result.project_id&&result.project_id!==projectId)
    throw new Error("Todoist создал задачу не в ожидаемом проекте. ID "+result.id);
  if(plan.date&&!result.due?.date)
    return {task:result,reminder:null,warning:"ВНИМАНИЕ: Todoist создал задачу, но срок не подтвердил."};
  if(plan.time&&result.due?.date){
    const expected=Date.parse(body.due_datetime);
    const actual=Date.parse(result.due.date);
    // Todoist may return a floating date with no timezone; don't equate that to UTC.
    if(!Number.isNaN(actual)&&!Number.isNaN(expected)&&Math.abs(expected-actual)>4*60*60*1000)
      return {task:result,reminder:null,warning:"Срок в ответе Todoist отличается — проверь задачу перед повтором."};
  }
  if(!plan.remind)return {task:result,reminder:null};
  if(!plan.time)return {task:result,reminder:null,warning:"Задача создана без напоминания: не задано время."};
  try {
    const reminder=await todoist(env,"POST","/reminders",{
      task_id:String(result.id),reminder_type:"relative",minute_offset:0,service:"push"
    });
    if(!reminder?.id)throw new Error("Todoist не вернул ID напоминания");
    return {task:result,reminder};
  } catch(err) {
    return {task:result,reminder:null,warning:"Задача создана, но push-напоминание НЕ создано: "+String(err.message||err).slice(0,140)};
  }
}

export async function closeTask(env,id) {
  await todoist(env,"POST","/tasks/"+encodeURIComponent(id)+"/close",{});
  return true;
}
export async function rescheduleTask(env,id,plan) {
  if(!plan?.date)throw new Error("Не названа новая дата");
  const body={};
  if(plan.time)body.due_datetime=new Date(plan.date+"T"+plan.time+":00+03:00").toISOString();
  else body.due_date=plan.date;
  const result=await todoist(env,"POST","/tasks/"+encodeURIComponent(id),body);
  // Update may be a 204 response; independently read active task to verify.
  const fresh=await todoist(env,"GET","/tasks/"+encodeURIComponent(id));
  if(!fresh?.due?.date)throw new Error("Обновление отправлено, но Todoist не подтвердил новый срок.");
  return fresh;
}
export async function removeTask(env,id) {
  await todoist(env,"DELETE","/tasks/"+encodeURIComponent(id));
  return true;
}
