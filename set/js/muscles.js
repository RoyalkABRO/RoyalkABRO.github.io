export const MUSCLE_GROUPS=[['chest','Груди'],['back','Спина'],['shoulders','Плечі'],['biceps','Біцепс'],['triceps','Трицепс'],['quads','Передня поверхня стегна'],['hamstrings','Задня поверхня стегна'],['glutes','Сідниці'],['calves','Ікри'],['core','Прес']];
export const MUSCLE_IDS=MUSCLE_GROUPS.map(([id])=>id);
export function inferMuscle(name){const n=String(name||'').toLocaleLowerCase('uk-UA');for(const [pattern,id] of [
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
 [/прес|скруч|планк|crunch|abdominal|^abs$|\bcore\b/,'core']])if(pattern.test(n))return id;return null;}
export function exerciseMuscle(e,catalog=[]){const config=catalog.find(c=>c.id===e.exerciseId),explicit=config?.muscleGroup??e.muscleGroup;if(explicit==='none')return null;return MUSCLE_IDS.includes(explicit)?explicit:inferMuscle(e.name);}
export function muscleActivity(history,catalog=[]){const groups=MUSCLE_GROUPS.map(([id,name])=>({id,name,sets:0,last:null,exercises:[]}));let unknown=0;for(const w of history)for(const e of w.exercises){const sets=e.sets.filter(s=>s.done&&s.type!=='warmup').length;if(!sets)continue;const group=groups.find(g=>g.id===exerciseMuscle(e,catalog));if(!group){unknown+=sets;continue;}group.sets+=sets;if(!group.last||Date.parse(w.finishedAt)>Date.parse(group.last))group.last=w.finishedAt;let entry=group.exercises.find(x=>x.id===e.exerciseId);if(!entry){entry={id:e.exerciseId,name:e.name,sets:0};group.exercises.push(entry);}entry.sets+=sets;}return {groups,unknown};}
export function muscleField(e){const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return '<label class="filter-label">Основна група м’язів<select id="exercise-muscle" class="field"><option value="">Автоматично за назвою</option>'+MUSCLE_GROUPS.map(([id,name])=>'<option value="'+id+'" '+(e.muscleGroup===id?'selected':'')+'>'+name+'</option>').join('')+'<option value="none" '+(e.muscleGroup==='none'?'selected':'')+'>Не відносити до групи</option></select></label>';}
