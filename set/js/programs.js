import {getOrCreateExercise,uid} from './model.js';
import {exerciseConfig,PERSONAL_PLAN_ADDITIONS} from './exercise-config.js';

// Keep the existing order and include the two requested positions.
export const PERSONAL_PROGRAM = [
  {id:'set-program-four-sets-mon',name:'Понеділок',day:1,exercises:[
    'Жим лежачи',
    'Підтягування',
    'Жим гантелей над головою (плечі)',
    'Розгинання ніг',
    'Ікри стоячи',
    PERSONAL_PLAN_ADDITIONS['set-program-four-sets-mon'].name,
    'Біцепс з грифом',
    'Трицепс вниз на блоці',
    'Прес'
  ]},
  {id:'set-program-four-sets-wed',name:'Середа',day:3,exercises:[
    'Жим гантелей під кутом',
    'Тяга нижнього блока',
    'Румунська тяга',
    'Згинання ніг',
    'Махи на середню дельту',
    'Біцепс — молотки',
    'Трицепс — розгинання над головою',
    'Прес'
  ]},
  {id:'set-program-four-sets-fri',name:'Пʼятниця',day:5,exercises:[
    'Жим ногами',
    'Тяга верхнього блока',
    'Butterfly / Pec Deck',
    'Задня дельта в Pec Deck',
    'Ікри сидячи',
    PERSONAL_PLAN_ADDITIONS['set-program-four-sets-fri'].name,
    'Біцепс на похилій лавці',
    'Трицепс — розгинання однією рукою',
    'Прес'
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
    state.templates.push({id:day.id,name:day.name,day:day.day,exercises:day.exercises.map(name=>{
      const exercise=getOrCreateExercise(state,name);
      const config=exerciseConfig(exercise);
      return {id:uid(),exerciseId:exercise.id,name:exercise.name,targetSets:4,
        targetReps:config.min,targetRepsMax:config.max};
    })});
  }
  return missing.length;
}
