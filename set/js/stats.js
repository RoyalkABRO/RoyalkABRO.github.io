import {isWorking} from './progression.js';
const filteredCache=new WeakMap();
export const volume = w => w.exercises.reduce((sum,e)=>sum+e.sets.filter(isWorking).reduce((v,s)=>v+Number(s.weight)*Number(s.reps),0),0);
export function filteredHistory(history,days=0,now=Date.now()) {
  if(!days&&Object.isFrozen(history)){
    const cached=filteredCache.get(history);
    if(cached&&cached.length&&Date.parse(cached.at(-1).finishedAt)<=now&&cached.length===history.length)return cached;
  }
  const out=history.filter(w=>Date.parse(w.finishedAt)<=now&&(!days||Date.parse(w.finishedAt)>=now-days*86400000)).sort((a,b)=>Date.parse(a.finishedAt)-Date.parse(b.finishedAt));
  if(!days&&Object.isFrozen(history)&&out.length===history.length){Object.freeze(out);filteredCache.set(history,out);}
  return out;
}
export function series(history,exerciseId,metric='weight') {
  return [...history].sort((a,b)=>Date.parse(a.finishedAt)-Date.parse(b.finishedAt)).flatMap(w=>{
    const sets=w.exercises.filter(e=>e.exerciseId===exerciseId).flatMap(e=>e.sets).filter(isWorking);
    if(!sets.length)return [];
    if(metric==='e1rm'&&!sets.some(s=>estimated1RM(s)>0))return [];
    const value=metric==='volume'?sets.reduce((v,s)=>v+s.weight*s.reps,0):metric==='reps'?Math.max(...sets.map(s=>s.reps)):metric==='e1rm'?Math.max(...sets.map(estimated1RM)):Math.max(...sets.map(s=>s.weight));
    return [{date:w.finishedAt,value}];
  });
}
export function records(history,exerciseId) {
  const sets=history.flatMap(w=>w.exercises.filter(e=>e.exerciseId===exerciseId).flatMap(e=>e.sets)).filter(isWorking);
  return {weight:sets.length?Math.max(...sets.map(s=>s.weight)):0,reps:sets.length?Math.max(...sets.map(s=>s.reps)):0,bestSetVolume:sets.length?Math.max(...sets.map(s=>s.weight*s.reps)):0};
}

// Epley estimate: limit to 1–12 reps and external load; 0 kg bodyweight is not a strength estimate.
export function estimated1RM(s){const w=Number(s.weight),r=Number(s.reps);return isWorking(s)&&Number.isFinite(w)&&w>0&&Number.isInteger(r)&&r>=1&&r<=12?(r===1?w:w*(1+r/30)):0;}
export function setRecords(history,exerciseId,set,earlier=[]){
  if(!set.done||!isWorking(set))return [];
  const previous=[...history.flatMap(w=>w.exercises.filter(e=>e.exerciseId===exerciseId).flatMap(e=>e.sets)),...earlier.filter(s=>s.done)].filter(isWorking);
  if(!previous.length)return [];
  const labels=[];
  if(Number(set.weight)>Math.max(...previous.map(s=>Number(s.weight))))labels.push('Вага');
  const sameWeight=previous.filter(s=>Number(s.weight)===Number(set.weight));
  if(sameWeight.length&&Number(set.reps)>Math.max(...sameWeight.map(s=>Number(s.reps))))labels.push('Повторення');
  const priorRM=previous.map(estimated1RM).filter(Boolean),rm=estimated1RM(set);
  if(priorRM.length&&rm>Math.max(...priorRM)+0.001)labels.push('≈1RM');
  return labels;
}
export const localDay=iso=>{const d=new Date(iso);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
export function monthActivity(history,month=new Date()){
  const year=month.getFullYear(),m=month.getMonth(),days=new Date(year,m+1,0).getDate(),counts=new Map();
  for(const w of history){const day=localDay(w.finishedAt);counts.set(day,(counts.get(day)||0)+1);}
  return Array.from({length:days},(_,i)=>{const date=localDay(new Date(year,m,i+1));return {date,day:i+1,count:counts.get(date)||0};});
}
