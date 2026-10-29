export const MUSCLE_GROUPS=[['chest','Груди'],['back','Спина'],['shoulders','Плечі'],['biceps','Біцепс'],['triceps','Трицепс'],['quads','Передня поверхня стегна'],['hamstrings','Задня поверхня стегна'],['glutes','Сідниці'],['calves','Ікри'],['core','Прес']];
export const MUSCLE_IDS=MUSCLE_GROUPS.map(([id])=>id);
const inferCache=new Map();
export function inferMuscle(name){
 const key=String(name||'');
 if(inferCache.has(key))return inferCache.get(key);
 const n=key.toLocaleLowerCase('uk-UA');
 for(const [pattern,id] of [
  [/задн.*дельт|rear.*delt|reverse.*(fly|pec)/,'shoulders'],
  [/трицеп|tricep|розгинан.*(над голов|однією рук)/,'triceps'],
  [/біцеп|бицеп|bicep|молот|hammer curl/,'biceps'],
  [/ікр|икр|calf|calves/,'calves'],
  [/румун|romanian|згинан.*ніг|leg curl/,'hamstrings'],
  [/сідниц|ягод|hip thrust|glute/,'glutes'],
  [/присід|присед|squat|жим ног|розгинан.*ніг|leg press|leg extension/,'quads'],
  [/підтяг|подтяг|pull.?up|тяга.*(блок|нахил|гантел|штанг|т-гриф)|\brow\b|lat pulldown/,'back'],
  [/дельт|плеч|shoulder|lateral raise|мах.*(сторон|бік)|жим.*над голов/,'shoulders'],
  [/жим.*(леж|лав|кут|горизонт)|bench press|chest|butterfly|pec.?deck|floor press|віджим|push.?up/,'chest'],
  [/прес|скруч|планк|crunch|abdominal|^abs$|\bcore\b/,'core']])if(pattern.test(n)){inferCache.set(key,id);return id;}
 inferCache.set(key,null);return null;
}
export function exerciseMuscle(e,catalog=[]){const config=Array.isArray(catalog)?catalog.find(c=>c.id===e.exerciseId):catalog.get?.(e.exerciseId),explicit=config?.muscleGroup??e.muscleGroup;if(explicit==='none')return null;return MUSCLE_IDS.includes(explicit)?explicit:inferMuscle(e.name);}
export function muscleActivity(history,catalog=[]){
 const catalogMap=new Map((catalog||[]).map(c=>[c.id,c]));
 const groups=MUSCLE_GROUPS.map(([id,name])=>({id,name,sets:0,last:null,lastTime:-Infinity,exercises:[],byId:new Map()}));
 const groupById=new Map(groups.map(g=>[g.id,g]));
 let unknown=0;
 for(const w of history){
  const t=Date.parse(w.finishedAt);
  for(const e of w.exercises){
   let sets=0;for(const s of e.sets)if(s.done&&s.type!=='warmup')sets++;
   if(!sets)continue;
   const group=groupById.get(exerciseMuscle(e,catalogMap));
   if(!group){unknown+=sets;continue;}
   group.sets+=sets;
   if(t>group.lastTime){group.lastTime=t;group.last=w.finishedAt;}
   let entry=group.byId.get(e.exerciseId);
   if(!entry){entry={id:e.exerciseId,name:e.name,sets:0};group.byId.set(e.exerciseId,entry);group.exercises.push(entry);}
   entry.sets+=sets;
  }
 }
 return {groups:groups.map(({id,name,sets,last,exercises})=>({id,name,sets,last,exercises})),unknown};
}
export function muscleField(e){const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return '<label class="filter-label">Основна група м’язів<select id="exercise-muscle" class="field"><option value="">Автоматично за назвою</option>'+MUSCLE_GROUPS.map(([id,name])=>'<option value="'+id+'" '+(e.muscleGroup===id?'selected':'')+'>'+name+'</option>').join('')+'<option value="none" '+(e.muscleGroup==='none'?'selected':'')+'>Не відносити до групи</option></select></label>';}
