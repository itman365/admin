const CACHE='valentin-os-smart-v6-20260920';
const BUILD='smart-v6-20260920';
const ASSETS=[
  './',
  './index.html',
  './app.css?v=5',
  `./final.css?v=${BUILD}`,
  `./smart.css?v=${BUILD}`,
  './app.js?v=5',
  `./app1.js?v=${BUILD}`,
  `./app2.js?v=${BUILD}`,
  `./app3.js?v=${BUILD}`,
  `./app4.js?v=${BUILD}`,
  `./app5.js?v=${BUILD}`,
  './app5.part1?v=6','./app5.part2?v=6','./app5.part3?v=6','./app5.part4?v=6',
  './manifest.webmanifest',
  './icon.svg'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{
    const copy=r.clone();
    caches.open(CACHE).then(c=>c.put(e.request,copy));
    return r;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});