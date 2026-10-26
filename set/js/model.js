import {MUSCLE_IDS} from './muscles.js';
import {isWorking} from './progression.js';
export const VERSION = 2;
export const LEGACY_KEY = 'set_workout_v1';
export const DAYS = ['Неділя','Понеділок','Вівторок','Середа','Четвер','Пʼятниця','Субота'];
export const REST_OPTIONS = [30,60,90,120,180,240,300];
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
export const clone = value => structuredClone(value);
export const nameKey = name => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk-UA');
export const fresh = () => ({version:VERSION,catalog:[],templates:[1,3,5].map((day,i)=>({id:uid(),name:`Тренування ${'ABC'[i]}`,day,exercises:[]})),history:[],session:null,restEndsAt:null,restSeconds:90,restDuration:90,warmupRestSeconds:60,exerciseRestSeconds:180,restKind:'set',restSetId:null,lastBackupAt:null,keepAwake:false,focusWorkout:true});
const fail = message => { throw new Error(message); };
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const text = (x, max=120) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const id = x => text(x,120);
function note(x){if(x===undefined)return {};if(typeof x!=='string'||x.length>1000)fail('Нотатка має містити до 1000 символів');return {note:x};}
const date = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
const list = (x,max) => Array.isArray(x) && x.length <= max;
const unique = xs => new Set(xs.map(x=>x.id)).size === xs.length;
export function validSet(s, completed=false) {
  if (!object(s) || !id(s.id) || typeof s.done !== 'boolean' || (s.type!==undefined&&!['working','warmup'].includes(s.type)) || (s.rir!==undefined&&![null,0,1,2].includes(s.rir))) return false;
  if (completed || s.done) return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(s.weight)) && Number.isFinite(Number(s.weight)) && Number(s.weight)>=0 && Number(s.weight)<=10000 && /^\d+$/.test(String(s.reps)) && Number.isInteger(Number(s.reps)) && Number(s.reps)>0 && Number(s.reps)<=1000;
  return ['string','number'].includes(typeof s.weight) && ['string','number'].includes(typeof s.reps) && String(s.weight).length<=24 && String(s.reps).length<=24;
}
function trainingConfig(e){const out={};if(e.muscleGroup!==undefined){if(![...MUSCLE_IDS,'none'].includes(e.muscleGroup))fail('Некоректна група м’язів');out.muscleGroup=e.muscleGroup;}if(e.equipment!==undefined){if(!object(e.equipment)||Object.keys(e.equipment).some(k=>!['seat','bench','pin','grip'].includes(k))||Object.values(e.equipment).some(v=>typeof v!=='string'||v.length>80))fail('Некоректні налаштування обладнання');out.equipment=Object.fromEntries(Object.entries(e.equipment).map(([k,v])=>[k,v.trim()]));}if(e.weightStep!==undefined){if(typeof e.weightStep!=='number'||!Number.isFinite(e.weightStep)||e.weightStep<=0||e.weightStep>1000)fail('Крок ваги: від 0 до 1000 кг');out.weightStep=e.weightStep;}if(e.weightBasis!==undefined){if(!['total','one-dumbbell'].includes(e.weightBasis))fail('Некоректний спосіб запису ваги');out.weightBasis=e.weightBasis;}return out;}
function goalData(e){if(e.goal===undefined)return {};const g=e.goal;if(!object(g)||!list(g.sets,200)||!g.sets.every(s=>object(s)&&typeof s.weight==='number'&&typeof s.reps==='number'&&validSet({id:'goal',weight:s.weight,reps:s.reps,done:true},true))||typeof g.reason!=='string'||g.reason.length>300||!['normal','easy','manual'].includes(g.mode))fail('Некоректна ціль заняття');return {goal:{sets:g.sets.map(s=>({weight:s.weight,reps:s.reps})),reason:g.reason,mode:g.mode}};}
export function repTarget(e){
  if(e.targetRepsUnspecified)return 'повторення за фактом';
  return e.targetRepsMax&&e.targetRepsMax!==e.targetReps?`${e.targetReps}–${e.targetRepsMax} повт.`:`${e.targetReps} повт.`;
}
function repOptions(e){
  if(e.targetRepsUnspecified!==undefined&&typeof e.targetRepsUnspecified!=='boolean')fail('Некоректна ціль повторень');
  if(e.targetRepsMax!==undefined&&(!Number.isInteger(e.targetRepsMax)||e.targetRepsMax<e.targetReps||e.targetRepsMax>1000||e.targetRepsUnspecified))fail('Некоректний діапазон повторень');
  return {...(e.targetRepsMax!==undefined?{targetRepsMax:e.targetRepsMax}:{}),...(e.targetRepsUnspecified?{targetRepsUnspecified:true}:{})};
}
export function normalize(raw) {
  if (!object(raw) || ![1,2,undefined].includes(raw.version)) fail('Непідтримувана версія даних');
  if (!list(raw.templates,500) || !list(raw.history,100000)) fail('Пошкоджений список планів або історії');
  const legacy = raw.version !== VERSION;
  const out = {...fresh(),templates:[],history:[],catalog:[]};
  if (!legacy) {
    if (!list(raw.catalog,10000) || !raw.catalog.every(e=>object(e)&&id(e.id)&&text(e.name,90)) || !unique(raw.catalog)) fail('Пошкоджений каталог вправ');
    out.catalog = raw.catalog.map(e=>({id:e.id,name:e.name.trim(),...note(e.note),...trainingConfig(e)}));
  }
  function exerciseId(e) {
    if (!legacy) { if (!id(e.exerciseId) || !out.catalog.some(x=>x.id===e.exerciseId)) fail('Невідома вправа'); return e.exerciseId; }
    let found=out.catalog.find(x=>nameKey(x.name)===nameKey(e.name));
    if (!found) {found={id:uid(),name:e.name.trim()};out.catalog.push(found);} return found.id;
  }
  function checkExercise(e) { if (!object(e)||!id(e.id)||!text(e.name,90)) fail('Пошкоджена вправа'); }
  for (const t of raw.templates) {
    if (!object(t)||!id(t.id)||!text(t.name,70)||!Number.isInteger(t.day)||t.day<0||t.day>6||!list(t.exercises,200)||!unique(t.exercises)) fail('Пошкоджений план');
    out.templates.push({id:t.id,name:t.name.trim(),day:t.day,exercises:t.exercises.map(e=>{
      checkExercise(e); const targetSets=legacy?3:e.targetSets; const targetReps=legacy?8:e.targetReps;
      if (!Number.isInteger(targetSets)||targetSets<1||targetSets>20||!Number.isInteger(targetReps)||targetReps<1||targetReps>1000) fail('Некоректна ціль підходів');
      return {id:e.id,exerciseId:exerciseId(e),name:e.name.trim(),targetSets,targetReps,...(legacy?{}:repOptions(e))};
    })});
  }
  function workout(w, completed) {
    if (!object(w)||!id(w.id)||!text(w.title,70)||!date(w.startedAt)||!list(w.exercises,200)||!unique(w.exercises)||!(w.templateId===null||id(w.templateId))) fail('Пошкоджене тренування');
    if(w.goalProgress!==undefined&&(!object(w.goalProgress)||!Number.isInteger(w.goalProgress.total)||w.goalProgress.total<1||w.goalProgress.total>40000||!Number.isInteger(w.goalProgress.met)||w.goalProgress.met<0||w.goalProgress.met>w.goalProgress.total))fail('Некоректний підсумок цілей');
    if(w.easy!==undefined&&typeof w.easy!=='boolean')fail('Некоректний режим заняття');
    if (completed&&(!date(w.finishedAt)||Date.parse(w.finishedAt)<Date.parse(w.startedAt))) fail('Некоректна дата тренування');
    const exercises=w.exercises.map(e=>{
      checkExercise(e);
      if (!list(e.sets,200)||!e.sets.every(s=>validSet(s,completed))||!unique(e.sets)||(completed&&!e.sets.length)) fail('Некоректні підходи');
      const targets={...trainingConfig(e),...goalData(e)};if(e.replacementFor!==undefined){const r=e.replacementFor;if(!object(r)||!id(r.exerciseId)||!text(r.name,90)||!out.catalog.some(c=>c.id===r.exerciseId))fail('Некоректна заміна вправи');targets.replacementFor={exerciseId:r.exerciseId,name:r.name};}
      if(e.targetSets!==undefined){if(!Number.isInteger(e.targetSets)||e.targetSets<1||e.targetSets>200)fail('Некоректна кількість підходів');targets.targetSets=e.targetSets;}
      if(e.targetReps!==undefined){if(!Number.isInteger(e.targetReps)||e.targetReps<1||e.targetReps>1000)fail('Некоректна ціль повторень');Object.assign(targets,{targetReps:e.targetReps},repOptions(e));}
      return {id:e.id,exerciseId:exerciseId(e),name:e.name.trim(),...note(e.note),...targets,sets:e.sets.map(s=>({id:s.id,weight:completed?Number(s.weight):s.weight,reps:completed?Number(s.reps):s.reps,done:completed?true:s.done,...(s.type!==undefined?{type:s.type}:{}),...(s.rir!==undefined?{rir:s.rir}:{})}))};
    });
    if (completed&&!exercises.length) fail('Порожній запис історії');
    return {id:w.id,templateId:w.templateId,title:w.title.trim(),startedAt:w.startedAt,...(completed&&w.goalProgress?{goalProgress:{...w.goalProgress}}:{}),...note(w.note),...(w.easy!==undefined?{easy:w.easy===true}:{}),...(completed?{finishedAt:w.finishedAt}:{}),exercises};
  }
  out.history=raw.history.map(w=>workout(w,true)).sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt));
  out.session=raw.session==null?null:workout(raw.session,false);
  if(out.session&&out.history.some(w=>w.id===out.session.id)) fail('Поточне тренування вже є в історії');
  if (!unique(out.templates)||!unique(out.history)) fail('Повторні ідентифікатори записів');
  out.warmupRestSeconds=REST_OPTIONS.includes(raw.warmupRestSeconds)?raw.warmupRestSeconds:60;
  out.restSeconds=REST_OPTIONS.includes(raw.restSeconds)?raw.restSeconds:90;
  out.exerciseRestSeconds=REST_OPTIONS.includes(raw.exerciseRestSeconds)?raw.exerciseRestSeconds:180;
  out.restKind=['warmup','set','exercise'].includes(raw.restKind)?raw.restKind:'set';
  out.restSetId=out.session&&id(raw.restSetId)?raw.restSetId:null;
  out.restDuration=Number.isFinite(raw.restDuration)&&raw.restDuration>0&&raw.restDuration<=86400?raw.restDuration:out.restSeconds;
  out.restEndsAt=out.session&&Number.isFinite(raw.restEndsAt)&&raw.restEndsAt>0?raw.restEndsAt:null;
  out.lastBackupAt=date(raw.lastBackupAt)?raw.lastBackupAt:null;
  out.keepAwake=raw.keepAwake===true;
  out.focusWorkout=true;
  return out;
}
export function getOrCreateExercise(state,name) {
  const clean=name.trim().replace(/\s+/g,' ');
  if (!text(clean,90)) fail('Вкажи назву вправи до 90 символів');
  let found=state.catalog.find(e=>nameKey(e.name)===nameKey(clean));
  if (!found) {found={id:uid(),name:clean};state.catalog.push(found);} return found;
}
export function previousSets(state,exerciseId) {
  for(const w of [...state.history].sort((a,b)=>Date.parse(b.finishedAt)-Date.parse(a.finishedAt))) {
    const sets=w.exercises.filter(e=>e.exerciseId===exerciseId).flatMap(e=>e.sets).filter(isWorking);
    if(sets.length) return sets;
  } return [];
}
export function startSession(state,templateId) {
  if(state.session) fail('Спочатку заверши поточне тренування');
  const t=state.templates.find(t=>t.id===templateId); if(!t) fail('План не знайдено');
  state.session={id:uid(),templateId:t.id,title:t.name,startedAt:new Date().toISOString(),exercises:t.exercises.map(e=>{
    const prior=previousSets(state,e.exerciseId);
    return {id:uid(),exerciseId:e.exerciseId,name:e.name,...note(state.catalog.find(x=>x.id===e.exerciseId)?.note),targetSets:e.targetSets,...trainingConfig(state.catalog.find(x=>x.id===e.exerciseId)||{}),targetReps:e.targetReps,...repOptions(e),sets:Array.from({length:e.targetSets},(_,i)=>({id:uid(),weight:prior[i]?.weight??prior.at(-1)?.weight??'',reps:prior[i]?.reps??(e.targetRepsUnspecified?'':e.targetReps),done:false}))};
  })};state.restEndsAt=null;state.restSetId=null;state.focusWorkout=true;
}
export function finishSession(state) {
  if(!state.session) fail('Немає активного тренування');
  let total=0,met=0;for(const e of state.session.exercises){const working=e.sets.filter(isWorking);for(const [i,g] of (e.goal?.sets||[]).entries()){total++;const s=working[i];if(s?.done&&Number(s.weight)>=g.weight&&Number(s.reps)>=g.reps)met++;}}
  const exercises=state.session.exercises.map(e=>({...e,...(e.goal?{goal:{...e.goal,sets:e.goal.sets.filter((_,i)=>e.sets.filter(isWorking)[i]?.done)}}:{}),sets:e.sets.filter(s=>s.done).map(s=>({...s,weight:Number(s.weight),reps:Number(s.reps)}))})).filter(e=>e.sets.length);
  if(!exercises.length) fail('Відміть хоча б один виконаний підхід');
  if(exercises.some(e=>e.sets.some(s=>!validSet(s,true)))) fail('Перевір вагу та повторення');
  state.history.push({...state.session,finishedAt:new Date().toISOString(),...(total?{goalProgress:{met,total}}:{}),exercises});
  state.session=null;state.restEndsAt=null;state.restSetId=null;
}
export function moveItem(items,id,direction) {
  const index=items.findIndex(e=>e.id===id), next=index+direction;
  if(index>=0&&next>=0&&next<items.length) [items[index],items[next]]=[items[next],items[index]];
}


// Validate both endpoints together before saving a historical correction.
export function workoutTimes(start,end){
  const a=new Date(start).getTime(),b=new Date(end).getTime();
  if(!Number.isFinite(a)||!Number.isFinite(b))throw Error('Вкажи початок і завершення тренування.');
  if(b<=a)throw Error('Завершення має бути пізніше за початок тренування.');
  return {startedAt:new Date(a).toISOString(),finishedAt:new Date(b).toISOString()};
}
