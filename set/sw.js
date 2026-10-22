/* Keep CACHE and ASSETS aligned with js/pwa.js. Each release gets a new cache. */
const CACHE='set-pwa-v2-20261023-3';
const PREFIX='set-pwa-';
const ASSETS=['./','./index.html','./styles.css','./app.js','./js/model.js','./js/storage.js','./js/stats.js','./js/timer.js','./js/views.js','./js/pwa.js','./js/programs.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  await(await caches.open(CACHE)).addAll(ASSETS);
  // Old releases placed their update button under the iPhone status bar.
  // Activate the prepared files without that button only when storage confirms
  // there is no active workout. Existing pages stay open and are never navigated.
  if(self.registration?.active&&await canActivateWithoutButton())await self.skipWaiting();
})()));
function canActivateWithoutButton(){
  return new Promise(resolve=>{
    if(typeof indexedDB==='undefined')return resolve(false);
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timeout);resolve(value);};
    const timeout=setTimeout(()=>finish(false),2500);
    let request;
    try{request=indexedDB.open('set-workout');}catch{return finish(false);}
    request.onupgradeneeded=()=>request.transaction.abort();
    request.onerror=()=>finish(false);
    request.onblocked=()=>finish(false);
    request.onsuccess=()=>{
      const db=request.result;
      if(settled){db.close();return;}
      if(!db.objectStoreNames.contains('meta')){db.close();finish(false);return;}
      try{
        const tx=db.transaction('meta','readonly'),read=tx.objectStore('meta').get('state');
        read.onsuccess=()=>{const value=read.result?.value;finish(Boolean(value)&&value.session===null);};
        read.onerror=()=>finish(false);
        tx.oncomplete=()=>db.close();tx.onabort=()=>{db.close();finish(false);};
      }catch{db.close();finish(false);}
    };
  });
}
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
