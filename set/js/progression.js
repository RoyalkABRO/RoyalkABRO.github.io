// Pure training guidance; suggestions never change a plan or logged results.
import {newestFirst} from './history-index.js';
import {equipmentKey, exerciseConfig, progressionWeight} from './exercise-config.js';
import {estimated1RM} from './stats.js';
export const isPending = s=>!s.done&&!s.skipped;
export const isWorking = s => s.type !== 'warmup';
export const workingSets = e => e.sets.filter(isWorking);
export const setLabel = (e,index) => {const warm=e.sets[index].type==='warmup';return (warm?'Р':'')+e.sets.slice(0,index+1).filter(s=>(s.type==='warmup')===warm).length;};
export function exerciseHistory(history,id){return newestFirst(history).flatMap(w=>{const es=w.exercises.filter(e=>e.exerciseId===id),sets=es.flatMap(workingSets);return sets.length?[{workout:w,sets,goal:es.length===1?es[0].goal:null}]:[];});}
function matchingResults(state,e,{includeEasy=false}={}) {
 const setup=equipmentKey(e),config=exerciseConfig(e);
 for(const workout of newestFirst(state.history)) {
  if(workout.easy&&!includeEasy)continue;
  const matches=workout.exercises.filter(row=>row.exerciseId===e.exerciseId&&equipmentKey(row)===setup&&
    (config.equipmentType!=='pullup'||row.training));
  if(matches.length===1&&workingSets(matches[0]).length&&(includeEasy||matches[0].goal?.mode!=='easy')) {
   return {workout, exercise:matches[0], sets:workingSets(matches[0])};
  }
  if(matches.length>1)return null;
 }
 return null;
}

export function progressionOffer(state,e) {
 const config=exerciseConfig(e), work=workingSets(e);
 if(!config.progression||state.session?.easy||e.replacementFor||e.goal?.mode==='manual'||e.targetRepsUnspecified||
    work.length<(e.targetSets??1)||work.some(s=>!isPending(s)))return null;
 const latest=matchingResults(state,e);
 if(!latest||!latest.workout.progressionComplete||latest.exercise.replacementFor||
    latest.sets.length!==work.length)return null;
 const high=e.targetRepsMax??e.targetReps??config.max;
 const current=Number(latest.sets[0].weight);
 if(latest.sets.some(s=>!s.done||!Number.isFinite(Number(s.weight))||Number(s.weight)!==current||
    Number(s.reps)<high||(config.useRir&&s.rir===0)))return null;
 // Respect manually edited working loads and existing manual goals.
 if(work.some(s=>String(s.weight)!==''&&Number(s.weight)!==current))return null;
 let weight,band;
 if(config.equipmentType==='pullup'&&config.band!==null) {
  const index=config.bands.indexOf(config.band);
  if(index<0||current!==0)return null;
  band=config.bands[index+1]??null;
 }else{
  if(current===0&&config.equipmentType!=='pullup')return null;
  weight=progressionWeight(current,config);
  if(weight===null)return null;
 }
 const key=JSON.stringify([latest.workout.id,latest.exercise.id,equipmentKey(e),weight,band,high,work.length]);
 const catalog=state.catalog.find(c=>c.id===e.exerciseId);
 if(catalog?.declinedProgression?.includes(key))return null;
 return {key,weight,band,low:e.targetReps??config.min};
}

export function resolveProgression(state,e,accept,expectedKey) {
 const offer=progressionOffer(state,e);
 if(!offer||(expectedKey!==undefined&&offer.key!==expectedKey))throw Error('Ця рекомендація вже змінилася.');
 const catalog=state.catalog.find(c=>c.id===e.exerciseId);
 if(!catalog)throw Error('Вправу не знайдено.');
 if(!accept){
  catalog.declinedProgression=[...(catalog.declinedProgression||[]),offer.key].slice(-30);
  return;
 }
 if(offer.band!==undefined){
  if(equipmentKey(catalog)!==equipmentKey(e))throw Error('Налаштування турніка змінилися. Перевір рівень допомоги в параметрах вправи.');
  e.training.band=offer.band;
  catalog.training={...structuredClone(e.training)};
 }
 const weight=offer.weight??0;
 applyGoal(e,{sets:workingSets(e).map(()=>({weight,reps:offer.low})),
  reason:'Прийнята ціль прогресії.',mode:'normal'});
}

