import {extractPlan, hasTaskIntent, moscowDate, safePlan} from "./task-engine.js";
import {listTasks,listProjects,createPlannedTask,formatTask,matchTask,closeTask,rescheduleTask,removeTask} from "./todoist-api.js";

function compact(s,max=300){return String(s||"").trim().slice(0,max);}
async function kvGet(env,key,defaultValue=null) {
  if(!env.HISTORY)return defaultValue;
  try {const v=await env.HISTORY.get(key);return v?JSON.parse(v):defaultValue;}catch{return defaultValue;}
}
async function kvPut(env,key,value,ttl=86400) {
  if(!env.HISTORY)throw new Error("Cloudflare KV HISTORY не подключён.");
  await env.HISTORY.put(key,JSON.stringify(value),{expirationTtl:ttl});
}
function taskRange(t,day){return String(t.due?.date||"").slice(0,10)===day;}
function dateDisplay(plan){
  return plan.date?(plan.date+(plan.time?" "+plan.time+" МСК":"")):"без срока";
}
function formatList(items,title,max=25) {
  const visible=items.slice(0,max);
  if(!visible.length)return title+"\nНет активных задач.";
  return title+" ("+items.length+")\n\n"+visible.map((t,i)=>
    String(i+1)+". "+formatTask(t)+"\nID: "+t.id
  ).join("\n\n")+(items.length>max?"\n\nПоказаны первые "+max+".":"");
}
function pendingKey(ownerId){return "pending:"+ownerId;}
function parseSimpleCommand(text) {
  const cmd=String(text||"").trim();
  if(/^\/(?:tasks|all)(?:@\w+)?\s*$/i.test(cmd))return {operation:"list"};
  if(/^\/today(?:@\w+)?\s*$/i.test(cmd))return {operation:"list",date:moscowDate()};
  if(/^\/(?:projects)(?:@\w+)?\s*$/i.test(cmd))return {operation:"projects"};
  if(/^\/(?:digest|brief)(?:@\w+)?\s*$/i.test(cmd))return {operation:"digest"};
  if(/^\/(?:status)(?:@\w+)?\s*$/i.test(cmd))return {operation:"status"};
  if(/^\/(?:notes)(?:@\w+)?\s*$/i.test(cmd))return {operation:"notes"};
  if(/^\/(?:cancel)(?:@\w+)?\s*$/i.test(cmd))return {operation:"cancel"};
  if(/^\/confirm(?:@\w+)?\s*$/i.test(cmd))return {operation:"confirm"};
  const note=cmd.match(/^\/note(?:@\w+)?\s+([\s\S]+)$/i);
  if(note)return {operation:"note",body:note[1]};
  const done=cmd.match(/^\/done(?:@\w+)?\s+(.+)$/i);
  if(done)return {operation:"complete",target:done[1]};
  const remove=cmd.match(/^\/delete(?:@\w+)?\s+(.+)$/i);
  if(remove)return {operation:"delete",target:remove[1]};
  const moved=cmd.match(/^\/move(?:@\w+)?\s+(.+?)\s+\|\s+(.+)$/i);
  if(moved)return {operation:"reschedule",target:moved[1],requestedDate:moved[2]};
  return null;
}
export async function handleAgent(env,ownerId,chatId,text,{say,telegram}) {
  const direct=parseSimpleCommand(text);
  if(!direct&&!hasTaskIntent(text))return false;
  const send=(msg)=>say(env,chatId,msg);
  if(direct?.operation==="status") {
    await send("Эдриан v2\nTelegram: подключён\nTodoist: "+(env.TODOIST_API_TOKEN?"настроен":"не подключён")+
      "\nAI: "+(env.AI?"подключён":"не подключён")+"\nПамять KV: "+(env.HISTORY?"подключена":"не подключена")+
      "\nЧасовой пояс: Москва. Это не проверка доступности внешних API.");
    return true;
  }
  if(direct?.operation==="cancel"){
    if(env.HISTORY)await env.HISTORY.delete(pendingKey(ownerId));
    await send("Ожидаемое подтверждение отменено.");
    return true;
  }
  if(direct?.operation==="confirm"){
    const pending=await kvGet(env,pendingKey(ownerId));
    if(!pending){await send("Нет действия, ожидающего подтверждения.");return true;}
    await env.HISTORY.delete(pendingKey(ownerId));
    if(pending.operation==="complete"){
      await closeTask(env,pending.id);
      await send("Todoist подтвердил выполнение: "+pending.title);
    } else if(pending.operation==="delete"){
      await removeTask(env,pending.id);
      await send("Todoist подтвердил удаление: "+pending.title);
    } else {
      await send("Неизвестный тип подтверждения, ничего не менял.");
    }
    return true;
  }
  if(direct?.operation==="note"){
    const notes=await kvGet(env,"notes:"+ownerId,[]);
    notes.push({text:compact(direct.body,800),created:moscowDate()});
    await kvPut(env,"notes:"+ownerId,notes.slice(-50),365*86400);
    await send("Сохранил заметку. Всего заметок: "+Math.min(notes.length,50)+". /notes — посмотреть.");
    return true;
  }
  if(direct?.operation==="notes"){
    const notes=await kvGet(env,"notes:"+ownerId,[]);
    await send(!notes.length?"Заметок пока нет. Добавь: /note текст":notes.slice(-20).map((n,i)=>(i+1)+". "+n.text).join("\n"));
    return true;
  }
  if(direct?.operation==="projects"){
    const projects=await listProjects(env);
    await send("Проекты Todoist:\n"+projects.slice(0,50).map(p=>"- "+p.name+" (ID "+p.id+")").join("\n"));
    return true;
  }
  if(direct?.operation==="list"||direct?.operation==="digest"){
    const tasks=await listTasks(env,direct.operation==="digest"?"":(env.TODOIST_PROJECT_ID||""),150);
    const today=moscowDate();
    const selected=direct.operation==="digest"?
      tasks.filter(t=>String(t.due?.date||"").slice(0,10)<=today && t.due?.date):
      direct.date?tasks.filter(t=>taskRange(t,direct.date)):tasks;
    selected.sort((a,b)=>String(a.due?.date||"9999").localeCompare(String(b.due?.date||"9999")));
    await send(formatList(selected,direct.operation==="digest"?"Сводка: сегодня и просрочка":direct.date?"Задачи на "+direct.date:"Задачи проекта «Эдриан»"));
    return true;
  }

  let plan=direct;
  if(direct?.operation==="reschedule") {
    plan=await extractPlan(env,"Перенеси задачу "+direct.target+" на "+direct.requestedDate);
    if(plan?.operation!=="reschedule") {
      await send("Не смог однозначно разобрать новую дату. Ничего не менял. Пример: /move Название | завтра в 15:00");
      return true;
    }
    plan.target=direct.target;
  } else if(!plan) plan=await extractPlan(env,text);

  if(!plan){
    // Preserve tested deterministic creation when Workers AI JSON is unavailable.
    // The old handler is already responsible for /task and explicit "поставь задачу".
    if(/^\/task(?:@\w+)?\b/i.test(text) ||
       /(?:задача\s*[:—-]|(?:поставь|создай|добавь|запиши|внеси)\b[^.!?]{0,90}\bзадачу)/i.test(text)) {
      return false;
    }
    if(/напомни|напоминани|перенеси.*задач|удали.*задач/i.test(text)){
      await send("Не смог надёжно разобрать поручение. Задача НЕ создана и ничего не изменено. Повтори коротко с датой и временем.");
      return true;
    }
    return false;
  }
  if(plan.ambiguous||plan.operation==="unknown"){
    await send("Ничего не менял: "+compact(plan.reason||"не уверен в деталях поручения")+
      ". Укажи действие, дату и время точнее.");
    return true;
  }
  if(plan.operation==="chat")return false;
  if(plan.operation==="list"){
    const tasks=await listTasks(env,env.TODOIST_PROJECT_ID||"",150);
    const selected=plan.date?tasks.filter(t=>taskRange(t,plan.date)):tasks;
    await send(formatList(selected,plan.date?"Задачи на "+plan.date:"Задачи проекта «Эдриан»"));
    return true;
  }
  if(plan.operation==="create"){
    // There is no single fact connecting this local worker to all ChatGPT apps.
    let destination=env.TODOIST_PROJECT_ID||"";
    const explicit=String(text).match(/(?:в|на)\s+проект\s+[«"]?([^.,!?»"]{2,45})/i);
    if(explicit){
      const requested=explicit[1].trim().toLowerCase();
      const projects=await listProjects(env);
      const exact=projects.filter(p=>String(p.name).toLowerCase()===requested);
      if(exact.length!==1){await send("Не нашёл однозначный проект «"+requested+"». Ничего не создавал. /projects — список.");return true;}
      destination=exact[0].id;
    }
    const r=await createPlannedTask(env,plan,destination);
    const task=r.task;
    let msg="Todoist: задача создана и подтверждена.\n"+task.content+
      "\nСрок: "+dateDisplay(plan)+"\nID: "+task.id;
    if(plan.remind)msg+="\nНапоминание: "+(r.reminder?"создано, push в назначенное время":"не создано");
    if(r.warning)msg+="\n"+r.warning;
    if(r.reminder)msg+="\nЗвук зависит от настроек телефона и Todoist.";
    await send(msg);
    return true;
  }

  if(["complete","reschedule","delete"].includes(plan.operation)){
    const tasks=await listTasks(env,"",200);
    const found=matchTask(tasks,plan.target);
    if(found.state==="missing"){
      await send("Не нашёл активную задачу «"+compact(plan.target)+"». Ничего не менял. /tasks — список.");
      return true;
    }
    if(found.state==="ambiguous"){
      await send("Нашёл несколько похожих задач, выбери по ID:\n"+
        found.tasks.map(t=>t.id+" — "+compact(t.content,150)).join("\n")+
        "\nНапример: /done ID задачи");
      return true;
    }
    const target=found.task;
    if(plan.operation==="reschedule"){
      if(!plan.date){await send("Новый срок не определён, ничего не менял.");return true;}
      // Explicit user request, but still verify the returned task and exact date.
      const fresh=await rescheduleTask(env,target.id,plan);
      await send("Todoist подтвердил перенос:\n"+fresh.content+"\nНовый срок: "+String(fresh.due.date));
      return true;
    }
    // Complete/delete always require an explicit second user action.
    if(!env.HISTORY){
      await send("Подтверждение недоступно: HISTORY не подключён. Задачу НЕ изменял.");
      return true;
    }
    const nonce=crypto.randomUUID().slice(0,18);
    const pending={nonce,operation:plan.operation,id:target.id,title:target.content};
    await kvPut(env,pendingKey(ownerId),pending,600);
    await telegram(env,"sendMessage",{
      chat_id:chatId,
      text:(plan.operation==="delete"?"Удалить без возможности восстановления?":"Отметить выполненной?")+
        "\n"+target.content+"\nID: "+target.id+"\nНажми кнопку либо отправь /confirm. Для отмены — /cancel.",
      reply_markup:{inline_keyboard:[[
        {text:"Подтвердить",callback_data:"adrian:"+nonce+":yes"},
        {text:"Отмена",callback_data:"adrian:"+nonce+":no"}
      ]]}
    });
    return true;
  }
  return false;
}

export async function handleAgentCallback(env,query,{say,telegram}){
  const userId=String(query?.from?.id||"");
  const chatId=query?.message?.chat?.id;
  const data=String(query?.data||"");
  if(!chatId||!userId||userId!==String(env.OWNER_TELEGRAM_ID)||!data.startsWith("adrian:"))return false;
  const match=data.match(/^adrian:([a-f0-9-]{18}):(yes|no)$/);
  if(!match)return false;
  const pending=await kvGet(env,pendingKey(userId));
  await telegram(env,"answerCallbackQuery",{callback_query_id:query.id});
  if(!pending||pending.nonce!==match[1]){
    await say(env,chatId,"Подтверждение истекло или уже заменено. Ничего не менял.");
    return true;
  }
  await env.HISTORY.delete(pendingKey(userId));
  if(match[2]==="no"){
    await say(env,chatId,"Отменено. Ничего не менял.");return true;
  }
  if(pending.operation==="delete"){
    await removeTask(env,pending.id);
    await say(env,chatId,"Todoist подтвердил удаление: "+pending.title);
  } else if(pending.operation==="complete"){
    await closeTask(env,pending.id);
    await say(env,chatId,"Todoist подтвердил выполнение: "+pending.title);
  }
  return true;
}
