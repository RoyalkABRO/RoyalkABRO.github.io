// Requests are serialized; late grants are released when the user leaves the workout.
export class WorkoutWakeLock {
 constructor(nav=globalThis.navigator,doc=globalThis.document,onStatus=()=>{}){this.nav=nav;this.doc=doc;this.onStatus=onStatus;this.desired=false;this.sentinel=null;this.requesting=null;}
 async sync(enabled){
  this.desired=Boolean(enabled)&&this.doc.visibilityState==='visible';
  if(!this.desired){if(this.sentinel){const held=this.sentinel;this.sentinel=null;await held.release().catch(()=>{});}this.onStatus(enabled?'Екран утримується лише коли СЕТ відкритий':'Утримання екрана вимкнено');return;}
  if(!this.nav.wakeLock?.request){this.onStatus('Цей браузер не підтримує утримання екрана');return;}
  if(this.sentinel){this.onStatus('Екран не згасатиме під час відкритого тренування');return;}
  if(this.requesting)return;
  this.requesting=(async()=>{try{
   const held=await this.nav.wakeLock.request('screen');
   if(!this.desired||this.doc.visibilityState!=='visible'){await held.release();return;}
   this.sentinel=held;this.onStatus('Екран не згасатиме під час відкритого тренування');
   held.addEventListener('release',()=>{if(this.sentinel===held){this.sentinel=null;this.onStatus('Система дозволила екрану згаснути');}});
  }catch{this.onStatus('Система не дозволила утримувати екран. Перевір енергозбереження');}finally{this.requesting=null;}})();
  return this.requesting;
 }
}
