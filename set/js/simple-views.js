import {focusExercise,upcomingExercise,equipmentText,forecastSession} from './workout-tools.js';
import {workingSets,suggestGoal,isWorking,setLabel,goalDiffersFromUnfinished,canOfferExtra} from './progression.js';
import {compactRepTarget,previousSets} from './model.js';
import {formatClock} from './timer.js';
import {icon} from './icons.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number(n).toLocaleString('uk-UA',{maximumFractionDigits:2});
const btn=(action,label,attrs='',cls='btn alt sm')=>'<button type="button" class="'+cls+'" data-action="'+action+'" '+attrs+'>'+label+'</button>';
const note=(value,attrs,label)=>'<details class="quiet-note"'+(value?' open':'')+'><summary>'+label+'</summary><textarea class="field workout-note" maxlength="1000" rows="2" '+attrs+'>'+esc(value||'')+'</textarea></details>';
export function compactTiming(state,now=Date.now()){
 return state.session?formatClock(Math.max(0,Math.floor((now-Date.parse(state.session.startedAt))/1000))):'';
}
export function formatSetGoalText(sets){
 if(!sets?.length)return '';
 const sameWeight=sets.every(s=>Number(s.weight)===Number(sets[0].weight));
 if(sameWeight)return num(sets[0].weight)+' кг · '+sets.map(s=>s.reps).join(' / ');
 return sets.map(s=>num(s.weight)+' кг × '+s.reps).join(' · ');
}
export function formatPreviousResultText(sets){
 if(!sets?.length)return '';
 const sameWeight=sets.every(s=>Number(s.weight)===Number(sets[0].weight));
 return sameWeight?num(sets[0].weight)+' кг: '+sets.map(s=>s.reps).join(' / '):sets.map(s=>num(s.weight)+' × '+s.reps).join(' · ');
}
export function renderExerciseCard(state,e,index,totalExercises,renderSet){
 const w=state.session,work=workingSets(e),g=e.goal||suggestGoal(state,e),attrs='data-id="'+esc(e.id)+'"',gear=equipmentText(e),complete=work.length>0&&work.every(s=>s.done),last=work.at(-1);
 const goalText=formatSetGoalText(g.sets);
 const canApply=goalDiffersFromUnfinished(e,g);
 const prior=previousSets(state,e.exerciseId);
 const isDumbbell=(e.weightBasis||state.catalog.find(c=>c.id===e.exerciseId)?.weightBasis)==='one-dumbbell';
 const nextEx=upcomingExercise(w,e.id);
 const firstActiveIdx=e.sets.findIndex(s=>!s.done);
 const isFirstEverSet=!state.history.length&&!w.exercises.some(ex=>ex.sets.some(s=>s.done));
 const menu=btn('workout-menu',icon('more-horizontal'),attrs+' aria-label="Дії з вправою та заняттям"','icon-btn exercise-menu-trigger');
 const subtitle=work.length+' × '+compactRepTarget(e)+(isDumbbell?' · вага 1 гантелі':'');
 const explain=g.shortReason||g.reason;
 const targetBlock='<div class="goal-summary-box"><div class="goal-summary-top"><p class="simple-hint" aria-describedby="exerciseGoal">'+esc(explain)+'</p>'+(canApply?btn('accept-goal','Підставити',attrs,'text-btn goal-apply-btn'):'')+'</div><span id="exerciseGoal" class="goal-summary-target visually-hidden">'+esc(goalText||explain)+'</span></div>';
 return '<section class="exercise simple-exercise" data-exercise="'+esc(e.id)+'"><header class="exercise-header"><button id="focus-exercise" type="button" class="exercise-title-picker" data-action="exercise-order" aria-haspopup="dialog" aria-label="Обрати або перемістити вправу: '+esc(e.name)+'">Вправа '+(index+1)+' із '+totalExercises+icon('chevron-right')+'</button>'+menu+'</header><h1 class="exercise-name">'+esc(e.name)+'</h1><p class="exercise-meta">'+esc(subtitle)+'</p>'+(gear?'<p class="simple-equipment">'+esc(gear)+'</p>':'')+(e.replacementFor?'<p class="replacement-label">Заміна на сьогодні (замість «'+esc(e.replacementFor.name)+'»)</p>':'')+targetBlock+(isFirstEverSet?'<p class="first-set-coachmark" role="note">Введи результат і натисни ✓</p>':'')+'<div class="set-grid journal-grid set-table-head"><span class="set-head">№</span><span class="set-head previous-set-heading">Минулого разу</span><span class="set-head">'+(isDumbbell?'Кг · 1 гант.':'Кг')+'</span><span class="set-head">Повт.</span><span class="set-head visually-hidden">Виконано</span></div><div class="exercise-sets-list">'+e.sets.map((s,j)=>{
  const isCurrent=j===firstActiveIdx;
 
  const previous=s.type==='warmup'?null:prior[e.sets.slice(0,j).filter(isWorking).length];
  return '<div class="set-block '+(s.done?'is-done':'')+' '+(isCurrent?'is-current':'')+' '+(s.type==='warmup'?'is-warmup':'')+'" data-set-block="'+esc(s.id)+'">'+renderSet(e,s,j,isCurrent,previous)+'<p class="set-error" data-set-error="'+esc(s.id)+'" role="alert" hidden></p></div>';
 }).join('')+'</div><div class="simple-set-actions">'+btn('suggest-warmup','Розминка',attrs,'text-btn')+btn('add-set','+ Підхід',attrs,'text-btn add-set')+'</div>'+restBarView(state)+(complete&&last?'<details class="quiet-effort"><summary>Як відчувалось? <span>необов’язково</span></summary><label class="effort-label">Запас в останньому підході<select data-rir data-ex="'+esc(e.id)+'" data-set="'+esc(last.id)+'"><option value="" '+(last.rir==null?'selected':'')+'>Не вказано</option>'+[[2,'Ще 2+ повторення'],[1,'Ще 1 повторення'],[0,'Без запасу']].map(([n,t])=>'<option value="'+n+'" '+(last.rir===n?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+(canOfferExtra(state,e)?btn('extra-set','+ Додатковий підхід на сьогодні',attrs,'btn alt sm'):'')+'</details>':'')+(nextEx?'<div class="next-exercise-callout"><span class="next-exercise-label">Наступна вправа<strong>'+esc(nextEx.name)+'</strong></span>'+(complete?btn('focus-move','Далі: '+esc(nextEx.name)+icon('chevron-right'),'data-target-id="'+esc(nextEx.id)+'" data-direction="1"','btn block simple-next'):btn('focus-move',icon('chevron-right'),'data-target-id="'+esc(nextEx.id)+'" data-direction="1" aria-label="Відкрити '+esc(nextEx.name)+'"','icon-btn next-exercise-open'))+'</div>':'')+'</section>';
}
export function setOptionsForm(e){
 return btn('close-modal',icon('close'),'aria-label="Закрити"','modal-close icon-btn')+'<h2>Типи підходів</h2><p class="helper">Лише для сьогоднішнього заняття</p><div id="set-options" data-id="'+esc(e.id)+'">'+e.sets.map((s,i)=>'<div class="set-options-row"><strong>Підхід '+setLabel(e,i)+'</strong>'+btn('set-type',s.type==='warmup'?'Зробити робочим':'Зробити розминкою','data-ex="'+esc(e.id)+'" data-set="'+esc(s.id)+'"')+(s.type==='warmup'?btn('remove-warmup','Прибрати','data-ex="'+esc(e.id)+'" data-set="'+esc(s.id)+'"','btn danger sm'):'')+'</div>').join('')+'</div>';
}
export function workoutMenuForm(state,e){
 if(!e)return btn('close-modal',icon('close'),'aria-label="Закрити меню"','modal-close')+'<h2>Заняття</h2><div class="workout-actions"><section>'+btn('session-add-ex','Додати вправу')+note(state.session.note,'data-workout-note','Нотатка до заняття')+btn('cancel-workout','Скасувати заняття','','btn danger sm')+'</section></div>';
 const attrs='data-id="'+esc(e.id)+'"',w=state.session,g=e.goal||suggestGoal(state,e),forecast=forecastSession(state),complete=workingSets(e).length&&workingSets(e).every(s=>s.done);
 return btn('close-modal',icon('close'),'aria-label="Закрити меню"','modal-close')+'<h2>Дії</h2><div class="workout-actions"><section><h3>Вправа</h3><p class="helper">'+esc(e.name)+'</p>'+btn('edit-goal','Змінити ціль',attrs)+btn('replace-exercise','Замінити на сьогодні',attrs+' '+(complete?'disabled':''))+btn('exercise-config','Обладнання та крок ваги',attrs)+btn('set-options','Типи підходів',attrs)+note(e.note,'data-note-ex="'+esc(e.id)+'"','Нотатка до вправи')+'<details class="goal-rules-details"><summary>Ціль і попередній результат</summary><strong>'+esc(formatSetGoalText(g.sets))+'</strong><p class="helper">'+esc(formatPreviousResultText(previousSets(state,e.exerciseId)))+'</p><p class="helper">'+esc(g.reason)+'</p></details>'+btn('remove-set','Прибрати останній підхід',attrs)+btn('remove-session-ex','Прибрати вправу',attrs,'btn danger sm')+'</section><section><h3>Заняття</h3>'+btn('easy-day',w.easy?'Повернути звичайне навантаження':'Сьогодні легше')+btn('session-add-ex','Додати вправу')+(forecast?.over&&forecast.optional.length?btn('review-extras','Прибрати додаткові підходи'):'')+note(w.note,'data-workout-note','Нотатка до заняття')+(forecast?'<p class="helper">Орієнтовне завершення: '+new Date(forecast.finish).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'})+'</p>':'')+btn('cancel-workout','Скасувати заняття','','btn danger sm')+'</section></div>';
}
export function restBarView(state){
 const w=state.session;if(!w)return '';
 const focused=focusExercise(w,null),nextEx=focused?upcomingExercise(w,focused.id):null;
 const active=Boolean(state.restEndsAt);
 const label=state.restKind==='exercise'?(nextEx?'Відпочинок перед «'+esc(nextEx.name)+'»':'Між вправами'):state.restKind==='warmup'?'Після розминки':'Між підходами';
 return '<div id="restSlot" class="rest-dock '+(active?'is-active':'is-idle')+'"><div id="restCompact" class="rest simple-rest" '+(active?'':'hidden')+'><button type="button" class="rest-expand-btn" data-action="rest-focus" aria-label="Розгорнути таймер відпочинку"><span id="restLabel" class="rest-kind-badge">'+label+'</span><strong id="restTimer" class="timer-compact-digits" role="timer">'+formatClock(state.restSeconds)+'</strong></button><div class="rest-dock-actions">'+btn('rest-adjust','+30 с','aria-label="Додати 30 секунд"','btn alt sm rest-add-btn')+btn('rest-stop','Пропустити','aria-label="Зупинити таймер"','text-btn rest-stop-btn')+'</div><div class="rest-line" aria-hidden="true"><span id="restMeter"></span></div></div><div id="restIdleBar" class="rest-idle-bar" '+(active?'hidden':'')+'><span>Відпочинок між підходами<strong>'+formatClock(state.restSeconds)+'</strong></span>'+btn('rest-start','Почати','aria-label="Почати відпочинок"','text-btn')+'</div></div>';
}
export function finishSectionView(state){
 const sets=state.session.exercises.flatMap(workingSets),done=sets.length&&sets.every(s=>s.done);
 return (done?btn('finish-workout','Завершити тренування','','btn block finish-primary'):'')+'<div class="workout-footer"><span id="saveStatus" class="save-status-pill" role="status">Збережено на пристрої</span>'+(!done?btn('finish-workout','Завершити','aria-label="Завершити тренування достроково"','text-btn finish-secondary'):'')+'</div>';
}
export function simpleWorkoutView(state,ui,renderSet){
 const w=state.session,focused=focusExercise(w,ui.focusId),index=w.exercises.indexOf(focused);
 const card=focused?renderExerciseCard(state,focused,index,w.exercises.length,renderSet):'<div class="empty"><strong>Додай першу вправу</strong>'+btn('session-add-ex','Додати вправу','','btn')+'</div>';
 return '<div class="simple-workout"><header class="simple-workout-head"><button type="button" class="workout-back text-btn" data-action="workout-home" aria-label="До програми — заняття зберігається">'+icon('chevron-right')+'<span class="workout-title">'+esc(w.title)+'</span></button><span class="workout-duration" id="compactTiming">'+compactTiming(state)+'</span>'+(!focused?btn('workout-menu',icon('more-horizontal'),'aria-label="Дії із заняттям"','icon-btn exercise-menu-trigger'):'')+'</header>'+(w.easy?'<p class="easy-day-label">Легший день</p>':'')+card+'<div class="simple-finish" id="workoutFinishSection">'+finishSectionView(state)+'</div></div>';
}
