import {focusExercise,upcomingExercise,equipmentText} from './workout-tools.js';
import {dashboard,workoutSummary,nextSet} from './dashboard.js';
import {icon} from './icons.js';
import {DAYS} from './model.js';
import {setLabel,comparison} from './progression.js';
import {onlyStarterPlans,missingProgramDays} from './programs.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number(n).toLocaleString('uk-UA',{maximumFractionDigits:1});
const action=(name,text,attrs='',style='btn')=>`<button type="button" class="${style}" data-action="${name}" ${attrs}>${text}</button>`;
const DAY_ACCUSATIVE=['у неділю','у понеділок','у вівторок','у середу','у четвер','у пʼятницю','у суботу'];
export function homeDesign(state,preset=''){
 const d=dashboard(state),active=state.session;
 const populated=state.templates.filter(p=>p.exercises.length);
 const isStarter=onlyStarterPlans(state);
 if(isStarter&&!active){
  return `<section class="home-intro"><div><p class="subtle">${new Date().toLocaleDateString('uk-UA',{weekday:'long',day:'numeric',month:'long'})}</p><h1 class="page-title">${d.greeting}</h1></div></section>
  <section class="card first-launch-card">
   <span class="plan-badge">${icon('dumbbell')} Перший запуск</span>
   <h2>Обери, як почати</h2>
   <p class="subtle">Готова програма містить 3 тренування по 8 вправ і 4 робочі підходи. Або створи власний план з потрібними вправами.</p>
   <div class="first-launch-actions">
    ${action('preview-program',icon('check')+'<span>Додати готову програму</span>','','btn block')}
    ${action('new-template',icon('plus')+'<span>Створити власну</span>','','btn alt block')}
   </div>
  </section>
  <p class="data-notice">Усі тренування зберігаються локально на цьому пристрої. У налаштуваннях завжди можна зберегти резервну копію JSON.</p>`;
 }
 const t=populated.slice().sort((a,b)=>(a.day-new Date().getDay()+7)%7-(b.day-new Date().getDay()+7)%7)[0]||state.templates[0];
 const other=state.templates.filter(p=>p.id!==t?.id);
 const isToday=t&&t.day===new Date().getDay();
 const ctaLabel=isToday?'Почати тренування':'Почати зараз';
 const statusBadge=isToday?`${icon('check')} Сьогодні за планом`:`${icon('calendar')} Найближче тренування`;
 const nextScheduleNote=t&&!isToday?`<p class="schedule-note">Сьогодні день відпочинку. Наступне заняття за планом — <strong>${DAY_ACCUSATIVE[t.day]}</strong> (${esc(DAYS[t.day])}).</p>`:'';
 return `<section class="home-intro"><div><p class="subtle">${new Date().toLocaleDateString('uk-UA',{weekday:'long',day:'numeric',month:'long'})}</p><h1 class="page-title">${d.greeting}</h1></div>${d.streak?`<span class="streak-pill" title="Тижні поспіль із завершеним тренуванням">${icon('fire')}<span>${d.streak} тиж.</span></span>`:''}</section>
 ${active?`<section class="card resume today-hero"><div class="row"><span class="plan-badge">${icon('dumbbell')} Активне заняття</span></div><h2>${esc(active.title)}</h2><p class="subtle">${active.exercises.length} вправ · ${active.exercises.reduce((n,e)=>n+e.sets.filter(s=>s.done).length,0)} виконаних підходів</p>${action('resume',icon('play')+'<span>Продовжити</span>','','btn block')}</section>`:''}
 ${!active&&t?`<section class="card hero today-hero template-card"><div class="row"><span class="plan-badge">${statusBadge}</span><span class="subtle">${DAYS[t.day]}</span></div><div class="row featured-title"><h2>${esc(t.name)}</h2></div>${nextScheduleNote}<p class="subtle">${t.exercises.length} вправ · ${t.exercises.reduce((n,e)=>n+e.targetSets,0)} робочих підходів</p><div class="exercise-chips">${t.exercises.slice(0,3).map(e=>`<span>${esc(e.name)}</span>`).join('')}${t.exercises.length>3?`<span>+${t.exercises.length-3}</span>`:''}</div>${action('start',icon('play')+'<span>'+ctaLabel+'</span>',`data-id="${esc(t.id)}" ${t.exercises.length?'':'disabled'}`,'btn block')}${!t.exercises.length?`<div class="btn-row">${action('edit-template','Додати вправи до плану',`data-id="${esc(t.id)}"`,'btn alt block')}</div>`:''}</section>`:''}
 <section class="card week-card"><div class="row"><h2 class="section-heading">Тижневий календар</h2><span class="subtle">${d.days.filter(x=>x.count).length} із 7 днів</span></div><div class="week-grid">${d.days.map((x,i)=>`<div class="week-day"><span>${['Пн','Вт','Ср','Чт','Пт','Сб','Нд'][i]}</span><span class="week-dot ${x.count?'trained':''} ${x.today?'is-today':''}" aria-label="${x.key}: ${x.count?'виконано тренування':x.planned?'заплановано':'вільний день'}${x.today?', сьогодні':''}">${x.count?icon('check'):x.today?'●':x.planned?'·':''}</span></div>`).join('')}</div></section>
 <section class="card my-program-section"><div class="section-title"><h2>Моя програма</h2></div>
  ${state.templates.length?`<div class="program-rows">${state.templates.map(p=>`<div class="compact-plan"><span class="day-tile">${DAYS[p.day].slice(0,2)}</span><div class="template-info"><strong>${esc(p.name)}</strong><p class="tiny">${DAYS[p.day]} · ${p.exercises.length} вправ · ${p.exercises.reduce((n,e)=>n+e.targetSets,0)} підходів</p></div><div class="controls">${action('edit-template',icon('edit'),`data-id="${esc(p.id)}" aria-label="Редагувати ${esc(p.name)}"`,'icon-btn')}${!active&&p.id!==t?.id&&p.exercises.length?action('start',icon('play'),`data-id="${esc(p.id)}" aria-label="Почати ${esc(p.name)}"`,'icon-btn play-row-btn'):''}</div></div>`).join('')}</div>`:'<p class="subtle">Планів ще немає.</p>'}
  <div class="btn-row program-manage-actions">
   ${action('new-template',icon('plus')+'<span>Новий день</span>','','btn alt sm')}
   ${missingProgramDays(state).length?action('preview-program','Готова програма','','btn alt sm'):''}
   ${state.templates.some(p=>p.exercises.length)?action('share-program',icon('share')+'<span>Поділитися</span>','','btn alt sm'):''}
  </div>
 </section>
 <p class="data-notice">Локальне збереження на пристрої. Резервна копія — у налаштуваннях.</p>`;
}
export function completionDesign(state,w){
 const s=workoutSummary(state.history,w),best=s.prs.slice().sort((a,b)=>b.rm-a.rm)[0];
 return `<section class="completed-summary celebration"><div class="completion-heading"><span class="plan-badge">${icon('check')} Збережено на пристрої</span><h1 class="page-title">Тренування завершено</h1><p class="subtle">${esc(w.title)} · ${new Date(w.finishedAt).toLocaleDateString('uk-UA',{day:'numeric',month:'long'})}</p></div><div class="completion-grid completion-grid-3"><div><strong>${s.minutes} хв</strong><span>Тривалість</span></div><div><strong>${s.sets}</strong><span>Робочих підходів</span></div><div><strong>${num(s.volume)} кг</strong><span>Обсяг</span></div></div>
 ${best?`<div class="record-celebration"><div class="eyebrow">${icon('trophy')} Новий рекорд</div><h3>${esc(best.name)}</h3><div class="row"><strong>${num(best.set.weight)} кг × ${best.set.reps} повт.</strong><span class="tiny">${esc(best.labels.map(l=>l==='PR'?'Рекорд':l).join(' · '))}</span></div>${best.rm?`<div class="record-estimate"><span>Оцінка максимуму на 1 повторення (≈1RM)</span><strong>${num(best.rm)} кг</strong></div><p class="tiny">Формула Еплі за робочим підходом.</p>`:''}</div>`:''}
 ${comparison(state.history,w).length?`<div class="card comparison-card"><h2 class="section-heading">Порівняння з минулим разом</h2>${comparison(state.history,w).map(line=>`<p class="comparison">${esc(line)}</p>`).join('')}</div>`:''}
 <div class="completion-actions">${action('dismiss-summary',icon('check')+'<span>До історії тренувань</span>','','btn block')}${action('result-card',icon('share')+'<span>Поділитися карткою</span>',`data-id="${esc(w.id)}"`,'btn alt block')}</div></section>`;
}
export function restDesign(state,focusId){
 const focused=state.focusWorkout?focusExercise(state.session,focusId):null,next=(focused?nextSet({exercises:[focused]}):null)||nextSet(state.session),following=upcomingExercise(state.session, (focused||next?.exercise)?.id),e=next?.exercise,s=next?.set,target=next?.target||s;
 const restKindLabel=state.restKind==='exercise'?(following?`Відпочинок перед вправою «${esc(following.name)}»`:'Відпочинок між вправами'):state.restKind==='warmup'?'Відпочинок після розминки':'Відпочинок між підходами';
 return `<section class="rest-hud" aria-label="Відпочинок та наступний підхід"><header class="rest-hud-header">${action('close-modal',icon('close'),'aria-label="Повернутися до тренування"','icon-btn')}<span class="plan-badge">${restKindLabel}</span><span class="tiny">Таймер</span></header><div class="rest-dial"><svg viewBox="0 0 240 240" aria-hidden="true"><circle class="dial-track" cx="120" cy="120" r="110"/><circle id="restRing" class="dial-progress" cx="120" cy="120" r="110" pathLength="100"/></svg><div class="dial-text"><span class="subtle">Залишилося</span><strong id="restHudTimer" class="timer-expanded-digits" role="timer" aria-live="off"></strong><span id="restHudTotal" class="tiny"></span></div></div><div class="rest-shortcuts">${[-15,30,60].map(n=>action('rest-shift',(n>0?'+':'')+n+' с',`data-seconds="${n}"`,'btn alt sm')).join('')}${action('rest-stop','Пропустити','','btn alt sm')}</div>
 ${next?`<div class="card next-set-card"><div class="row"><span class="plan-badge">Наступний підхід · ${setLabel(e,next.index)}</span><span class="tiny">${s.type==='warmup'?'Розминка':'Робочий підхід'}</span></div><h2>${esc(e.name)}</h2><div class="next-set-metrics"><div><span>${next.target?'Ціль ваги':'Записана вага'}</span><strong>${target.weight!==''?num(target.weight)+' кг':'—'}</strong></div><div><span>Повторення</span><strong>${target.reps!==''?esc(target.reps)+' повт.':'—'}</strong></div></div>${e.weightBasis==='one-dumbbell'?'<p class="tiny">Вказана вага однієї гантелі</p>':`<details class="plate-calculator"><summary>${icon('dumbbell')} Розкладка дисків на штанзі</summary><p class="tiny">Для штанги (разом із грифом), диски на один бік.</p><label class="tiny">Вага грифа, кг<input id="plateBar" class="field" type="number" min="1" max="100" step="any" value="20" inputmode="decimal"></label><p id="plateResult" data-weight="${esc(target.weight)}"></p><p class="tiny">Диски: 25 / 20 / 15 / 10 / 5 / 2,5 / 1,25 кг</p></details>`}</div>`:'<div class="card"><h2>Усі підходи виконано</h2><p class="subtle">Відпочинь і переходь до завершення тренування.</p></div>'}
 ${following?`<div class="card upcoming-exercise"><div class="subtle">Далі за планом</div><strong>Далі: ${esc(following.name)}</strong>${equipmentText(following)?`<p class="tiny">${esc(equipmentText(following))}</p>`:''}</div>`:''}${action('rest-continue',icon('play')+'<span>'+(state.restKind==='exercise'&&following?'Перейти до «'+esc(following.name)+'»':next?'Повернутися до підходу':'Повернутися до тренування')+'</span>','','btn block')}</section>`;
}
