export const CACHE_NAME='set-pwa-v2-20261023-10';
export const OFFLINE_ASSETS=['./','./index.html','./styles.css','./app.js','./js/model.js','./js/storage.js','./js/stats.js','./js/timer.js','./js/views.js','./js/pwa.js','./js/programs.js','./js/share.js','./js/icons.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
export async function checkOffline(){
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return 'Потрібен HTTPS або localhost для офлайн-режиму';
  const registration=await navigator.serviceWorker.getRegistration();
  if(!registration?.active)return 'Офлайн-файли ще готуються. Спробуй за кілька секунд.';
  const cache=await caches.open(CACHE_NAME),files=await Promise.all(OFFLINE_ASSETS.map(path=>cache.match(new URL(path,document.baseURI).href)));
  return files.every(Boolean)?'Готово до роботи без інтернету':'Офлайн-копія неповна. Відкрий СЕТ з інтернетом і повтори перевірку.';
}
export async function requestPersistence(){
  try{if(!navigator.storage?.persist)return 'Браузер не підтримує запит захисту. Регулярно зберігай JSON-копії.';
    const granted=await navigator.storage.persist();return granted?'Постійне сховище дозволене. Резервні копії все одно потрібні.':'Браузер не надав постійне сховище. Зберігай резервні копії у Файли.';
  }catch{return 'Не вдалося змінити режим сховища. Твої записи залишаються на пристрої.';}
}
export async function setupPWA({canUpdate,onStatus,onUpdate}){
  if(!('serviceWorker' in navigator)||!window.isSecureContext){onStatus('Офлайн-режим потребує HTTPS або localhost');return;}
  let requested=false,reloading=false,hadController=Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!hadController){hadController=true;return;}
    if(!canUpdate()){onUpdate(()=>{if(canUpdate())location.reload();});return;}
    if(!reloading){reloading=true;location.reload();}
  });
  const registration=await navigator.serviceWorker.register(`./sw.js?set_release=${CACHE_NAME}`,{updateViaCache:'none'});
  if(!registration){onStatus('Браузер не дозволив підготовку офлайн-файлів');return;}
  function waiting(){if(!registration.waiting)return;onUpdate(()=>{if(!canUpdate())return;if(requested||!registration.waiting){location.reload();return;}requested=true;registration.waiting.postMessage({type:'SKIP_WAITING'});});}
  waiting();
  registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'){if(navigator.serviceWorker.controller)waiting();else checkOffline().then(onStatus);}if(worker.state==='redundant')onStatus('Не вдалося підготувати оновлення. Поточна версія залишається доступною.');});});
  // Force a fresh worker check on reopening; a cached app shell must not hide fixes.
  if(navigator.onLine&&navigator.serviceWorker.controller)registration.update().catch(()=>{});
  await navigator.serviceWorker.ready;onStatus(await checkOffline());
}
