import {mascotScene,mascotSVG,mountMascot} from './recap-mascot.js';
import {buildRecap,kyivDay,periodFor,completedPeriod,recapArchive} from './recap.js';
import {recapNotice,unreadRecaps} from './recap-notices.js';
import {recapMuscleMap} from './progress-overview.js';

const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=new Intl.NumberFormat('uk-UA',{maximumFractionDigits:1});
const num=n=>fmt.format(n);
const signed=n=>(n>0?'+':'')+num(n);
export const RECAP_STATES={
 up:{title:'ТИ СТАЄШ СИЛЬНІШИМ!',caption:'Більшість зіставних вправ показала зростання.'},
 stable:{title:'ТИ ТРИМАЄШ ФОРМУ!',caption:'Загальна тенденція рівна або результати різноспрямовані.'},
 down:{title:'НЕ КОЖЕН ТИЖДЕНЬ — РЕКОРД!',caption:'У більшості зіставних вправ показники цього разу нижчі.'},
 insufficient:{title:'ПОТРІБНО БІЛЬШЕ ДАНИХ',caption:'Для загального висновку потрібно щонайменше дві зіставні вправи.'}
};

const button=(action,label,attributes='',style='btn alt')=>`<button type="button" class="${style}" data-action="${action}" ${attributes}>${label}</button>`;
const metrics=items=>`<dl class="recap-metrics">${items.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
const hint=content=>`<p class="recap-note">${content}</p>`;
const work=t=>metrics([['Обсяг',num(t.volume)+' кг'],['Повторення',num(t.reps)],['Робочі підходи',num(t.sets)]]);
const total=t=>metrics([['Тренування',num(t.workouts)],['Хвилини',num(t.minutes)],['Робочі підходи',num(t.sets)]]);
const unit=r=>r.metric==='reps'?'повт.':'кг ≈1RM';
const directionLabel={up:'Зростання',stable:'Стабільно',down:'Нижче'};

function sparkline(values,label,split){
 if(values.length<2)return '';
 if(values.length>120){
  split=split?Math.round(split*120/values.length):0;
  values=Array.from({length:120},(_,i)=>values[Math.round(i*(values.length-1)/119)]);
 }
 const min=Math.min(...values),max=Math.max(...values),range=max-min||1;
 const points=values.map((v,i)=>[7+166*i/(values.length-1),min===max?26:45-36*(v-min)/range]);
 return `<svg class="recap-sparkline" viewBox="0 0 180 55" role="img" aria-label="${html(label)}">${split?'<path class="recap-separator" d="M'+(7+166*(split-.5)/(values.length-1))+' 2v51"/>':''}<polyline points="${points.map(p=>p.join(',')).join(' ')}"/>${points.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2.5"/>`).join('')}</svg>`;
}
const deltas=(rows,empty='Поки немає результатів, які можна зіставити.')=>rows.length?
 `<div class="recap-list">${rows.map(r=>`<article data-direction="${r.direction}"><div><strong>${html(r.name)}</strong>
 ${r.setupLabel?`<small>${html(r.setupLabel)}</small>`:''}<small>${num(r.before)} → ${num(r.after)} ${unit(r)} · ${r.sampleCounts.join(' / ')} занять · ${directionLabel[r.direction]}</small></div>
 <b>${r.metric==='reps'?signed(r.after-r.before)+' повт.':signed(r.change)+'%'}</b>
 ${sparkline(r.values,r.values.map(num).join(' → ')+' '+unit(r),r.sampleCounts[0])}</article>`).join('')}</div>`:hint(empty);
