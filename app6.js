(()=>{
const META_KEY='valentin_os_smart_meta_v1';
let meta={tasks:{},ideas:{}};
try{const x=JSON.parse(localStorage.getItem(META_KEY)||'{}');meta={tasks:x.tasks||{},ideas:x.ideas||{}}}catch{}
function taskExtra(t={}){return {details:t.details||'',dueTime:t.dueTime||'',tags:Array.isArray(t.tags)?t.tags:[],projectId:t.projectId||'',goalId:t.goalId||'',pinned:Boolean(t.pinned),repeat:t.repeat||'none',createdTs:t.createdTs||0,updatedTs:t.updatedTs||0}}
function ideaExtra(i={}){return {priority:i.priority||'Обычно',tags:Array.isArray(i.tags)?i.tags:[],projectId:i.projectId||'',pinned:Boolean(i.pinned),createdTs:i.createdTs||0,updatedTs:i.updatedTs||0}}
function recoverRaw(){
  try{
    const raw=JSON.parse(localStorage.getItem('valentin_os_v5')||'{}');
    (raw.inbox||[]).forEach(t=>{meta.tasks[t.id]={...meta.tasks[t.id],...taskExtra(t)}});
    (raw.ideas||[]).forEach(i=>{meta.ideas[i.id]={...meta.ideas[i.id],...ideaExtra(i)}});
  }catch{}
}
function restoreMeta(){
  state.inbox.forEach(t=>Object.assign(t,meta.tasks[t.id]||{}));
  state.ideas.forEach(i=>Object.assign(i,meta.ideas[i.id]||{}));
}
function syncMeta(){
  const aliveT=new Set(),aliveI=new Set();
  state.inbox.forEach(t=>{aliveT.add(t.id);meta.tasks[t.id]=taskExtra(t)});
  state.ideas.forEach(i=>{aliveI.add(i.id);meta.ideas[i.id]=ideaExtra(i)});
  Object.keys(meta.tasks).forEach(id=>{if(!aliveT.has(id))delete meta.tasks[id]});
  Object.keys(meta.ideas).forEach(id=>{if(!aliveI.has(id))delete meta.ideas[id]});
  localStorage.setItem(META_KEY,JSON.stringify(meta));
}
recoverRaw();restoreMeta();syncMeta();

const smartSave=save;
save=function(msg){syncMeta();smartSave(msg)};

// Extended task editor keeps the delete action.
window.editInbox=id=>{
  const t=state.inbox.find(x=>x.id===id);if(!t)return;
  window.openSmartCapture('task',{id:t.id,kind:'task',title:t.text,body:t.details||'',priority:t.priority||'Обычно',dueDate:t.due||'',dueTime:t.dueTime||'',tags:t.tags||[],projectId:t.projectId||'',goalId:t.goalId||'',pinned:t.pinned,repeat:t.repeat||'none',source:'task'});
  const actions=document.querySelector('#modal .modal-actions');
  if(actions){const del=document.createElement('button');del.className='btn danger';del.textContent='Удалить';del.onclick=()=>window.deleteInbox(id);actions.prepend(del)}
};

// Import restores smart task/idea properties before saving the migrated state.
const imp=$('importInput');if(imp){const n=imp.cloneNode(true);imp.replaceWith(n);n.addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;const payload=JSON.parse(await f.text()),raw=payload.state||payload;state=migrate(raw);(raw.inbox||[]).forEach(t=>Object.assign(state.inbox.find(x=>x.id===t.id)||{},taskExtra(t)));(raw.ideas||[]).forEach(i=>Object.assign(state.ideas.find(x=>x.id===i.id)||{},ideaExtra(i)));if(Array.isArray(payload.memory))localStorage.setItem('valentin_os_memory_v1',JSON.stringify(payload.memory));syncMeta();save('Импортировано');location.reload()}catch{toast('Не удалось импортировать файл')}})}

render();
})();