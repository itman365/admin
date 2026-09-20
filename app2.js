function renderProjects(){
  $('projectsList').innerHTML=state.projects.length?state.projects.map(p=>`<div class="project" onclick="editProject('${p.id}')"><div class="project-top"><div><h3>${esc(p.name)}</h3><p><b>Следующий шаг:</b> ${esc(p.next||'не задан')} · обновлено ${esc(p.updated||'')}</p></div><span class="tag">${esc(p.status)}</span></div><div class="progress"><i style="width:${Math.max(0,Math.min(100,+p.progress||0))}%"></i></div></div>`).join(''):'<div class="empty">Проектов нет.</div>';
}
window.editProject=id=>{const p=state.projects.find(x=>x.id===id);if(!p)return;modal(`<h2>Проект</h2><input id="pName" class="input" value="${esc(p.name)}"><textarea id="pNext" class="textarea" placeholder="Следующий конкретный шаг">${esc(p.next||'')}</textarea><div class="modal-grid"><select id="pStatus" class="select"><option>Активно</option><option>Пауза</option><option>Готово</option><option>Закрыто</option></select><input id="pProgress" class="input" type="number" min="0" max="100" value="${+p.progress||0}"></div><div class="modal-actions"><button class="btn danger" onclick="deleteProject('${id}')">Удалить</button><button class="btn" onclick="saveProject('${id}')">Сохранить</button></div>`);$('pStatus').value=p.status};
window.saveProject=id=>{const p=state.projects.find(x=>x.id===id);p.name=$('pName').value.trim()||'Проект';p.next=$('pNext').value.trim();p.status=$('pStatus').value;p.progress=+$('pProgress').value||0;p.updated=iso();closeModal();save('Проект обновлён')};
window.deleteProject=id=>{state.projects=state.projects.filter(x=>x.id!==id);closeModal();save('Удалено')};

function renderDeals(){
  $('dealsList').innerHTML=state.deals.length?state.deals.map(d=>`<div class="deal"><div class="item-top"><div><h3>${esc(d.name)} · ${fmt(d.amount)}</h3><p>${esc(d.stage)}${d.next?' · '+esc(d.next):''}${d.date?' · '+esc(d.date):''}</p></div><div class="task-actions">${d.date?`<button class="mini" onclick="calendarDeal('${d.id}')">↗</button>`:''}<button class="mini" onclick="editDeal('${d.id}')">⋯</button></div></div></div>`).join(''):'<div class="empty">Сделок нет. Деньги, как назло, любят конкретику.</div>';
}
window.editDeal=id=>{const d=state.deals.find(x=>x.id===id);if(!d)return;modal(`<h2>Сделка</h2><input id="dName" class="input" value="${esc(d.name)}"><div class="modal-grid"><input id="dAmount" class="input" type="number" value="${+d.amount||0}"><select id="dStage" class="select"><option>Потенциал</option><option>В работе</option><option>Получено</option><option>Отказ</option></select></div><input id="dNext" class="input" value="${esc(d.next||'')}" placeholder="Следующий шаг"><input id="dDate" class="input" type="date" value="${esc(d.date||'')}"><div class="modal-actions"><button class="btn danger" onclick="deleteDeal('${id}')">Удалить</button><button class="btn" onclick="saveDeal('${id}')">Сохранить</button></div>`);$('dStage').value=d.stage};
window.saveDeal=id=>{const d=state.deals.find(x=>x.id===id);d.name=$('dName').value.trim()||'Сделка';d.amount=+$('dAmount').value||0;d.stage=$('dStage').value;d.next=$('dNext').value.trim();d.date=$('dDate').value;d.updated=iso();closeModal();save('Сделка обновлена')};
window.deleteDeal=id=>{state.deals=state.deals.filter(x=>x.id!==id);closeModal();save('Удалено')};
window.calendarDeal=id=>{const d=state.deals.find(x=>x.id===id);if(d?.date)downloadICS('Сделка: '+d.name,d.date,d.next||'VALENTIN OS')};

function renderPeople(){
  $('peopleList').innerHTML=state.people.length?state.people.map(p=>`<div class="person"><div class="item-top"><div><h3>${esc(p.name)}</h3><p>${esc(p.promise||'')}${p.date?' · '+esc(p.date):''}</p></div><div><span class="tag">${esc(p.status)}</span>${p.date?`<button class="mini" onclick="calendarPerson('${p.id}')">↗</button>`:''}<button class="mini" onclick="editPerson('${p.id}')">⋯</button></div></div></div>`).join(''):'<div class="empty">Незакрытых людей нет.</div>';
}
window.editPerson=id=>{const p=state.people.find(x=>x.id===id);if(!p)return;modal(`<h2>Человек / обещание</h2><input id="peName" class="input" value="${esc(p.name)}"><textarea id="pePromise" class="textarea">${esc(p.promise||'')}</textarea><div class="modal-grid"><select id="peStatus" class="select"><option>Открыто</option><option>Жду</option><option>Готово</option><option>Отменено</option></select><input id="peDate" class="input" type="date" value="${esc(p.date||'')}"></div><div class="modal-actions"><button class="btn danger" onclick="deletePerson('${id}')">Удалить</button><button class="btn" onclick="savePerson('${id}')">Сохранить</button></div>`);$('peStatus').value=p.status};
window.savePerson=id=>{const p=state.people.find(x=>x.id===id);p.name=$('peName').value.trim()||'Человек';p.promise=$('pePromise').value.trim();p.status=$('peStatus').value;p.date=$('peDate').value;p.updated=iso();closeModal();save('Сохранено')};
window.deletePerson=id=>{state.people=state.people.filter(x=>x.id!==id);closeModal();save('Удалено')};
window.calendarPerson=id=>{const p=state.people.find(x=>x.id===id);if(p?.date)downloadICS(p.name+': '+p.promise,p.date,'VALENTIN OS')};

