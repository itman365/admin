const CACHE='valentin-os-jarvis-v7-20260920-fix1';
const BUILD='jarvis-v7-20260920-fix1';
const ASSETS=[
  './','./index.html','./app.css?v=5',
  `./final.css?v=${BUILD}`,`./smart.css?v=${BUILD}`,`./jarvis.css?v=${BUILD}`,
  './app.js?v=5',
  `./app1.js?v=${BUILD}`,`./app2.js?v=${BUILD}`,`./app3.js?v=${BUILD}`,`./app4.js?v=${BUILD}`,`./app5.js?v=${BUILD}`,`./app6.js?v=${BUILD}`,`./app7.js?v=${BUILD}`,
  './app5.part1?v=6','./app5.part2?v=6','./app5.part3?v=6','./app5.part4?v=6',
  './app7.part1?v=7','./app7.part2?v=7','./app7.part3?v=7','./app7.part4?v=7','./app7.part5?v=7',
  './manifest.webmanifest','./icon.svg'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))))});
self.addEventListener('push',e=>{let data={};try{data=e.data?e.data.json():{}}catch{data={body:e.data?.text()||''}};const title=data.title||'JARVIS';const options={body:data.body||'Есть новый сигнал.',icon:'./icon.svg',badge:'./icon.svg',tag:data.tag||'jarvis-push',data:{url:data.url||'./?jarvis=1'}};e.waitUntil(self.registration.showNotification(title,options))});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=e.notification.data?.url||'./?jarvis=1';e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus'in c){c.navigate(url);return c.focus()}}return clients.openWindow?clients.openWindow(url):null}))});