export function suggestGoal(state,e){
 const count=workingSets(e).length,last=matchingResults(state,e),config=exerciseConfig(e);
 const mode=state.session?.easy?'easy':'normal';
 if(!count||(!config.progression&&mode!=='easy'))return {sets:[],reason:'',mode};
 if(!last)return {sets:[],reason:'Обери комфортну робочу вагу.',mode};
 const low=e.targetReps??config.min,high=e.targetRepsMax??low;
 const sets=Array.from({length:count},(_,i)=>{
  const p=last.sets[i]||last.sets.at(-1);
  return {weight:Number(p.weight),reps:Number(p.reps)};
 });
 let reason='Повтори результат минулого заняття.';
 if(mode==='easy'){
  for(const set of sets)set.reps=Math.max(1,Math.floor(set.reps*.8));
  reason='Легший день: менше повторень із тією самою вагою.';
 }else if(!e.targetRepsUnspecified&&last.sets.length===count){
  const i=sets.findLastIndex((s,i)=>s.reps<high&&(!config.useRir||last.sets[i].rir!==0));
  if(i>=0){
   sets[i].reps=Math.min(high,Math.max(low,sets[i].reps+1));
   reason='Додай повторення за тієї самої ваги.';
  }
 }
 return {sets,reason,mode};
}
export function applyGoal(e,goal){const rows=workingSets(e);if(goal.sets.length!==rows.length)throw new Error('Кількість робочих підходів змінилася. Відкрий ціль ще раз.');rows.forEach((s,i)=>{if(!s.done)Object.assign(s,goal.sets[i]);});e.goal={sets:goal.sets.map(s=>({weight:Number(s.weight),reps:Number(s.reps)})),reason:goal.reason,mode:goal.mode||'normal'};}
export function goalDiffersFromUnfinished(e,goal){
 const rows=workingSets(e);
 if(!goal?.sets?.length||goal.sets.length!==rows.length)return false;
 return rows.some((s,i)=>!s.done&&(String(s.weight)===''||String(s.reps)===''||Number(s.weight)!==Number(goal.sets[i].weight)||Number(s.reps)!==Number(goal.sets[i].reps)));
}
export function previousDuration(state,w=state.session){const last=newestFirst(state.history).find(h=>h.id!==w.id&&w.templateId&&h.templateId===w.templateId&&Date.parse(h.finishedAt)<=Date.parse(w.startedAt));return last?Math.max(1,Math.round((Date.parse(last.finishedAt)-Date.parse(last.startedAt))/60000)):null;}
export function canOfferExtra(state,e,now=Date.now()){const ss=workingSets(e),elapsed=(now-Date.parse(state.session.startedAt))/60000,prior=previousDuration(state),all=state.session.exercises.flatMap(workingSets),done=all.filter(s=>s.done).length,projected=done?elapsed*all.length/done:90;return e.sets.length<200&&!state.session.easy&&ss.length===(e.targetSets||4)&&ss.length<20&&ss.length>0&&ss.every(s=>s.done&&s.rir!==0)&&ss.some(s=>s.rir>=1)&&elapsed<75&&Math.max(elapsed,prior||elapsed,projected)+5<=90;}
const repWord=n=>n%10>=1&&n%10<=4&&(n%100<11||n%100>14)?'повторення':'повторень';
export function comparison(history,w){const lines=[];for(const e of w.exercises){const prev=matchingResults({history:history.filter(h=>h.id!==w.id&&Date.parse(h.finishedAt)<=Date.parse(w.startedAt))},e,{includeEasy:true}),ss=workingSets(e);if(!prev||!ss.length)continue;const p=prev.sets;if(ss.length===p.length&&ss.every((s,i)=>Number(s.weight)===Number(p[i].weight))){const diff=ss.reduce((n,s)=>n+Number(s.reps),0)-p.reduce((n,s)=>n+Number(s.reps),0);lines.push(e.name+': за тієї самої ваги '+(diff>0?'на '+diff+' '+repWord(diff)+' більше':diff<0?'на '+(-diff)+' '+repWord(-diff)+' менше':'стільки ж повторень')+'.');}else lines.push(e.name+': робочий обсяг '+Math.round(ss.reduce((n,s)=>n+s.weight*s.reps,0))+' кг (минулого разу '+Math.round(p.reduce((n,s)=>n+s.weight*s.reps,0))+' кг).');}return lines;}
export function exerciseComparison(history,exerciseId,metric='weight'){
 const entries=exerciseHistory(history,exerciseId);
 if(entries.length<2)return '';
 const curr=entries[0].sets,prev=entries[1].sets;
 if(metric==='e1rm'){
  const c=Math.max(0,...curr.map(estimated1RM)),p=Math.max(0,...prev.map(estimated1RM));
  if(!c||!p)return 'Для порівняння оцінки максимуму потрібні два заняття з підходами на 1–12 повторень і додатковою вагою.';
  const diff=Math.round((c-p)*10)/10;
  return diff===0?'Оцінка максимуму без змін':`Оцінка максимуму ${diff>0?'+':''}${diff.toLocaleString('uk-UA')} кг до попереднього заняття`;
 }
 if(metric==='volume'){
  const cv=Math.round(curr.reduce((n,s)=>n+Number(s.weight)*Number(s.reps),0)),pv=Math.round(prev.reduce((n,s)=>n+Number(s.weight)*Number(s.reps),0)),diff=cv-pv;
  return diff===0?`Обсяг як минулого разу (${cv.toLocaleString('uk-UA')} кг)`:`Обсяг ${diff>0?'+':''}${diff.toLocaleString('uk-UA')} кг до попереднього заняття (${pv.toLocaleString('uk-UA')} → ${cv.toLocaleString('uk-UA')} кг)`;
 }
 if(metric==='reps'){
  const cr=Math.max(...curr.map(s=>Number(s.reps))),pr=Math.max(...prev.map(s=>Number(s.reps))),diff=cr-pr;
  return diff===0?`Максимум повторень без змін (${cr})`:`Максимум повторень ${diff>0?'+':''}${diff} до попереднього заняття (${pr} → ${cr})`;
 }
 const cw=Math.max(...curr.map(s=>Number(s.weight))),pw=Math.max(...prev.map(s=>Number(s.weight))),diff=Math.round((cw-pw)*100)/100;
 if(diff!==0)return `Робоча вага ${diff>0?'+':''}${diff.toLocaleString('uk-UA')} кг до попереднього заняття (${pw.toLocaleString('uk-UA')} → ${cw.toLocaleString('uk-UA')} кг)`;
 const creps=curr.reduce((n,s)=>n+Number(s.reps),0),preps=prev.reduce((n,s)=>n+Number(s.reps),0),rdiff=creps-preps;
 return rdiff===0?`Повторено попередній результат (${cw.toLocaleString('uk-UA')} кг · ${curr.map(s=>s.reps).join('/')})`:`За ваги ${cw.toLocaleString('uk-UA')} кг ${rdiff>0?'+':''}${rdiff} ${repWord(Math.abs(rdiff))} до попереднього заняття`;
}
