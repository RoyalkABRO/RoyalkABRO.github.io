import {kyivDay,kyivMidnight,periodFor,previousPeriod,inPeriod} from './recap.js';

const KEY='set-recap-preferences-v1';
const ids=state=>Array.isArray(state?.seen)?state.seen.filter(x=>typeof x==='string').slice(-64):[];
export function recapPreferences(storage){
 try{
  const data=JSON.parse(storage?.getItem(KEY)||'null');
  return {enabled:data?.enabled!==false,push:data?.push===true,pushUsed:data?.pushUsed===true||data?.push===true,seen:ids(data)};
 }catch{return {enabled:true,push:false,pushUsed:false,seen:[]};}
}
export function saveRecapPreferences(storage,update){
 const data={...recapPreferences(storage),...update};
 data.seen=[...new Set(ids(data))];
 try{storage?.setItem(KEY,JSON.stringify(data));}catch{}
 return data;
}
export const recapNotice=kind=>kind==='week'?
 '🏋️ Твій тиждень у СЕТ завершено! Подивимось, наскільки ти став сильнішим?':
 '🏆 Твій місячний RECAP готовий. Час побачити результати!';
export function unreadRecaps(archive,prefs,today=kyivDay(Date.now())){
 if(!prefs.enabled)return [];
 const recent=new Set(['week','month'].map(k=>previousPeriod(periodFor(k,today)).id));
 return archive.filter(p=>recent.has(p.id)&&!prefs.seen.includes(p.id));
}
const historyDays=new WeakMap();
export function recapDeadlines(history,enabled,now=Date.now()){
 const day=kyivDay(now);
 let days=historyDays.get(history);
 if(!days){
  days=history.map(w=>kyivDay(w.startedAt));
  if(Object.isFrozen(history))historyDays.set(history,days);
 }
 return ['week','month'].map(kind=>{
  const p=periodFor(kind,day),hasWork=enabled&&days.some(d=>d<=day&&inPeriod(d,p));
  return {kind,id:hasWork?p.id:null,endsAt:hasWork?kyivMidnight(p.end):null};
 });
}
