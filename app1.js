const KEY='valentin_os_v5';
const OLD_KEYS=['valentin_os_v4','valentin_os_live_v1'];
const PIN_KEY='valentin_os_pin_hash';
const $=id=>document.getElementById(id);
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=n=>new Intl.NumberFormat('ru-RU').format(Math.round(Number(n)||0))+' ₽';
const iso=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const nowLabel=()=>new Date().toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const dayDiff=(a,b=iso())=>Math.floor((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000);

const DEFAULT={
  focus:[
    {id:uid(),text:'Действие №1, которое приносит деньги',done:false},
    {id:uid(),text:'Действие №2, которое двигает главный проект',done:false},
    {id:uid(),text:'Действие №3 для имени, системы или свободы',done:false}
  ],
  inbox:[],
  projects:[
    {id:uid(),name:'ЦИТО',status:'Активно',next:'Один конкретный коммерческий шаг',progress:20,updated:iso()},
    {id:uid(),name:'КСБ-МОДУЛЬ',status:'Активно',next:'Главный шаг, который влияет на продажи',progress:40,updated:iso()},
    {id:uid(),name:'Личный бренд',status:'Активно',next:'Один сильный выход в контент',progress:15,updated:iso()}
  ],
  money:{goal:300000,fact:0},
  deals:[],people:[],ideas:[],decisions:[],chat:[],history:[],
  review:{money:'',name:'',waste:'',stop:'',next:'',saved:''},
  settings:{focusMinutes:25,autoLock:false},
  stats:{lastOpen:'',streak:0,daily:{}}
};

function migrate(raw){
  if(!raw)return structuredClone(DEFAULT);
  const n=structuredClone(DEFAULT);
  if(Array.isArray(raw.focus))n.focus=raw.focus.slice(0,3).map(x=>({id:x.id||uid(),text:x.text||x.t||'Главное дело',done:Boolean(x.done??x.d)}));
  if(Array.isArray(raw.inbox))n.inbox=raw.inbox.map(x=>({...x,id:x.id||uid(),text:x.text||x.t||'',created:x.created||x.c||nowLabel(),createdDate:x.createdDate||iso(),due:x.due||'',priority:x.priority||'Обычно'}));
  if(Array.isArray(raw.projects))n.projects=raw.projects.map(x=>({id:x.id||uid(),name:x.name||x.n||'Проект',status:x.status||x.s||'Активно',next:x.next||'',progress:Number(x.progress??x.p)||0,updated:x.updated||iso()}));
  n.money={goal:Number(raw.money?.goal)||300000,fact:Number(raw.money?.fact)||0};
  if(Array.isArray(raw.deals))n.deals=raw.deals.map(x=>({id:x.id||uid(),name:x.name||x.n||'Сделка',amount:Number(x.amount??x.a)||0,stage:x.stage||x.s||'Потенциал',next:x.next||'',date:x.date||'',created:x.created||iso(),updated:x.updated||iso()}));
  if(Array.isArray(raw.people))n.people=raw.people.map(x=>({id:x.id||uid(),name:x.name||x.n||'Человек',promise:x.promise||x.t||'',status:x.status||'Открыто',date:x.date||'',updated:x.updated||iso()}));
  if(Array.isArray(raw.ideas))n.ideas=raw.ideas.map(x=>({...x,id:x.id||uid(),text:x.text||x.t||'',type:x.type||'Идея',status:x.status||'Новая'}));
  if(Array.isArray(raw.decisions))n.decisions=raw.decisions;
  if(Array.isArray(raw.chat))n.chat=raw.chat.slice(-30);
  if(Array.isArray(raw.history))n.history=raw.history.slice(-100);
  if(Array.isArray(raw.review))n.review={money:raw.review[0]||'',name:raw.review[1]||'',waste:raw.review[2]||'',stop:raw.review[3]||'',next:raw.review[4]||'',saved:''};
  else if(raw.review)n.review={...n.review,...raw.review};
  if(raw.settings)n.settings={...n.settings,...raw.settings};
  if(raw.stats)n.stats={...n.stats,...raw.stats,daily:{...n.stats.daily,...(raw.stats.daily||{})}};
  return n;
}
function loadState(){
  try{
    const current=localStorage.getItem(KEY);
    if(current)return migrate(JSON.parse(current));
    for(const k of OLD_KEYS){const old=localStorage.getItem(k);if(old){const s=migrate(JSON.parse(old));localStorage.setItem(KEY,JSON.stringify(s));return s}}
  }catch(e){}
  return structuredClone(DEFAULT);
}
let state=loadState();

function registerOpen(){
  const today=iso(),last=state.stats.lastOpen;
  if(last!==today){
    if(last&&dayDiff(last,today)===1)state.stats.streak=(state.stats.streak||0)+1;
    else state.stats.streak=1;
    state.stats.lastOpen=today;
    state.stats.daily[today]={...(state.stats.daily[today]||{}),opened:true};
    trimDaily();
  }
}
function trimDaily(){const keys=Object.keys(state.stats.daily).sort();while(keys.length>45){delete state.stats.daily[keys.shift()]}}
registerOpen();

function save(msg){localStorage.setItem(KEY,JSON.stringify(state));render();if(msg)toast(msg)}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),1600)}
function modal(html){$('modal').innerHTML=html;$('modalWrap').classList.add('show')}
function closeModal(){$('modalWrap').classList.remove('show')}
$('modalWrap').addEventListener('click',e=>{if(e.target===$('modalWrap'))closeModal()});
window.closeModal=closeModal;

