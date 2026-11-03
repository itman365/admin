// Intent planning is separate from execution. LLM output never directly authorizes arbitrary API calls.
const MODEL = "@cf/zai-org/glm-4.7-flash";
export function moscowDate(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const f = k => p.find(x=>x.type===k)?.value;
  return f("year")+"-"+f("month")+"-"+f("day");
}
export function hasTaskIntent(text) {
  const s = String(text || "");
  return /(^|[\s,!:—-])(напомни|напоминание|не забудь|поставь|создай|запиши|добавь|внеси|закинь|перенеси|измени|удали|отметь|закрой|задачи|задачу|задачку)(?=[\s,!:—-]|$)/i.test(s) ||
    /^\/(?:task|remind|tasks|today|done|move|delete|digest|projects)\b/i.test(s);
}
function modelText(result) {
  const c=result?.choices?.[0]?.message?.content ?? result?.response ?? result?.output_text ?? "";
  return typeof c==="string"?c:Array.isArray(c)?c.map(x=>x?.text||"").join(""):"";
}
function parseJson(s) {
  const a=String(s).indexOf("{"), b=String(s).lastIndexOf("}");
  if(a<0||b<=a) return null;
  try { return JSON.parse(String(s).slice(a,b+1)); } catch { return null; }
}
export function safePlan(candidate,text,today=moscowDate()) {
  if(!candidate||typeof candidate!=="object") return null;
  const op=String(candidate.operation||"").toLowerCase();
  if(!["create","list","complete","reschedule","delete","chat","unknown"].includes(op)) return null;
  const title=String(candidate.title||"").trim().slice(0,600);
  const target=String(candidate.target||"").trim().slice(0,240);
  const date=String(candidate.date||"").trim(), time=String(candidate.time||"").trim();
  const remind=candidate.remind===true||/\bнапомни|напоминани|уведомлен/i.test(text);
  const priority=[1,2,3,4].includes(Number(candidate.priority))?Number(candidate.priority):4;
  const invalid=(reason)=>({operation:"unknown",ambiguous:true,reason});
  if(date) {
    const parsed = new Date(date+"T12:00:00Z");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.valueOf()) ||
       parsed.toISOString().slice(0,10)!==date) return invalid("Некорректная дата");
  }
  if(date && date<today)return invalid("Названная дата уже прошла");
  if(time && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!date))return invalid("Не удалось определить дату и точное время");
  if(op==="create"&&!title)return invalid("Не расслышал действие");
  if(op==="create"&&remind&&!time)return invalid("Для напоминания нужно точное время");
  if(["complete","reschedule","delete"].includes(op)&&!target)return invalid("Неясно, какую задачу изменять");
  if(op==="reschedule"&&!date)return invalid("Не удалось определить новый срок");
  const mentionsDate=/сегодня|завтра|послезавтра|суббот|воскресень|понедельник|вторник|сред|четверг|пятниц|\d{1,2}[.:]\d{2}|\d{4}-\d{2}-\d{2}/i.test(text);
  if(op==="create"&&mentionsDate&&!date)return invalid("Не удалось надёжно определить дату");
  if(op==="create"&&/каждый|ежедневно|еженедельно|раз в неделю|по будням/i.test(text)&&!date) return invalid("Повторяющийся срок пока не поддерживается автоматически");
  return {operation:op,title,target,date,time,remind,priority,ambiguous:candidate.ambiguous===true,reason:String(candidate.reason||"").slice(0,200)};
}
export function duePayload(p) {
  if(!p?.date)return {};
  if(!p.time)return {due_date:p.date};
  const time=new Date(p.date+"T"+p.time+":00+03:00");
  return Number.isNaN(time.valueOf())?{}:{due_datetime:time.toISOString()};
}
export async function extractPlan(env,text,now=new Date()) {
  if(!env.AI?.run)return null;
  const today=moscowDate(now);
  const system=[
   "Ты парсер команд пользователя. Верни только JSON: operation (create/list/complete/reschedule/delete/chat/unknown), title, target, date, time, remind, priority, ambiguous, reason.",
   "Сегодня в Москве: "+today+". Часовой пояс Europe/Moscow.",
   "В title только само действие, без времени, имени, Todoist и напоминаний.",
   "Напомни = создать задачу с напоминанием. Чтоб я оплатил дороги = Оплатить дороги.",
   "Сделал задачу = complete. Перенеси задачу = reschedule. Удали = delete.",
   "Только явно указанные даты, время. Относительные даты преобразуй в абсолютные YYYY-MM-DD.",
   "time: HH:MM 24 часа, либо пустая строка. 12.30 днём = 12:30; 905 = 09:05.",
   "target = существующая задача при изменении/удалении; иначе пусто.",
   "Если не понял — operation unknown, ambiguous true. Не утверждай о выполнении действий."
  ].join(" ");
  try {
    const r=await env.AI.run(MODEL,{
      messages:[{role:"system",content:system},{role:"user",content:String(text).slice(0,3000)}],
      max_completion_tokens:750,chat_template_kwargs:{enable_thinking:false},
      response_format:{type:"json_object"},temperature:0
    });
    return safePlan(parseJson(modelText(r)),text,today);
  } catch(e) { console.error("Planner failed:",String(e)); return null; }
}
