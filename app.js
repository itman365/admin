const KEY='valentin_os_v4';
const OLD_KEY='valentin_os_live_v1';
const $=id=>document.getElementById(id);
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=n=>new Intl.NumberFormat('ru-RU').format(Math.round(Number(n)||0))+' ₽';
const iso=()=>new Date().toISOString().slice(0,10);
const nowLabel=()=>new Date().toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});

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
  deals:[],people:[],ideas:[],decisions:[],chat:[],
  review:{money:'',name:'',waste:'',stop:'',next:''}
};

function migrate(raw){
  if(!raw) return structuredClone(DEFAULT);
  const n=structuredClone(DEFAULT);
  if(Array.isArray(raw.focus)) n.focus=raw.focus.slice(0,3).map(x=>({id:x.id||uid(),text:x.text||x.t||'Главное дело',done:Boolean(x.done??x.d)}));
  if(Array.isArray(raw.inbox)) n.inbox=raw.inbox.map(x=>({id:x.id||uid(),text:x.text||x.t||'',created:x.created||x.c||nowLabel(),due:x.due||'',priority:x.priority||'Обычно'}));
  if(Array.isArray(raw.projects)) n.projects=raw.projects.map(x=>({id:x.id||uid(),name:x.name||x.n||'Проект',status:x.status||x.s||'Активно',next:x.next||'',progress:Number(x.progress??x.p)||0,updated:x.updated||iso()}));
  n.money={goal:Number(raw.money?.goal)||300000,fact:Number(raw.money?.fact)||0};
  if(Array.isArray(raw.deals)) n.deals=raw.deals.map(x=>({id:x.id||uid(),name:x.name||x.n||'Сделка',amount:Number(x.amount??x.a)||0,stage:x.stage||x.s||'Потенциал',next:x.next||'',date:x.date||''}));
  if(Array.isArray(raw.people)) n.people=raw.people.map(x=>({id:x.id||uid(),name:x.name||x.n||'Человек',promise:x.promise||x.t||'',status:x.status||'Открыто',date:x.date||''}));
  if(Array.isArray(raw.ideas)) n.ideas=raw.ideas.map(x=>({id:x.id||uid(),text:x.text||x.t||'',type:x.type||'Идея',status:x.status||'Новая'}));
  if(Array.isArray(raw.decisions)) n.decisions=raw.decisions;
  if(Array.isArray(raw.chat)) n.chat=raw.chat.slice(-20);
  if(Array.isArray(raw.review)) n.review={money:raw.review[0]||'',name:raw.review[1]||'',waste:raw.review[2]||'',stop:raw.review[3]||'',next:raw.review[4]||''};
  else if(raw.review) n.review={...n.review,...raw.review};
  return n;
}

function loadState(){
  try{
    const current=localStorage.getItem(KEY);
    if(current) return migrate(JSON.parse(current));
    const old=localStorage.getItem(OLD_KEY);
    const s=old?migrate(JSON.parse(old)):structuredClone(DEFAULT);
    localStorage.setItem(KEY,JSON.stringify(s));
    return s;
  }catch(e){return structuredClone(DEFAULT)}
}
let state=loadState();

function save(msg){localStorage.setItem(KEY,JSON.stringify(state));render();if(msg)toast(msg)}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),1500)}
function modal(html){$('modal').innerHTML=html;$('modalWrap').classList.add('show')}
function closeModal(){$('modalWrap').classList.remove('show')}
$('modalWrap').addEventListener('click',e=>{if(e.target===$('modalWrap'))closeModal()});

function go(screen){
  document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.dataset.screen===screen));
  document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===screen));
  scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.nav)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
document.querySelectorAll('[data-base]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-base]').forEach(x=>x.classList.toggle('active',x===b));
  document.querySelectorAll('[data-pane]').forEach(x=>x.classList.toggle('active',x.dataset.pane===b.dataset.base));
  if(b.dataset.base==='voice')renderVoice();
}));