const prText=p=>num(p.weight)+' кг × '+num(p.reps);
const prList=prs=>prs.length?`<ol class="recap-records">${prs.map((r,i)=>`<li style="--delay:${Math.min(i,8)*65}ms"><span aria-hidden="true">✦</span><div><strong>${html(r.name)}</strong><small>${prText(r.before)} → ${prText(r)}</small></div><b>+${num(r.delta)} ${r.metric==='weight'?'кг':'повт.'}</b></li>`).join('')}</ol>`:hint('У цьому періоді немає нових перевершених результатів.');
const awardList=rows=>rows.length?`<div class="recap-awards">${rows.map((a,i)=>`<article style="--delay:${i*90}ms"><span aria-hidden="true">✧</span><div><strong>${a.name}</strong><small>${a.rule}</small></div></article>`).join('')}</div>`:hint('Досягнення відкриваються за результатами з журналу.');
const methodology=()=>`<details class="recap-method"><summary>Як рахується динаміка</summary><p>Для обтяжень беремо найкращий ≈1RM за заняття і порівнюємо медіани. Формула Epley для 2–12 повторень: вага × (1 + повторення / 30). Для одного повторення беремо вагу напряму. Менше 2% різниці вважаємо стабільним результатом.</p><p>Для власної ваги й підтягувань зіставляємо повторення з тією самою додатковою вагою та допомогою. Зіставлення враховує ID вправи та записані параметри обладнання. Розминку й легкі заняття виключаємо.</p><p>Загальний напрям визначає більшість серед щонайменше двох вправ. Загальний відсоток показуємо за медіаною зіставних змін ≈1RM, якщо для принаймні двох вправ є по два заняття в обох періодах і напрям збігається.</p></details>`;

function discipline(r){
 const {consistency:c,totals:t,prior:p}=r;
 return metrics([['За графіком',c.planned===null?'—':c.matched+' / '+c.planned],['Тренувань',t.workouts],['Загальний час',t.minutes+' хв'],['Робочі підходи',t.sets],['Найдовша серія',c.streak+' тиж.']])+
 hint('Заплановані дні оцінено за поточними шаблонами. Зараховується заняття за відповідним шаблоном у його день.')+
 (p.workouts?hint(signed(t.workouts-p.workouts)+' тренувань до попереднього періоду.'):hint('Попередній період без тренувань для порівняння.'));
}

const bestPR=r=>[...r.prs].sort((a,b)=>b.delta/b.before.value-a.delta/a.before.value)[0];
function finalSlide(r){
 const p=bestPR(r);
 const leader=p?html(p.name)+' · '+prText(p):r.best?html(r.best.name)+' · '+r.best.sets+' роб. підходів':'—';
 return total(r.totals)+`<p class="recap-best">${leader}</p>`+hint(RECAP_STATES[r.strength.status].caption)+metrics([['Особисті рекорди',r.prs.length],['Досягнення',r.awards.length]])+awardList(r.awards)+
 `<div class="recap-share">${button('recap-share','Поділитися карткою','data-recap-share disabled','btn')}${button('recap-download','Зберегти PNG','data-recap-download disabled')}</div><p class="recap-note" data-recap-export-status role="status"></p>`;
}

function weeklyStrength(r){
 const rows=r.trends.filter(t=>t.points.length>=2);
 return rows.length?`<div class="recap-list">${rows.map(row=>{
  const values=r.weeks.map(week=>{
   const points=row.points.filter(p=>p.day>=week.start&&p.day<week.end).map(p=>p.value);
   return points.length?Math.max(...points):null;
  });
  const max=Math.max(1,...values.filter(v=>v!==null));
  return `<article><strong>${html(row.name)}</strong>${row.setupLabel?`<small>${html(row.setupLabel)}</small>`:''}
   <div class="recap-week-values">${values.map((v,i)=>`<span><i aria-hidden="true" style="--height:${v===null?0:Math.max(7,100*v/max)}%"></i><small>${r.weeks[i].label}</small><b>${v===null?'—':num(v)}</b></span>`).join('')}</div>
   <small>${unit(row)} · найкращий результат у кожному тижні</small></article>`;
 }).join('')}</div>`:hint('Потрібні повторні заняття з тим самим обладнанням.');
}

