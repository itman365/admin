let dbPromise=null;
function openDB(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('valentin_os_db',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('voice'))r.result.createObjectStore('voice',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return dbPromise}
async function voiceAll(){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction('voice','readonly').objectStore('voice').getAll();r.onsuccess=()=>res(r.result.sort((a,b)=>b.createdTs-a.createdTs));r.onerror=()=>rej(r.error)})}
async function voicePut(obj){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction('voice','readwrite').objectStore('voice').put(obj);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function voiceDelete(id){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction('voice','readwrite').objectStore('voice').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function renderVoice(){try{const items=await voiceAll();$('voiceList').innerHTML=items.length?items.map(v=>`<div class="voice-item"><div class="item-top"><div><b>${esc(v.title)}</b><div class="muted">${esc(v.created)} · ${v.duration||0} сек</div></div><button class="mini" onclick="removeVoice('${v.id}')">×</button></div><audio controls preload="metadata" src="${URL.createObjectURL(v.blob)}"></audio></div>`).join(''):'<div class="empty">Голосовых пока нет.</div>'}catch(e){$('voiceList').innerHTML='<div class="empty">Не удалось открыть локальное хранилище голосовых.</div>'}}
window.removeVoice=async id=>{await voiceDelete(id);renderVoice();toast('Голосовая удалена')};
let recorder=null,chunks=[],recordStarted=0,stream=null;
async function toggleRecording(){
  if(recorder?.state==='recording'){recorder.stop();return}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Запись микрофона не поддерживается');return}
  try{stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];recordStarted=Date.now();let opts={};for(const type of ['audio/mp4','audio/webm;codecs=opus']){if(MediaRecorder.isTypeSupported?.(type)){opts={mimeType:type};break}}recorder=new MediaRecorder(stream,opts);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=async()=>{const blob=new Blob(chunks,{type:recorder.mimeType||'audio/mp4'});stream?.getTracks().forEach(t=>t.stop());const created=new Date();await voicePut({id:uid(),title:'Голосовая · '+created.toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}),created:created.toLocaleString('ru-RU'),createdTs:Date.now(),duration:Math.max(1,Math.round((Date.now()-recordStarted)/1000)),blob});$('recordVoiceBtn').classList.remove('voice-recording');$('recordVoiceBtn').textContent='● Записать';$('voiceNoteBtn').classList.remove('voice-recording');$('voiceStatus').textContent='Сохранено локально.';renderVoice();toast('Голосовая сохранена')};recorder.start();$('recordVoiceBtn').classList.add('voice-recording');$('recordVoiceBtn').textContent='■ Остановить';$('voiceNoteBtn').classList.add('voice-recording');$('voiceStatus').textContent='Идёт запись…';toast('Запись началась')}catch(e){toast(e.name==='NotAllowedError'?'Нужен доступ к микрофону':'Не удалось начать запись')}
}
$('recordVoiceBtn').addEventListener('click',toggleRecording);
$('voiceNoteBtn').addEventListener('click',()=>{openBase('voice');setTimeout(toggleRecording,120)});