function renderIdeas(){
  $('ideasList').innerHTML=state.ideas.length?state.ideas.map(i=>`<div class="idea"><div class="item-top"><div><h3>${esc(i.text)}</h3><p>${esc(i.type)} · ${esc(i.status)}</p></div><button class="mini" onclick="editIdea('${i.id}')">⋯</button></div></div>`).join(''):'<div class="empty">Идей пока нет.</div>';
}
window.editIdea=id=>{const i=state.ideas.find(x=>x.id===id);if(!i)return;modal(`<h2>Идея</h2><textarea id="iText" class="textarea">${esc(i.text)}</textarea><div class="modal-grid"><select id="iType" class="select"><option>Идея</option><option>Контент</option><option>Оффер</option><option>Бизнес</option><option>Личное</option></select><select id="iStatus" class="select"><option>Новая</option><option>В работе</option><option>Использовано</option><option>Архив</option></select></div><div class="modal-actions"><button class="btn danger" onclick="deleteIdea('${id}')">Удалить</button><button class="btn" onclick="saveIdea('${id}')">Сохранить</button></div>`);$('iType').value=i.type;$('iStatus').value=i.status};
window.saveIdea=id=>{const i=state.ideas.find(x=>x.id===id);i.text=$('iText').value.trim();i.type=$('iType').value;i.status=$('iStatus').value;closeModal();save('Сохранено')};
window.deleteIdea=id=>{state.ideas=state.ideas.filter(x=>x.id!==id);closeModal();save('Удалено')};

function renderDecisions(){
  $('decisionsList').innerHTML=state.decisions.length?state.decisions.slice().reverse().map(d=>`<div class="decision"><div class="item-top"><div><h3>${esc(d.text)}</h3><p>${esc(d.created)}</p></div><button class="mini" onclick="deleteDecision('${d.id}')">×</button></div></div>`).join(''):'<div class="empty">Решений пока нет. Зафиксированное решение сложнее переписать задним числом.</div>';
}
window.deleteDecision=id=>{state.decisions=state.decisions.filter(x=>x.id!==id);save('Удалено')};

function renderHistory(){
  $('streakBadge').textContent=`${state.stats.streak||0} дн.`;
  const h=state.history.slice().reverse().slice(0,40);
  $('historyList').innerHTML=h.length?h.map(x=>`<div class="history-item"><h3>${x.type==='day'?'Закрыт день':x.type==='task'?'Закрыта задача':'Событие'}</h3><p class="${x.win?'win':''}">${esc(x.text||'')}${x.created?' · '+esc(x.created):''}</p></div>`).join(''):'<div class="empty">История появится, когда начнёшь закрывать задачи и дни.</div>';
}

