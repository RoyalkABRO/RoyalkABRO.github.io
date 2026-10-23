import {isWorking,workingSets} from './progression.js';
import {volume,estimated1RM,setRecords,localDay} from './stats.js';
export function workoutPRs(history,w){
 const prior=history.filter(p=>p.id!==w.id&&Date.parse(p.finishedAt)<=Date.parse(w.startedAt)),seen=new Map(),out=[];
 for(const e of w.exercises)for(const s of e.sets){const earlier=seen.get(e.exerciseId)||[];const labels=setRecords(prior,e.exerciseId,s,earlier);if(labels.length)out.push({name:e.name,set:s,labels,rm:estimated1RM(s)});earlier.push(s);seen.set(e.exerciseId,earlier);}return out;
}
const monday=date=>{const d=new Date(date);d.setHours(0,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return d;};
export function dashboard(state,now=new Date()){
 const start=monday(now),days=Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return {key:localDay(d),today:localDay(d)===localDay(now),count:state.history.filter(w=>localDay(w.finishedAt)===localDay(d)).length,planned:state.templates.some(t=>t.exercises.length&&t.day===d.getDay())};});
 const weeks=new Set(state.history.filter(w=>Date.parse(w.finishedAt)<=now.getTime()).map(w=>localDay(monday(w.finishedAt))));let cursor=new Date(start),streak=0;
 if(!weeks.has(localDay(cursor)))cursor.setDate(cursor.getDate()-7);while(weeks.has(localDay(cursor))){streak++;cursor.setDate(cursor.getDate()-7);}
 const month=state.history.filter(w=>{const d=new Date(w.finishedAt);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()&&d<=now;});
 const plans=state.templates.filter(t=>t.exercises.length).slice().sort((a,b)=>(a.day-now.getDay()+7)%7-(b.day-now.getDay()+7)%7);
 return {days,streak,monthCount:month.length,monthVolume:month.reduce((n,w)=>n+volume(w),0),monthPRs:month.reduce((n,w)=>n+workoutPRs(state.history,w).length,0),featured:plans[0]||state.templates[0],greeting:now.getHours()<5?'Доброї ночі':now.getHours()<12?'Добрий ранок':now.getHours()<18?'Добрий день':'Добрий вечір'};
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
