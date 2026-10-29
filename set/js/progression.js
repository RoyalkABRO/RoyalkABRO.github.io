// Pure training guidance; suggestions never change a plan or logged results.
import {newestFirst} from './history-index.js';
import {estimated1RM} from './stats.js';
export const isWorking = s => s.type !== 'warmup';
export const workingSets = e => e.sets.filter(isWorking);
export const setLabel = (e,index) => {const warm=e.sets[index].type==='warmup';return (warm?'Р':'')+e.sets.slice(0,index+1).filter(s=>(s.type==='warmup')===warm).length;};
export function exerciseHistory(history,id){return newestFirst(history).flatMap(w=>{const es=w.exercises.filter(e=>e.exerciseId===id),sets=es.flatMap(workingSets);return sets.length?[{workout:w,sets,goal:es.length===1?es[0].goal:null}]:[];});}
export function suggestGoal(state,e){
 const count=workingSets(e).length,history=exerciseHistory(state.history,e.exerciseId).filter(h=>!h.workout.easy&&h.goal?.mode!=='easy'),last=history[0],config=state.catalog.find(c=>c.id===e.exerciseId)||{};
 if(!last||!count)return {sets:[],reason:'Перший орієнтир: обери вагу та повторення самостійно.',shortReason:'Обери комфортну робочу вагу для першого заняття.',mode:state.session?.easy?'easy':'normal'};
 const low=e.targetRepsUnspecified?1:e.targetReps||Math.min(...last.sets.map(s=>Number(s.reps))),high=e.targetRepsUnspecified?1000:e.targetRepsMax||e.targetReps||1000;
 let sets=Array.from({length:count},(_,i)=>{const p=last.sets[i]||last.sets.at(-1);return {weight:Number(p.weight),reps:Number(p.reps)};}),reason='Повтори попередній результат — додавати навантаження щоразу не потрібно.',shortReason='Повтори результат минулого заняття.';
 const uniform=ss=>ss.length===count&&ss.every(s=>Number(s.weight)===Number(ss[0].weight));
 const confident=h=>h&&uniform(h.sets)&&h.sets.every(s=>Number(s.reps)>=high&&s.rir!==0);
 const missed=last.sets.length!==count||last.sets.some(s=>Number(s.reps)<low||s.rir===0)||last.goal?.sets.some((g,i)=>!last.sets[i]||Number(last.sets[i].weight)<g.weight||(Number(last.sets[i].weight)===g.weight&&Number(last.sets[i].reps)<g.reps));
 if(missed&&last.goal?.sets.length===count){sets=last.goal.sets.map(s=>({...s}));reason="Повтори попередню ціль без додаткового навантаження.";shortReason='Повтори попередню ціль.';}
 if(state.session?.easy){sets=sets.map(s=>({weight:s.weight,reps:Math.max(1,Math.floor(s.reps*.8))}));reason='Легше сьогодні: та сама вага, приблизно на 20% менше повторень. План збережеться.';shortReason='Легший день: менше повторень із тією самою вагою.';}
 else if(!missed&&!e.targetRepsUnspecified&&confident(last)&&confident(history[1])&&Number(last.sets[0].weight)===Number(history[1].sets[0].weight)&&config.weightStep&&sets[0].weight>0&&sets[0].weight+config.weightStep<=10000){sets=sets.map(s=>({weight:Math.round((s.weight+config.weightStep)*1000)/1000,reps:low}));reason='Верхню межу повторено двічі без позначки «без запасу». Спробуй +'+config.weightStep+' кг.';shortReason='На '+config.weightStep.toLocaleString('uk-UA')+' кг більше, ніж минулого разу.';}
 else if(!missed){const i=sets.findLastIndex(s=>s.reps<high);if(i>=0){sets[i].reps++;const before=last.sets.reduce((n,s)=>n+Number(s.reps),0),after=sets.reduce((n,s)=>n+s.reps,0);reason='Минулого разу '+before+' повторень. Ціль — '+after+'. Додай одне повторення.';shortReason='На 1 повторення більше, ніж минулого разу.';}else if(!config.weightStep){reason='Верхню межу освоєно. Вкажи крок ваги в налаштуваннях вправи.';shortReason='Верхню межу досягнуто — вкажи крок ваги в меню вправи.';}else{reason='Повтори верхню межу ще раз перед збільшенням ваги.';shortReason='Повтори верхню межу ще раз для закріплення.';}}
 return {sets,reason,shortReason,mode:state.session?.easy?'easy':'normal'};
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
export function comparison(history,w){const lines=[];for(const e of w.exercises){const prev=exerciseHistory(history.filter(h=>h.id!==w.id&&Date.parse(h.finishedAt)<=Date.parse(w.startedAt)),e.exerciseId)[0],ss=workingSets(e);if(!prev||!ss.length)continue;const p=prev.sets;if(ss.length===p.length&&ss.every((s,i)=>Number(s.weight)===Number(p[i].weight))){const diff=ss.reduce((n,s)=>n+Number(s.reps),0)-p.reduce((n,s)=>n+Number(s.reps),0);lines.push(e.name+': за тієї самої ваги '+(diff>0?'на '+diff+' '+repWord(diff)+' більше':diff<0?'на '+(-diff)+' '+repWord(-diff)+' менше':'стільки ж повторень')+'.');}else lines.push(e.name+': робочий обсяг '+Math.round(ss.reduce((n,s)=>n+s.weight*s.reps,0))+' кг (минулого разу '+Math.round(p.reduce((n,s)=>n+s.weight*s.reps,0))+' кг).');}return lines;}
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