function moneyStats(){
  const dealFact=state.deals.filter(d=>d.stage==='Получено').reduce((a,d)=>a+(+d.amount||0),0);
  const pipeline=state.deals.filter(d=>d.stage==='В работе').reduce((a,d)=>a+(+d.amount||0),0);
  const potential=state.deals.filter(d=>d.stage==='Потенциал').reduce((a,d)=>a+(+d.amount||0),0);
  const fact=(+state.money.fact||0)+dealFact;
  return {fact,pipeline,potential,gap:Math.max(0,(+state.money.goal||0)-fact)};
}
function openPromises(){return state.people.filter(p=>p.status!=='Готово'&&p.status!=='Отменено')}
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
function getBrief(){
  const m=moneyStats(),done=state.focus.filter(f=>f.done).length,open=openPromises(),projects=activeProjects();
  const weak=projects.find(p=>!p.next)||projects.find(p=>(+p.progress||0)<20);
  let lead='';
  if(done===3) lead='Три главных закрыты. Не надо срочно придумывать себе ещё двенадцать дел. Зафиксируй результат и добей один хвост.';
  else if(m.pipeline>0) lead=`Главное сейчас — деньги в движении: ${fmt(m.pipeline)} уже в работе. Первым делом толкай ближайшую к оплате сделку.`;
  else if(state.inbox.length) lead=`У тебя ${state.inbox.length} пунктов в инбоксе. Сначала выбери действие, которое ближе всего к деньгам или сильному результату, а не самое приятное.`;
  else lead='Инбокс чист. Редкая роскошь. Используй её на один сильный шаг по главному проекту.';
  const tail=[];
  if(open.length)tail.push(`${open.length} незакрытых обязательств по людям`);
  if(weak)tail.push(`проверь проект «${weak.name}»`);
  if(m.gap>0)tail.push(`до цели месяца ещё ${fmt(m.gap)}`);
  return lead+(tail.length?' В поле зрения: '+tail.join(', ')+'.':'');
}
function contextBrief(){
  const m=moneyStats();
  return `ВАЛЕНТИН OS — текущий бриф\n\nТри главных:\n${state.focus.map((f,i)=>`${i+1}. ${f.done?'[готово]':'[в работе]'} ${f.text}`).join('\n')}\n\nДеньги: цель ${fmt(state.money.goal)}, получено ${fmt(m.fact)}, в работе ${fmt(m.pipeline)}, потенциал ${fmt(m.potential)}, до цели ${fmt(m.gap)}.\n\nАктивные проекты:\n${activeProjects().map(p=>`- ${p.name}: ${p.next||'следующий шаг не задан'} (${p.progress||0}%)`).join('\n')||'- нет'}\n\nНезакрытые обещания людям:\n${openPromises().slice(0,8).map(p=>`- ${p.name}: ${p.promise}${p.date?' до '+p.date:''}`).join('\n')||'- нет'}\n\nИнбокс (${state.inbox.length}):\n${state.inbox.slice(0,10).map(x=>`- ${x.text}`).join('\n')||'- пусто'}\n\nИдеи: ${state.ideas.length}. Решения: ${state.decisions.length}.\n\nРазбери ситуацию как мой цифровой партнёр Эдриан: что главное, что убрать, где деньги и какие 3 действия сделать следующими.`;
}

function focusHTML(){return state.focus.map(f=>`<div class="task ${f.done?'done':''}"><button class="check" onclick="toggleFocus('${f.id}')">${f.done?'✓':''}</button><div class="task-copy"><b>${esc(f.text)}</b><small>главный фокус</small></div></div>`).join('')}
window.toggleFocus=id=>{const f=state.focus.find(x=>x.id===id);if(f){f.done=!f.done;save()}};

function renderInbox(){
  $('inboxBadge').textContent=state.inbox.length;
  $('inboxList').innerHTML=state.inbox.length?state.inbox.sort((a,b)=>scoreTask(b)-scoreTask(a)).map(t=>`<div class="task"><button class="check" onclick="finishInbox('${t.id}')"></button><div class="task-copy"><b>${esc(t.text)}</b><small>${esc(t.priority||'Обычно')}${t.due?' · до '+esc(t.due):''} · ${esc(t.created||'')}</small></div><div class="task-actions">${t.due?`<button class="mini" onclick="calendarTask('${t.id}')" title="В календарь">↗</button>`:''}<button class="mini" onclick="editInbox('${t.id}')">⋯</button></div></div>`).join(''):'<div class="empty">Инбокс пуст. Это не повод срочно придумать себе работу.</div>';
}
window.finishInbox=id=>{state.inbox=state.inbox.filter(x=>x.id!==id);save('Закрыто')};
window.editInbox=id=>{const t=state.inbox.find(x=>x.id===id);if(!t)return;modal(`<h2>Задача</h2><textarea id="eiText" class="textarea">${esc(t.text)}</textarea><div class="modal-grid"><select id="eiPriority" class="select"><option>Обычно</option><option>Высоко</option><option>Низко</option></select><input id="eiDue" class="input" type="date" value="${esc(t.due||'')}"></div><div class="modal-actions"><button class="btn danger" onclick="deleteInbox('${id}')">Удалить</button><button class="btn" onclick="saveInbox('${id}')">Сохранить</button></div>`);$('eiPriority').value=t.priority||'Обычно'};
window.saveInbox=id=>{const t=state.inbox.find(x=>x.id===id);t.text=$('eiText').value.trim();t.priority=$('eiPriority').value;t.due=$('eiDue').value;closeModal();save('Сохранено')};
window.deleteInbox=id=>{state.inbox=state.inbox.filter(x=>x.id!==id);closeModal();save('Удалено')};
window.calendarTask=id=>{const t=state.inbox.find(x=>x.id===id);if(t&&t.due)downloadICS(t.text,t.due,'Задача из VALENTIN OS')};

