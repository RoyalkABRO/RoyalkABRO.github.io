import test from 'node:test';
import assert from 'node:assert/strict';
import {DUMBBELL_WEIGHTS, exerciseConfig, progressionWeight, stepWeight, trainingSnapshot} from '../js/exercise-config.js';
import {clone, fresh, normalize, normalizeMeta, startSession, finishSession, getOrCreateExercise} from '../js/model.js';
import {addPersonalProgram} from '../js/programs.js';
import {progressionOffer, resolveProgression, suggestGoal} from '../js/progression.js';
import {restartRest, restOwner, shiftRest, startRest, stopRest} from '../js/timer.js';
import {restAfterSet, restDestination} from '../js/workout-tools.js';
import {renderFocusedExercise, programPreview} from '../js/views.js';
import {exerciseConfigForm} from '../js/exercise-config-view.js';

function fixture(name='Жим гантелей під кутом', count=4, options={}, other=false) {
  const state=fresh(),catalog=getOrCreateExercise(state,name);
  if(Object.keys(options).length)catalog.training={...trainingSnapshot(catalog).training,...options};
  const c=exerciseConfig(catalog);
  const plan={id:'plan',name:'План',day:1,exercises:[{
    id:'plan-ex',exerciseId:catalog.id,name,targetSets:count,targetReps:c.min,targetRepsMax:c.max
  }]};
  if(other){
    const second=getOrCreateExercise(state,'Прес');
    plan.exercises.push({id:'plan-abs',exerciseId:second.id,name:second.name,targetSets:2,targetReps:12,targetRepsMax:20});
  }
  state.templates=[plan];startSession(state,plan.id);
  return {state,catalog,e:state.session.exercises[0]};
}
function log(e,weight,reps,rir) {
  e.sets.forEach((s,i)=>Object.assign(s,{done:true,weight,reps:Array.isArray(reps)?reps[i]:reps,...(rir===undefined?{}:{rir})}));
}
function next(state) {
  finishSession(state);
  startSession(state,'plan');
  return state.session.exercises[0];
}

test('current three-day plan uses the revised rest times and ranges, including Monday lateral raises and Friday leg curls',()=>{
  const state=fresh();
  state.templates=[];
  const alias=getOrCreateExercise(state,'Жим гантелей сидячи на плечі');
  assert.equal(addPersonalProgram(state),3);
  const mon=state.templates[0];
  assert.equal(mon.exercises[2].exerciseId,alias.id);
  assert.deepEqual(state.templates.map(t=>t.exercises.length),[9,8,9]);
  assert.deepEqual(state.templates.map(t=>t.exercises.map(e=>exerciseConfig(e).restSeconds)),[
    [180,150,150,120,120,90,120,120,90],[180,150,180,120,90,120,120,90],[180,150,120,90,120,120,120,120,90]
  ]);
  assert.deepEqual(state.templates.map(t=>t.exercises.map(e=>[e.targetReps,e.targetRepsMax])),[
    [[5,8],[6,12],[8,12],[10,15],[10,20],[12,20],[8,12],[10,15],[12,20]],
    [[8,12],[8,12],[6,10],[10,15],[12,20],[8,12],[10,15],[12,20]],
    [[8,12],[8,12],[10,15],[12,20],[12,20],[10,15],[8,12],[12,15],[12,20]]
  ]);
  assert.match(programPreview(state),/4 × 12–20/);
});

test('dumbbell buttons traverse the entire rack in both directions and handle manual intermediate weights',()=>{
  const c=exerciseConfig({name:'Жим гантелей під кутом'});
  const rack=[0,...DUMBBELL_WEIGHTS];
  rack.forEach((w,i)=>{
    assert.equal(stepWeight(w,c,1),rack[i+1]??null);
    assert.equal(stepWeight(w,c,-1),rack[i-1]??null);
  });
  assert.equal(stepWeight(21,c,1),22.5);
  assert.equal(stepWeight(21,c,-1),20);
  assert.equal(stepWeight(-8,c,1),2);
  assert.equal(stepWeight('',c,1),2);
  assert.equal(stepWeight(0,{...c,weights:[7,14]},1),7);
});

