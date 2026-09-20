function autoPlanDay(){
  const picks=state.inbox.slice().sort((a,b)=>scoreTask(b)-scoreTask(a)).slice(0,3);
  const result=picks.map(x=>({id:uid(),text:x.text,done:false}));
  const used=new Set(picks.map(x=>x.id));
  for(const p of activeProjects()){if(result.length>=3)break;if(p.next?.trim())result.push({id:uid(),text:`${p.name}: ${p.next}`,done:false})}
  while(result.length<3)result.push({id:uid(),text:`Главное дело ${result.length+1}`,done:false});
  state.focus=result.slice(0,3);state.inbox=state.inbox.filter(x=>!used.has(x.id));save('День собран');
}

function render(){
  const m=moneyStats(),done=state.focus.filter(f=>f.done).length;
  $('briefText').textContent=getBrief();$('briefTitle').textContent=done===3?'День закрыт красиво':'Что важно прямо сейчас';
  $('homeFocus').innerHTML=focusHTML();$('todayFocus').innerHTML=focusHTML();
  $('metricFact').textContent=fmt(m.fact);$('metricPipeline').textContent=fmt(m.pipeline);$('metricInbox').textContent=state.inbox.length;$('metricPeople').textContent=openPromises().length;
  $('moneyFact').textContent=fmt(m.fact);$('moneyGoal').textContent=fmt(state.money.goal);$('moneyPipeline').textContent=fmt(m.pipeline);$('moneyPotential').textContent=fmt(m.potential);$('moneyGap').textContent=fmt(m.gap);$('moneyProgress').style.width=Math.min(100,m.fact/Math.max(1,state.money.goal)*100)+'%';
  $('opsScore').textContent=opsScore()+'/100';
  $('reviewMoney').value=state.review.money||'';$('reviewName').value=state.review.name||'';$('reviewWaste').value=state.review.waste||'';$('reviewStop').value=state.review.stop||'';$('reviewNext').value=state.review.next||'';
  $('focusMinutesSelect').value=String(state.settings.focusMinutes||25);$('autoLockToggle').checked=Boolean(state.settings.autoLock);
  renderRadar();renderInbox();renderProjects();renderDeals();renderPeople();renderIdeas();renderDecisions();renderHistory();renderChat();
}

