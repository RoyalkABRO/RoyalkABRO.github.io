/* Keep CACHE and ASSETS aligned with js/pwa.js. Each release gets a new cache. */
const CACHE='set-pwa-v2-20261023-1';
const PREFIX='set-pwa-';
const ASSETS=['./','./index.html','./styles.css','./app.js','./js/model.js','./js/storage.js','./js/stats.js','./js/timer.js','./js/views.js','./js/pwa.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  const canonical=new URL(url);canonical.search='';canonical.hash='';
  const isAppAsset=ASSETS.some(path=>new URL(path,self.registration.scope).href===canonical.href);
  if(event.request.mode!=='navigate'&&!isAppAsset)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const hit=await cache.match(event.request.mode==='navigate'?new URL('./index.html',self.registration.scope).href:canonical.href);
    if(hit)return hit;
    try{return await fetch(event.request);}catch{return new Response('СЕТ ще не підготовлено до роботи офлайн. Відкрий застосунок з інтернетом.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
  })());
});