test('button stride and physical increment are independent and fractional arithmetic stays exact',()=>{
  const c=exerciseConfig({name:'Розгинання ніг',weightStep:10});
  assert.equal(stepWeight(45,c,1),55);
  assert.equal(stepWeight(55,c,-1),45);
  assert.equal(progressionWeight(45,{...c,step:7}),55);
  assert.equal(stepWeight(0.1+0.2,{equipmentType:'barbell',step:.1},1),.4);
  assert.equal(stepWeight(2,c,-1),0);
  assert.equal(stepWeight(10000,c,1),null);
  assert.equal(progressionWeight(10000,c),null);
  const {state,e}=fixture('Розгинання ніг');
  e.sets[0].weight='45';
  assert.equal(normalize(state).session.exercises[0].sets[0].weight,'45');
});

for(const count of [2,3,4,5]){
  test('one complete workout at the upper limit qualifies with '+count+' working sets',()=>{
    const {state,e}=fixture('Жим гантелей під кутом',count);
    log(e,22.5,12);
    e.sets.unshift({id:'warmup',type:'warmup',done:true,weight:14,reps:5});
    const active=next(state);
    const offer=progressionOffer(state,active);
    assert.equal(offer.weight,25);
    assert.equal(offer.low,8);
    assert.ok(active.sets.every(s=>s.weight===22.5));
    resolveProgression(state,active,true,offer.key);
    assert.ok(active.sets.every(s=>s.weight===25&&s.reps===8&&!s.done));
    assert.equal(state.history[0].exercises[0].sets[1].weight,22.5);
    assert.equal(progressionOffer(state,active),null);
  });
}

test('partial, skipped, lower-rep and mixed-load sessions do not qualify',()=>{
  for(const kind of ['partial','skipped','removed','lower reps','mixed loads']){
    const {state,e}=fixture('Жим гантелей під кутом',4,{},true);
    log(e,22.5,12);
    log(state.session.exercises[1],0,20);
    if(kind==='partial')state.session.exercises[1].sets[0].done=false;
    if(kind==='removed')state.session.exercises[1].sets.pop();
    if(kind==='skipped')Object.assign(e.sets.at(-1),{done:false,skipped:true});
    if(kind==='lower reps')e.sets.at(-1).reps=11;
    if(kind==='mixed loads')e.sets.at(-1).weight=20;
    assert.equal(progressionOffer(state,next(state)),null,kind);
  }
});

test('fallback rep guidance keeps the weight after a weaker workout',()=>{
  const {state,e}=fixture();
  log(e,22.5,[12,11,10,9]);
  const active=next(state);
  assert.equal(progressionOffer(state,active),null);
  const target=suggestGoal(state,active);
  assert.deepEqual(target.sets.map(s=>s.weight),[22.5,22.5,22.5,22.5]);
  assert.deepEqual(target.sets.map(s=>s.reps),[12,11,10,10]);
});

test('recorded RIR is considered only when enabled and missing RIR is allowed',()=>{
  for(const [useRir,rir,qualifies] of [[true,0,false],[true,null,true],[true,1,true],[false,0,true]]){
    const {state,e}=fixture('Жим гантелей під кутом',4,{useRir});
    log(e,22.5,12,rir);
    assert.equal(Boolean(progressionOffer(state,next(state))),qualifies);
  }
});

test('equipment snapshots prevent comparisons across settings; opt-out disables the coach',()=>{
  const {state,catalog,e}=fixture();
  e.equipment={bench:'30°'};
  log(e,22.5,12);finishSession(state);
  catalog.equipment={bench:'45°'};
  startSession(state,'plan');
  const active=state.session.exercises[0];
  assert.equal(active.sets[0].weight,'');
  assert.equal(progressionOffer(state,active),null);
  assert.deepEqual(suggestGoal(state,active).sets,[]);
  active.equipment={bench:'30°'};
  active.training.progression=false;
  assert.equal(progressionOffer(state,active),null);
  assert.deepEqual(suggestGoal(state,active).sets,[]);
});