function renderProjects(){
  $('projectsList').innerHTML=state.projects.length?state.projects.map(p=>`<div class="project" onclick="editProject('${p.id}')"><div class="project-top"><div><h3>${esc(p.name)}</h3><p><b>Следующий шаг:</b> ${esc(p.next||'не задан')}</p></div><span class="tag">${esc(p.status)}</span></div><div class="progress"><i style="width:${Math.max(0,Math.min(100,+p.progress||0))}%"></i></div></div>`).join(''):'<div class="empty">Проектов нет.</div>';
}
window.editProject=id=>{const p=state.projects.find(x=>x.id===id);if(!p)return;modal(`<h2>Проект</h2><input id="pName" class="input" value="${esc(p.name)}"><textarea id="pNext" class="textarea" placeholder="Следующий конкретный шаг">${esc(p.next||'')}</textarea><div class="modal-grid"><select id="pStatus" class="select"><option>Активно</option><option>Пауза</option><option>Готово</option><option>Закрыто</option></select><input id="pProgress" class="input" type="number" min="0" max="100" value="${+p.progress||0}"></div><div class="modal-actions"><button class="btn danger" onclick="deleteProject('${id}')">Удалить</button><button class="btn" onclick="saveProject('${id}')">Сохранить</button></div>`);$('pStatus').value=p.status};
window.saveProject=id=>{const p=state.projects.find(x=>x.id===id);p.name=$('pName').value.trim()||'Проект';p.next=$('pNext').value.trim();p.status=$('pStatus').value;p.progress=+$('pProgress').value||0;p.updated=iso();closeModal();save('Проект обновлён')};
window.deleteProject=id=>{state.projects=state.projects.filter(x=>x.id!==id);closeModal();save('Удалено')};

function renderDeals(){
  $('dealsList').innerHTML=state.deals.length?state.deals.map(d=>`<div class="deal"><div class="item-top"><div><h3>${esc(d.name)} · ${fmt(d.amount)}</h3><p>${esc(d.stage)}${d.next?' · '+esc(d.next):''}${d.date?' · '+esc(d.date):''}</p></div><div class="task-actions">${d.date?`<button class="mini" onclick="calendarDeal('${d.id}')">↗</button>`:''}<button class="mini" onclick="editDeal('${d.id}')">⋯</button></div></div></div>`).join(''):'<div class="empty">Сделок пока нет. Деньги предпочитают конкретику, отвратительная привычка.</div>';
}
window.editDeal=id=>{const d=state.deals.find(x=>x.id===id);if(!d)return;modal(`<h2>Сделка</h2><input id="dName" class="input" value="${esc(d.name)}"><div class="modal-grid"><input id="dAmount" class="input" type="number" value="${+d.amount||0}"><select id="dStage" class="select"><option>Потенциал</option><option>В работе</option><option>Получено</option><option>Отказ</option></select></div><input id="dNext" class="input" value="${esc(d.next||'')}" placeholder="Следующий шаг"><input id="dDate" class="input" type="date" value="${esc(d.date||'')}"><div class="modal-actions"><button class="btn danger" onclick="deleteDeal('${id}')">Удалить</button><button class="btn" onclick="saveDeal('${id}')">Сохранить</button></div>`);$('dStage').value=d.stage};
window.saveDeal=id=>{const d=state.deals.find(x=>x.id===id);d.name=$('dName').value.trim()||'Сделка';d.amount=+$('dAmount').value||0;d.stage=$('dStage').value;d.next=$('dNext').value.trim();d.date=$('dDate').value;closeModal();save('Сделка обновлена')};
window.deleteDeal=id=>{state.deals=state.deals.filter(x=>x.id!==id);closeModal();save('Удалено')};
window.calendarDeal=id=>{const d=state.deals.find(x=>x.id===id);if(d&&d.date)downloadICS('Сделка: '+d.name,d.date,d.next||'VALENTIN OS')};

