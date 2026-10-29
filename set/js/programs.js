import {getOrCreateExercise,uid} from './model.js';

// Exercise order and rep ranges are transcribed from the supplied three-day plan.
// Abs have no prescribed rep count; the logger leaves those inputs blank.
export const PERSONAL_PROGRAM = [
  {id:'set-program-four-sets-mon',name:'Понеділок',day:1,exercises:[
    ['Жим лежачи',6,8],
    ['Підтягування',6,10],
    ['Жим гантелей над головою (плечі)',8,12],
    ['Розгинання ніг',10,15],
    ['Ікри стоячи',8,12],
    ['Біцепс з грифом',8,12],
    ['Трицепс вниз на блоці',10,15],
    ['Прес',null,null]
  ]},
  {id:'set-program-four-sets-wed',name:'Середа',day:3,exercises:[
    ['Жим гантелей під кутом',6,10],
    ['Тяга нижнього блока',6,10],
    ['Румунська тяга',6,10],
    ['Згинання ніг',10,15],
    ['Махи на середню дельту',12,20],
    ['Біцепс — молотки',8,12],
    ['Трицепс — розгинання над головою',10,15],
    ['Прес',null,null]
  ]},
  {id:'set-program-four-sets-fri',name:'Пʼятниця',day:5,exercises:[
    ['Жим ногами',8,12],
    ['Тяга верхнього блока',8,12],
    ['Butterfly / Pec Deck',10,15],
    ['Задня дельта в Pec Deck',10,15],
    ['Ікри сидячи',12,20],
    ['Біцепс на похилій лавці',10,12],
    ['Трицепс — розгинання однією рукою',12,15],
    ['Прес',null,null]
  ]}
];
export function missingProgramDays(state){return PERSONAL_PROGRAM.filter(day=>!state.templates.some(t=>t.id===day.id));}
export function onlyStarterPlans(state){
  return !state.history.length&&!state.session&&!state.catalog.length&&(state.templates.length===0||(state.templates.length===3&&state.templates.every(t=>!t.exercises.length&&[1,3,5].includes(t.day)&&t.name===`Тренування ${'ABC'[[1,3,5].indexOf(t.day)]}`)));
}
export function isFirstLaunch(state){
  return onlyStarterPlans(state);
}
export function addPersonalProgram(state){
  const missing=missingProgramDays(state);
  if(!missing.length)return 0;
  if(state.templates.length+missing.length>500)throw new Error('Забагато планів. Видали зайві перед додаванням.');
  if(onlyStarterPlans(state))state.templates=[];
  for(const day of missing){
    state.templates.push({id:day.id,name:day.name,day:day.day,exercises:day.exercises.map(([name,min,max])=>({
      id:uid(),exerciseId:getOrCreateExercise(state,name).id,name,targetSets:4,targetReps:min??8,
      ...(max!==null?{targetRepsMax:max}:{}),...(min===null?{targetRepsUnspecified:true}:{})
    }))});
  }
  return missing.length;
}
