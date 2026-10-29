import {isWorking,workingSets,previousDuration} from './progression.js';
import {getOrCreateExercise,previousSets,uid} from './model.js';
import {newestFirst} from './history-index.js';
export const EQUIPMENT_FIELDS=[['seat','Сидіння'],['bench','Нахил лавки'],['pin','Положення блока'],['grip','Хват / руків’я']];
export function equipmentText(e){return EQUIPMENT_FIELDS.filter(([key])=>e.equipment?.[key]).map(([key,label])=>label+': '+e.equipment[key]).join(' · ');}
export function focusExercise(session,selected){return session?.exercises.find(e=>e.id===selected)||session?.exercises.find(e=>e.sets.some(s=>!s.done))||session?.exercises[0]||null;}
export function upcomingExercise(session,currentId){const es=session?.exercises||[],i=es.findIndex(e=>e.id===currentId);return es.slice(i+1).find(e=>e.sets.some(s=>!s.done))||es.slice(0,Math.max(0,i)).find(e=>e.sets.some(s=>!s.done))||null;}
export function warmupSuggestion(weight,step=2.5){
 if(!Number.isFinite(weight)||weight<=0||weight>10000||!Number.isFinite(step)||step<=0||step>1000)return [];
 const seen=new Set();return [[.4,8],[.6,5],[.8,3]].flatMap(([fraction,reps])=>{const load=Math.round(Math.floor((weight*fraction+1e-8)/step)*step*1000)/1000;if(load<=0||load>=weight||seen.has(load))return [];seen.add(load);return [{weight:load,reps}];});
}
export function applyWarmup(e,rows){
 if(!rows.length||!rows.every(s=>Number.isFinite(s.weight)&&s.weight>0&&s.weight<=10000&&Number.isInteger(s.reps)&&s.reps>0&&s.reps<=1000))throw Error('Перевір вагу та повторення розминки');
 const done=e.sets.filter(s=>!isWorking(s)&&s.done),work=e.sets.filter(isWorking),added=rows.filter(s=>!done.some(p=>Number(p.weight)===s.weight&&Number(p.reps)===s.reps));
 if(done.length+work.length+added.length>200)throw Error('Максимум 200 підходів');
 e.sets=[...done,...added.map(s=>({id:uid(),...s,type:'warmup',done:false})),...work];
}
export function replaceExercise(state,sessionId,name,reps){
 const index=state.session?.exercises.findIndex(e=>e.id===sessionId);if(index===undefined||index<0)throw Error('Вправу не знайдено');
 const e=state.session.exercises[index],remaining=workingSets(e).filter(s=>!s.done).length;if(!remaining)throw Error('Усі робочі підходи вже виконано');
 if(!Number.isInteger(reps)||reps<1||reps>1000)throw Error('Повторення: від 1 до 1000');
 const catalog=getOrCreateExercise(state,name);if(catalog.id===e.exerciseId)throw Error('Обери іншу вправу');
 const previous=previousSets(state,catalog.id),cfg={};for(const key of ['note','equipment','weightStep','weightBasis'])if(catalog[key]!==undefined)cfg[key]=structuredClone(catalog[key]);
 const replacement={id:uid(),exerciseId:catalog.id,name:catalog.name,...cfg,replacementFor:{exerciseId:e.exerciseId,name:e.name},targetSets:remaining,targetReps:reps,sets:Array.from({length:remaining},(_,i)=>({id:uid(),weight:previous[i]?.weight??previous.at(-1)?.weight??'',reps,done:false}))};
 const completed=e.sets.filter(s=>s.done);if(completed.length){if(state.session.exercises.length>=200)throw Error('Максимум 200 вправ');const goal=e.goal?{...e.goal,sets:e.goal.sets.filter((_,i)=>workingSets(e)[i]?.done)}:null;e.sets=completed;if(goal)e.goal=goal;state.session.exercises.splice(index+1,0,replacement);}else state.session.exercises.splice(index,1,replacement);
 return replacement.id;
}
export function optionalSets(session){return (session?.exercises||[]).flatMap(e=>workingSets(e).slice(e.targetSets||4).filter(s=>!s.done).map(s=>({exerciseId:e.id,setId:s.id,name:e.name})));}
export function forecastSession(state,now=Date.now()){
 const w=state.session;if(!w)return null;const elapsed=Math.max(0,(now-Date.parse(w.startedAt))/60000),all=w.exercises.flatMap(e=>e.sets),working=all.filter(isWorking),done=working.filter(s=>s.done).length,pending=working.filter(s=>!s.done).length,warm=all.filter(s=>!isWorking(s)&&!s.done).length;
 const prior=newestFirst(state.history).find(p=>w.templateId&&p.templateId===w.templateId&&Date.parse(p.finishedAt)<=Date.parse(w.startedAt));
 const priorCount=prior?.exercises.flatMap(workingSets).length||0;
 let estimated=false,cycle=.75+state.restSeconds/60,source='за часом підходу й відпочинку';
 if(priorCount){estimated=true;cycle=Math.max(.5,Math.min(8,previousDuration(state)/priorCount));source='за минулим заняттям';}
 if(done>=3&&elapsed>=3){estimated=true;cycle=Math.max(.5,Math.min(8,elapsed/done));source='за поточним темпом';}
 const remainingExercises=w.exercises.filter(e=>workingSets(e).some(s=>!s.done)).length;
 const baseline=pending*.75+Math.max(0,pending-remainingExercises)*state.restSeconds/60+Math.max(0,remainingExercises-1)*(state.exerciseRestSeconds??180)/60+Math.max(0,((state.restEndsAt||now)-now)/60000);
 const left=(estimated?pending*cycle:baseline)+warm*(.5+state.warmupRestSeconds/60),minutes=Math.ceil(left),finish=now+minutes*60000;
 return {elapsed,minutes,finish,total:Math.ceil(elapsed+left),over:elapsed+left>90,source,pending,done,optional:optionalSets(w)};
}

export function restAfterSet(state,exercise,set){
 if(set.type==='warmup')return {seconds:state.warmupRestSeconds,kind:'warmup'};
 if(workingSets(exercise).some(s=>!s.done))return {seconds:state.restSeconds,kind:'set'};
 const hasNext=state.session.exercises.some(e=>e.id!==exercise.id&&workingSets(e).some(s=>!s.done));
 return {seconds:hasNext?state.exerciseRestSeconds:0,kind:'exercise'};
}