function renderPeople(){
  $('peopleList').innerHTML=state.people.length?state.people.map(p=>`<div class="person"><div class="item-top"><div><h3>${esc(p.name)}</h3><p>${esc(p.promise||'')}${p.date?' · '+esc(p.date):''}</p></div><div><span class="tag">${esc(p.status)}</span>${p.date?`<button class="mini" onclick="calendarPerson('${p.id}')">↗</button>`:''}<button class="mini" onclick="editPerson('${p.id}')">⋯</button></div></div></div>`).join(''):'<div class="empty">Незакрытых людей нет. Пользуйся моментом.</div>';
}
window.editPerson=id=>{const p=state.people.find(x=>x.id===id);if(!p)return;modal(`<h2>Человек / обещание</h2><input id="peName" class="input" value="${esc(p.name)}"><textarea id="pePromise" class="textarea">${esc(p.promise||'')}</textarea><div class="modal-grid"><select id="peStatus" class="select"><option>Открыто</option><option>Жду</option><option>Готово</option><option>Отменено</option></select><input id="peDate" class="input" type="date" value="${esc(p.date||'')}"></div><div class="modal-actions"><button class="btn danger" onclick="deletePerson('${id}')">Удалить</button><button class="btn" onclick="savePerson('${id}')">Сохранить</button></div>`);$('peStatus').value=p.status};
window.savePerson=id=>{const p=state.people.find(x=>x.id===id);p.name=$('peName').value.trim()||'Человек';p.promise=$('pePromise').value.trim();p.status=$('peStatus').value;p.date=$('peDate').value;closeModal();save('Сохранено')};
window.deletePerson=id=>{state.people=state.people.filter(x=>x.id!==id);closeModal();save('Удалено')};
window.calendarPerson=id=>{const p=state.people.find(x=>x.id===id);if(p&&p.date)downloadICS(p.name+': '+p.promise,p.date,'VALENTIN OS')};

function renderIdeas(){
  $('ideasList').innerHTML=state.ideas.length?state.ideas.map(i=>`<div class="idea"><div class="item-top"><div><h3>${esc(i.text)}</h3><p>${esc(i.type)} · ${esc(i.status)}</p></div><button class="mini" onclick="editIdea('${i.id}')">⋯</button></div></div>`).join(''):'<div class="empty">Идей пока нет. Подозрительно тихо.</div>';
}
window.editIdea=id=>{const i=state.ideas.find(x=>x.id===id);if(!i)return;modal(`<h2>Идея</h2><textarea id="iText" class="textarea">${esc(i.text)}</textarea><div class="modal-grid"><select id="iType" class="select"><option>Идея</option><option>Контент</option><option>Оффер</option><option>Бизнес</option><option>Личное</option></select><select id="iStatus" class="select"><option>Новая</option><option>В работе</option><option>Использовано</option><option>Архив</option></select></div><div class="modal-actions"><button class="btn danger" onclick="deleteIdea('${id}')">Удалить</button><button class="btn" onclick="saveIdea('${id}')">Сохранить</button></div>`);$('iType').value=i.type;$('iStatus').value=i.status};
window.saveIdea=id=>{const i=state.ideas.find(x=>x.id===id);i.text=$('iText').value.trim();i.type=$('iType').value;i.status=$('iStatus').value;closeModal();save('Сохранено')};
window.deleteIdea=id=>{state.ideas=state.ideas.filter(x=>x.id!==id);closeModal();save('Удалено')};

function renderDecisions(){
  $('decisionsList').innerHTML=state.decisions.length?state.decisions.slice().reverse().map(d=>`<div class="decision"><div class="item-top"><div><h3>${esc(d.text)}</h3><p>${esc(d.created)}</p></div><button class="mini" onclick="deleteDecision('${d.id}')">×</button></div></div>`).join(''):'<div class="empty">Решений пока нет. Когда фиксируешь решение, мозгу сложнее потом переписать историю.</div>';
}
window.deleteDecision=id=>{state.decisions=state.decisions.filter(x=>x.id!==id);save('Удалено')};

