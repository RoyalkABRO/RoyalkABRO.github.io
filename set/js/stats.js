export const volume = w => w.exercises.reduce((sum,e)=>sum+e.sets.reduce((v,s)=>v+Number(s.weight)*Number(s.reps),0),0);
export function filteredHistory(history,days=0,now=Date.now()) {
  return history.filter(w=>!days||Date.parse(w.finishedAt)>=now-days*86400000).sort((a,b)=>Date.parse(a.finishedAt)-Date.parse(b.finishedAt));
}
export function series(history,exerciseId,metric='weight') {
  return [...history].sort((a,b)=>Date.parse(a.finishedAt)-Date.parse(b.finishedAt)).flatMap(w=>{
    const sets=w.exercises.filter(e=>e.exerciseId===exerciseId).flatMap(e=>e.sets);
    if(!sets.length)return [];
    const value=metric==='volume'?sets.reduce((v,s)=>v+s.weight*s.reps,0):metric==='reps'?Math.max(...sets.map(s=>s.reps)):Math.max(...sets.map(s=>s.weight));
    return [{date:w.finishedAt,value}];
  });
}
export function records(history,exerciseId) {
  const sets=history.flatMap(w=>w.exercises.filter(e=>e.exerciseId===exerciseId).flatMap(e=>e.sets));
  return {weight:sets.length?Math.max(...sets.map(s=>s.weight)):0,reps:sets.length?Math.max(...sets.map(s=>s.reps)):0,bestSetVolume:sets.length?Math.max(...sets.map(s=>s.weight*s.reps)):0};
}