$('quickAddBtn').addEventListener('click',()=>{const v=$('quickInput').value.trim();if(!v)return;state.inbox.unshift({id:uid(),text:v,created:nowLabel(),createdDate:iso(),due:'',priority:'Обычно'});$('quickInput').value='';save('В инбоксе')});
$('quickInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('quickAddBtn').click()});
$('quickTaskBtn').addEventListener('click',()=>modal(`<h2>Быстро добавить</h2><textarea id="qaText" class="textarea" placeholder="Что записать?"></textarea><select id="qaType" class="select"><option value="task">Задача</option><option value="idea">Идея</option><option value="decision">Решение</option></select><div class="modal-actions"><button class="btn" onclick="saveQuickAdd()">Добавить</button></div>`));
window.saveQuickAdd=()=>{const t=$('qaText').value.trim(),type=$('qaType').value;if(!t)return;if(type==='task')state.inbox.unshift({id:uid(),text:t,created:nowLabel(),createdDate:iso(),due:'',priority:'Обычно'});if(type==='idea')state.ideas.unshift({id:uid(),text:t,type:'Идея',status:'Новая'});if(type==='decision')state.decisions.push({id:uid(),text:t,created:nowLabel()});closeModal();save('Добавлено')};

$('editFocusBtn').addEventListener('click',()=>modal(`<h2>Три главных</h2>${[0,1,2].map(i=>`<input id="focusEdit${i}" class="input" value="${esc(state.focus[i]?.text||'')}">`).join('')}<div class="modal-actions"><button class="btn" onclick="saveFocus()">Сохранить</button></div>`));
window.saveFocus=()=>{state.focus=[0,1,2].map(i=>({id:state.focus[i]?.id||uid(),text:$('focusEdit'+i).value.trim()||`Главное дело ${i+1}`,done:false}));closeModal();save('Фокус обновлён')};
$('autoPlanBtn').addEventListener('click',autoPlanDay);

$('addProjectBtn').addEventListener('click',()=>modal(`<h2>Новый проект</h2><input id="npName" class="input" placeholder="Название"><textarea id="npNext" class="textarea" placeholder="Следующий конкретный шаг"></textarea><div class="modal-actions"><button class="btn" onclick="addProject()">Добавить</button></div>`));
window.addProject=()=>{state.projects.unshift({id:uid(),name:$('npName').value.trim()||'Новый проект',status:'Активно',next:$('npNext').value.trim(),progress:0,updated:iso()});closeModal();save('Проект добавлен')};

$('moneySettingsBtn').addEventListener('click',()=>modal(`<h2>Деньги месяца</h2><div class="modal-grid"><input id="msGoal" class="input" type="number" value="${state.money.goal}" placeholder="Цель"><input id="msFact" class="input" type="number" value="${state.money.fact}" placeholder="Факт вне сделок"></div><div class="modal-actions"><button class="btn" onclick="saveMoneySettings()">Сохранить</button></div>`));
window.saveMoneySettings=()=>{state.money.goal=+$('msGoal').value||0;state.money.fact=+$('msFact').value||0;closeModal();save('Деньги обновлены')};
$('addDealBtn').addEventListener('click',()=>modal(`<h2>Новая сделка</h2><input id="ndName" class="input" placeholder="Клиент / источник"><div class="modal-grid"><input id="ndAmount" class="input" type="number" placeholder="Сумма"><select id="ndStage" class="select"><option>Потенциал</option><option>В работе</option><option>Получено</option></select></div><input id="ndNext" class="input" placeholder="Следующий шаг"><input id="ndDate" class="input" type="date"><div class="modal-actions"><button class="btn" onclick="addDeal()">Добавить</button></div>`));
window.addDeal=()=>{state.deals.unshift({id:uid(),name:$('ndName').value.trim()||'Новая сделка',amount:+$('ndAmount').value||0,stage:$('ndStage').value,next:$('ndNext').value.trim(),date:$('ndDate').value,created:iso(),updated:iso()});closeModal();save('Сделка добавлена')};

$('addPersonBtn').addEventListener('click',()=>modal(`<h2>Человек / обещание</h2><input id="newPersonName" class="input" placeholder="Имя"><textarea id="newPersonPromise" class="textarea" placeholder="Что обещал / чего ждёшь"></textarea><input id="newPersonDate" class="input" type="date"><div class="modal-actions"><button class="btn" onclick="addPerson()">Добавить</button></div>`));
window.addPerson=()=>{state.people.unshift({id:uid(),name:$('newPersonName').value.trim()||'Человек',promise:$('newPersonPromise').value.trim(),status:'Открыто',date:$('newPersonDate').value,updated:iso()});closeModal();save('Добавлено')};
$('addIdeaBtn').addEventListener('click',()=>modal(`<h2>Новая идея</h2><textarea id="newIdeaText" class="textarea" placeholder="Идея, контент, оффер, схема…"></textarea><select id="newIdeaType" class="select"><option>Идея</option><option>Контент</option><option>Оффер</option><option>Бизнес</option><option>Личное</option></select><div class="modal-actions"><button class="btn" onclick="addIdea()">Добавить</button></div>`));
window.addIdea=()=>{state.ideas.unshift({id:uid(),text:$('newIdeaText').value.trim()||'Без названия',type:$('newIdeaType').value,status:'Новая'});closeModal();save('Идея сохранена')};
$('addDecisionBtn').addEventListener('click',()=>modal(`<h2>Зафиксировать решение</h2><textarea id="decisionText" class="textarea" placeholder="Что решил и почему?"></textarea><div class="modal-actions"><button class="btn" onclick="addDecision()">Зафиксировать</button></div>`));
window.addDecision=()=>{const t=$('decisionText').value.trim();if(!t)return;state.decisions.push({id:uid(),text:t,created:nowLabel()});closeModal();save('Решение зафиксировано')};

$('saveReviewBtn').addEventListener('click',()=>{state.review={money:$('reviewMoney').value,name:$('reviewName').value,waste:$('reviewWaste').value,stop:$('reviewStop').value,next:$('reviewNext').value,saved:iso()};save('Неделя сохранена')});
$('speakBriefBtn').addEventListener('click',()=>{if(!('speechSynthesis'in window)){toast('Озвучка не поддерживается');return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(getBrief());u.lang='ru-RU';u.rate=.96;u.pitch=.92;speechSynthesis.speak(u)});

$('adrianSendBtn').addEventListener('click',()=>{const v=$('adrianInput').value.trim();if(!v)return;$('adrianInput').value='';runCommand(v)});
$('adrianInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('adrianSendBtn').click()});
document.querySelectorAll('[data-cmd]').forEach(b=>b.addEventListener('click',()=>runCommand(b.dataset.cmd)));
$('copyContextBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(contextBrief());toast('Бриф скопирован')}catch{modal(`<h2>Бриф для Эдриана</h2><textarea class="textarea" style="min-height:360px">${esc(contextBrief())}</textarea>`)}});

$('morningBtn').addEventListener('click',()=>{const r=radar().filter(x=>x.level!=='good');modal(`<div class="eyebrow">УТРО С ЭДРИАНОМ</div><h2>${new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}</h2><p>${esc(getBrief())}</p><p class="muted">${r.length?`Сигналов радара: ${r.length}.`:'Красных сигналов нет.'}</p><div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Оставить как есть</button><button class="btn" onclick="morningAutoPlan()">Собрать 3 главных</button></div>`)});
window.morningAutoPlan=()=>{closeModal();autoPlanDay();go('today')};
$('eveningBtn').addEventListener('click',()=>{const done=state.focus.filter(x=>x.done).length,m=moneyStats();modal(`<div class="eyebrow">ВЕЧЕР С ЭДРИАНОМ</div><h2>Закрыть день</h2><p>Главных закрыто: <b>${done}/3</b>. Денег получено: <b>${fmt(m.fact)}</b>.</p><textarea id="dayWin" class="textarea" placeholder="Главная победа или вывод дня"></textarea><label class="toggle-row"><span><b>Вернуть незакрытые главные в инбокс</b><small>Чтобы завтра они не исчезли в тумане.</small></span><input id="carryFocus" type="checkbox" checked></label><div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Не закрывать</button><button class="btn" onclick="closeDay()">Закрыть день</button></div>`)});
window.closeDay=()=>{const win=$('dayWin').value.trim(),carry=$('carryFocus').checked,unfinished=state.focus.filter(x=>!x.done);if(carry)unfinished.forEach(x=>state.inbox.unshift({id:uid(),text:x.text,created:nowLabel(),createdDate:iso(),due:'',priority:'Обычно'}));state.history.push({id:uid(),type:'day',text:`${state.focus.filter(x=>x.done).length}/3 главных${win?' · '+win:''}`,win:win||'',created:nowLabel(),date:iso()});state.stats.daily[iso()]={...(state.stats.daily[iso()]||{}),closed:true,focusDone:state.focus.filter(x=>x.done).length,win};state.focus=[1,2,3].map(n=>({id:uid(),text:`Главное дело ${n}`,done:false}));closeModal();save('День закрыт')};

$('globalSearchBtn').addEventListener('click',()=>modal(`<h2>Поиск по всей жизни</h2><input id="globalSearchInput" class="input" placeholder="Человек, задача, проект, сделка…"><div id="globalSearchResults" class="search-results"><div class="empty">Начни печатать.</div></div>`));
document.addEventListener('input',e=>{if(e.target?.id==='globalSearchInput'){const hits=globalSearch(e.target.value);$('globalSearchResults').innerHTML=hits.length?hits.map((h,i)=>`<button class="search-hit" onclick="openSearchHit(${i})"><b>${esc(h.type)} · ${esc(h.text)}</b><small>Открыть раздел</small></button>`).join(''):'<div class="empty">Ничего не найдено.</div>';window._searchHits=hits}});
window.openSearchHit=i=>{const h=window._searchHits[i];closeModal();if(h.screen)go(h.screen);if(h.base)openBase(h.base)};

let recognition=null;
function startDictation(target='adrian'){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast('Диктовка браузером недоступна. Используй микрофон клавиатуры или голосовую.');return}
  try{if(recognition)recognition.abort();recognition=new SR();recognition.lang='ru-RU';recognition.interimResults=false;recognition.maxAlternatives=1;recognition.onstart=()=>toast('Слушаю…');recognition.onresult=e=>{const text=e.results[0][0].transcript;if(target==='adrian')runCommand(text);else{$('quickInput').value=text;toast('Распознано')}};recognition.onerror=e=>toast('Диктовка: '+(e.error||'ошибка'));recognition.start()}catch(e){toast('Не удалось запустить диктовку')}
}
$('voiceCommandBtn').addEventListener('click',()=>{go('adrian');setTimeout(()=>startDictation('adrian'),100)});
$('adrianMicBtn').addEventListener('click',()=>startDictation('adrian'));

function downloadICS(title,date,description=''){
  const clean=s=>String(s).replace(/[\\,;]/g,m=>'\\'+m).replace(/\n/g,'\\n'),d=date.replace(/-/g,'');
  const ics=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//VALENTIN OS//RU\r\nBEGIN:VEVENT\r\nUID:${uid()}@valentin-os\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}\r\nDTSTART;VALUE=DATE:${d}\r\nSUMMARY:${clean(title)}\r\nDESCRIPTION:${clean(description)}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));a.download='VALENTIN-OS.ics';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)
}
