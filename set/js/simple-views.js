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
 const f=forecastSession(state,now);if(!f)return '';
 return Math.floor(f.elapsed)+' хв · до ≈'+new Date(f.finish).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'})+(f.over?' · понад 90 хв':'');
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
 const prior=previousSets(state,e.exerciseId),prevText=formatPreviousResultText(prior);
 const isDumbbell=(e.weightBasis||state.catalog.find(c=>c.id===e.exerciseId)?.weightBasis)==='one-dumbbell';
 const nextEx=upcomingExercise(w,e.id);
 const firstActiveIdx=e.sets.findIndex(s=>!s.done);
 const isFirstEverSet=!state.history.length&&!w.exercises.some(ex=>ex.sets.some(s=>s.done));
 const menu='<details class="simple-menu exercise-menu"><summary aria-label="Дії з вправою '+esc(e.name)+'">'+icon('more-horizontal')+'</summary><div class="simple-menu-content">'+btn('edit-goal','Змінити ціль вручну',attrs)+btn('replace-exercise','Замінити вправу на сьогодні',attrs+' '+(complete?'disabled':''))+btn('exercise-config','Обладнання та крок ваги',attrs)+btn('set-options','Типи підходів',attrs)+btn('remove-set','Прибрати останній підхід',attrs)+note(e.note,'data-note-ex="'+esc(e.id)+'"','Нотатка до вправи')+btn('remove-session-ex','Прибрати вправу з тренування',attrs,'btn danger sm')+'</div></details>';
 const subtitle='Вправа '+(index+1)+' із '+totalExercises+' · '+work.length+' × '+compactRepTarget(e)+(isDumbbell?' · вага 1 гантелі':'');
 const explain=g.shortReason||g.reason;
 const targetBlock='<div class="goal-summary-box">'+(goalText?'<div class="goal-summary-top"><div class="goal-summary-main"><span class="goal-summary-label">'+(e.goal?'Ціль на сьогодні':'Рекомендовано по підходах')+'</span><strong class="goal-summary-target">'+esc(goalText)+'</strong></div>'+(canApply?btn('accept-goal','Підставити',attrs,'btn sm goal-apply-btn'):'')+'</div>':'')+'<p class="simple-hint">'+esc(explain)+(prevText?' <span class="prior-inline">(минулого разу '+esc(prevText)+')</span>':'')+'</p><details class="goal-rules-details"><summary>Правила розрахунку</summary><p class="helper">'+esc(g.reason)+' Подвійна прогресія: коли всі робочі підходи виконано по верхній межі діапазону двічі поспіль із запасом сил, додається крок ваги; інакше додається 1 повторення.</p></details></div>';
 return '<section class="exercise simple-exercise" data-exercise="'+esc(e.id)+'"><header class="exercise-header"><div class="exercise-title-group"><button id="focus-exercise" type="button" class="exercise-title-picker" data-action="exercise-order" aria-haspopup="dialog" aria-label="Обрати або перемістити вправу: '+esc(e.name)+'"><h2 class="exercise-name">'+esc(e.name)+'</h2><span class="picker-chevron" aria-hidden="true">▾</span></button><p class="exercise-meta">'+esc(subtitle)+'</p></div>'+menu+'</header>'+(isDumbbell?'<p class="dumbbell-notice">Вводь вагу <strong>однієї гантелі</strong> (кг)</p>':'')+(gear?'<p class="simple-equipment">'+esc(gear)+'</p>':'')+(e.replacementFor?'<p class="replacement-label">Заміна на сьогодні (замість «'+esc(e.replacementFor.name)+'»)</p>':'')+targetBlock+(isFirstEverSet?'<p class="first-set-coachmark" role="note">Введи результат і натисни ✓</p>':'')+'<div class="set-grid set-table-head"><span class="set-head">№</span><span class="set-head">'+(isDumbbell?'КГ (1 ГАНТ.)':'КГ')+'</span><span class="set-head">ПОВТ.</span><span class="set-head" aria-label="Виконано">СТАН</span></div><div class="exercise-sets-list">'+e.sets.map((s,j)=>{
  const isCurrent=j===firstActiveIdx;
 
  return '<div class="set-block '+(s.done?'is-done':'')+' '+(isCurrent?'is-current':'')+' '+(s.type==='warmup'?'is-warmup':'')+'" data-set-block="'+esc(s.id)+'">'+renderSet(e,s,j,isCurrent)+'<p class="set-error" data-set-error="'+esc(s.id)+'" role="alert" hidden></p></div>';
 }).join('')+'</div><div class="simple-set-actions">'+btn('suggest-warmup','Розминка',attrs,'btn alt')+btn('add-set','+ Підхід',attrs,'btn alt add-set')+'</div>'+(complete&&last?'<details class="quiet-effort"><summary>Запас сил в останньому підході <span>необов’язково</span></summary><label class="effort-label">Запас повторень<select data-rir data-ex="'+esc(e.id)+'" data-set="'+esc(last.id)+'"><option value="" '+(last.rir==null?'selected':'')+'>Не вказано</option>'+[[2,'Ще 2+ повторення'],[1,'Ще 1 повторення'],[0,'Без запасу']].map(([n,t])=>'<option value="'+n+'" '+(last.rir===n?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+(canOfferExtra(state,e)?btn('extra-set','+ Додатковий робочий підхід на сьогодні',attrs,'btn alt sm'):'')+'</details>':'')+(nextEx?'<div class="next-exercise-callout"><span class="next-exercise-label">Далі: <strong>'+esc(nextEx.name)+'</strong></span>'+(complete?btn('focus-move','Перейти до «'+esc(nextEx.name)+'» '+icon('chevron-right'),'data-target-id="'+esc(nextEx.id)+'" data-direction="1"','btn block simple-next'):btn('focus-move','Відкрити','data-target-id="'+esc(nextEx.id)+'" data-direction="1"','btn alt sm'))+'</div>':'')+'</section>';
}
export function setOptionsForm(e){
 return btn('close-modal',icon('close'),'aria-label="Закрити"','modal-close icon-btn')+'<h2>Типи підходів</h2><p class="helper">Лише для сьогоднішнього заняття</p><div id="set-options" data-id="'+esc(e.id)+'">'+e.sets.map((s,i)=>'<div class="set-options-row"><strong>Підхід '+setLabel(e,i)+'</strong>'+btn('set-type',s.type==='warmup'?'Зробити робочим':'Зробити розминкою','data-ex="'+esc(e.id)+'" data-set="'+esc(s.id)+'"')+(s.type==='warmup'?btn('remove-warmup','Прибрати','data-ex="'+esc(e.id)+'" data-set="'+esc(s.id)+'"','btn danger sm'):'')+'</div>').join('')+'</div>';
}
export function restBarView(state){
 const w=state.session;if(!w)return '';
 const focused=focusExercise(w,null),nextEx=focused?upcomingExercise(w,focused.id):null;
 const active=Boolean(state.restEndsAt);
 const label=state.restKind==='exercise'?(nextEx?'Відпочинок перед «'+esc(nextEx.name)+'»':'Між вправами'):state.restKind==='warmup'?'Після розминки':'Між підходами';
 return '<div id="restSlot" class="rest-dock '+(active?'is-active':'is-idle')+'"><div id="restCompact" class="rest simple-rest" '+(active?'':'hidden')+'><button type="button" class="rest-expand-btn" data-action="rest-focus" aria-label="Розгорнути таймер відпочинку"><span class="rest-meta"><span id="restLabel" class="rest-kind-badge">'+label+'</span></span><strong id="restTimer" class="timer-compact-digits" role="timer">'+formatClock(state.restSeconds)+'</strong></button><div class="rest-dock-actions">'+btn('rest-adjust','+30 с','aria-label="Додати 30 секунд"','btn alt sm rest-add-btn')+btn('rest-stop',icon('close')+'<span class="visually-hidden">Зупинити</span>','aria-label="Зупинити таймер"','icon-btn rest-stop-btn')+'</div></div><div id="restIdleBar" class="rest-idle-bar" '+(active?'hidden':'')+'><span id="saveStatus" class="save-status-pill" role="status">Збережено на пристрої</span>'+(nextEx?'<span class="rest-idle-next">Далі: '+esc(nextEx.name)+'</span>':'<span class="rest-idle-next">Усі вправи за планом</span>')+'</div></div>';
}
export function simpleWorkoutView(state,ui,renderSet){
 const w=state.session,focused=focusExercise(w,ui.focusId),index=w.exercises.indexOf(focused),forecast=forecastSession(state);
 const allWorking=w.exercises.flatMap(workingSets),allDone=allWorking.length>0&&allWorking.every(s=>s.done),unmarkedCount=w.exercises.reduce((n,e)=>n+e.sets.filter(s=>!s.done).length,0);
 const sessionMenu='<details class="simple-menu session-menu"><summary aria-label="Меню тренування">'+icon('settings')+'</summary><div class="simple-menu-content">'+btn('easy-day',w.easy?'Звичайне навантаження':'Сьогодні легше','aria-pressed="'+Boolean(w.easy)+'"')+btn('session-add-ex','Додати вправу до заняття')+(forecast?.over&&forecast.optional.length?btn('review-extras','Прибрати додаткові підходи'):'')+note(w.note,'data-workout-note','Нотатка до тренування')+btn('cancel-workout','Скасувати тренування','','btn danger sm')+'</div></details>';
 const card=focused?renderExerciseCard(state,focused,index,w.exercises.length,renderSet):'<div class="empty"><strong>Додай першу вправу</strong>'+btn('session-add-ex','Додати вправу','','btn')+'</div>';
 const finishBtn=allDone?btn('finish-workout',icon('check')+'<span>Завершити тренування</span>','','btn block finish-primary'):btn('finish-workout','Завершити достроково','','btn alt block finish-secondary')+(unmarkedCount?'<p class="helper">Не позначено підходів: '+unmarkedCount+'</p>':'');
 return '<div class="simple-workout"><header class="simple-workout-head"><div><h1 class="page-title workout-title">'+esc(w.title)+'</h1><p class="workout-duration" id="compactTiming">'+compactTiming(state)+'</p>'+(w.easy?'<span class="plan-badge">Легший режим на сьогодні</span>':'')+'</div>'+sessionMenu+'</header>'+card+'<div class="simple-finish" id="workoutFinishSection">'+finishBtn+'</div>'+restBarView(state)+'</div>';
}
