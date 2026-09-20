(()=>{
'use strict';
const SAFETY_KEY='valentin_os_safety_snapshots_v1';
const MAIN_KEY='valentin_os_v5';
const MEM_KEY='valentin_os_memory_v1';
const SMART_KEY='valentin_os_smart_meta_v1';
const JARVIS_KEY='valentin_os_jarvis_v1';
const LINK_KEY='valentin_os_focus_links_v1';
const ERROR_KEY='valentin_os_error_log_v1';
const SNAP_KEYS=[MAIN_KEY,MEM_KEY,SMART_KEY,JARVIS_KEY,LINK_KEY];
const MAX_SNAPS=8;
function capture(){const data={};for(const k of SNAP_KEYS){const v=localStorage.getItem(k);if(v!==null)data[k]=v}return data}
function snapshots(){try{const x=JSON.parse(localStorage.getItem(SAFETY_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function refreshCount(){const n=snapshots().length;const c=document.getElementById('safetyCount');if(c)c.textContent=`Снимков: ${n}`;const u=document.getElementById('safetyUndoBtn');if(u)u.disabled=!n;const b=document.getElementById('undoChangeBtn');if(b){b.disabled=!n;b.style.opacity=n?'1':'.35'}}
function preSnapshot(reason){try{const data=capture(),signature=JSON.stringify(data),arr=snapshots();if(arr.length&&arr[arr.length-1].signature===signature)return;arr.push({at:Date.now(),reason,data,signature});localStorage.setItem(SAFETY_KEY,JSON.stringify(arr.slice(-MAX_SNAPS)));refreshCount()}catch(e){console.warn('Safety snapshot failed',e)}}
function wrap(name,reason){const fn=window[name];if(typeof fn!=='function'||fn.__safe9)return;const w=function(...args){preSnapshot(reason);return fn.apply(this,args)};w.__safe9=true;window[name]=w;try{if(typeof globalThis[name]==='function')globalThis[name]=w}catch{}}

// Completion and confirmed deletion must always be reversible.
wrap('finishInbox','До завершения задачи');
wrap('confirmSafeDelete','До удаления записи');

// Editing and adding existing entities must snapshot BEFORE mutation.
[
 ['saveInbox','До изменения задачи'],['saveProject','До изменения проекта'],['saveDeal','До изменения сделки'],
 ['savePerson','До изменения человека'],['saveIdea','До изменения идеи'],['saveMoneySettings','До изменения денег'],
 ['addProject','До добавления проекта'],['addDeal','До добавления сделки'],['addPerson','До добавления человека'],
 ['addIdea','До добавления идеи'],['addDecision','До добавления решения'],['saveQuickAdd','До быстрого добавления']
].forEach(([n,r])=>wrap(n,r));

// Quick inbox and weekly review are event-driven rather than exposed mutators.
const quick=document.getElementById('quickAddBtn');if(quick)quick.addEventListener('click',()=>{const v=document.getElementById('quickInput')?.value?.trim();if(v)preSnapshot('До быстрого добавления')},true);
const review=document.getElementById('saveReviewBtn');if(review)review.addEventListener('click',()=>preSnapshot('До недельного разбора'),true);

// Commands can mutate data in the legacy local brain. Snapshot only write-like commands.
const coreRun=window.runCommand||((typeof runCommand==='function')?runCommand:null);
if(typeof coreRun==='function'&&!coreRun.__safe9){const safeRun=function(text){const l=String(text||'').trim().toLowerCase();if(/^(задача |идея |решение |сделка |обещал |заметка |запомни |цель )/.test(l))preSnapshot('До команды Эдриану');return coreRun(text)};safeRun.__safe9=true;window.runCommand=safeRun;try{runCommand=safeRun}catch{}}

function parse(key,fallback){try{return JSON.parse(localStorage.getItem(key)||fallback)}catch{return null}}
function integrity(){
 const issues=[],warn=[];
 const st=(typeof state!=='undefined')?state:parse(MAIN_KEY,'{}');
 if(!st||typeof st!=='object')issues.push('Основное хранилище не читается');
 else{
  if(!Array.isArray(st.inbox))issues.push('Инбокс повреждён');
  if(!Array.isArray(st.focus)||st.focus.length!==3)warn.push('Три главных: ожидалось 3 слота');
  const groups=['inbox','projects','deals','people','ideas','decisions','history'];
  for(const g of groups){const a=Array.isArray(st[g])?st[g]:[];const ids=a.map(x=>x?.id).filter(Boolean);if(new Set(ids).size!==ids.length)issues.push(`Дубли ID: ${g}`)}
  const validP=new Set(['Низко','Обычно','Высоко','Критично']);for(const t of (st.inbox||[])){if(t.priority&&!validP.has(t.priority))warn.push(`Неизвестный приоритет: ${t.text||'задача'}`);if(t.repeat&&!['none','daily','weekly','monthly'].includes(t.repeat))issues.push(`Некорректный повтор: ${t.text||'задача'}`)}
  const utils=(st.inbox||[]).filter(t=>/коммунал|показани.{0,15}(счетчик|счетчика)/i.test(t.text||''));if(utils.length>1)warn.push(`Похожие задачи коммуналки: ${utils.length}`);
  const links=parse(LINK_KEY,'{}');if(links&&typeof links==='object'){const focusIds=new Set((st.focus||[]).map(x=>x.id)),taskIds=new Set((st.inbox||[]).map(x=>x.id));for(const [fid,v] of Object.entries(links)){if(!focusIds.has(fid))warn.push('Есть устаревшая связь фокуса');if(v?.taskId&&!taskIds.has(v.taskId))warn.push('Фокус связан с отсутствующей задачей')}}
 }
 const mem=parse(MEM_KEY,'[]');if(mem===null||!Array.isArray(mem))issues.push('Память не читается');else{const ids=mem.map(x=>x?.id).filter(Boolean);if(new Set(ids).size!==ids.length)issues.push('Дубли ID в Памяти')}
 for(const [k,label] of [[SMART_KEY,'Smart metadata'],[JARVIS_KEY,'JARVIS'],[LINK_KEY,'Связи фокуса']])if(localStorage.getItem(k)!==null&&parse(k,'{}')===null)issues.push(`${label}: повреждён JSON`);
 const errors=parse(ERROR_KEY,'[]');const recent=Array.isArray(errors)?errors.slice(-5):[];if(recent.length)warn.push(`Журнал JS-ошибок: ${recent.length} последних записей`);
 return {ok:!issues.length,issues,warn:[...new Set(warn)],checkedAt:new Date().toISOString(),counts:{tasks:st?.inbox?.length||0,memory:Array.isArray(mem)?mem.length:0,projects:st?.projects?.length||0,snapshots:snapshots().length}}
}
function showIntegrity(){const r=integrity(),esc2=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));const rows=[...r.issues.map(x=>`<p class="hot">✕ ${esc2(x)}</p>`),...r.warn.map(x=>`<p>△ ${esc2(x)}</p>`)];modal(`<div class="eyebrow">ДИАГНОСТИКА</div><h2>${r.ok?'Целостность данных: OK':'Найдены ошибки'}</h2><p class="muted">Задач: ${r.counts.tasks} · Память: ${r.counts.memory} · Проектов: ${r.counts.projects} · Снимков: ${r.counts.snapshots}</p>${rows.length?rows.join(''):'<p>Критических проблем структуры данных не найдено.</p>'}<div class="modal-actions"><button class="btn" onclick="closeModal()">Закрыть</button></div>`)}
window.VALENTIN_DIAGNOSTICS={run:integrity,snapshot:preSnapshot};

// Make backup limitations explicit: voice blobs live in IndexedDB and are not in JSON.
const exportBtn=document.getElementById('exportBtn');if(exportBtn)exportBtn.textContent='Экспорт JSON (без голосовых)';
const settings=document.querySelector('[data-pane="settings"] .settings-card');if(settings&&!document.getElementById('integrityBtn')){const b=document.createElement('button');b.id='integrityBtn';b.className='btn secondary full';b.textContent='Проверить целостность данных';b.addEventListener('click',showIntegrity);const safety=document.getElementById('safetyPanel');(safety||settings.firstChild)?.insertAdjacentElement?.('afterend',b);if(!b.isConnected)settings.prepend(b);const n=document.createElement('p');n.className='muted';n.style.margin='8px 0';n.textContent='JSON-бэкап сохраняет задачи, проекты, деньги, Память и настройки. Голосовые записи хранятся отдельно на устройстве.';exportBtn?.insertAdjacentElement('afterend',n)}
refreshCount();
})();