export function recapSlides(r){
 const monthly=r.period.kind==='month',status=RECAP_STATES[r.strength.status];
 const revealTitle=monthly&&r.strength.status==='down'?'НЕ КОЖЕН МІСЯЦЬ — РЕКОРД!':status.title;
 const state=r.strength.status;
 const decline=r.strength.rows.find(row=>row.direction==='down'&&row.before>0);
 const delta=r.strength.delta;
 const upProp=delta!==null?{kind:'score',value:signed(delta)+'%',label:'медіана змін ≈1RM'}:
  {kind:'score',value:r.strength.comparable+' зіставних вправ',label:'Силова динаміка'};
 const downProp=decline?{kind:'graph',label:decline.name, before:decline.before,after:decline.after,
  value:num(decline.before)+' → '+num(decline.after)+' '+unit(decline)}:null;
 const slides=[
  {title:r.period.intro,scene:{state:'idle'},hero:true,body:hint(html(r.period.label))},
  {title:revealTitle,scene:{state,prop:state==='up'?upProp:state==='down'?downProp:null},hero:true,
   body:(delta!==null&&state!=='up'?`<p class="recap-reveal-number">${signed(delta)}% <small>медіана змін ≈1RM</small></p>`:'')+
    hint(status.caption)+hint(r.strength.comparable+' зіставних вправ')},
 ];
 const disciplineSlide={title:'Дисципліна',body:discipline(r)};
 const pr=bestPR(r);
 const recordsSlide={title:'Особисті рекорди',scene:pr?{state:'record',
  prop:{kind:'record',value:prText(pr),label:pr.name}}:null,body:prList(r.prs)};
 const dynamics={title:'Силова динаміка',body:deltas(r.strength.rows)+methodology()};
 const workload={title:'Виконана робота',body:work(r.totals)+(r.prior.workouts?metrics([['Зміна обсягу',signed(r.totals.volume-r.prior.volume)+' кг'],['Зміна повторів',signed(r.totals.reps-r.prior.reps)],['Зміна підходів',signed(r.totals.sets-r.prior.sets)]]):'')+hint('Тоннаж показує виконану роботу. Силова динаміка рахується окремо.')};
 const muscle={title:'М’язові групи',body:recapMuscleMap(r.muscles)};
 const finish={title:'Твій RECAP',scene:r.totals.workouts?{state:'celebration'}:null,body:finalSlide(r)};
 if(!monthly)return [...slides,disciplineSlide,recordsSlide,dynamics,workload,muscle,finish];
 const biggest=r.strength.rows.filter(x=>x.direction==='up').sort((a,b)=>b.change-a.change)[0];
 const facts=hint(r.frequent?'Найчастіша вправа — '+html(r.frequent.name)+' · '+r.frequent.sessions.size+' занять.':'За цей місяць журнал порожній.')+
  (r.totals.days?hint('Ти тренувався у '+num(r.totals.days)+' різні дні та виконав '+num(r.totals.sets)+' робочих підходів.'): '');
 return [...slides,{title:'Місяць у цифрах',body:total(r.totals)+work(r.totals)+facts},
  {title:'Сила за тижнями',body:weeklyStrength(r)+methodology()},
  {title:'Найбільший прогрес',body:deltas(biggest?[biggest]:[],'За доступними записами немає зіставного зростання.')},
  recordsSlide,{title:'Початок і кінець місяця',body:deltas(r.half)+hint('Порівняно першу та другу половини календарного місяця.')},
  disciplineSlide,muscle,{title:'Найкраще тренування',body:r.best?`<p class="recap-best">${html(r.best.name)}</p>`+metrics([['Дата',r.best.day],['Рекорди',r.best.prs],['Робочі підходи',r.best.sets]])+hint('Пріоритет за кількістю рекордів, далі за робочими підходами.') :hint('У цьому місяці тренувань немає.')},
  {title:'Твої досягнення',body:awardList(r.awards)},finish];
}

export function recapInbox(history,prefs,today=kyivDay(Date.now()),archive=recapArchive(history,today)){
 if(!prefs.enabled)return '';
 const unread=unreadRecaps(archive,prefs,today);
 return unread.length?`<section class="recap-inbox" aria-label="Нові підсумки">${unread.map(p=>`<div class="card"><p>${recapNotice(p.kind)}</p>${button('recap-open','Відкрити RECAP',`data-id="${p.id}"`,'btn sm')}</div>`).join('')}</section>`:'';
}