function go(screen){
  document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.dataset.screen===screen));
  document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===screen));
  scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.nav)));
document.querySelectorAll('[data-base]').forEach(b=>b.addEventListener('click',()=>openBase(b.dataset.base)));
function openBase(name){
  go('base');
  document.querySelectorAll('[data-base]').forEach(x=>x.classList.toggle('active',x.dataset.base===name));
  document.querySelectorAll('[data-pane]').forEach(x=>x.classList.toggle('active',x.dataset.pane===name));
  if(name==='voice')renderVoice();
}

function moneyStats(){
  const fact=(+state.money.fact||0)+state.deals.filter(d=>d.stage==='Получено').reduce((a,d)=>a+(+d.amount||0),0);
  const pipeline=state.deals.filter(d=>d.stage==='В работе').reduce((a,d)=>a+(+d.amount||0),0);
  const potential=state.deals.filter(d=>d.stage==='Потенциал').reduce((a,d)=>a+(+d.amount||0),0);
  return {fact,pipeline,potential,gap:Math.max(0,(+state.money.goal||0)-fact)};
}
function openPromises(){return state.people.filter(p=>!['Готово','Отменено'].includes(p.status))}
function activeProjects(){return state.projects.filter(p=>p.status==='Активно')}
function scoreTask(t){
  const x=(t.text||'').toLowerCase();let s=0;
  if(/клиент|деньг|оплат|сч[её]т|продаж|коммер|авито|лид|созвон/.test(x))s+=6;
  if(/сроч|сегодня|дедлайн|горит/.test(x))s+=5;
  if(/цито|бренд|контент|кейс|оффер/.test(x))s+=3;
  if(t.priority==='Высоко')s+=4;
  if(t.due&&t.due<=iso())s+=5;
  return s;
}
function radar(){
  const out=[],today=iso(),m=moneyStats();
  const overdueTasks=state.inbox.filter(x=>x.due&&x.due<today);
  const overduePeople=openPromises().filter(x=>x.date&&x.date<today);
  const overdueDeals=state.deals.filter(x=>!['Получено','Отказ'].includes(x.stage)&&x.date&&x.date<today);
  const stale=activeProjects().filter(p=>p.updated&&dayDiff(p.updated)>=7);
  const noNext=activeProjects().filter(p=>!p.next?.trim());
  const deadDeals=state.deals.filter(x=>['Потенциал','В работе'].includes(x.stage)&&!x.next?.trim());
  if(overdueTasks.length)out.push({level:'red',title:`Просрочено задач: ${overdueTasks.length}`,sub:'Срок уже прошёл. Закрой, перенеси или удали.',screen:'today'});
  if(overduePeople.length)out.push({level:'red',title:`Просрочено обещаний: ${overduePeople.length}`,sub:'Люди запоминают тишину лучше, чем мы надеемся.',base:'people'});
  if(overdueDeals.length)out.push({level:'red',title:`Сделки с просроченным шагом: ${overdueDeals.length}`,sub:'Деньги редко приходят сами напомнить о себе.',screen:'money'});
  if(m.gap>0&&m.pipeline===0)out.push({level:'red',title:'Денег в работе: 0 ₽',sub:`До цели ещё ${fmt(m.gap)}. Нужен конкретный коммерческий шаг.`,screen:'money'});
  if(noNext.length)out.push({level:'warn',title:`Проектов без следующего шага: ${noNext.length}`,sub:'Проект без next action быстро становится декорацией.',base:'projects'});
  if(stale.length)out.push({level:'warn',title:`Проектов без движения 7+ дней: ${stale.length}`,sub:stale.slice(0,3).map(x=>x.name).join(', '),base:'projects'});
  if(deadDeals.length)out.push({level:'warn',title:`Сделок без следующего шага: ${deadDeals.length}`,sub:'У каждой активной сделки должен быть следующий контакт.',screen:'money'});
  if(state.inbox.length>10)out.push({level:'warn',title:`Инбокс раздут: ${state.inbox.length}`,sub:'Это уже не память, а склад. Разбери верхние пункты.',screen:'today'});
  if(activeProjects().length>5)out.push({level:'info',title:`Активных проектов: ${activeProjects().length}`,sub:'Проверь, не называешь ли ты распыление амбициями.',base:'projects'});
  if(!out.length)out.push({level:'good',title:'Критических сигналов нет',sub:'Редкий момент. Используй тишину на сильное действие.',screen:'today'});
  return out;
}
function opsScore(){
  const m=moneyStats(),focusDone=state.focus.filter(f=>f.done).length;
  let score=0;
  score+=Math.round(focusDone/3*25);
  score+=m.fact>0?12:0;score+=m.pipeline>0?8:0;
  score+=Math.max(0,20-Math.min(20,state.inbox.length*2));
  const overdue=openPromises().filter(x=>x.date&&x.date<iso()).length;
  score+=Math.max(0,15-overdue*5);
  const active=activeProjects(),goodProjects=active.filter(p=>p.next?.trim()).length;
  score+=active.length?Math.round(goodProjects/active.length*10):10;
  score+=state.review.saved&&dayDiff(state.review.saved)<=7?10:0;
  return Math.max(0,Math.min(100,score));
}
function getBrief(){
  const m=moneyStats(),done=state.focus.filter(f=>f.done).length,r=radar().filter(x=>x.level!=='good');
  let lead='';
  if(done===3)lead='Три главных закрыты. Зафиксируй результат и не превращай успех в повод набрать ещё десять задач.';
  else if(r.some(x=>x.level==='red'))lead='Есть красный сигнал. Сначала разбери то, что уже горит, потом занимайся красивыми новыми идеями.';
  else if(m.pipeline>0)lead=`В работе ${fmt(m.pipeline)}. Первым делом толкай ближайшую к оплате сделку.`;
  else if(state.inbox.length)lead=`В инбоксе ${state.inbox.length}. Выбери действие ближе всего к деньгам, имени или свободе.`;
  else lead='Инбокс чист. Не заполняй пустоту суетой. Сделай один сильный шаг по главному проекту.';
  const tail=[];if(openPromises().length)tail.push(`${openPromises().length} обязательств людям`);if(m.gap>0)tail.push(`до цели ${fmt(m.gap)}`);
  return lead+(tail.length?' В поле зрения: '+tail.join(', ')+'.':'');
}
function contextBrief(){
  const m=moneyStats(),r=radar().filter(x=>x.level!=='good');
  return `VALENTIN OS — БРИФ ДЛЯ ЭДРИАНА\nДата: ${new Date().toLocaleDateString('ru-RU')}\nОперационный индекс: ${opsScore()}/100\n\nРАДАР:\n${r.map(x=>'- '+x.title+': '+x.sub).join('\n')||'- критических сигналов нет'}\n\nТРИ ГЛАВНЫХ:\n${state.focus.map((f,i)=>`${i+1}. ${f.done?'[готово]':'[в работе]'} ${f.text}`).join('\n')}\n\nДЕНЬГИ: цель ${fmt(state.money.goal)}, получено ${fmt(m.fact)}, в работе ${fmt(m.pipeline)}, потенциал ${fmt(m.potential)}, до цели ${fmt(m.gap)}.\n\nАКТИВНЫЕ ПРОЕКТЫ:\n${activeProjects().map(p=>`- ${p.name}: ${p.next||'следующий шаг не задан'} (${p.progress||0}%)`).join('\n')||'- нет'}\n\nЛЮДИ:\n${openPromises().slice(0,10).map(p=>`- ${p.name}: ${p.promise}${p.date?' до '+p.date:''}`).join('\n')||'- нет'}\n\nИНБОКС (${state.inbox.length}):\n${state.inbox.slice().sort((a,b)=>scoreTask(b)-scoreTask(a)).slice(0,12).map(x=>`- ${x.text}${x.due?' ['+x.due+']':''}`).join('\n')||'- пусто'}\n\nРазбери как мой цифровой партнёр: что главное, что выкинуть, где деньги, кого не забыть и какие 3 действия сделать следующими.`;
}

