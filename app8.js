(()=>{
'use strict';
const SAFETY_KEY='valentin_os_safety_snapshots_v1';
const LINK_KEY='valentin_os_focus_links_v1';
const MAIN_KEY='valentin_os_v5';
const MEM_KEY='valentin_os_memory_v1';
const SMART_KEY='valentin_os_smart_meta_v1';
const JARVIS_KEY='valentin_os_jarvis_v1';
const ERROR_KEY='valentin_os_error_log_v1';
const MAX_SNAPS=8;
let focusLinks={};
try{focusLinks=JSON.parse(localStorage.getItem(LINK_KEY)||'{}')||{}}catch{focusLinks={}}

const sClone=x=>JSON.parse(JSON.stringify(x));
const isPlaceholder=f=>!f||/^(Действие №|Главное дело)/.test(String(f.text||''));
const snapKeys=[MAIN_KEY,MEM_KEY,SMART_KEY,JARVIS_KEY,LINK_KEY];
function captureStorage(){const data={};for(const k of snapKeys){const v=localStorage.getItem(k);if(v!==null)data[k]=v}return data}
function readSnaps(){try{const x=JSON.parse(localStorage.getItem(SAFETY_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function writeSnaps(x){try{localStorage.setItem(SAFETY_KEY,JSON.stringify(x.slice(-MAX_SNAPS)))}catch{try{localStorage.setItem(SAFETY_KEY,JSON.stringify(x.slice(-3)))}catch{}}}
function snapshot(reason='Изменение'){const data=captureStorage(),signature=JSON.stringify(data),snaps=readSnaps();if(snaps.length&&snaps[snaps.length-1].signature===signature)return;snaps.push({at:Date.now(),reason,data,signature});writeSnaps(snaps);updateSafetyUI()}
function restoreSnapshot(){const snaps=readSnaps();if(!snaps.length){toast('Нет сохранённого состояния для отмены');return}const s=snaps.pop();writeSnaps(snaps);for(const k of snapKeys){if(Object.prototype.hasOwnProperty.call(s.data,k))localStorage.setItem(k,s.data[k]);else localStorage.removeItem(k)};toast('Восстанавливаю предыдущее состояние…');setTimeout(()=>location.reload(),250)}
function saveLinks(){localStorage.setItem(LINK_KEY,JSON.stringify(focusLinks))}
function linkedTaskId(focusId){return focusLinks[focusId]?.taskId||''}
function focusedTaskIds(){return new Set((state.focus||[]).filter(f=>!f.done).map(f=>linkedTaskId(f.id)).filter(Boolean))}
function unlinkFocus(focusId){if(focusLinks[focusId]){delete focusLinks[focusId];saveLinks()}}
function linkFocus(focusId,taskId){focusLinks[focusId]={taskId,at:Date.now()};saveLinks()}
function focusFromTask(t){const f={id:uid(),text:t.text,done:false};linkFocus(f.id,t.id);return f}

function logError(kind,value){try{const arr=JSON.parse(localStorage.getItem(ERROR_KEY)||'[]');arr.push({at:Date.now(),kind,value:String(value||'').slice(0,800),url:location.href});localStorage.setItem(ERROR_KEY,JSON.stringify(arr.slice(-12)))}catch{}}
window.addEventListener('error',e=>logError('error',e.message||e.error));
window.addEventListener('unhandledrejection',e=>logError('promise',e.reason));

const coreSave=save;
save=function(msg){if(msg)snapshot(msg);const r=coreSave(msg);updateSafetyUI();return r};

const coreRenderInbox=renderInbox;
renderInbox=function(){const original=state.inbox,hidden=focusedTaskIds();state.inbox=original.filter(t=>!hidden.has(t.id));try{return coreRenderInbox()}finally{state.inbox=original;const b=$('inboxBadge');if(b)b.textContent=original.filter(t=>!hidden.has(t.id)).length}};
const coreRender=render;
render=function(){const r=coreRender();const m=$('metricInbox');if(m)m.textContent=state.inbox.filter(t=>!focusedTaskIds().has(t.id)).length;updateSafetyUI();return r};

function meaningfulFocus(){return (state.focus||[]).filter(f=>!isPlaceholder(f))}
function addIndependentToInbox(f){if(!f||f.done||isPlaceholder(f))return;if(linkedTaskId(f.id)){unlinkFocus(f.id);return}if(!state.inbox.some(t=>t.text===f.text))state.inbox.unshift({id:uid(),text:f.text,created:nowLabel(),createdDate:iso(),due:'',priority:'Обычно'})}
function planCandidates(){const linked=new Set(Object.values(focusLinks).map(x=>x?.taskId).filter(Boolean));return state.inbox.slice().filter(t=>!linked.has(t.id)).sort((a,b)=>scoreTask(b)-scoreTask(a))}
function fillPlan(preserve=true){snapshot('До автоплана');let result=[];
  if(preserve)result=(state.focus||[]).filter(f=>!isPlaceholder(f)).slice(0,3);
  else{
    const done=(state.focus||[]).filter(f=>f.done&&!isPlaceholder(f));
    const unfinished=(state.focus||[]).filter(f=>!f.done&&!isPlaceholder(f));
    unfinished.forEach(addIndependentToInbox);
    result=done.slice(0,3);
    for(const f of Object.keys(focusLinks)){if(!(state.focus||[]).some(x=>x.id===f&&x.done))delete focusLinks[f]}
    saveLinks();
  }
  for(const t of planCandidates()){if(result.length>=3)break;result.push(focusFromTask(t))}
  for(const p of activeProjects()){if(result.length>=3)break;if(p.next?.trim()&&!result.some(f=>f.text===`${p.name}: ${p.next}`))result.push({id:uid(),text:`${p.name}: ${p.next}`,done:false})}
  while(result.length<3)result.push({id:uid(),text:`Главное дело ${result.length+1}`,done:false});
  state.focus=result.slice(0,3);saveLinks();coreSave(preserve?'Автоплан дополнил свободные места':'День пересобран безопасно');
}
function safeAutoPlanDay(){const current=meaningfulFocus();if(!current.length){fillPlan(true);return}
  const free=Math.max(0,3-current.length);
  modal(`<div class="eyebrow">БЕЗОПАСНЫЙ АВТОПЛАН</div><h2>${free?'У тебя уже стоят задачи':'Три главных уже заполнены'}</h2><p class="muted">JARVIS больше не перезаписывает текущие задачи молча. ${free?`Свободных мест: ${free}.`:'Если хочешь изменить день, это будет отдельное подтверждённое действие.'}</p><div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Ничего не менять</button>${free?`<button class="btn secondary" onclick="safePlanFill()">Только дополнить</button>`:''}<button class="btn" onclick="safePlanRebuild()">Пересобрать безопасно</button></div>`)}
window.safePlanFill=()=>{closeModal();fillPlan(true)};
window.safePlanRebuild=()=>{closeModal();fillPlan(false)};
try{autoPlanDay=safeAutoPlanDay}catch{}
window.autoPlanDay=safeAutoPlanDay;
window.morningAutoPlan=()=>{closeModal();safeAutoPlanDay();go('today')};
const autoBtn=$('autoPlanBtn');if(autoBtn){const n=autoBtn.cloneNode(true);autoBtn.replaceWith(n);n.addEventListener('click',safeAutoPlanDay)}

window.promoteTask=id=>{const t=state.inbox.find(x=>x.id===id);if(!t)return;const slot=state.focus.findIndex(f=>f.done||isPlaceholder(f));if(slot>=0){snapshot('До переноса в фокус');const old=state.focus[slot];if(old&&!old.done&&!isPlaceholder(old))addIndependentToInbox(old);state.focus[slot]=focusFromTask(t);coreSave('В трёх главных')}else modal(`<h2>Куда поставить?</h2>${state.focus.map((f,i)=>`<button class="btn secondary full" onclick="replaceFocusSafe(${i},'${id}')">${i+1}. ${esc(f.text)}</button>`).join('')}`)};
window.replaceFocusSafe=(i,id)=>{const t=state.inbox.find(x=>x.id===id);if(!t)return;snapshot('До замены фокуса');const old=state.focus[i];if(old&&!old.done&&!isPlaceholder(old))addIndependentToInbox(old);state.focus[i]=focusFromTask(t);closeModal();coreSave('Фокус заменён без потери')};
window.replaceFocus=window.replaceFocusSafe;

window.saveFocus=()=>{snapshot('До изменения трёх главных');const next=[0,1,2].map(i=>{const old=state.focus[i]||{id:uid(),text:`Главное дело ${i+1}`,done:false};const value=$('focusEdit'+i).value.trim()||old.text||`Главное дело ${i+1}`;if(value!==old.text)unlinkFocus(old.id);return {id:old.id||uid(),text:value,done:Boolean(old.done)}});state.focus=next;closeModal();coreSave('Фокус обновлён')};

const coreToggleFocus=window.toggleFocus;
window.toggleFocus=id=>{const f=state.focus.find(x=>x.id===id);if(!f)return;if(f.done&&linkedTaskId(id)){toast('Эта задача уже закрыта. Для возврата используй ↶ Отменить');return}snapshot('До отметки задачи');const taskId=linkedTaskId(id);if(taskId&&!f.done){f.done=true;const coreFinish=window.finishInbox;unlinkFocus(id);if(state.inbox.some(t=>t.id===taskId)&&typeof coreFinish==='function')coreFinish(taskId);else coreSave('Задача закрыта');return}return coreToggleFocus(id)};
const doneBtn=$('focusDoneBtn');if(doneBtn){const n=doneBtn.cloneNode(true);doneBtn.replaceWith(n);n.addEventListener('click',()=>{const f=state.focus.find(x=>x.id===focusCurrentId);if(!f){closeFocus();return}snapshot('До закрытия фокуса');const taskId=linkedTaskId(f.id);f.done=true;if(taskId){unlinkFocus(f.id);if(state.inbox.some(t=>t.id===taskId))window.finishInbox(taskId);else coreSave('Фокус закрыт')}else{state.history.push({id:uid(),type:'task',text:'Фокус: '+f.text,created:nowLabel(),date:iso()});coreSave('Фокус закрыт')}closeFocus()})}

window.closeDay=()=>{snapshot('До закрытия дня');const win=$('dayWin').value.trim(),carry=$('carryFocus').checked,unfinished=state.focus.filter(x=>!x.done);if(carry)unfinished.forEach(f=>{const taskId=linkedTaskId(f.id);if(taskId)unlinkFocus(f.id);else if(!isPlaceholder(f)&&!state.inbox.some(t=>t.text===f.text))state.inbox.unshift({id:uid(),text:f.text,created:nowLabel(),createdDate:iso(),due:'',priority:'Обычно'})});state.history.push({id:uid(),type:'day',text:`${state.focus.filter(x=>x.done).length}/3 главных${win?' · '+win:''}`,win:win||'',created:nowLabel(),date:iso()});state.stats.daily[iso()]={...(state.stats.daily[iso()]||{}),closed:true,focusDone:state.focus.filter(x=>x.done).length,win};state.focus=[1,2,3].map(n=>({id:uid(),text:`Главное дело ${n}`,done:false}));focusLinks={};saveLinks();closeModal();coreSave('День закрыт')};

const brain=window.adrianAnswer||adrianAnswer;if(typeof brain==='function'){const safeBrain=function(text){const l=String(text||'').trim().toLowerCase();if(/разложи день|собери день|выбери три/.test(l)){safeAutoPlanDay();return meaningfulFocus().length?'Открыл безопасный автоплан. Текущие задачи не трогаю без подтверждения.':'Собрал три главных без удаления исходных задач.'}return brain(text)};window.adrianAnswer=safeBrain;try{adrianAnswer=safeBrain}catch{}}

const coreSmartSave=window.saveSmartCapture;if(typeof coreSmartSave==='function')window.saveSmartCapture=function(source,id){snapshot('До сохранения умной записи');const kind=document.getElementById('smKind')?.value||'';const r=coreSmartSave(source,id);setTimeout(()=>{const where=kind==='task'?'Задачи / Сегодня':kind==='idea'?'База / Идеи':'База / Память';toast(`Сохранено → ${where}`)},80);return r};
for(const name of ['deleteMemory','archiveMemory']){const fn=window[name];if(typeof fn==='function')window[name]=function(...args){snapshot(name==='deleteMemory'?'До удаления из Памяти':'До изменения архива');return fn(...args)}}

const destructive={};for(const name of ['deleteInbox','deleteProject','deleteDeal','deletePerson','deleteIdea','deleteDecision']){if(typeof window[name]==='function'){destructive[name]=window[name];window[name]=function(id){modal(`<h2>Удалить?</h2><p class="muted">Запись исчезнет из текущего раздела, но её можно вернуть кнопкой ↶ Отменить.</p><div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmSafeDelete('${name}','${String(id).replace(/'/g,'')}')">Удалить</button></div>`)}}}
window.confirmSafeDelete=(name,id)=>{const fn=destructive[name];if(!fn)return;closeModal();fn(id)};
const coreRemoveVoice=window.removeVoice;if(typeof coreRemoveVoice==='function')window.removeVoice=id=>modal(`<h2>Удалить голосовую?</h2><p class="muted">Голосовые хранятся отдельно в IndexedDB, поэтому обычная отмена их не восстанавливает.</p><div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmVoiceDelete('${String(id).replace(/'/g,'')}')">Удалить навсегда</button></div>`);
window.confirmVoiceDelete=async id=>{closeModal();await coreRemoveVoice(id)};

const voiceQuick=$('voiceNoteBtn');if(voiceQuick){const n=voiceQuick.cloneNode(true);voiceQuick.replaceWith(n);n.addEventListener('click',()=>{openBase('voice');toggleRecording()})}

function injectSafetyUI(){
  const top=document.querySelector('.top-actions');if(top&&!document.getElementById('undoChangeBtn')){const b=document.createElement('button');b.id='undoChangeBtn';b.className='icon-btn';b.setAttribute('aria-label','Отменить последнее изменение');b.title='Отменить последнее изменение';b.textContent='↶';b.addEventListener('click',restoreSnapshot);top.prepend(b)}
  const settings=document.querySelector('[data-pane="settings"] .settings-card');if(settings&&!document.getElementById('safetyPanel')){const box=document.createElement('div');box.id='safetyPanel';box.className='safety-panel';box.innerHTML=`<div class="setting-row"><span><b>Безопасность данных</b><small id="safetyCount">Снимков: 0</small></span><button id="manualSnapshotBtn" class="btn secondary small">Снимок</button></div><button id="safetyUndoBtn" class="btn secondary full">↶ Отменить последнее изменение</button><p class="muted" style="margin:8px 0 0">Автоплан, удаления и крупные правки больше не должны оставлять тебя без пути назад.</p>`;settings.prepend(box);box.querySelector('#manualSnapshotBtn').addEventListener('click',()=>{snapshot('Ручной снимок');toast('Снимок сохранён')});box.querySelector('#safetyUndoBtn').addEventListener('click',restoreSnapshot)}
}
function updateSafetyUI(){const n=readSnaps().length;const b=document.getElementById('undoChangeBtn');if(b){b.disabled=!n;b.style.opacity=n?'1':'.35'}const c=document.getElementById('safetyCount');if(c)c.textContent=`Снимков: ${n}`;const u=document.getElementById('safetyUndoBtn');if(u)u.disabled=!n}
injectSafetyUI();

const imp=$('importInput');if(imp)imp.addEventListener('change',()=>snapshot('До импорта'),true);
window.confirmReset=()=>{snapshot('До полного сброса');state=structuredClone(DEFAULT);localStorage.setItem(MAIN_KEY,JSON.stringify(state));for(const k of [MEM_KEY,SMART_KEY,JARVIS_KEY,LINK_KEY])localStorage.removeItem(k);closeModal();toast('Основные данные сброшены. Можно отменить ↶');setTimeout(()=>location.reload(),300)};

window.VALENTIN_SAFETY={snapshot,undo:restoreSnapshot,status:()=>({snapshots:readSnaps().length,focusLinks:sClone(focusLinks),errors:(()=>{try{return JSON.parse(localStorage.getItem(ERROR_KEY)||'[]')}catch{return []}})()})};
updateSafetyUI();
render();
})();