function renderChat(){
  if(!state.chat.length)state.chat=[{who:'adrian',text:'Я на месте. Здесь можно говорить коротко: «что главное?», «разложи день», «сделка 120000 Амаяк», «идея …», «задача …». Я не изображаю всезнающий ИИ: работаю с тем, что реально записано в твоём VALENTIN OS.',at:nowLabel()}];
  $('adrianChat').innerHTML=state.chat.slice(-18).map(m=>`<div class="bubble ${m.who}">${esc(m.text)}<small>${esc(m.at||'')}</small></div>`).join('');
  $('adrianChat').scrollTop=$('adrianChat').scrollHeight;
}
function addChat(who,text){state.chat.push({who,text,at:nowLabel()});state.chat=state.chat.slice(-24)}
function parseAmount(text){const m=text.match(/(\d[\d\s.,]*)\s*(млн|миллион|тыс|к|k)?/i);if(!m)return 0;let n=parseFloat(m[1].replace(/\s/g,'').replace(',','.'))||0;const u=(m[2]||'').toLowerCase();if(u==='млн'||u==='миллион')n*=1000000;if(u==='тыс'||u==='к'||u==='k')n*=1000;return Math.round(n)}
function adrianAnswer(text){
  const q=text.trim(),l=q.toLowerCase(),m=moneyStats();
  if(!q)return '';
  if(/что главн|приоритет|фокус/.test(l))return getBrief();
  if(/деньг|касс|сделк.*сколько/.test(l))return `По деньгам: получено ${fmt(m.fact)}, в работе ${fmt(m.pipeline)}, потенциал ${fmt(m.potential)}, до цели ${fmt(m.gap)}. ${m.pipeline?'Не распыляйся: сначала двигай сделки в работе к оплате.':'В работе денег сейчас нет. Значит первая задача — создать или продвинуть конкретную сделку.'}`;
  if(/кому ответ|люд|обещан/.test(l)){const p=openPromises();return p.length?'Незакрыто по людям:\n'+p.slice(0,7).map(x=>`• ${x.name}: ${x.promise}${x.date?' до '+x.date:''}`).join('\n'):'По людям хвостов нет.'}
  if(/где затык|проблем|тормоз/.test(l)){const issues=[];if(state.inbox.length>8)issues.push(`инбокс раздут до ${state.inbox.length}`);const np=activeProjects().filter(p=>!p.next);if(np.length)issues.push(`${np.length} проекта без следующего шага`);if(openPromises().length>5)issues.push(`${openPromises().length} обязательств по людям`);if(m.pipeline===0&&m.gap>0)issues.push('до цели есть разрыв, но денег «в работе» нет');return issues.length?'Вижу вот что: '+issues.join('; ')+'. Выбирай первый пункт, который напрямую бьёт по деньгам или главному проекту.':'Явного системного затыка по данным не вижу. Значит проблема, скорее всего, не в списках, а в выборе одного действия и доведении его до конца.'}
  if(/разложи день|собери день|выбери три/.test(l)){const picks=state.inbox.slice().sort((a,b)=>scoreTask(b)-scoreTask(a)).slice(0,3);if(!picks.length)return 'Инбокс пуст. Я не буду выдумывать тебе занятость. Возьми следующий шаг самого важного активного проекта.';state.focus=picks.map(x=>({id:uid(),text:x.text,done:false}));state.inbox=state.inbox.filter(x=>!picks.some(p=>p.id===x.id));return 'Собрал три главных из инбокса по деньгам, срочности и влиянию. Остальное оставил за бортом.'}
  if(l.startsWith('задача ')){const t=q.replace(/^задача\s+/i,'').trim();state.inbox.unshift({id:uid(),text:t,created:nowLabel(),due:'',priority:'Обычно'});return `Записал задачу: ${t}`}
  if(l.startsWith('идея ')){const t=q.replace(/^идея\s+/i,'').trim();state.ideas.unshift({id:uid(),text:t,type:'Идея',status:'Новая'});return `Сохранил идею. Не оцениваю её раньше времени: ${t}`}
  if(l.startsWith('решение ')){const t=q.replace(/^решение\s+/i,'').trim();state.decisions.push({id:uid(),text:t,created:nowLabel()});return `Зафиксировал решение: ${t}`}
  if(l.startsWith('сделка ')){const amount=parseAmount(q);let name=q.replace(/^сделка\s+/i,'').replace(/\d[\d\s.,]*\s*(млн|миллион|тыс|к|k)?/i,'').trim()||'Новая сделка';state.deals.unshift({id:uid(),name,amount,stage:'Потенциал',next:'',date:''});return `Добавил сделку «${name}»${amount?' на '+fmt(amount):''}. Статус: потенциал.`}
  if(l.startsWith('обещал ')){const body=q.replace(/^обещал\s+/i,'').trim(),parts=body.split(':');const name=(parts.shift()||'Человек').trim(),promise=parts.join(':').trim()||'Уточнить обещание';state.people.unshift({id:uid(),name,promise,status:'Открыто',date:''});return `Записал обязательство по ${name}: ${promise}`}
  state.inbox.unshift({id:uid(),text:q,created:nowLabel(),due:'',priority:'Обычно'});return 'Не стал изображать телепата. Положил это в инбокс, чтобы мысль не потерялась.';
}
function runCommand(text){addChat('user',text);const answer=adrianAnswer(text);addChat('adrian',answer);save();renderChat()}

function render(){
  const m=moneyStats(),done=state.focus.filter(f=>f.done).length;
  $('briefText').textContent=getBrief();$('briefTitle').textContent=done===3?'День закрыт красиво':'Что важно прямо сейчас';
  $('homeFocus').innerHTML=focusHTML();$('todayFocus').innerHTML=focusHTML();
  $('metricFact').textContent=fmt(m.fact);$('metricPipeline').textContent=fmt(m.pipeline);$('metricInbox').textContent=state.inbox.length;$('metricPeople').textContent=openPromises().length;
  $('moneyFact').textContent=fmt(m.fact);$('moneyGoal').textContent=fmt(state.money.goal);$('moneyPipeline').textContent=fmt(m.pipeline);$('moneyPotential').textContent=fmt(m.potential);$('moneyGap').textContent=fmt(m.gap);$('moneyProgress').style.width=Math.min(100,m.fact/Math.max(1,state.money.goal)*100)+'%';
  renderInbox();renderProjects();renderDeals();renderPeople();renderIdeas();renderDecisions();renderChat();
  $('reviewMoney').value=state.review.money||'';$('reviewName').value=state.review.name||'';$('reviewWaste').value=state.review.waste||'';$('reviewStop').value=state.review.stop||'';$('reviewNext').value=state.review.next||'';
}