function focusHTML(){return state.focus.map((f,i)=>`<div class="task ${f.done?'done':''}"><button class="check" onclick="toggleFocus('${f.id}')">${f.done?'✓':''}</button><div class="task-copy"><b>${esc(f.text)}</b><small>главный фокус · слот ${i+1}</small></div>${!f.done?`<button class="triage-btn" onclick="startFocus('${f.id}')">Фокус</button>`:''}</div>`).join('')}
window.toggleFocus=id=>{const f=state.focus.find(x=>x.id===id);if(f){f.done=!f.done;state.stats.daily[iso()]={...(state.stats.daily[iso()]||{}),focusDone:state.focus.filter(x=>x.done).length};save()}};

function renderRadar(){
  const r=radar();$('radarBadge').textContent=r.filter(x=>x.level!=='good').length;
  $('radarList').innerHTML=r.map((x,i)=>`<div class="radar ${x.level}"><span class="dot"></span><div class="radar-copy"><strong>${esc(x.title)}</strong><small>${esc(x.sub)}</small></div>${x.screen||x.base?`<button onclick="openRadar(${i})">›</button>`:''}</div>`).join('');
  window._radar=r;
}
window.openRadar=i=>{const x=window._radar[i];if(x.screen)go(x.screen);if(x.base)openBase(x.base)};