let focusInterval=null,focusRemaining=0,focusRunning=false,focusCurrentId=null,wakeLock=null;
function updateFocusTimer(){const m=Math.floor(focusRemaining/60),s=focusRemaining%60;$('focusTimer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
async function requestWake(){try{if('wakeLock'in navigator)wakeLock=await navigator.wakeLock.request('screen')}catch(e){}}
window.startFocus=id=>{const f=state.focus.find(x=>x.id===id)||state.focus.find(x=>!x.done);if(!f){toast('Все три уже закрыты');return}focusCurrentId=f.id;focusRemaining=(+state.settings.focusMinutes||25)*60;focusRunning=true;$('focusTaskTitle').textContent=f.text;$('focusOverlay').classList.add('show');updateFocusTimer();clearInterval(focusInterval);focusInterval=setInterval(()=>{if(!focusRunning)return;focusRemaining--;updateFocusTimer();if(focusRemaining<=0){focusRunning=false;clearInterval(focusInterval);toast('Фокус-сессия закончена');if(navigator.vibrate)navigator.vibrate([150,80,150])}},1000);requestWake()};
$('startFocusBtn').addEventListener('click',()=>window.startFocus());
$('focusPauseBtn').addEventListener('click',()=>{focusRunning=!focusRunning;$('focusPauseBtn').textContent=focusRunning?'Пауза':'Продолжить'});
$('focusDoneBtn').addEventListener('click',()=>{const f=state.focus.find(x=>x.id===focusCurrentId);if(f)f.done=true;state.history.push({id:uid(),type:'task',text:'Фокус: '+(f?.text||''),created:nowLabel(),date:iso()});closeFocus();save('Фокус закрыт')});
$('focusCloseBtn').addEventListener('click',closeFocus);
function closeFocus(){clearInterval(focusInterval);focusRunning=false;$('focusOverlay').classList.remove('show');wakeLock?.release?.().catch(()=>{});wakeLock=null}

async function hashPin(pin){const bytes=new TextEncoder().encode('VALENTIN_OS::'+pin);const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
$('pinBtn').addEventListener('click',()=>modal(`<h2>PIN-блокировка</h2><p class="muted">Это защита от случайного доступа к открытому приложению, не полноценное шифрование данных.</p><input id="newPin" class="input pin-input" type="password" inputmode="numeric" maxlength="6" placeholder="4–6 цифр"><div class="modal-actions"><button class="btn danger" onclick="removePin()">Отключить</button><button class="btn" onclick="setPin()">Сохранить PIN</button></div>`));
window.setPin=async()=>{const pin=$('newPin').value.trim();if(!/^\d{4,6}$/.test(pin)){toast('Нужно 4–6 цифр');return}localStorage.setItem(PIN_KEY,await hashPin(pin));closeModal();toast('PIN установлен')};
window.removePin=()=>{localStorage.removeItem(PIN_KEY);sessionStorage.removeItem('vos_unlocked');closeModal();toast('PIN отключён')};
function showLock(){if(localStorage.getItem(PIN_KEY)){$('lockCover').classList.add('show');$('unlockPin').value='';$('unlockError').textContent=''}}
$('unlockBtn').addEventListener('click',async()=>{const h=await hashPin($('unlockPin').value.trim());if(h===localStorage.getItem(PIN_KEY)){$('lockCover').classList.remove('show');sessionStorage.setItem('vos_unlocked','1')}else $('unlockError').textContent='Неверный PIN'});
$('unlockPin').addEventListener('keydown',e=>{if(e.key==='Enter')$('unlockBtn').click()});
$('autoLockToggle').addEventListener('change',()=>{state.settings.autoLock=$('autoLockToggle').checked;save('Настройка сохранена')});
$('focusMinutesSelect').addEventListener('change',()=>{state.settings.focusMinutes=+$('focusMinutesSelect').value;save('Фокус-таймер обновлён')});

$('persistBtn').addEventListener('click',async()=>{if(!navigator.storage?.persist){toast('Браузер не даёт управлять хранением');return}const ok=await navigator.storage.persist();toast(ok?'Хранение закреплено':'iOS решит сам, данные всё равно локальные')});
$('exportBtn').addEventListener('click',()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='VALENTIN-OS-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);toast('Резервная копия готова')});
$('importInput').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;state=migrate(JSON.parse(await f.text()));save('Импортировано')}catch{toast('Не удалось импортировать файл')}});
$('installHelpBtn').addEventListener('click',()=>modal(`<h2>Установка на iPhone</h2><p class="muted">Safari → Поделиться → На экран «Домой» → оставить «Открывать как веб-приложение». Если после обновления видишь старую версию, закрой приложение полностью и открой снова.</p><div class="modal-actions"><button class="btn" onclick="closeModal()">Понял</button></div>`));
$('resetBtn').addEventListener('click',()=>modal(`<h2>Сбросить всё?</h2><p class="muted">Основные данные будут удалены. Голосовые лежат отдельно и останутся.</p><div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmReset()">Сбросить</button></div>`));
window.confirmReset=()=>{state=structuredClone(DEFAULT);localStorage.setItem(KEY,JSON.stringify(state));closeModal();render();toast('Сброшено')};

$('privacyBtn').addEventListener('click',()=>$('privacyCover').classList.add('show'));
$('privacyCover').addEventListener('click',()=>$('privacyCover').classList.remove('show'));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.settings.autoLock)setTimeout(showLock,500)});

const now=new Date(),hour=now.getHours();
$('greeting').textContent=hour<6?'Не спишь, Валентин':hour<12?'Доброе утро, Валентин':hour<18?'Добрый день, Валентин':'Добрый вечер, Валентин';
$('dateLine').textContent=now.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
save();renderVoice();
if(localStorage.getItem(PIN_KEY)&&sessionStorage.getItem('vos_unlocked')!=='1')showLock();
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=5').catch(()=>{}));
