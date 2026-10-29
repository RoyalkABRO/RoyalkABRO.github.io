import {isWorking,workingSets} from './progression.js';
import {volume,localDay,estimated1RM} from './stats.js';
import {workoutPRs as indexedWorkoutPRs,recordCount,newestFirst,recordIndex,priorWeights} from './history-index.js';
export function workoutPRs(history,w){return indexedWorkoutPRs(history,w);}
const monday=date=>{const d=new Date(date);d.setHours(0,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return d;};
export function dashboard(state,now=new Date()){
 const start=monday(now),counts=new Map(),weeks=new Set(),month=[];
 const nowTime=now.getTime(),nowMonth=now.getMonth(),nowYear=now.getFullYear();
 for(const w of state.history){
  const t=Date.parse(w.finishedAt);if(t>nowTime)continue;
  const dayKey=localDay(w.finishedAt);
  counts.set(dayKey,(counts.get(dayKey)||0)+1);
  weeks.add(localDay(monday(w.finishedAt)));
  const d=new Date(w.finishedAt);
  if(d.getMonth()===nowMonth&&d.getFullYear()===nowYear)month.push(w);
 }
 const days=Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);const key=localDay(d);return {key,today:key===localDay(now),count:counts.get(key)||0,planned:state.templates.some(t=>t.exercises.length&&t.day===d.getDay())};});
 let cursor=new Date(start),streak=0;
 if(!weeks.has(localDay(cursor)))cursor.setDate(cursor.getDate()-7);while(weeks.has(localDay(cursor))){streak++;cursor.setDate(cursor.getDate()-7);}
 const plans=state.templates.filter(t=>t.exercises.length).slice().sort((a,b)=>(a.day-now.getDay()+7)%7-(b.day-now.getDay()+7)%7);
 const out={days,streak,monthCount:month.length,monthVolume:month.reduce((n,w)=>n+volume(w),0),featured:plans[0]||state.templates[0],greeting:now.getHours()<5?'Доброї ночі':now.getHours()<12?'Добрий ранок':now.getHours()<18?'Добрий день':'Добрий вечір'};
 Object.defineProperty(out,'monthPRs',{enumerable:true,get(){return recordCount(state.history,month);}});
 return out;
}
export function workoutSummary(history,w){
 const sets=w.exercises.flatMap(workingSets),prs=workoutPRs(history,w);let targets=0,met=0;
 for(const e of w.exercises){workingSets(e).forEach((s,i)=>{const target=e.goal?.sets[i];if(target){targets++;if(Number(s.weight)>=target.weight&&Number(s.reps)>=target.reps)met++;}});}
 if(w.goalProgress){targets=w.goalProgress.total;}
 const total=sets.length,focus=w.exercises.map(e=>({name:e.name,count:workingSets(e).length})).filter(e=>e.count).map(e=>({...e,percent:e.count/Math.max(1,total)*100}));
 return {volume:volume(w),sets:total,minutes:Math.max(1,Math.round((Date.parse(w.finishedAt)-Date.parse(w.startedAt))/60000)),targets,met,goalPercent:targets?Math.round(met/targets*100):null,prs,focus};
}
export function nextSet(session){if(!session)return null;for(const e of session.exercises){const s=e.sets.find(s=>!s.done);if(s){const index=workingSets(e).indexOf(s);return {exercise:e,set:s,index:e.sets.indexOf(s),target:isWorking(s)?e.goal?.sets[index]:null};}}return null;}
export function barbellPlates(weight,bar=20){if(!Number.isFinite(weight)||!Number.isFinite(bar)||bar<=0||weight<bar)return null;let rest=Math.round((weight-bar)*100)/200;const plates=[];for(const p of [25,20,15,10,5,2.5,1.25])while(rest>=p-0.00001){plates.push(p);rest-=p;}return {plates,remainder:Math.max(0,Math.round(rest*200)/100)};}
const factsCache=new WeakMap();
export function historyFacts(history){
 if(Object.isFrozen(history)&&factsCache.has(history))return factsCache.get(history);
 const plans=new Map(),previous=new Map(),best=new Map();
 for(const w of newestFirst(history)){
  if(w.templateId&&!plans.has(w.templateId))plans.set(w.templateId,w);
  for(const e of w.exercises){const sets=workingSets(e).filter(s=>s.done);if(!sets.length)continue;
   if(!previous.has(e.exerciseId))previous.set(e.exerciseId,sets);
   for(const set of sets){const prior=best.get(e.exerciseId);if(!prior||Number(set.weight)>Number(prior.set.weight)||(Number(set.weight)===Number(prior.set.weight)&&Number(set.reps)>Number(prior.set.reps)))best.set(e.exerciseId,{name:e.name,set,date:w.finishedAt});}
  }
 }
 const result={plans,previous,best};if(Object.isFrozen(history))factsCache.set(history,result);return result;
}
export function weekGroups(visible,allHistory=visible,now=new Date()){
 const totals=new Map(),groups=new Map(),prs=recordIndex(allHistory),baselines=priorWeights(allHistory),current=localDay(monday(now)),last=new Date(monday(now));last.setDate(last.getDate()-7);
 for(const w of allHistory){const key=localDay(monday(w.finishedAt));totals.set(key,(totals.get(key)||0)+volume(w));}
 for(const w of newestFirst(visible)){const start=monday(w.finishedAt),key=localDay(start);let group=groups.get(key);if(!group){const previous=new Date(start);previous.setDate(previous.getDate()-7);const end=new Date(start);end.setDate(end.getDate()+6);const total=totals.get(key)||0,prior=totals.get(localDay(previous))||0;group={key,start,end,label:key===current?'Цей тиждень':key===localDay(last)?'Минулий тиждень':'Тиждень',volume:total,delta:prior>0?Math.round((total-prior)/prior*100):null,workouts:[]};groups.set(key,group);}
  const records=prs.get(w.id)||[],top=records.slice().sort((a,b)=>(b.rm||Number(b.set.weight)*Number(b.set.reps))-(a.rm||Number(a.set.weight)*Number(a.set.reps)))[0];
  const best=top||w.exercises.flatMap(e=>workingSets(e).filter(s=>s.done).map(set=>({name:e.name,set,rm:estimated1RM(set)}))).sort((a,b)=>(b.rm||Number(b.set.weight)*Number(b.set.reps))-(a.rm||Number(a.set.weight)*Number(a.set.reps)))[0];
  let deltaWeight=null;
  if(top?.labels.includes('Вага')){const exercise=w.exercises.find(e=>e.sets.includes(top.set));let baseline=baselines.get(w.id)?.get(exercise.exerciseId)??-Infinity;for(const e of w.exercises){if(e.exerciseId!==exercise.exerciseId)continue;for(const set of e.sets){if(set===top.set)break;if(set.done&&isWorking(set))baseline=Math.max(baseline,Number(set.weight));}if(e.sets.includes(top.set))break;}if(Number.isFinite(baseline)&&Number(top.set.weight)>baseline)deltaWeight=Number(top.set.weight)-baseline;}
  group.workouts.push({workout:w,prs:records,top:best,isPR:Boolean(top),deltaWeight,volume:volume(w)});
 }
 return [...groups.values()];
}