test('declining a specific offer persists through storage normalization and leaves the weight alone',()=>{
  const {state,e}=fixture();
  log(e,22.5,12);
  const active=next(state),offer=progressionOffer(state,active);
  assert.throws(()=>resolveProgression(state,active,false,'stale'));
  resolveProgression(state,active,false,offer.key);
  const restored=normalize(JSON.parse(JSON.stringify(state)));
  assert.equal(progressionOffer(restored,restored.session.exercises[0]),null);
  assert.ok(restored.session.exercises[0].sets.every(s=>s.weight===22.5));
  log(restored.session.exercises[0],22.5,12);
  assert.equal(progressionOffer(restored,next(restored)).weight,25);
});

test('bands use the user-defined order, keep assistance separate from kilos and offer unassisted last',()=>{
  const {state,e,catalog}=fixture('Підтягування з резинкою',3,{bands:['A / сильна','B / легка'],band:'A / сильна'});
  log(e,0,12);
  let active=next(state);
  let offer=progressionOffer(state,active);
  assert.equal(offer.band,'B / легка');
  assert.equal(offer.weight,undefined);
  resolveProgression(state,active,true);
  assert.equal(catalog.training.band,'B / легка');
  assert.equal(state.history[0].exercises[0].training.band,'A / сильна');
  assert.deepEqual(active.sets.map(s=>s.weight),[0,0,0]);
  log(active,0,12);
  active=next(state);offer=progressionOffer(state,active);
  assert.equal(offer.band,null);
  resolveProgression(state,active,true);
  assert.equal(catalog.training.band,null);
});

test('timers use the originating exercise, retain base duration across adjustments and survive reload',()=>{
  const {state,e}=fixture('Жим лежачи',2,{},true);
  const [first,last]=e.sets;first.done=true;first.weight=60;
  assert.deepEqual(restAfterSet(state,e,first),{seconds:180,kind:'set'});
  assert.deepEqual(restAfterSet(state,e,{type:'warmup'}),{seconds:60,kind:'warmup'});
  Object.assign(last,{done:true,weight:60});
  assert.deepEqual(restAfterSet(state,e,last),{seconds:180,kind:'exercise'});
  log(state.session.exercises[1],0,12);
  assert.deepEqual(restAfterSet(state,e,last),{seconds:180,kind:'set'});
  state.session.exercises[1].sets[0].done=false;
  startRest(state,180,'exercise',last.id,1000);
  const restored=normalize(JSON.parse(JSON.stringify(state)));
  assert.equal(restOwner(restored).id,e.id);
  const other=state.session.exercises[1];
  assert.equal(restDestination(restored,other.id).next.id,other.id);
  shiftRest(restored,30,11000);assert.equal(restored.restEndsAt,211000);
  shiftRest(restored,-30,12000);assert.equal(restored.restEndsAt,181000);
  shiftRest(restored,-30,177000);assert.equal(restored.restEndsAt,177000);
  restartRest(restored,200000);
  assert.equal(restored.restEndsAt,380000);
  assert.equal(restored.restSetId,last.id);
  stopRest(restored);
  assert.equal(restored.restEndsAt,null);
  assert.equal(restored.restSetId,null);
  restartRest(restored,202000);
  assert.equal(restored.restEndsAt,null);
});