$('quickAddBtn').addEventListener('click',()=>{const v=$('quickInput').value.trim();if(!v)return;state.inbox.unshift({id:uid(),text:v,created:nowLabel(),due:'',priority:'Обычно'});$('quickInput').value='';save('В инбоксе')});
$('quickInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('quickAddBtn').click()});
$('quickTaskBtn').addEventListener('click',()=>modal(`<h2>Быстро добавить</h2><textarea id="qaText" class="textarea" placeholder="Что записать?"></textarea><select id="qaType" class="select"><option value="task">Задача</option><option value="idea">Идея</option><option value="decision">Решение</option></select><div class="modal-actions"><button class="btn" onclick="saveQuickAdd()">Добавить</button></div>`));
window.saveQuickAdd=()=>{const t=$('qaText').value.trim(),type=$('qaType').value;if(!t)return;if(type==='task')state.inbox.unshift({id:uid(),text:t,created:nowLabel(),due:'',priority:'Обычно'});if(type==='idea')state.ideas.unshift({id:uid(),text:t,type:'Идея',status:'Новая'});if(type==='decision')state.decisions.push({id:uid(),text:t,created:nowLabel()});closeModal();save('Добавлено')};

$('editFocusBtn').addEventListener('click',()=>modal(`<h2>Три главных</h2>${[0,1,2].map(i=>`<input id="focusEdit${i}" class="input" value="${esc(state.focus[i]?.text||'')}">`).join('')}<div class="modal-actions"><button class="btn" onclick="saveFocus()">Сохранить</button></div>`));
window.saveFocus=()=>{state.focus=[0,1,2].map(i=>({id:state.focus[i]?.id||uid(),text:$('focusEdit'+i).value.trim()||`Главное дело ${i+1}`,done:false}));closeModal();save('Фокус обновлён')};

$('addProjectBtn').addEventListener('click',()=>modal(`<h2>Новый проект</h2><input id="npName" class="input" placeholder="Название"><textarea id="npNext" class="textarea" placeholder="Следующий конкретный шаг"></textarea><div class="modal-actions"><button class="btn" onclick="addProject()">Добавить</button></div>`));
window.addProject=()=>{state.projects.unshift({id:uid(),name:$('npName').value.trim()||'Новый проект',status:'Активно',next:$('npNext').value.trim(),progress:0,updated:iso()});closeModal();save('Проект добавлен')};

$('moneySettingsBtn').addEventListener('click',()=>modal(`<h2>Деньги месяца</h2><div class="modal-grid"><input id="msGoal" class="input" type="number" value="${state.money.goal}" placeholder="Цель"><input id="msFact" class="input" type="number" value="${state.money.fact}" placeholder="Факт вне сделок"></div><div class="modal-actions"><button class="btn" onclick="saveMoneySettings()">Сохранить</button></div>`));
window.saveMoneySettings=()=>{state.money.goal=+$('msGoal').value||0;state.money.fact=+$('msFact').value||0;closeModal();save('Деньги обновлены')};
$('addDealBtn').addEventListener('click',()=>modal(`<h2>Новая сделка</h2><input id="ndName" class="input" placeholder="Клиент / источник"><div class="modal-grid"><input id="ndAmount" class="input" type="number" placeholder="Сумма"><select id="ndStage" class="select"><option>Потенциал</option><option>В работе</option><option>Получено</option></select></div><input id="ndNext" class="input" placeholder="Следующий шаг"><input id="ndDate" class="input" type="date"><div class="modal-actions"><button class="btn" onclick="addDeal()">Добавить</button></div>`));
window.addDeal=()=>{state.deals.unshift({id:uid(),name:$('ndName').value.trim()||'Новая сделка',amount:+$('ndAmount').value||0,stage:$('ndStage').value,next:$('ndNext').value.trim(),date:$('ndDate').value});closeModal();save('Сделка добавлена')};

$('addPersonBtn').addEventListener('click',()=>modal(`<h2>Человек / обещание</h2><input id="newPersonName" class="input" placeholder="Имя"><textarea id="newPersonPromise" class="textarea" placeholder="Что обещал / чего ждёшь"></textarea><input id="newPersonDate" class="input" type="date"><div class="modal-actions"><button class="btn" onclick="addPerson()">Добавить</button></div>`));
window.addPerson=()=>{state.people.unshift({id:uid(),name:$('newPersonName').value.trim()||'Человек',promise:$('newPersonPromise').value.trim(),status:'Открыто',date:$('newPersonDate').value});closeModal();save('Добавлено')};
$('addIdeaBtn').addEventListener('click',()=>modal(`<h2>Новая идея</h2><textarea id="newIdeaText" class="textarea" placeholder="Идея, контент, оффер, схема…"></textarea><select id="newIdeaType" class="select"><option>Идея</option><option>Контент</option><option>Оффер</option><option>Бизнес</option><option>Личное</option></select><div class="modal-actions"><button class="btn" onclick="addIdea()">Добавить</button></div>`));
window.addIdea=()=>{state.ideas.unshift({id:uid(),text:$('newIdeaText').value.trim()||'Без названия',type:$('newIdeaType').value,status:'Новая'});closeModal();save('Идея сохранена')};
$('addDecisionBtn').addEventListener('click',()=>modal(`<h2>Зафиксировать решение</h2><textarea id="decisionText" class="textarea" placeholder="Что решил и почему?"></textarea><div class="modal-actions"><button class="btn" onclick="addDecision()">Зафиксировать</button></div>`));
window.addDecision=()=>{const t=$('decisionText').value.trim();if(!t)return;state.decisions.push({id:uid(),text:t,created:nowLabel()});closeModal();save('Решение зафиксировано')};

$('saveReviewBtn').addEventListener('click',()=>{state.review={money:$('reviewMoney').value,name:$('reviewName').value,waste:$('reviewWaste').value,stop:$('reviewStop').value,next:$('reviewNext').value};save('Неделя сохранена')});

$('refreshBriefBtn').addEventListener('click',()=>{render();toast('Брифинг обновлён')});
$('speakBriefBtn').addEventListener('click',()=>{if(!('speechSynthesis'in window)){toast('Озвучка не поддерживается');return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(getBrief());u.lang='ru-RU';u.rate=.96;u.pitch=.92;speechSynthesis.speak(u)});

$('adrianSendBtn').addEventListener('click',()=>{const v=$('adrianInput').value.trim();if(!v)return;$('adrianInput').value='';runCommand(v)});
$('adrianInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('adrianSendBtn').click()});
document.querySelectorAll('[data-cmd]').forEach(b=>b.addEventListener('click',()=>runCommand(b.dataset.cmd)));
$('copyContextBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(contextBrief());toast('Бриф скопирован')}catch{modal(`<h2>Бриф для Эдриана</h2><textarea class="textarea" style="min-height:360px">${esc(contextBrief())}</textarea>`)}});

let recognition=null;
function startDictation(target='adrian'){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast('Диктовка браузером не поддерживается. Используй микрофон клавиатуры или голосовую заметку.');return}
  try{
    if(recognition)recognition.abort();
    recognition=new SR();recognition.lang='ru-RU';recognition.interimResults=false;recognition.maxAlternatives=1;
    recognition.onstart=()=>toast('Слушаю…');
    recognition.onresult=e=>{const text=e.results[0][0].transcript;if(target==='adrian')runCommand(text);else{$('quickInput').value=text;toast('Распознано')}};
    recognition.onerror=e=>toast('Диктовка: '+(e.error||'ошибка'));
    recognition.start();
  }catch(e){toast('Не удалось запустить диктовку')}
}
$('voiceCommandBtn').addEventListener('click',()=>startDictation('adrian'));
$('adrianMicBtn').addEventListener('click',()=>startDictation('adrian'));

function downloadICS(title,date,description=''){
  const clean=s=>String(s).replace(/[\\,;]/g,m=>'\\'+m).replace(/\n/g,'\\n');
  const d=date.replace(/-/g,'');
  const ics=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//VALENTIN OS//RU\r\nBEGIN:VEVENT\r\nUID:${uid()}@valentin-os\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}\r\nDTSTART;VALUE=DATE:${d}\r\nSUMMARY:${clean(title)}\r\nDESCRIPTION:${clean(description)}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));a.download='VALENTIN-OS.ics';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)
}

let dbPromise=null;
function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('valentin_os_db',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('voice'))r.result.createObjectStore('voice',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return dbPromise
}
async function voiceAll(){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction('voice','readonly').objectStore('voice').getAll();r.onsuccess=()=>res(r.result.sort((a,b)=>b.createdTs-a.createdTs));r.onerror=()=>rej(r.error)})}
async function voicePut(obj){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction('voice','readwrite').objectStore('voice').put(obj);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function voiceDelete(id){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction('voice','readwrite').objectStore('voice').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function renderVoice(){
  try{const items=await voiceAll();$('voiceList').innerHTML=items.length?items.map(v=>`<div class="voice-item"><div class="item-top"><div><b>${esc(v.title)}</b><div class="muted">${esc(v.created)}</div></div><button class="mini" onclick="removeVoice('${v.id}')">×</button></div><audio controls preload="metadata" src="${URL.createObjectURL(v.blob)}"></audio></div>`).join(''):'<div class="empty">Голосовых пока нет.</div>'}catch(e){$('voiceList').innerHTML='<div class="empty">Не удалось открыть локальное хранилище голосовых.</div>'}
}
window.removeVoice=async id=>{await voiceDelete(id);renderVoice();toast('Голосовая удалена')};
let recorder=null,chunks=[],recordStarted=0,stream=null;
async function toggleRecording(){
  if(recorder&&recorder.state==='recording'){recorder.stop();return}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Запись микрофона не поддерживается');return}
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];recordStarted=Date.now();
    let opts={};for(const type of ['audio/mp4;codecs=alac','audio/mp4','audio/webm;codecs=opus']){if(MediaRecorder.isTypeSupported?.(type)){opts={mimeType:type};break}}
    recorder=new MediaRecorder(stream,opts);
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    recorder.onstop=async()=>{const blob=new Blob(chunks,{type:recorder.mimeType||'audio/mp4'});stream?.getTracks().forEach(t=>t.stop());const created=new Date();await voicePut({id:uid(),title:'Голосовая · '+created.toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}),created:created.toLocaleString('ru-RU'),createdTs:Date.now(),duration:Math.max(1,Math.round((Date.now()-recordStarted)/1000)),blob});$('recordVoiceBtn').classList.remove('voice-recording');$('recordVoiceBtn').textContent='● Записать';$('voiceNoteBtn').classList.remove('voice-recording');$('voiceStatus').textContent='Сохранено локально на этом устройстве.';renderVoice();toast('Голосовая сохранена')};
    recorder.start();$('recordVoiceBtn').classList.add('voice-recording');$('recordVoiceBtn').textContent='■ Остановить';$('voiceNoteBtn').classList.add('voice-recording');$('voiceStatus').textContent='Идёт запись… нажми ещё раз, чтобы остановить.';toast('Запись началась');
  }catch(e){toast(e.name==='NotAllowedError'?'Нужен доступ к микрофону':'Не удалось начать запись')}
}
$('recordVoiceBtn').addEventListener('click',toggleRecording);$('voiceNoteBtn').addEventListener('click',()=>{go('base');document.querySelector('[data-base="voice"]').click();setTimeout(toggleRecording,120)});

