import {trainingSnapshot} from '../js/exercise-config.js';

export const TODAY='2026-11-23';

export function demoData(scenario){
 const names=['Жим лежачи','Румунська тяга','Жим гантелей під кутом'];
 const exercise=(name,index,weight,reps)=>({
  id:'row-'+index,exerciseId:'demo-'+index,name,...trainingSnapshot({name}),
  sets:[{id:'warmup-'+index,type:'warmup',done:true,weight:weight/2,reps:10},
   {id:'working-'+index,done:true,weight,reps}]
 });
 const make=(day,index,work)=>({
  id:'demo-session-'+index,title:'Демо · Силове',templateId:'demo-plan',
  startedAt:day+'T16:00:00Z',finishedAt:day+'T17:05:00Z',
  exercises:names.map((name,i)=>exercise(name,i,[60,80,20][i]+work[i],8))
 });
 const steps={up:[7.5,10,2.5],stable:[0,0,0],down:[-7.5,-10,-2.5],records:[10,15,5]};
 const days=['2026-11-10','2026-11-13','2026-11-17','2026-11-20'];
 const history=scenario==='empty'?[]:scenario==='insufficient'?[make(days[3],0,[0,0,0])]:
  days.map((day,i)=>make(day,i,i<2?[0,0,0]:steps[scenario]));
 return {history,catalog:[],templates:[{id:'demo-plan',day:2,exercises:[{}]}]};
}