test('version 2 migration keeps workout rows, IDs, saved weights, date and active deadline',()=>{
  const {state,catalog,e}=fixture('Жим лежачи');
  log(e,62.5,8);
  const active=next(state);
  const old=clone(state);delete old.exerciseSettingsVersion;
  delete old.history[0].progressionComplete;
  delete old.history[0].exercises[0].training;
  delete old.session.exercises[0].training;
  old.catalog[0].weightStep=5;
  old.templates[0].exercises[0].targetReps=6;
  old.restEndsAt=1809999999999;
  const migrated=normalize(old);
  assert.deepEqual(migrated.history,old.history);
  assert.equal(migrated.catalog[0].id,catalog.id);
  assert.equal(migrated.catalog[0].weightStep,5);
  assert.equal(migrated.session.exercises[0].id,active.id);
  assert.equal(migrated.session.exercises[0].sets[0].weight,62.5);
  assert.equal(migrated.restEndsAt,old.restEndsAt);
  assert.equal(migrated.templates[0].exercises[0].targetReps,5);
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(migrated))),migrated);
  const changed={...migrated,catalog:clone(migrated.catalog)};
  changed.catalog[0].training={...trainingSnapshot(changed.catalog[0]).training,restSeconds:137};
  assert.equal(normalizeMeta(changed,migrated).catalog[0].training.restSeconds,137);
});

test('legacy v1 migration maps aliases to one catalog ID and preserves workout weights',()=>{
  const {state,e}=fixture('Жим гантелей сидячи на плечі');
  log(e,18,12);finishSession(state);
  const old={version:1,templates:state.templates,history:state.history};
  old.history[0].exercises[0].name='Жим гантелей над головою (плечі)';
  const migrated=normalize(old);
  assert.equal(migrated.catalog.length,1);
  assert.equal(migrated.catalog[0].id,migrated.history[0].exercises[0].exerciseId);
  assert.equal(migrated.templates[0].exercises[0].exerciseId,migrated.history[0].exercises[0].exerciseId);
  assert.equal(migrated.history[0].exercises[0].sets[0].weight,18);
});

test('workout HTML exposes the new controls and escapes custom equipment labels',()=>{
  const {state,e}=fixture('Підтягування',2,{bands:['A < B'],band:'A < B'});
  const html=renderFocusedExercise(state,e,0,1);
  assert.match(html,/data-action="weight-step"/);
  assert.match(html,/Допомога: A &lt; B/);
  const form=exerciseConfigForm(state.catalog[0]);
  for(const name of ['restSeconds','equipmentType','step','increment','min','max','progression','useRir','bands','band']){
    assert.ok(form.includes('name="'+name+'"'),name);
  }
});

test('built-in plan migration reuses both exercise IDs without modifying custom plans or logged workouts',()=>{
  const state=fresh();
  addPersonalProgram(state);
  const [mon,wed,fri]=state.templates;
  const lateral=mon.exercises.splice(5,1)[0],curl=fri.exercises.splice(5,1)[0];
  const custom={...clone(mon),id:'custom-monday'};
  state.templates.push(custom);
  startSession(state,wed.id);
  const e=state.session.exercises[0];
  Object.assign(e.sets[0],{weight:20,reps:8,done:true});
  finishSession(state);
  delete state.exerciseSettingsVersion;
  const migrated=normalize(state);
  assert.equal(migrated.templates[0].exercises[5].exerciseId,lateral.exerciseId);
  assert.equal(migrated.templates[2].exercises[5].exerciseId,curl.exerciseId);
  assert.equal(migrated.templates[3].exercises.length,custom.exercises.length);
  assert.deepEqual(migrated.history,state.history);
  assert.deepEqual(normalize(migrated),migrated);

  const existing=clone(state);
  existing.templates[0].exercises.push({...lateral,name:'Махи гантелями в сторони'});
  existing.templates[2].exercises.push(curl);
  const kept=normalize(existing);
  assert.equal(kept.templates[0].exercises.at(-1).id,lateral.id);
  assert.equal(kept.templates[2].exercises.at(-1).id,curl.id);
  assert.equal(kept.templates[0].exercises.length,9);
  assert.equal(kept.templates[2].exercises.length,9);
  assert.equal(kept.catalog.length,state.catalog.length);
});