function renderChat(){
  if(!state.chat.length)state.chat=[{who:'adrian',text:'Я на месте. Команды: «радар», «что главное?», «что по деньгам?», «найди Амаяк», «разложи день», «задача…», «сделка 120000 Амаяк».',at:nowLabel()}];
  $('adrianChat').innerHTML=state.chat.slice(-22).map(m=>`<div class="bubble ${m.who}">${esc(m.text)}<small>${esc(m.at||'')}</small></div>`).join('');
  $('adrianChat').scrollTop=$('adrianChat').scrollHeight;
}
function addChat(who,text){state.chat.push({who,text,at:nowLabel()});state.chat=state.chat.slice(-30)}
function parseAmount(text){const m=text.match(/(\d[\d\s.,]*)\s*(млн|миллион|тыс|к|k)?/i);if(!m)return 0;let n=parseFloat(m[1].replace(/\s/g,'').replace(',','.'))||0;const u=(m[2]||'').toLowerCase();if(u==='млн'||u==='миллион')n*=1000000;if(['тыс','к','k'].includes(u))n*=1000;return Math.round(n)}
function globalSearch(q){
  const needle=q.toLowerCase().trim();if(!needle)return [];
  const hits=[];
  state.inbox.forEach(x=>{if(x.text.toLowerCase().includes(needle))hits.push({type:'Задача',text:x.text,screen:'today'})});
  state.projects.forEach(x=>{if((x.name+' '+x.next).toLowerCase().includes(needle))hits.push({type:'Проект',text:x.name+' · '+x.next,base:'projects'})});
  state.deals.forEach(x=>{if((x.name+' '+x.next).toLowerCase().includes(needle))hits.push({type:'Сделка',text:x.name+' · '+fmt(x.amount),screen:'money'})});
  state.people.forEach(x=>{if((x.name+' '+x.promise).toLowerCase().includes(needle))hits.push({type:'Человек',text:x.name+' · '+x.promise,base:'people'})});
  state.ideas.forEach(x=>{if(x.text.toLowerCase().includes(needle))hits.push({type:'Идея',text:x.text,base:'ideas'})});
  state.decisions.forEach(x=>{if(x.text.toLowerCase().includes(needle))hits.push({type:'Решение',text:x.text,screen:'adrian'})});
  return hits.slice(0,30);
}
function searchSummary(q){const h=globalSearch(q);return h.length?`Нашёл ${h.length} совпадений:\n`+h.slice(0,8).map(x=>`• ${x.type}: ${x.text}`).join('\n'):`По запросу «${q}» ничего не нашёл.`}
function adrianAnswer(text){
  const q=text.trim(),l=q.toLowerCase(),m=moneyStats();if(!q)return '';
  if(/^радар$|что горит|сигнал/.test(l)){const r=radar().filter(x=>x.level!=='good');return r.length?r.map(x=>`• ${x.title}: ${x.sub}`).join('\n'):'Критических сигналов нет.'}
  if(/что главн|приоритет|фокус/.test(l))return getBrief();
  if(/деньг|касс|сделк.*сколько/.test(l))return `По деньгам: получено ${fmt(m.fact)}, в работе ${fmt(m.pipeline)}, потенциал ${fmt(m.potential)}, до цели ${fmt(m.gap)}. ${m.pipeline?'Сначала двигай сделки в работе к оплате.':'Денег в работе нет. Значит нужен новый или следующий коммерческий шаг.'}`;
  if(/кому ответ|люд|обещан/.test(l)){const p=openPromises();return p.length?'Незакрыто по людям:\n'+p.slice(0,8).map(x=>`• ${x.name}: ${x.promise}${x.date?' до '+x.date:''}`).join('\n'):'По людям хвостов нет.'}
  if(/где затык|проблем|тормоз/.test(l)){const r=radar().filter(x=>x.level==='red'||x.level==='warn');return r.length?'Вот системные затыки:\n'+r.map(x=>'• '+x.title).join('\n'):'Явного системного затыка по данным не вижу. Тогда узкое место, скорее всего, в исполнении одного выбранного действия.'}
  if(/разложи день|собери день|выбери три/.test(l)){autoPlanDay();return 'Собрал три главных по срочности, деньгам и влиянию. Проверь, чтобы они были реалистичны, а не героичны.'}
  if(l.startsWith('найди '))return searchSummary(q.replace(/^найди\s+/i,''));
  if(l.startsWith('задача ')){const t=q.replace(/^задача\s+/i,'').trim();state.inbox.unshift({id:uid(),text:t,created:nowLabel(),createdDate:iso(),due:'',priority:'Обычно'});return `Записал задачу: ${t}`}
  if(l.startsWith('идея ')){const t=q.replace(/^идея\s+/i,'').trim();state.ideas.unshift({id:uid(),text:t,type:'Идея',status:'Новая'});return `Сохранил идею: ${t}`}
  if(l.startsWith('решение ')){const t=q.replace(/^решение\s+/i,'').trim();state.decisions.push({id:uid(),text:t,created:nowLabel()});return `Зафиксировал решение: ${t}`}
  if(l.startsWith('сделка ')){const amount=parseAmount(q);let name=q.replace(/^сделка\s+/i,'').replace(/\d[\d\s.,]*\s*(млн|миллион|тыс|к|k)?/i,'').trim()||'Новая сделка';state.deals.unshift({id:uid(),name,amount,stage:'Потенциал',next:'',date:'',created:iso(),updated:iso()});return `Добавил сделку «${name}»${amount?' на '+fmt(amount):''}.`}
  if(l.startsWith('обещал ')){const body=q.replace(/^обещал\s+/i,'').trim(),parts=body.split(':');const name=(parts.shift()||'Человек').trim(),promise=parts.join(':').trim()||'Уточнить обещание';state.people.unshift({id:uid(),name,promise,status:'Открыто',date:'',updated:iso()});return `Записал обязательство по ${name}: ${promise}`}
  state.inbox.unshift({id:uid(),text:q,created:nowLabel(),createdDate:iso(),due:'',priority:'Обычно'});return 'Положил это в инбокс. Если это была команда, сформулируй короче: «радар», «найди …», «задача …», «сделка …».';
}
function runCommand(text){addChat('user',text);const answer=adrianAnswer(text);addChat('adrian',answer);save();renderChat()}
