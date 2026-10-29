import {isWorking} from './progression.js';
import {estimated1RM,setRecords} from './stats.js';

// Derived history data is cached only for frozen arrays. The repository freezes
// saved history, so a new array means changed data and a fresh calculation.
const recordCache=new WeakMap(),orderCache=new WeakMap();
const cached=(store,history,build)=>{if(!Object.isFrozen(history))return build();let value=store.get(history);if(!value){value=build();store.set(history,value);}return value;};

// Newest first; ties keep the stored order. Callers must not mutate the result.
export function newestFirst(history){return cached(orderCache,history,()=>[...history].sort((a,b)=>Date.parse(b.finishedAt)-Date.parse(a.finishedAt)));}

// Exact previous implementation, kept for workouts outside the given history
// and for the rare zero-duration workout that would count itself as earlier.
export function directWorkoutPRs(history,w){
 const prior=history.filter(p=>p.id!==w.id&&Date.parse(p.finishedAt)<=Date.parse(w.startedAt)),seen=new Map(),out=[];
 for(const e of w.exercises)for(const s of e.sets){const earlier=seen.get(e.exerciseId)||[];const labels=setRecords(prior,e.exerciseId,s,earlier);if(labels.length)out.push({name:e.name,set:s,labels,rm:estimated1RM(s)});earlier.push(s);seen.set(e.exerciseId,earlier);}
 return out;
}
const emptyBest=()=>({count:0,weight:-Infinity,reps:new Map(),rm:-Infinity});
function absorb(best,s){
 const weight=Number(s.weight),reps=Number(s.reps),rm=estimated1RM(s);best.count++;
 if(weight>best.weight)best.weight=weight;
 if(!(reps<=best.reps.get(weight)))best.reps.set(weight,Math.max(reps,best.reps.get(weight)??-Infinity));
 if(rm&&rm>best.rm)best.rm=rm;
}
// Labels follow setRecords(): weight above every earlier working set, more reps
// than every earlier set at the same weight, and a higher Epley estimate.
function labelsFor(s,global,local){
 if(!s.done||!isWorking(s))return [];
 const count=(global?.count||0)+(local?.count||0);if(!count)return [];
 const weight=Number(s.weight),reps=Number(s.reps),labels=[];
 if(weight>Math.max(global?.weight??-Infinity,local?.weight??-Infinity))labels.push('Вага');
 const sameWeight=Math.max(global?.reps.get(weight)??-Infinity,local?.reps.get(weight)??-Infinity);
 if(sameWeight>-Infinity&&reps>sameWeight)labels.push('Повторення');
 const priorRM=Math.max(global?.rm??-Infinity,local?.rm??-Infinity),rm=estimated1RM(s);
 if(priorRM>-Infinity&&rm>priorRM+0.001)labels.push('≈1RM');
 return labels;
}
// One chronological pass over history. A workout joins the baseline once it has
// finished at or before the start of the workout being evaluated, matching the
// previous per-workout filter. Editing any saved workout creates a new history
// array, so every dependent record is recalculated.
export function recordIndex(history){return cached(recordCache,history,()=>{
 const byStart=[...history].sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt));
 const byFinish=[...history].sort((a,b)=>Date.parse(a.finishedAt)-Date.parse(b.finishedAt));
 const best=new Map(),result=new Map();let next=0;
 for(const w of byStart){
  const start=Date.parse(w.startedAt);
  while(next<byFinish.length&&Date.parse(byFinish[next].finishedAt)<=start){for(const e of byFinish[next].exercises)for(const s of e.sets){if(!isWorking(s))continue;let b=best.get(e.exerciseId);if(!b){b=emptyBest();best.set(e.exerciseId,b);}absorb(b,s);}next++;}
  if(Date.parse(w.finishedAt)<=start){result.set(w.id,directWorkoutPRs(history,w));continue;}
  const local=new Map(),out=[];
  for(const e of w.exercises)for(const s of e.sets){
   const labels=labelsFor(s,best.get(e.exerciseId),local.get(e.exerciseId));
   if(labels.length)out.push({name:e.name,set:s,labels,rm:estimated1RM(s)});
   if(s.done&&isWorking(s)){let l=local.get(e.exerciseId);if(!l){l=emptyBest();local.set(e.exerciseId,l);}absorb(l,s);}
  }
  result.set(w.id,out);
 }
 return result;
});}
export function workoutPRs(history,w){const found=history.includes(w)?recordIndex(history).get(w.id):null;return found||directWorkoutPRs(history,w);}
export function recordCount(history,within=history){const index=recordIndex(history);let n=0;for(const w of within)n+=(index.get(w.id)||workoutPRs(history,w)).length;return n;}
const priorWeightCache=new WeakMap();
export function priorWeights(history){return cached(priorWeightCache,history,()=>{
 const starts=[...history].sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt)),finishes=[...history].sort((a,b)=>Date.parse(a.finishedAt)-Date.parse(b.finishedAt)),best=new Map(),result=new Map();let cursor=0;
 const add=(map,w)=>{for(const e of w.exercises)for(const s of e.sets)if(s.done&&isWorking(s))map.set(e.exerciseId,Math.max(map.get(e.exerciseId)??-Infinity,Number(s.weight)));};
 for(const w of starts){while(cursor<finishes.length&&Date.parse(finishes[cursor].finishedAt)<=Date.parse(w.startedAt))add(best,finishes[cursor++]);
  if(Date.parse(w.finishedAt)<=Date.parse(w.startedAt)){const baseline=new Map();for(const p of history)if(p.id!==w.id&&Date.parse(p.finishedAt)<=Date.parse(w.startedAt))add(baseline,p);result.set(w.id,baseline);}
  else result.set(w.id,new Map(best));
 }
 return result;
});}
