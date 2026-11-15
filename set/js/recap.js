import {equipmentKey,exerciseConfig,exerciseIdentity} from './exercise-config.js';
import {estimated1RM} from './stats.js';
import {muscleActivity} from './muscles.js';

const DAY=86400000;
const kyiv=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'});
const utc=new Intl.DateTimeFormat('uk-UA',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'});
const monthName=new Intl.DateTimeFormat('uk-UA',{timeZone:'UTC',month:'long'});
const civil=key=>new Date(key+'T00:00:00Z');
const keyOf=date=>date.toISOString().slice(0,10);
const addDays=(key,n)=>keyOf(new Date(+civil(key)+n*DAY));
export function kyivDay(time){
 const parts=kyiv.formatToParts(new Date(time));
 const pick=type=>parts.find(p=>p.type===type).value;
 return pick('year')+'-'+pick('month')+'-'+pick('day');
}
const dateKey=/^\d{4}-\d{2}-\d{2}$/;
const validDay=key=>dateKey.test(key)&&Number.isFinite(+civil(key))&&keyOf(civil(key))===key;

export function periodFor(kind,day){
 if(kind==='all')return {id:'all',kind,label:'За весь час',intro:'ТВІЙ ШЛЯХ У СЕТ'};
 const date=civil(day);
 if(kind==='week'){
  const start=addDays(day,-((date.getUTCDay()+6)%7)),end=addDays(start,7);
  return {id:'week:'+start,kind,start,end,label:utc.format(civil(start))+' — '+utc.format(civil(addDays(end,-1))),intro:'ТВІЙ ТИЖДЕНЬ У СЕТ'};
 }
 const start=day.slice(0,7)+'-01';
 date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+1);
 const label=monthName.format(civil(start));
 return {id:'month:'+start,kind,start,end:keyOf(date),label:label+' '+start.slice(0,4),intro:('ТВІЙ '+label+' У СЕТ').toLocaleUpperCase('uk-UA')};
}

export function completedPeriod(id,today=kyivDay(Date.now())){
 const [kind,day,...remainder]=String(id).split(':');
 if(remainder.length||!['week','month'].includes(kind)||!validDay(day))return null;
 const period=periodFor(kind,day);
 return period.id===id&&period.end<=today?period:null;
}

export const inPeriod=(day,period)=>period.kind==='all'||(day>=period.start&&day<period.end);
export const previousPeriod=period=>period.kind==='all'?null:periodFor(period.kind,addDays(period.start,-1));

const archiveCache=new WeakMap();
export function recapArchive(history,today=kyivDay(Date.now())){
 const cached=archiveCache.get(history);
 if(cached?.day===today)return cached.reports;
 const counts=new Map();
 for(const workout of history){
  const day=kyivDay(workout.startedAt);
  for(const kind of ['week','month']){
   const p=periodFor(kind,day);
   if(p.end<=today){
    if(!counts.has(p.id))counts.set(p.id,{...p,count:0});
    counts.get(p.id).count++;
   }
  }
 }
 const reports=[...counts.values()].sort((a,b)=>b.end.localeCompare(a.end)||a.kind.localeCompare(b.kind));
 if(Object.isFrozen(history))archiveCache.set(history,{day:today,reports});
 return reports;
}

const boundaries=new Map();
export function kyivMidnight(day){
 if(boundaries.has(day))return boundaries.get(day);
 const midnight=+civil(day);
 let low=midnight-DAY,high=midnight+DAY;
 while(high-low>1){
  const mid=Math.floor((low+high)/2);
  if(kyivDay(mid)<day)low=mid;else high=mid;
 }
 if(boundaries.size>=128)boundaries.clear();
 boundaries.set(day,high);
 return high;
}

const setsOf=e=>e.sets.filter(s=>s.done&&!s.skipped&&s.type!=='warmup');
const median=xs=>{
 const values=[...xs].sort((a,b)=>a-b),i=Math.floor(values.length/2);
 return values.length%2?values[i]:(values[i-1]+values[i])/2;
};
const round=n=>Math.round(n*10)/10;

function totals(entries){
 const result={workouts:entries.length,minutes:0,sets:0,reps:0,volume:0,days:0};
 for(const {workout} of entries){
  result.minutes+=Math.max(0,Date.parse(workout.finishedAt)-Date.parse(workout.startedAt))/60000;
  for(const e of workout.exercises)for(const set of setsOf(e)){
   result.sets++;result.reps+=Number(set.reps);result.volume+=Number(set.weight)*Number(set.reps);
  }
 }
 result.minutes=Math.round(result.minutes);
 result.days=new Set(entries.map(e=>e.day)).size;
 return result;
}