function trends(r,index){
 const rows=r.trends.filter(t=>t.points.length>=2);
 if(!rows.length)return hint('Додай повторні заняття з однаковим обладнанням, щоб побачити графік.');
 const row=rows[index]||rows[0],values=row.points.map(p=>p.value);
 return `<label class="filter-label">Вправа <select id="recap-trend" class="field">${rows.map((t,i)=>`<option value="${i}" ${t===row?'selected':''}>${html(t.name)}${t.setupLabel?' · '+html(t.setupLabel):''}</option>`).join('')}</select></label>
 ${sparkline(values,values.length+' занять, від '+num(values[0])+' до '+num(values.at(-1))+' '+unit(row))}
 ${hint(html(row.points[0].day)+' · '+num(values[0])+' → '+html(row.points.at(-1).day)+' · '+num(values.at(-1))+' '+unit(row))}
 <details><summary>Результати за датами</summary><ol>${row.points.map(p=>`<li>${html(p.day)} · ${num(p.value)} ${unit(row)}</li>`).join('')}</ol></details>${methodology()}`;
}

export function recapHub(state,ui){
 const today=kyivDay(Date.now()),mode=ui.recapMode||'week',archive=recapArchive(state.history,today);
 const period=periodFor(mode==='month'?'month':mode==='all'?'all':'week',today);
 const report=mode==='archive'?null:buildRecap(state,period,today);
 return `<section class="recap-hub"><header><p class="recap-brand">СЕТ RECAP</p><h2>Твій прогрес у часі</h2></header>
 <div class="recap-filters" role="group" aria-label="Період RECAP">${[['week','Тиждень'],['month','Місяць'],['all','Весь час'],['archive','Архів']].map(([k,label])=>button('recap-filter',label,`data-id="${k}" aria-pressed="${mode===k}"`,'btn alt sm')).join('')}</div>
 ${recapInbox(state.history,ui.recapPrefs??{enabled:true,seen:[]},today,archive)}
 ${report?`<div class="card"><h3>${mode==='week'?'Поточний тиждень':mode==='month'?'Поточний місяць':'Загальна історія'}</h3>${hint(html(period.label))}${total(report.totals)}${mode==='all'?work(report.totals)+trends(report,ui.recapTrend):deltas(report.strength.rows)+methodology()}</div>`:''}
 ${mode==='archive'?archive.length?`<div class="recap-archive">${archive.map(p=>`<article class="card"><div><strong>${p.kind==='week'?'Тиждень':'Місяць'}</strong><small>${html(p.label)} · ${p.count} трен.</small></div>${button('recap-open','Переглянути',`data-id="${p.id}"`,'btn alt sm')}</article>`).join('')}</div>`:hint('Підсумки з’являться після завершення періоду з тренуваннями.'):
 archive.length?button('recap-filter','Архів підсумків', 'data-id="archive"','btn alt block'):''}</section>`;
}

export function recapSettings(prefs,connected,supported,status){
 return `<section class="card recap-settings"><h2 class="section-heading">Сповіщення СЕТ RECAP</h2>
 <label class="toggle-setting"><span>Повідомлення у СЕТ</span><input id="recap-inapp" type="checkbox" ${prefs.enabled?'checked':''}></label>
 <label class="toggle-setting"><span>Фонові сповіщення RECAP</span><input id="recap-push" type="checkbox" ${prefs.push?'checked':''} ${connected&&supported?'':'disabled'}></label>
 <p class="helper" id="recap-push-status" role="status">${html(!connected?'Спочатку підключи фонові сповіщення СЕТ.':!supported?'Потрібне оновлення сервера сповіщень для RECAP.':status||'Заплануй сигнал для поточного періоду з тренуваннями.')}</p></section>`;
}
export function reportFromId(state,id){
 const period=completedPeriod(id);
 return period?buildRecap(state,period):null;
}

