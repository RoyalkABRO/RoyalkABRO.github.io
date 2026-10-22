import {DAYS,repTarget} from './model.js';

export function programText(templates,selectedId=''){
  const selected=selectedId?templates.filter(plan=>plan.id===selectedId):templates;
  if(!selected.length)return '';
  const days=selected.map(plan=>{
    const title=plan.name===DAYS[plan.day]?plan.name:`${plan.name} · ${DAYS[plan.day]}`;
    const exercises=plan.exercises.map((exercise,index)=>`${index+1}. ${exercise.name} — ${exercise.targetSets} × ${repTarget(exercise)}`);
    return [title,...(exercises.length?exercises:['Вправи ще не додані.'])].join('\n');
  });
  return ['Моя програма тренувань — СЕТ',...days].join('\n\n');
}