function setup(e){
 const config=exerciseConfig(e);
 if(config.equipmentType==='other')return null;
 // Legacy machine and pull-up records lack a reliable setup snapshot.
 if(!e.training&&['machine','cable','pullup','bodyweight'].includes(config.equipmentType))return null;
 return {config,key:JSON.stringify([e.exerciseId,equipmentKey(e)])};
}

function samples(entries){
 const rows=new Map();
 for(const {workout,day} of entries){
  if(workout.easy)continue;
  for(const e of workout.exercises){
   const match=setup(e);
   if(!match||e.goal?.mode==='easy')continue;
   for(const s of setsOf(e)){
    const weight=Number(s.weight),reps=Number(s.reps);
    const useReps=weight===0||['bodyweight','pullup'].includes(match.config.equipmentType);
    const value=useReps?reps:estimated1RM(s);
    if(!value)continue;
    const key=JSON.stringify([match.key,useReps?weight:null]);
    if(!rows.has(key))rows.set(key,{key,name:e.name,id:e.exerciseId,metric:useReps?'reps':'rm',
      setupLabel:[match.config.band,[e.equipment?.station,e.equipment?.seat,e.equipment?.bench,e.equipment?.pin,e.equipment?.grip].filter(Boolean).join(' / '),useReps&&weight?weight+' кг додатково':''].filter(Boolean).join(' · '),points:new Map()});
    const bucket=rows.get(key).points;
    if(!bucket.has(workout.id)||bucket.get(workout.id).value<value)bucket.set(workout.id,{day,value});
   }
  }
 }
 return rows;
}

function compare(left,right){
 const results=[];
 for(const [key,row] of right){
  const baseline=left.get(key);
  if(!baseline)continue;
  const a=Array.from(baseline.points.values()),b=Array.from(row.points.values());
  const before=median(a.map(p=>p.value)),after=median(b.map(p=>p.value)),change=(after/before-1)*100;
  const direction=row.metric==='reps'?(after>before?'up':after<before?'down':'stable'):
   change>=2?'up':change<=-2?'down':'stable';
  const {points,...meta}=row;
  results.push({...meta,before:round(before),after:round(after),change:round(change),direction,
   sampleCounts:[a.length,b.length],values:[...a,...b].map(p=>round(p.value))});
 }
 return results.sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));
}

function strength(rows){
 // A single exercise cannot dominate even if it has several equipment setups.
 const perExercise=new Map();
 for(const r of rows){
  if(!perExercise.has(r.id))perExercise.set(r.id,[]);
  perExercise.get(r.id).push(r);
 }
 const evidence=Array.from(perExercise.values(),r=>{
  const signals=new Set(r.map(x=>x.direction));
  return signals.size===1?r[0].direction:'stable';
 });
 const status=evidence.length<2?'insufficient':evidence.filter(x=>x==='up').length>evidence.length/2?'up':
  evidence.filter(x=>x==='down').length>evidence.length/2?'down':'stable';
 // Comparable relative changes of estimated 1RM only. Require matching direction
 // and enough observations that each exercise has been seen twice on both sides.
 const loads=Array.from(perExercise.values(),r=>r.filter(x=>x.metric==='rm'&&x.sampleCounts.every(n=>n>=2))).filter(r=>r.length);
 const delta=loads.length>=2?round(median(loads.map(rows=>median(rows.map(x=>x.change))))):null;
 return {status,comparable:evidence.length,delta:delta!==null&&
  ((status==='up'&&delta>=2)||(status==='down'&&delta<=-2))?delta:null,rows};
}

function records(entries,period){
 const peaks=new Map(),out=[];
 for(const {workout,day} of entries){
  if(workout.easy)continue;
  for(const e of workout.exercises){
   if(e.goal?.mode==='easy')continue;
   const match=setup(e);
   if(!match)continue;
   for(const set of setsOf(e)){
    const weight=Number(set.weight),reps=Number(set.reps);
    const measures=[[JSON.stringify([match.key,weight]),'reps',reps]];
    if(weight>0&&!['pullup','bodyweight'].includes(match.config.equipmentType))measures.push([JSON.stringify([match.key,'weight']),'weight',weight]);
    const changes=[];
    for(const [key,metric,value] of measures){
     const previous=peaks.get(key);
     if(previous&&previous.value>=value)continue;
     peaks.set(key,{weight,reps,value});
     if(previous&&inPeriod(day,period))changes.push({metric,before:previous,delta:round(value-previous.value)});
    }
    if(changes.length)out.push({name:e.name,id:e.exerciseId,workoutId:workout.id,day,weight,reps,...changes.at(-1)});
   }
  }
 }
 return out;
}