$('persistBtn').addEventListener('click',async()=>{if(!navigator.storage?.persist){toast('Браузер не даёт управлять хранением');return}const ok=await navigator.storage.persist();toast(ok?'Хранение закреплено':'iOS решит сам, но данные останутся локальными')});
$('exportBtn').addEventListener('click',()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='VALENTIN-OS-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);toast('Резервная копия готова')});
$('importInput').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;state=migrate(JSON.parse(await f.text()));save('Импортировано')}catch{toast('Не удалось импортировать файл')}});
$('installHelpBtn').addEventListener('click',()=>modal(`<h2>Установка на iPhone</h2><p class="muted">Открой VALENTIN OS именно в Safari → кнопка «Поделиться» → «На экран Домой» → оставь включённым «Открывать как веб-приложение». После этого он будет жить отдельной иконкой, почти как обычное приложение.</p><div class="modal-actions"><button class="btn" onclick="closeModal()">Понял</button></div>`));
$('resetBtn').addEventListener('click',()=>{modal(`<h2>Сбросить всё?</h2><p class="muted">Это удалит задачи, сделки, людей, идеи и решения из основного хранилища. Голосовые останутся отдельно.</p><div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmReset()">Сбросить</button></div>`) });
window.confirmReset=()=>{state=structuredClone(DEFAULT);localStorage.setItem(KEY,JSON.stringify(state));closeModal();render();toast('Сброшено')};
window.closeModal=closeModal;

$('privacyBtn').addEventListener('click',()=>$('privacyCover').classList.add('show'));
$('privacyCover').addEventListener('click',()=>$('privacyCover').classList.remove('show'));

document.addEventListener('visibilitychange',()=>{if(document.hidden&&localStorage.getItem('valentin_auto_privacy')==='1')$('privacyCover').classList.add('show')});

const now=new Date(),hour=now.getHours();
$('greeting').textContent=hour<6?'Не спишь, Валентин':hour<12?'Доброе утро, Валентин':hour<18?'Добрый день, Валентин':'Добрый вечер, Валентин';
$('dateLine').textContent=now.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
render();renderVoice();

if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=4').catch(()=>{}));