async function drawExportMascot(g,state){
 const source=new Blob([mascotSVG(state,{card:true})],{type:'image/svg+xml'});
 const url=URL.createObjectURL(source);
 try{
  const avatar=new Image();
  await new Promise((resolve,reject)=>{avatar.onload=resolve;avatar.onerror=reject;avatar.src=url;});
  g.drawImage(avatar,230,203,620,475);
 }finally{URL.revokeObjectURL(url);}
}

async function exportCard(report){
 const canvas=document.createElement('canvas');
 canvas.width=1080;canvas.height=1350;
 const g=canvas.getContext('2d');
 if(!g)return Promise.reject(Error('PNG недоступний.'));
 const {period,totals,prs,awards,strength}=report;
 const accent={up:'#c8f542',stable:'#ffcf76',down:'#ff9e91',insufficient:'#c7b9ef'}[strength.status];
 const bg=g.createLinearGradient(0,0,1080,1350);bg.addColorStop(0,'#20291a');bg.addColorStop(1,'#141515');
 g.fillStyle=bg;g.fillRect(0,0,1080,1350);
 const line=(value,size,x,y,color='#f7f7ed',max=928)=>{
  g.fillStyle=color;g.font='700 '+size+'px system-ui';g.fillText(value,x,y,max);
 };
 line('СЕТ RECAP',52,76,125,accent);
 line(period.label,42,76,200);
 await drawExportMascot(g,strength.status);
 const headline=period.kind==='month'&&strength.status==='down'?'НЕ КОЖЕН МІСЯЦЬ — РЕКОРД!':RECAP_STATES[strength.status].title;
 line(headline,60,76,695);
 line(totals.workouts+' трен.   ·   '+totals.sets+' підходів   ·   '+prs.length+' рек.',44,76,800,accent);
 const p=bestPR(report);
 if(p)line(p.name+' · '+prText(p),42,76,900);
 else if(report.best)line(report.best.name+' · '+report.best.sets+' роб. підходів',42,76,900);
 awards.forEach((a,i)=>line('✧  '+a.name,32,76,980+i*46));
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Не вдалося створити PNG.')),'image/png'));
}