function consistency(entries,period,templates,today,history){
 const byWeek=new Map();
 for(const {day} of history){
  const key=periodFor('week',day).start;
  byWeek.set(key,(byWeek.get(key)||0)+1);
 }
 if(!period.start)return {planned:null,matched:0,streak:longestStreak(byWeek)};
 const plans=templates.filter(t=>t.exercises.length);
 let planned=0,matched=0;
 for(let day=period.start;day<period.end&&day<=today;day=addDays(day,1)){
  for(const plan of plans.filter(t=>t.day===civil(day).getUTCDay())){
   planned++;
   if(entries.some(e=>e.day===day&&e.workout.templateId===plan.id&&e.workout.exercises.some(x=>setsOf(x).length)))matched++;
  }
 }
 return {planned:plans.length?planned:null,matched,streak:longestStreak(byWeek)};
}

function longestStreak(byWeek){
 let previous=null,current=0,best=0;
 for(const key of [...byWeek.keys()].sort()){
  current=previous&&addDays(previous,7)===key?current+1:1;
  best=Math.max(best,current);previous=key;
 }
 return best;
}

function awards(result){
 const {consistency:c,prs,totals,strength,period,prior,firstDay}=result;
 return [
  [c.planned>=3&&c.matched===c.planned,'Залізна дисципліна','Виконано всі заплановані дні, щонайменше три.'],
  [prs.length>=3,'Машина рекордів','Щонайменше три рекордні підходи.'],
  [prs.some(p=>exerciseIdentity(p.name)===exerciseIdentity('Жим лежачи')),'Майстер жиму','Особистий рекорд у жимі лежачи.'],
  [totals.reps>=500,'Король повторень','Щонайменше 500 робочих повторень.'],
  [strength.status==='stable'&&strength.rows.every(r=>r.direction==='stable'),'Стабільність — це сила','Щонайменше дві зіставні вправи зі стабільним результатом.'],
  [period.kind==='month'&&period.start===firstDay?.slice(0,7)+'-01'&&totals.workouts>=4,'Перший місяць','Чотири тренування або більше в першому місяці журналу.'],
  [strength.status==='up'&&prior.workouts>0,'Новий рівень','Більшість зіставних вправ показала зростання.']
 ].filter(([earned])=>earned).map(([,name,rule])=>({name,rule}));
}

export function buildRecap(state,period,today=kyivDay(Date.now())){
 const entries=state.history.map(workout=>({workout,day:kyivDay(workout.startedAt)}))
  .filter(e=>e.day<=today).sort((a,b)=>Date.parse(a.workout.startedAt)-Date.parse(b.workout.startedAt));
 const current=entries.filter(e=>inPeriod(e.day,period)),previous=previousPeriod(period);
 const prior=previous?entries.filter(e=>inPeriod(e.day,previous)):[];
 const halfway=period.kind==='month'?addDays(period.start,Math.floor((civil(period.end)-civil(period.start))/DAY/2)):null;
 const currentSamples=samples(current),priorSamples=samples(prior);
 const early=halfway?samples(current.filter(e=>e.day<halfway)):null,late=halfway?samples(current.filter(e=>e.day>=halfway)):null;
 const prs=records(entries.filter(e=>!period.end||e.day<period.end),period);
 const weeks=[];
 if(period.kind==='month')for(let week=periodFor('week',period.start);week.start<period.end;week=periodFor('week',week.end)){
  const weekEntries=current.filter(e=>inPeriod(e.day,week));
  weeks.push({start:week.start,end:week.end,label:week.start.slice(8)+'.'+week.start.slice(5,7),...totals(weekEntries)});
 }
 const milestones=new Map(),frequency=new Map();
 for(const {workout} of current)for(const e of workout.exercises){
  if(!setsOf(e).length)continue;
  if(!frequency.has(e.exerciseId))frequency.set(e.exerciseId,{name:e.name,sessions:new Set()});
  frequency.get(e.exerciseId).sessions.add(workout.id);
 }
 for(const pr of prs)milestones.set(pr.workoutId,(milestones.get(pr.workoutId)||0)+1);
 const best=[...current].sort((a,b)=>(milestones.get(b.workout.id)||0)-(milestones.get(a.workout.id)||0)||
  totals([b]).sets-totals([a]).sets)[0];
 const result={period,totals:totals(current),prior:totals(prior),prs,
  firstDay:entries[0]?.day,consistency:consistency(current,period,state.templates||[],today,entries.filter(e=>!period.end||e.day<period.end)),
  strength:strength(compare(priorSamples,currentSamples)),weeks,half:early?compare(early,late):[],
  trends:Array.from(currentSamples.values(),({points,...row})=>({...row,points:[...points.values()]}))
    .sort((a,b)=>b.points.length-a.points.length),
  muscles:muscleActivity(current.map(e=>e.workout),state.catalog||[]),
  frequent:[...frequency.values()].sort((a,b)=>b.sessions.size-a.sessions.size)[0],
  best:best?{name:best.workout.title,day:best.day,prs:milestones.get(best.workout.id)||0,sets:totals([best]).sets}:null
 };
 return {...result,awards:awards(result)};
}