function renderInbox(){
  $('inboxBadge').textContent=state.inbox.length;
  const list=state.inbox.slice().sort((a,b)=>scoreTask(b)-scoreTask(a));
  $('inboxList').innerHTML=list.length?list.map(t=>`<div class="task"><button class="check" onclick="finishInbox('${t.id}')"></button><div class="task-copy"><b>${esc(t.text)}</b><small>${esc(t.priority||'Обычно')}${t.due?' · до '+esc(t.due):''} · ${esc(t.created||'')}</small></div><div class="task-actions"><button class="triage-btn" onclick="promoteTask('${t.id}')">→3</button>${t.due?`<button class="mini" onclick="calendarTask('${t.id}')">↗</button>`:''}<button class="mini" onclick="editInbox('${t.id}')">⋯</button></div></div>`).join(''):'<div class="empty">Инбокс пуст. Не надо срочно выдумывать себе занятость.</div>';
}
window.finishInbox=id=>{const t=state.inbox.find(x=>x.id===id);if(t)state.history.push({id:uid(),type:'task',text:t.text,created:nowLabel(),date:iso()});state.inbox=state.inbox.filter(x=>x.id!==id);save('Закрыто')};
window.promoteTask=id=>{const t=state.inbox.find(x=>x.id===id);if(!t)return;const slot=state.focus.findIndex(f=>f.done||/^Действие №|^Главное дело/.test(f.text));if(slot>=0){state.focus[slot]={id:uid(),text:t.text,done:false};state.inbox=state.inbox.filter(x=>x.id!==id);save('В трёх главных')}else modal(`<h2>Куда поставить?</h2>${state.focus.map((f,i)=>`<button class="btn secondary full" onclick="replaceFocus(${i},'${id}')">${i+1}. ${esc(f.text)}</button>`).join('')}`)};
window.replaceFocus=(i,id)=>{const t=state.inbox.find(x=>x.id===id);if(!t)return;state.focus[i]={id:uid(),text:t.text,done:false};state.inbox=state.inbox.filter(x=>x.id!==id);closeModal();save('Фокус заменён')};
window.editInbox=id=>{const t=state.inbox.find(x=>x.id===id);if(!t)return;modal(`<h2>Задача</h2><textarea id="eiText" class="textarea">${esc(t.text)}</textarea><div class="modal-grid"><select id="eiPriority" class="select"><option>Обычно</option><option>Высоко</option><option>Низко</option></select><input id="eiDue" class="input" type="date" value="${esc(t.due||'')}"></div><div class="modal-actions"><button class="btn danger" onclick="deleteInbox('${id}')">Удалить</button><button class="btn" onclick="saveInbox('${id}')">Сохранить</button></div>`);$('eiPriority').value=t.priority||'Обычно'};
window.saveInbox=id=>{const t=state.inbox.find(x=>x.id===id);t.text=$('eiText').value.trim();t.priority=$('eiPriority').value;t.due=$('eiDue').value;closeModal();save('Сохранено')};
window.deleteInbox=id=>{state.inbox=state.inbox.filter(x=>x.id!==id);closeModal();save('Удалено')};
window.calendarTask=id=>{const t=state.inbox.find(x=>x.id===id);if(t?.due)downloadICS(t.text,t.due,'Задача из VALENTIN OS')};