export function showRecap(report,{demo=false}={}){
 const slides=recapSlides(report);
 const dialog=document.createElement('dialog');
 dialog.className='recap-dialog';
 dialog.setAttribute('aria-labelledby','recap-slide-title');
 const opener=document.activeElement;
 let index=0,blob=null,pending=null,url=null,animator=null;
 const updateExport=()=>{
  if(index!==slides.length-1)return;
  const save=dialog.querySelector('[data-recap-download]'),share=dialog.querySelector('[data-recap-share]');
  if(!blob)return;
  save.disabled=false;
  try{share.disabled=!(navigator.share&&navigator.canShare?.({files:[new File([blob],'SET-RECAP.png',{type:'image/png'})]}));}
  catch{share.disabled=true;}
  if(share.disabled)share.hidden=true;
 };
 const status=message=>{const node=dialog.querySelector('[data-recap-export-status]');if(node)node.textContent=message;};
 const display=()=>{
  animator?.dispose();animator=null;
  const slide=slides[index],scene=slide.scene;
  dialog.innerHTML=`<div class="recap-shell"><header class="recap-top"><div class="recap-segments" role="progressbar" aria-label="Прогрес підсумку" aria-valuemin="1" aria-valuemax="${slides.length}" aria-valuenow="${index+1}">${slides.map((_,i)=>`<i class="${i<=index?'is-read':''}"></i>`).join('')}</div>
   <div class="recap-topline"><span>${demo?'ДЕМО · ':'СЕТ RECAP · '}${html(report.period.label)}</span><button type="button" class="icon-btn" data-recap-control="close" aria-label="Закрити RECAP">×</button></div></header>
   <main class="recap-slide ${slide.hero?'recap-hero':''} ${scene?'mascot-recap-slide':''}" tabindex="-1">
   ${slide.hero&&scene?mascotScene(scene):''}<h2 id="recap-slide-title" tabindex="-1">${slide.title}</h2>
   ${!slide.hero&&scene?mascotScene(scene):''}
   ${scene?`<div class="mascot-controls"><button class="text-btn" type="button" data-recap-control="pause-motion">Пауза</button>
    <button class="text-btn" type="button" data-recap-control="skip-motion">Пропустити анімацію</button>
    <button class="text-btn" type="button" data-recap-control="replay-motion" hidden>Повторити анімацію</button></div>`:''}
   ${slide.body}</main>
   <footer class="recap-footer"><button class="btn alt" type="button" data-recap-control="back" ${index===0?'disabled':''}>Назад</button>
   ${index<2?'<button class="text-btn" type="button" data-recap-control="skip">До статистики</button>':'<span>'+ (index+1)+' / '+slides.length+'</span>'}
   <button class="btn" type="button" data-recap-control="next">${index===slides.length-1?'Готово':'Далі'}</button></footer></div>`;
  if(scene){
   animator=mountMascot(dialog.querySelector('.mascot-scene'),{
    onMotionChange(reduced,completed){
     if(completed)dialog.querySelector('[data-recap-control="replay-motion"]').hidden=reduced;
    },
    onComplete:()=>{
    const pause=dialog.querySelector('[data-recap-control="pause-motion"]');
    const skip=dialog.querySelector('[data-recap-control="skip-motion"]');
    const replay=dialog.querySelector('[data-recap-control="replay-motion"]');
    const keepFocus=[pause,skip].includes(document.activeElement);
    pause.hidden=skip.hidden=true;
    replay.hidden=Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    if(keepFocus)(replay.hidden?dialog.querySelector('[data-recap-control="next"]'):replay).focus();
   }});
  }
  dialog.querySelector('#recap-slide-title').focus({preventScroll:true});
  if(index===slides.length-1){
   if(!pending)pending=Promise.resolve().then(()=>exportCard(report)).then(value=>{blob=value;updateExport();}).catch(e=>status(e.message));
   updateExport();
  }
 };
 dialog.addEventListener('click',event=>{
  const target=event.target.closest('button');
  if(!target||target.disabled)return;
  const action=target.dataset.recapControl||target.dataset.action;
  if(action==='close'||(action==='next'&&index===slides.length-1)){dialog.close();return;}
  if(['next','back','skip'].includes(action)){
   index=action==='skip'?2:index+(action==='next'?1:-1);
   display();return;
  }
  if(action==='pause-motion'){target.textContent=animator?.pause()?'Продовжити':'Пауза';return;}
  if(action==='skip-motion'){animator?.skip();return;}
  if(action==='replay-motion'){
   for(const mode of ['pause-motion','skip-motion'])dialog.querySelector('[data-recap-control="'+mode+'"]').hidden=false;
   const pause=dialog.querySelector('[data-recap-control="pause-motion"]');
   pause.textContent='Пауза';target.hidden=true;pause.focus();animator?.restart();return;
  }
  if(action==='recap-share'&&blob){
   const file=new File([blob],'SET-RECAP.png',{type:'image/png'});
   navigator.share({title:'СЕТ RECAP',files:[file]}).catch(e=>{if(e.name!=='AbortError')status('Спробуй зберегти PNG.');});
  }
  if(action==='recap-download'&&blob){
   url??=URL.createObjectURL(blob);
   const anchor=document.createElement('a');anchor.href=url;anchor.download='SET-RECAP.png';anchor.click();
  }
 });
 dialog.addEventListener('keydown',event=>{
  if(event.target.matches('input,select,textarea,summary'))return;
  if(event.key==='ArrowRight'&&index<slides.length-1){event.preventDefault();index++;display();}
  if(event.key==='ArrowLeft'&&index>0){event.preventDefault();index--;display();}
 });
 dialog.addEventListener('close',()=>{
  animator?.dispose();animator=null;
  if(url)setTimeout(()=>URL.revokeObjectURL(url),30000);
  dialog.remove();document.body.classList.remove('recap-open');
  if(opener?.isConnected)opener.focus();
  else document.querySelector('[data-action="recap-filter"][aria-pressed="true"]')?.focus();
 },{once:true});
 document.body.append(dialog);document.body.classList.add('recap-open');
 dialog.showModal();display();
}
