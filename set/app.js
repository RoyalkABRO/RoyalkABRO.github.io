import {PushNotifications,classifyPushState} from './js/push-notifications.js';
import {muscleField} from './js/muscles.js';
import {exerciseOrderForm,bindExerciseOrder,reorderExercises} from './js/exercise-order.js';
import {compactTiming,restBarView} from './js/simple-views.js';
import {focusExercise,upcomingExercise,replaceExercise,applyWarmup,warmupSuggestion,forecastSession,optionalSets,restAfterSet} from './js/workout-tools.js';
import {equipmentFields,replacementForm,warmupForm,warmupRows,extrasForm} from './js/workout-tools-views.js';
import {restDesign} from './js/design-views.js';
import {barbellPlates} from './js/dashboard.js';
import {isWorking,workingSets,suggestGoal,applyGoal,canOfferExtra} from './js/progression.js';
import {historyCSV,workoutImage} from './js/exports.js';
import {WorkoutWakeLock} from './js/wake-lock.js';
import {Repository} from './js/storage.js';
import {fresh,normalize,clone,uid,getOrCreateExercise,validSet,startSession,finishSession,moveItem} from './js/model.js';
import {renderView,renderNavigation,renderFocusedExercise,goalForm,shareProgramForm,templateForm,historyDetail,historyEditor,catalogList,esc,button,programPreview} from './js/views.js';
import {programText} from './js/share.js';
import {addPersonalProgram} from './js/programs.js';
import {remaining,formatClock,unlockSound,beep} from './js/timer.js';
import {setupPWA,checkOffline,requestPersistence} from './js/pwa.js';
import {icon} from './js/icons.js';

const app=document.getElementById('app'),modal=document.getElementById('modal'),modalContent=document.getElementById('modalContent');
const notice=document.getElementById('notice'),noticeText=document.getElementById('noticeText');
const navigation=document.getElementById('navigation');
const repo=new Repository();
let state,queue=Promise.resolve(),pending=0,failed=false,stale=false,toastHandle,draft=null,draftBaseline='',historyDraft=null,historyBaseline='',modalMode='',timerNotified=null,resultFile=null,resultURL=null;
const ui={tab:'home',historyDays:0,historyMode:'list',progressDays:0,progressDetailsOpen:false,metric:'weight',exerciseId:null,offlineStatus:'Перевіряємо офлайн-готовність…',storageStatus:'Сховище на пристрої'};

function updatePushStatus(info){
  Object.assign(ui,{pushStatus:info.message,pushConnected:info.connected,pushReady:info.ready,pushURL:info.url});
  for(const id of ['notificationStatus','restNotificationStatus']){
    const el=document.getElementById(id);
    if(el){el.textContent=info.message;if(id==='restNotificationStatus')el.hidden=!info.connected;}
  }
  const badge=document.getElementById('notificationBadge'),hint=document.getElementById('notificationHint');
  if(badge||hint){
    const st=classifyPushState(ui);
    if(badge){badge.textContent=st.badge;badge.className='status-badge status-'+st.kind;}
    if(hint)hint.textContent=st.hint+' Сигнал після відпочинку працює навіть зі згорнутим СЕТ.';
  }
  for(const [id,hidden] of [['pushEnable',info.connected||!info.ready],['pushTest',!info.connected],['pushDisable',!info.connected],['pushPairing',info.connected],['pushRetry',info.ready]]){
    const el=document.getElementById(id);if(el)el.hidden=hidden;
  }
}
const pushNotifications=new PushNotifications({onStatus:updatePushStatus});
function syncPush(){if(state&&!failed&&!stale)void pushNotifications.sync(state);}
let undoRecord=null,undoHandle,orderCleanup=null;
function clearUndo(){undoRecord=null;clearTimeout(undoHandle);document.getElementById('undoBar').hidden=true;}
function offerUndo(before,label,tab,focusId,sessionOnly=false){
  clearUndo();
  undoRecord={state:before,sessionOnly,revision:repo.revision,expires:Date.now()+20000,tab,focusId};
  document.getElementById('undoLabel').textContent=label;
  document.getElementById('undoBar').hidden=false;
  undoHandle=setTimeout(clearUndo,20000);
}
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('set-workout-updates'):null;
function toast(message){
  if(!message)return;
  const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');
  clearTimeout(toastHandle);toastHandle=setTimeout(()=>el.classList.remove('show'),3200);
}
function showError(error){noticeText.textContent=error?.message||String(error);notice.hidden=false;}
function saveStatus(){
  const target=document.getElementById('saveStatus');
  if(target)target.textContent=stale?'Є зміни в іншому вікні':failed?'Є незбережені зміни':pending?'Збереження…':'Збережено на пристрої';
}
const wakeLock=new WorkoutWakeLock(navigator,document,message=>{const target=document.getElementById('wakeStatus');if(target)target.textContent=message;});
function syncWakeLock(){wakeLock.sync(Boolean(state?.keepAwake&&state.session&&ui.tab==='workout')).catch(()=>{});}

function updateWorkoutProgress(){
  const rail=document.getElementById('workoutProgress');
  const sets=state?.session?.exercises.flatMap(workingSets)||[];
  const total=sets.length,done=sets.filter(s=>s.done).length;
  const ratio=total?done/total:0,percent=done===total&&total?100:Math.min(99,Math.round(ratio*100));
  rail.hidden=ui.tab!=='workout'||!state?.session||total===0;
  rail.style.setProperty('--workout-progress',String(ratio));
  rail.classList.toggle('is-complete',total>0&&done===total);
  rail.classList.toggle('has-progress',done>0);
  rail.setAttribute('aria-valuemax',String(total||1));
  rail.setAttribute('aria-valuenow',String(done));
  rail.setAttribute('aria-valuetext',done+' з '+total+' робочих підходів · '+percent+'%');
  rail.querySelector('.workout-progress-percent').textContent=percent+'%';
  const summary=document.getElementById('workoutProgressSummary');
  if(summary)summary.textContent=total?done+' / '+total+' робочих підходів':'Додай робочі підходи';
}

function updateFinishButtonDOM(){
  const finishBox=document.getElementById('workoutFinishSection');
  if(!finishBox||!state?.session)return;
  const w=state.session,allWorking=w.exercises.flatMap(workingSets),allDone=allWorking.length>0&&allWorking.every(s=>s.done);
  const unmarkedCount=w.exercises.reduce((n,e)=>n+e.sets.filter(s=>!s.done).length,0);
  finishBox.innerHTML=allDone
    ?button('finish-workout',icon('check')+'<span>Завершити тренування</span>','','btn block finish-primary')
    :button('finish-workout','Завершити тренування достроково'+(unmarkedCount?' (не позначено '+unmarkedCount+')':''),'','btn alt block finish-secondary');
}

function updateExerciseCardDOM(){
  if(ui.tab!=='workout'||!state?.session){render();return;}
  const w=state.session,focused=focusExercise(w,ui.focusId),index=w.exercises.indexOf(focused);
  const currentCard=app.querySelector('.simple-exercise');
  if(!focused||!currentCard){render();return;}
  const activeEl=document.activeElement;
  const focusSelector=activeEl?.dataset?.set&&activeEl?.dataset?.field?`[data-set="${activeEl.dataset.set}"][data-field="${activeEl.dataset.field}"]`:null;
  const selStart=activeEl?.selectionStart,selEnd=activeEl?.selectionEnd;
  const y=window.scrollY;
  currentCard.outerHTML=renderFocusedExercise(state,focused,index,w.exercises.length);
  const dock=document.getElementById('restSlot');
  if(dock)dock.outerHTML=restBarView(state);
  updateFinishButtonDOM();
  updateWorkoutProgress();saveStatus();updateTimer();
  if(focusSelector){
    const restored=app.querySelector(focusSelector);
    if(restored){restored.focus({preventScroll:true});try{if(selStart!=null)restored.setSelectionRange(selStart,selEnd);}catch{}}
  }
  if(window.scrollY!==y)window.scrollTo(0,y);
}

function render(){
  const activeEl=document.activeElement;
  const focusSelector=activeEl?.dataset?.set&&activeEl?.dataset?.field?`[data-set="${activeEl.dataset.set}"][data-field="${activeEl.dataset.field}"]`:null;
  const selStart=activeEl?.selectionStart,selEnd=activeEl?.selectionEnd;
  if(state?.session&&state.focusWorkout)ui.focusId=focusExercise(state.session,ui.focusId)?.id;
  app.innerHTML=renderView(state,ui);
  if(ui.tab==='workout'&&state?.session){
    const line=document.createElement('p');line.id='restNotificationStatus';line.className='helper';line.hidden=!ui.pushConnected;line.textContent=ui.pushStatus||'';
    app.querySelector('.simple-workout')?.append(line);
  }
  if(!navigation.childElementCount)navigation.innerHTML=renderNavigation();
  const current=ui.tab==='workout'?'home':ui.tab;
  for(const tab of navigation.querySelectorAll('[data-tab]')){
    const active=tab.dataset.tab===current;tab.classList.toggle('active',active);
    if(active)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
  }
  navigation.hidden=false;updateWorkoutProgress();saveStatus();updateTimer();syncWakeLock();
  if(focusSelector){
    const restored=app.querySelector(focusSelector);
    if(restored){restored.focus({preventScroll:true});try{if(selStart!=null)restored.setSelectionRange(selStart,selEnd);}catch{}}
  }
}

function cloneForCommit(source,sessionOnly){
  if(!sessionOnly)return clone(source);
  return {...source,catalog:clone(source.catalog),session:clone(source.session)};
}

function commit(mutator,{redraw=true,cardOnly=false,preserve=false,undoLabel=null,sessionOnly=false}={}) {
  pending++;saveStatus();
  const task=queue.then(async()=>{
    if(stale)throw new Error('Дані змінені в іншому вікні. Збережи копію й перезавантаж СЕТ.');
    const before=undoLabel?cloneForCommit(state,sessionOnly):null,undoTab=ui.tab,undoFocus=ui.focusId;
    const next=cloneForCommit(state,sessionOnly);mutator(next);
    try {
      const saved=await repo.write(next,{sessionOnly});state=saved;failed=false;syncPush();
      clearUndo();if(undoLabel)offerUndo(before,undoLabel,undoTab,undoFocus,sessionOnly);
      if(!stale)notice.hidden=true;
      channel?.postMessage({revision:repo.revision});
    } catch(error){if(preserve){clearUndo();state=next;updateWorkoutProgress();}failed=true;throw error;}
    if(cardOnly&&ui.tab==='workout'&&state?.session)updateExerciseCardDOM();
    else if(redraw)render();
    else updateWorkoutProgress();
  }).catch(error=>{showError(error);throw error;}).finally(()=>{pending--;saveStatus();});
  queue=task.catch(()=>{});return task;
}

function openModal(html,mode){modalContent.innerHTML=html;modalMode=mode;if(!modal.open)modal.showModal();}
function syncDraft(){
  if(!draft)return;const name=document.getElementById('template-name');if(!name)return;
  draft.name=name.value;draft.day=Number(document.getElementById('template-day').value);draft.addName=document.getElementById('template-add-name').value;
  for(const root of modalContent.querySelectorAll('[data-draft-ex]')){
    const e=draft.exercises.find(x=>x.id===root.dataset.draftEx);if(!e)continue;
    for(const input of root.querySelectorAll('[data-target]')){
      if(input.dataset.target==='targetReps'){e.targetRepsUnspecified=input.value==='';e.targetReps=input.value===''?8:Number(input.value);}
      else if(input.dataset.target==='targetRepsMax'){if(input.value==='')delete e.targetRepsMax;else e.targetRepsMax=Number(input.value);}
      else e[input.dataset.target]=Number(input.value);
    }
  }
}
function syncHistoryDraft(){
  if(!historyDraft)return;const title=document.getElementById('history-title');if(!title)return;
  historyDraft.title=title.value;historyDraft.note=document.querySelector('[data-history-workout-note]')?.value||'';
  for(const x of modalContent.querySelectorAll('[data-history-note-ex]')){const e=historyDraft.exercises.find(e=>e.id===x.dataset.historyNoteEx);if(e)e.note=x.value;}
  for(const x of modalContent.querySelectorAll('[data-history-rir]')){const set=historyDraft.exercises.find(e=>e.id===x.dataset.ex)?.sets.find(s=>s.id===x.dataset.set);if(set)set.rir=x.value===''?null:Number(x.value);}
  const date=document.getElementById('history-date').value;
  if(date){const startedAt=new Date(date);if(!Number.isNaN(startedAt.getTime())){const duration=Date.parse(historyDraft.finishedAt)-Date.parse(historyDraft.startedAt);historyDraft.startedAt=startedAt.toISOString();historyDraft.finishedAt=new Date(startedAt.getTime()+duration).toISOString();}}
  for(const input of modalContent.querySelectorAll('[data-set][data-field]')){const set=historyDraft.exercises.find(e=>e.id===input.dataset.ex)?.sets.find(s=>s.id===input.dataset.set);if(set)set[input.dataset.field]=input.value.replace(',','.');}
}
function isModalDirty(){
  if(modalMode==='template'&&draft){syncDraft();return JSON.stringify(draft)!==draftBaseline;}
  if(modalMode==='history-edit'&&historyDraft){syncHistoryDraft();return JSON.stringify(historyDraft)!==historyBaseline;}
  return false;
}
function closeModal(force=false){
  orderCleanup?.();orderCleanup=null;modal.classList.remove('rest-dialog');
  if(!force&&isModalDirty()&&!confirm('Закрити редактор без збереження внесених змін?'))return;
  modal.close();if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;resultFile=null;
  modalContent.innerHTML='';modalMode='';draft=null;draftBaseline='';historyDraft=null;historyBaseline='';
}
function editTemplate(id){
  const source=state.templates.find(t=>t.id===id);
  draft=source?{...clone(source),isNew:false,addName:''}:{id:uid(),name:'',day:new Date().getDay(),exercises:[],isNew:true,addName:''};
  draftBaseline=JSON.stringify(draft);
  openModal(templateForm(draft,state),'template');
}
function download(text,name,type='application/json'){const url=URL.createObjectURL(text instanceof Blob?text:new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function backup(value=state,prefix='set-backup'){download(JSON.stringify({...value,exportedAt:new Date().toISOString()},null,2),`${prefix}-${new Date().toISOString().slice(0,10)}.json`);}
async function exportBackup(){await queue;backup();toast(failed?'Копія містить також незбережені зміни':'Файл резервної копії підготовлено');if(!failed&&!stale)await commit(s=>{s.lastBackupAt=new Date().toISOString();},{redraw:ui.tab==='settings',sessionOnly:true});}
async function importBackup(file){if(!file)return;try{if(file.size>30*1024*1024)throw new Error('Файл більший за 30 МБ');const incoming=normalize(JSON.parse(await file.text()));await queue;if(!confirm(`Відновити ${incoming.templates.length} планів і ${incoming.history.length} тренувань? Поточні дані будуть замінені. Спочатку завантажиться їхня резервна копія.`))return;backup(state,'set-before-import');await commit(s=>{Object.keys(s).forEach(key=>delete s[key]);Object.assign(s,incoming);});ui.tab=state.session?'workout':'home';render();toast('Дані перевірено й відновлено');}catch(error){showError(new Error(`Не вдалося імпортувати: ${error.message}`));}finally{const input=document.getElementById('backup-file');if(input)input.value='';}}
function sessionExercise(s,id){const found=s.session?.exercises.find(e=>e.id===id);if(!found)throw new Error('Вправу не знайдено');return found;}
function sessionSet(s,ex,id){const found=sessionExercise(s,ex).sets.find(x=>x.id===id);if(!found)throw new Error('Підхід не знайдено');return found;}
function displayDraft(){openModal(templateForm(draft,state),'template');}

async function copyProgramText(){
  const preview=document.getElementById('share-text');if(!preview?.value)return;
  const status=document.getElementById('share-status');
  try{await navigator.clipboard.writeText(preview.value);status.textContent='Текст скопійовано';}
  catch{preview.focus();preview.select();status.textContent='Затисни виділений текст і вибери «Копіювати»';}
}
async function shareProgramText(){
  const text=document.getElementById('share-text')?.value;if(!text)return;
  document.getElementById('share-status').textContent='';
  const data={title:'Моя програма тренувань — СЕТ',text};
  if(typeof navigator.share==='function'){
    try{await navigator.share(data);return;}catch(error){if(error.name==='AbortError')return;}
  }
  await copyProgramText();
}
async function showResultCard(id){
 await queue;const w=state.history.find(w=>w.id===id);if(!w)return;
 const blob=await workoutImage(w,state.history);if(resultURL)URL.revokeObjectURL(resultURL);
 resultFile=new File([blob],'set-'+w.finishedAt.slice(0,10)+'.png',{type:'image/png'});resultURL=URL.createObjectURL(blob);
 openModal(button('close-modal','×','aria-label="Закрити"','modal-close')+'<h2>Твоє тренування</h2><img id="result-preview" alt="Картка результату тренування" src="'+resultURL+'"><div class="result-actions">'+button('share-result','Поділитися','','btn')+button('save-result','Завантажити PNG','','btn alt')+'</div><p class="helper" id="result-status" role="status">Картка 1080 × 1920 для сторіз. Особисті нотатки не додаються.</p>','result-card');
}
function openExerciseConfig(id){
  const e=state.catalog.find(e=>e.id===id);if(!e)return;
  openModal(button('close-modal','×','aria-label="Закрити"','modal-close')+'<h2>Налаштування вправи</h2><p class="scope-badge">Змінюється в каталозі для поточних і майбутніх занять</p><form id="rename-form" data-id="'+esc(id)+'"><label class="filter-label">Назва<input id="exercise-new-name" class="field" maxlength="90" required value="'+esc(e.name)+'"></label><label class="filter-label">Крок ваги, кг<input id="exercise-weight-step" class="field" type="number" inputmode="decimal" min="0.001" max="1000" step="any" placeholder="Наприклад, 2.5" value="'+esc(e.weightStep??'')+'"></label><label class="filter-label">Як записуєш вагу<select id="exercise-weight-basis" class="field"><option value="total" '+(e.weightBasis!=='one-dumbbell'?'selected':'')+'>Загальна вага (штанга / тренажер)</option><option value="one-dumbbell" '+(e.weightBasis==='one-dumbbell'?'selected':'')+'>Вага однієї гантелі</option></select></label>'+equipmentFields(e)+muscleField(e)+'<p class="helper">Для гантелей вводиться вага однієї гантелі в кілограмах (обсяг рахується без подвоєння).</p><button type="submit" class="btn block">Зберегти</button></form>','rename');
}

function showSetFieldError(exId,setId,setObj){
  const errEl=app.querySelector(`[data-set-error="${setId}"]`);
  const block=app.querySelector(`[data-set-block="${setId}"]`);
  const wVal=String(setObj.weight??'').trim(),rVal=String(setObj.reps??'').trim();
  const wValid=/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(wVal)&&Number.isFinite(Number(wVal))&&Number(wVal)>=0&&Number(wVal)<=10000;
  const rValid=/^\d+$/.test(rVal)&&Number.isInteger(Number(rVal))&&Number(rVal)>0&&Number(rVal)<=1000;
  let msg='Вкажи коректну вагу та повторення';
  if(!wValid&&!rValid)msg='Введи вагу (0–10000 кг) і повторення (1–1000)';
  else if(!wValid)msg='Введи вагу від 0 до 10000 кг';
  else if(!rValid)msg='Введи кількість повторень (1–1000)';
  if(errEl){errEl.textContent=msg;errEl.hidden=false;}
  if(block){
    const field=!wValid?'weight':'reps';
    const input=block.querySelector(`[data-field="${field}"]`);
    if(input){input.classList.add('is-invalid');input.focus();}
  }
}

async function handleAction(b){
  const action=b.dataset.action,id=b.dataset.id;unlockSound();
  if(action.startsWith('push-')){if(b.dataset.busy)return;b.dataset.busy='1';b.disabled=true;try{
    if(action==='push-enable'){const code=document.getElementById('pushPairingCode')?.value||'';await pushNotifications.enable(code);const field=document.getElementById('pushPairingCode');if(field)field.value='';await queue;syncPush();}
    if(action==='push-connect'){await pushNotifications.init();syncPush();}
    if(action==='push-test')await pushNotifications.test();
    if(action==='push-disable')await pushNotifications.disable();
  }catch(e){pushNotifications.status(e.message);toast(e.message);}finally{b.disabled=false;delete b.dataset.busy;}return;}

  if(action==='tab'){await queue;if(window.scrollY)window.scrollTo(0,0);ui.tab=b.dataset.tab;render();if(window.scrollY)window.scrollTo(0,0);return;}
  if(action==='resume'){if(window.scrollY)window.scrollTo(0,0);ui.tab='workout';render();return;}
  if(action==='history-mode'){ui.historyMode=b.dataset.mode;render();return;}
  if(action==='calendar-month'){ui.historyMode='calendar';const base=ui.calendarMonth?new Date(ui.calendarMonth+'-01T12:00:00'):new Date();const month=new Date(base.getFullYear(),base.getMonth()+Number(b.dataset.direction),1);ui.calendarMonth=month.getFullYear()+'-'+String(month.getMonth()+1).padStart(2,'0');render();return;}
  if(action==='export-csv'){await queue;download(historyCSV(state.history),'set-history-'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8');return;}
  if(action==='result-card')return showResultCard(id);
  if(action==='save-result'){if(resultFile)download(resultFile,resultFile.name);return;}
  if(action==='share-result'){
    if(!resultFile)return;
    if(navigator.canShare?.({files:[resultFile]})&&navigator.share){try{await navigator.share({files:[resultFile],title:'Тренування — СЕТ'});return;}catch(error){if(error.name==='AbortError')return;}}
    document.getElementById('result-status').textContent='Натисни «Завантажити PNG», щоб зберегти або надіслати картку.';return;
  }
  if(action==='undo-action'){
    await queue;const record=undoRecord;
    if(!record||record.expires<Date.now()||record.revision!==repo.revision||stale)return clearUndo();
    await commit(s=>{
      if(record.sessionOnly){s.catalog=clone(record.state.catalog);s.session=clone(record.state.session);s.restEndsAt=record.state.restEndsAt;s.restSetId=record.state.restSetId;s.restKind=record.state.restKind;s.restDuration=record.state.restDuration;}
      else{Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,clone(record.state));}
    },{redraw:false,sessionOnly:record.sessionOnly});
    ui.tab=record.tab;ui.focusId=record.focusId;timerNotified=null;render();return;
  }

  if(action==='focus-move'){
    await queue;
    const targetId=b.dataset.targetId;
    if(targetId&&state.session.exercises.some(x=>x.id===targetId)){ui.focusId=targetId;render();window.scrollTo(0,0);return;}
    const e=focusExercise(state.session,ui.focusId),i=state.session.exercises.indexOf(e),next=state.session.exercises[i+Number(b.dataset.direction)];
    if(next){ui.focusId=next.id;render();window.scrollTo(0,0);}
    return;
  }
  if(action==='replace-exercise'){await queue;openModal(replacementForm(state,sessionExercise(state,id)),'replacement');return;}
  if(action==='suggest-warmup'){await queue;openModal(warmupForm(state,sessionExercise(state,id)),'warmup');return;}
  if(action==='recalculate-warmup'){const base=document.getElementById('warmup-base'),step=document.getElementById('warmup-step');if(!base.reportValidity()||!step.reportValidity())return;document.getElementById('warmup-preview').innerHTML=warmupRows(warmupSuggestion(Number(base.value),Number(step.value)));return;}
  if(action==='review-extras'){await queue;openModal(extrasForm(state),'extras');return;}
  if(action==='accept-goal'){await commit(s=>{const e=sessionExercise(s,id);applyGoal(e,suggestGoal(s,e));},{cardOnly:true,sessionOnly:true,undoLabel:'Підставлення цілі'});return;}
  if(action==='edit-goal'){await queue;openModal(goalForm(state,sessionExercise(state,id)),'goal');return;}
  if(action==='easy-day'){await commit(s=>{s.session.easy=!s.session.easy;for(const e of s.session.exercises)delete e.goal;},{sessionOnly:true});return;}
  if(action==='add-warmup'){await commit(s=>{const e=sessionExercise(s,id);if(e.sets.length>=200)throw new Error('Максимум 200 підходів');const index=e.sets.findIndex(isWorking);e.sets.splice(index<0?e.sets.length:index,0,{id:uid(),type:'warmup',weight:'',reps:'',done:false});},{cardOnly:true,sessionOnly:true});return;}
  if(action==='remove-warmup'){await queue;const e=sessionExercise(state,b.dataset.ex),set=e.sets.find(s=>s.id===b.dataset.set);if(!set||set.type!=='warmup')return;if(e.sets.length===1)return toast('Залиш хоча б один підхід');if(set.done&&!confirm('Прибрати виконану розминку?'))return;await commit(s=>{const e=sessionExercise(s,b.dataset.ex);e.sets=e.sets.filter(x=>x.id!==b.dataset.set);},{cardOnly:true,sessionOnly:true,undoLabel:"Розминку прибрано"});return;}
  if(action==='set-type'){await commit(s=>{const e=sessionExercise(s,b.dataset.ex),set=sessionSet(s,b.dataset.ex,b.dataset.set);set.type=set.type==='warmup'?'working':'warmup';e.sets=[...e.sets.filter(x=>!isWorking(x)),...e.sets.filter(isWorking)];delete e.goal;},{cardOnly:true,sessionOnly:true,undoLabel:"Тип підходу змінено"});return;}
  if(action==='history-type'){syncHistoryDraft();const e=historyDraft.exercises.find(e=>e.id===b.dataset.ex),set=e.sets.find(s=>s.id===b.dataset.set);set.type=set.type==='warmup'?'working':'warmup';e.sets=[...e.sets.filter(x=>!isWorking(x)),...e.sets.filter(isWorking)];delete e.goal;openModal(historyEditor(historyDraft),'history-edit');return;}
  if(action==='extra-set'){await queue;if(!canOfferExtra(state,sessionExercise(state,id)))return toast('Залишаємо поточний обсяг з урахуванням часу та складності.');if(!confirm('Додати один робочий підхід лише сьогодні? План не зміниться. Залиш орієнтовно 5 хвилин.'))return;await commit(s=>{const e=sessionExercise(s,id),p=workingSets(e).at(-1);e.sets.push({id:uid(),weight:p.weight,reps:p.reps,type:'working',done:false});if(e.goal)e.goal.sets.push({weight:Number(p.weight),reps:Number(p.reps)});},{cardOnly:true,sessionOnly:true,undoLabel:"Підхід додано"});return;}
  if(action==='exercise-config'){await queue;const e=sessionExercise(state,id);openExerciseConfig(e.exerciseId);return;}
  if(action==='copy-set'){await commit(s=>{const e=sessionExercise(s,b.dataset.ex),i=e.sets.findIndex(x=>x.id===b.dataset.set);if(i<1)return;const previous=e.sets.slice(0,i).filter(s=>(s.type==='warmup')===(e.sets[i].type==='warmup')).at(-1);if(!previous)return;delete e.sets[i].rir;Object.assign(e.sets[i],{weight:previous.weight,reps:previous.reps,done:false});},{cardOnly:true,sessionOnly:true,undoLabel:"Значення скопійовано"});return;}
  if(action==='dismiss-summary'){delete ui.finishedId;render();window.scrollTo(0,0);return;}
  if(action==='rest-focus'){await queue;openModal(restDesign(state,ui.focusId),'rest-focus');modal.classList.add('rest-dialog');updateTimer();updatePlates();return;}
  if(action==='rest-continue'){await queue;const current=focusExercise(state.session,ui.focusId),next=state.restKind==='exercise'&&current&&workingSets(current).every(s=>s.done)?upcomingExercise(state.session,current.id):null;await commit(s=>{s.restEndsAt=null;s.restSetId=null;},{redraw:false,sessionOnly:true});if(next)ui.focusId=next.id;closeModal(true);render();return;}
  if(action==='rest-shift'){await commit(s=>{const now=Date.now(),before=Math.max(0,(s.restEndsAt||now)-now)/1000,seconds=Number(b.dataset.seconds);s.restEndsAt=now+Math.max(0,Math.min(86400,before+seconds))*1000;s.restDuration=Math.min(86400,Math.max(s.restDuration||s.restSeconds,Math.ceil((s.restEndsAt-now)/1000)));timerNotified=null;},{redraw:false,sessionOnly:true});updateTimer();return;}
  if(action==='new-template')return editTemplate();
  if(action==='preview-program'){await queue;openModal(programPreview(state),'program');return;}
  if(action==='add-program'){let added=0;await commit(s=>{added=addPersonalProgram(s);});closeModal(true);if(!added)toast('Готову програму вже додано');return;}
  if(action==='edit-template')return editTemplate(id);
  if(action==='start'){await commit(s=>startSession(s,id),{redraw:false,sessionOnly:false});if(window.scrollY)window.scrollTo(0,0);ui.tab='workout';render();return;}
  if(action==='add-set')return commit(s=>{const e=sessionExercise(s,id);if(e.sets.length>=200)throw new Error('Максимум 200 підходів');const p=workingSets(e).at(-1);if(e.goal&&p&&validSet({...p,done:true},true))e.goal.sets.push({weight:Number(p.weight),reps:Number(p.reps)});else delete e.goal;e.sets.push({id:uid(),weight:p?.weight??'',reps:p?.reps??'',done:false});},{cardOnly:true,sessionOnly:true,undoLabel:"Підхід додано"});
  if(action==='remove-set'){await queue;const e=state.session?.exercises.find(e=>e.id===id);if(!e||e.sets.length<=1)return toast('Залиш хоча б один підхід');if(e.sets.at(-1).done&&!confirm('Видалити виконаний підхід?'))return;return commit(s=>{const e=sessionExercise(s,id);e.sets.pop();if(e.goal)e.goal.sets=e.goal.sets.slice(0,workingSets(e).length);},{cardOnly:true,sessionOnly:true,undoLabel:"Підхід видалено"});}
  if(action==='toggle-set'){
    await queue;
    const currentSet=sessionSet(state,b.dataset.ex,b.dataset.set);
    if(!currentSet.done&&!validSet({...currentSet,done:true},true)){
      showSetFieldError(b.dataset.ex,b.dataset.set,currentSet);
      return;
    }
    return commit(s=>{
      const set=sessionSet(s,b.dataset.ex,b.dataset.set);
      if(!set.done&&!validSet({...set,done:true},true))throw new Error('Вкажи вагу 0–10000 кг і цілу кількість повторень 1–1000');
      set.done=!set.done;
      if(set.done){
        const rest=restAfterSet(s,sessionExercise(s,b.dataset.ex),set);
        s.restDuration=rest.seconds||s.restSeconds;s.restKind=rest.kind;
        s.restEndsAt=rest.seconds?Date.now()+rest.seconds*1000:null;
        s.restSetId=rest.seconds?set.id:null;timerNotified=null;
      }else if(s.restSetId===set.id){s.restEndsAt=null;s.restSetId=null;timerNotified=null;}
    },{cardOnly:true,sessionOnly:true,undoLabel:"Позначку підходу змінено"});
  }
  if(action==='exercise-order'){
    await queue;openModal(exerciseOrderForm(state,focusExercise(state.session,ui.focusId)?.id),'exercise-order');
    orderCleanup?.();
    orderCleanup=bindExerciseOrder(modalContent,ids=>{commit(s=>reorderExercises(s,ids),{sessionOnly:true,undoLabel:'Порядок вправ змінено'}).catch(()=>closeModal(true));});
    return;
  }
  if(action==='save-order-to-plan'){
    await queue;
    const ids=state.session.exercises.map(e=>e.id);
    await commit(s=>reorderExercises(s,ids,true),{undoLabel:'Порядок збережено в план'});
    closeModal(true);
    return;
  }
  if(action==='select-exercise'){await queue;if(!state.session?.exercises.some(e=>e.id===id))return;ui.focusId=id;closeModal(true);render();window.scrollTo(0,0);return;}
  if(action==='remove-session-ex'){if(confirm('Прибрати вправу та її підходи з поточного тренування?'))return commit(s=>{s.session.exercises=s.session.exercises.filter(e=>e.id!==id);},{sessionOnly:true,undoLabel:"Вправу прибрано"});return;}
  if(action==='session-add-ex'){openModal(`${button('close-modal','×','aria-label="Закрити"','modal-close')}<h2>Додати вправу</h2><p class="scope-badge">Лише для сьогоднішнього заняття</p><form id="session-ex-form"><div class="labels"><label for="session-ex-name">Назва вправи</label><input id="session-ex-name" class="field" maxlength="90" required list="exercise-names" autofocus></div>${catalogList(state)}<button class="btn block" type="submit">Додати до тренування</button></form>`,'session-ex');return;}
  if(action==='finish-workout'){
    await queue;
    const unmarked=state.session.exercises.reduce((n,e)=>n+e.sets.filter(s=>!s.done).length,0);
    if(unmarked&&!confirm(`Не позначено ${unmarked} підходів. Зберегти лише виконані й завершити тренування достроково?`))return;
    const completedId=state.session.id;
    await commit(finishSession,{redraw:false});
    ui.finishedId=completedId;if(window.scrollY)window.scrollTo(0,0);ui.tab='history';render();
    toast('Тренування успішно збережено на пристрої');
    return;
  }
  if(action==='cancel-workout'){if(confirm('Скасувати поточне тренування та видалити введені результати?')){await commit(s=>{s.session=null;s.restEndsAt=null;},{redraw:false,sessionOnly:true,undoLabel:'Тренування скасовано'});if(window.scrollY)window.scrollTo(0,0);ui.tab='home';render();}return;}
  if(action==='rest-start'||action==='rest-adjust')return commit(s=>{if(!s.session)return;s.restEndsAt=action==='rest-adjust'?Math.max(Date.now(),s.restEndsAt||Date.now())+30000:Date.now()+s.restSeconds*1000;s.restDuration=Math.min(86400,Math.max(action==='rest-start'?s.restSeconds:(s.restDuration||s.restSeconds),Math.ceil((s.restEndsAt-Date.now())/1000)));timerNotified=null;},{redraw:false,sessionOnly:true}).then(updateTimer);
  if(action==='rest-stop')return commit(s=>{s.restEndsAt=null;timerNotified=null;},{redraw:false,sessionOnly:true}).then(()=>{if(modalMode==='rest-focus')closeModal(true);updateTimer();});
  if(action==='export')return exportBackup();
  if(action==='share-program'){await queue;openModal(shareProgramForm(state),'share-program');return;}
  if(action==='share-text')return shareProgramText();
  if(action==='copy-share-text')return copyProgramText();
  if(action==='export-legacy'){const text=await repo.recoveryText();if(!text)return toast('Даних попередньої версії немає');download(text,'set-before-v2.json');return;}
  if(action==='import')return document.getElementById('backup-file').click();
  if(action==='reset'){if(confirm('Очистити всі поточні плани та історію? Перед очищенням завантажиться резервна копія.')){await queue;backup(state,'set-before-reset');await commit(s=>{Object.assign(s,fresh());},{redraw:false});ui.tab='home';render();}return;}
  if(action==='close-modal')return closeModal();
  if(action==='draft-add'){syncDraft();const name=draft.addName.trim();if(!name)return toast('Введи назву вправи');if(draft.exercises.length>=200)return toast('Максимум 200 вправ');draft.exercises.push({id:uid(),exerciseId:null,name,targetSets:4,targetReps:8});draft.addName='';displayDraft();return;}
  if(action==='draft-remove'){syncDraft();draft.exercises=draft.exercises.filter(e=>e.id!==id);displayDraft();return;}
  if(action==='draft-move'){syncDraft();moveItem(draft.exercises,id,Number(b.dataset.direction));displayDraft();return;}
  if(action==='delete-template'){if(confirm('Видалити план? Історія тренувань залишиться.')){await commit(s=>{s.templates=s.templates.filter(t=>t.id!==draft.id);},{undoLabel:"План видалено"});closeModal(true);}return;}
  if(action==='history-detail'){const w=state.history.find(w=>w.id===id);if(w)openModal(historyDetail(w),'history-detail');return;}
  if(action==='delete-history'){if(confirm('Видалити цей запис історії?')){await commit(s=>{s.history=s.history.filter(w=>w.id!==id);},{undoLabel:"Запис видалено"});closeModal(true);}return;}
  if(action==='edit-history'){historyDraft=clone(state.history.find(w=>w.id===id));historyBaseline=JSON.stringify(historyDraft);openModal(historyEditor(historyDraft),'history-edit');return;}
  if(action==='history-remove-set'){syncHistoryDraft();const e=historyDraft.exercises.find(e=>e.id===b.dataset.ex);if(e.sets.length===1){if(!confirm('Прибрати вправу з цього запису?'))return;historyDraft.exercises=historyDraft.exercises.filter(x=>x.id!==e.id);}else e.sets=e.sets.filter(s=>s.id!==b.dataset.set);openModal(historyEditor(historyDraft),'history-edit');return;}
  if(action==='history-add-set'){syncHistoryDraft();const e=historyDraft.exercises.find(e=>e.id===id);if(e.sets.length>=200)return toast('Максимум 200 підходів');e.sets.push({id:uid(),weight:e.sets.at(-1)?.weight??0,reps:e.sets.at(-1)?.reps??8,done:true});openModal(historyEditor(historyDraft),'history-edit');return;}
  if(action==='muscle-select'){ui.muscleGroup=b.dataset.group;ui.progressDetailsOpen=true;const y=window.scrollY;render();window.scrollTo(0,y);return;}
  if(action==='chart-metric'){ui.metric=b.dataset.metric;const y=window.scrollY;render();window.scrollTo(0,y);return;}
  if(action==='rename-exercise'){openExerciseConfig(id);return;}
  if(action==='check-offline'){ui.offlineStatus=await checkOffline();render();return;}
  if(action==='persist-storage'){ui.storageStatus=await requestPersistence();render();return;}
}

document.addEventListener('click',event=>{const b=event.target.closest('[data-action]');if(b&&!b.disabled)handleAction(b).catch(showError);});

app.addEventListener('input',event=>{
  const x=event.target;
  if(x.matches('[data-note-ex],[data-workout-note]')){
    const value=x.value;
    commit(s=>{if(x.hasAttribute('data-workout-note'))s.session.note=value;else{const e=sessionExercise(s,x.dataset.noteEx);e.note=value;const catalog=s.catalog.find(c=>c.id===e.exerciseId);if(catalog)catalog.note=value;}},{redraw:false,preserve:true,sessionOnly:true}).catch(()=>{});
    return;
  }
  if(!x.matches('[data-set][data-field]'))return;
  const {ex,set,field}=x.dataset,value=x.value.replace(',','.');
  x.classList.remove('is-invalid');
  const errEl=app.querySelector(`[data-set-error="${set}"]`);
  if(errEl){errEl.hidden=true;errEl.textContent='';}
  const row=x.closest('.set-grid'),btn=row?.querySelector('.done'),block=x.closest('.set-block');
  block?.classList.remove('is-done');
  btn?.classList.remove('yes');
  btn?.setAttribute('aria-pressed','false');
  btn?.setAttribute('aria-label',btn.getAttribute('aria-label')?.replace(': виконано',': позначити виконаним')||'Позначити виконаним');
  commit(s=>{const target=sessionSet(s,ex,set);target[field]=value;target.done=false;delete target.rir;},{redraw:false,preserve:true,sessionOnly:true}).then(()=>updateFinishButtonDOM()).catch(()=>{});
});

app.addEventListener('change',event=>{
  const x=event.target;
  if(x.matches('[data-rir]')){const value=x.value;commit(s=>{sessionSet(s,x.dataset.ex,x.dataset.set).rir=value===''?null:Number(value);},{cardOnly:true,sessionOnly:true}).catch(()=>{});}
  if(x.id==='exercise-rest-duration')commit(s=>{s.exerciseRestSeconds=Number(x.value);},{redraw:false,sessionOnly:true}).catch(()=>{});
  if(x.id==='warmup-rest-duration')commit(s=>{s.warmupRestSeconds=Number(x.value);},{redraw:false,sessionOnly:true}).catch(()=>{});
  if(x.id==='keep-awake')commit(s=>{s.keepAwake=x.checked;},{redraw:false,sessionOnly:true}).then(syncWakeLock).catch(()=>{});
  if(x.id==='rest-duration')commit(s=>{s.restSeconds=Number(x.value);},{redraw:false,sessionOnly:true}).catch(()=>{});
  if(x.id==='progress-ex'){ui.exerciseId=x.value;render();}
  if(x.id==='progress-period'){ui.progressDays=Number(x.value);render();}
  if(x.id==='history-period'){ui.historyDays=Number(x.value);render();}
  if(x.id==='backup-file')importBackup(x.files[0]);
});
app.addEventListener('toggle',event=>{
  if(event.target.matches('.progress-details-card'))ui.progressDetailsOpen=event.target.open;
},true);

modal.addEventListener('cancel',event=>{event.preventDefault();closeModal();});
modal.addEventListener('change',event=>{if(event.target.id==='share-plan'){document.getElementById('share-text').value=programText(state.templates,event.target.value);document.getElementById('share-status').textContent='';}});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
modal.addEventListener('submit',event=>{event.preventDefault();const form=event.target;(async()=>{
  if(form.id==='replacement-form'){const name=document.getElementById('replacement-name').value,reps=Number(document.getElementById('replacement-reps').value);let focusId;await commit(s=>{focusId=replaceExercise(s,form.dataset.id,name,reps);},{redraw:false,sessionOnly:true,undoLabel:'Вправу замінено на сьогодні'});ui.focusId=focusId;closeModal(true);render();}
  if(form.id==='warmup-form'){const rows=[...form.querySelectorAll('.warmup-preview-row')].map(row=>({weight:Number(row.querySelector('[data-warmup-weight]').value),reps:Number(row.querySelector('[data-warmup-reps]').value)}));await commit(s=>applyWarmup(sessionExercise(s,form.dataset.id),rows),{cardOnly:true,sessionOnly:true,undoLabel:'Розминку додано'});closeModal(true);}
  if(form.id==='extras-form'){const rows=[...form.querySelectorAll('[data-extra-ex]:checked')].map(x=>({ex:x.dataset.extraEx,id:x.value}));if(!rows.length)return;await commit(s=>{const allowed=optionalSets(s.session);for(const row of rows){if(!allowed.some(x=>x.exerciseId===row.ex&&x.setId===row.id))throw Error('Список підходів змінився. Відкрий його ще раз.');const e=sessionExercise(s,row.ex),index=workingSets(e).findIndex(x=>x.id===row.id);e.sets=e.sets.filter(x=>x.id!==row.id);if(e.goal)e.goal.sets.splice(index,1);}},{cardOnly:true,sessionOnly:true,undoLabel:'Додаткові підходи прибрано'});closeModal(true);}
  if(form.id==='goal-form'){const sets=[...form.querySelectorAll('.goal-input-row')].map(row=>({weight:Number(row.querySelector('[data-goal-weight]').value),reps:Number(row.querySelector('[data-goal-reps]').value)}));await commit(s=>applyGoal(sessionExercise(s,form.dataset.id),{sets,mode:'manual',reason:'Власна ціль на це заняття.'}),{cardOnly:true,sessionOnly:true});closeModal(true);}
  if(form.id==='template-form'){syncDraft();const saved=clone(draft);await commit(s=>{const exercises=saved.exercises.map(e=>({...e,exerciseId:e.exerciseId||getOrCreateExercise(s,e.name).id}));const t={id:saved.id,name:saved.name.trim(),day:saved.day,exercises};const index=s.templates.findIndex(x=>x.id===t.id);if(index<0)s.templates.push(t);else s.templates[index]=t;});closeModal(true);}
  if(form.id==='session-ex-form'){const name=document.getElementById('session-ex-name').value;let addedId=null;await commit(s=>{if(s.session.exercises.length>=200)throw new Error('Максимум 200 вправ');const exercise=getOrCreateExercise(s,name);addedId=uid();s.session.exercises.push({id:addedId,exerciseId:exercise.id,name:exercise.name,...(exercise.note!==undefined?{note:exercise.note}:{}),targetSets:4,...(exercise.weightStep?{weightStep:exercise.weightStep}:{}),...(exercise.weightBasis?{weightBasis:exercise.weightBasis}:{}),...(exercise.equipment?{equipment:clone(exercise.equipment)}:{}),sets:Array.from({length:4},()=>({id:uid(),weight:'',reps:'',done:false}))});},{redraw:false,sessionOnly:true});if(addedId)ui.focusId=addedId;closeModal(true);render();}
  if(form.id==='history-form'){syncHistoryDraft();const saved=clone(historyDraft);await commit(s=>{const index=s.history.findIndex(w=>w.id===saved.id);s.history[index]=saved;});closeModal(true);}
  if(form.id==='rename-form'){const name=document.getElementById('exercise-new-name').value.trim().replace(/\s+/g,' '),id=form.dataset.id;await commit(s=>{const existing=getOrCreateExercise(clone(s),name);if(existing.id!==id&&s.catalog.some(e=>e.id===existing.id))throw new Error('Вправа з такою назвою вже є. Обери іншу назву.');const catalog=s.catalog.find(e=>e.id===id);catalog.name=name;const oldStep=catalog.weightStep,oldBasis=catalog.weightBasis;const muscle=document.getElementById('exercise-muscle').value;if(muscle)catalog.muscleGroup=muscle;else delete catalog.muscleGroup;catalog.equipment=Object.fromEntries([...form.querySelectorAll('[data-equipment]')].map(x=>[x.dataset.equipment,x.value.trim()]).filter(([,v])=>v));const step=document.getElementById('exercise-weight-step').value;if(step==='')delete catalog.weightStep;else catalog.weightStep=Number(step);catalog.weightBasis=document.getElementById('exercise-weight-basis').value;for(const e of s.session?.exercises||[])if(e.exerciseId===id){e.name=name;e.equipment=clone(catalog.equipment);e.weightBasis=catalog.weightBasis;if(catalog.weightStep)e.weightStep=catalog.weightStep;else delete e.weightStep;if(oldStep!==catalog.weightStep||oldBasis!==catalog.weightBasis)delete e.goal;}for(const t of s.templates)for(const e of t.exercises)if(e.exerciseId===id)e.name=name;});closeModal(true);}
})().catch(showError);});

function updatePlates(){const result=document.getElementById('plateResult'),bar=document.getElementById('plateBar');if(!result||!bar)return;const weight=result.dataset.weight===''?NaN:Number(result.dataset.weight),p=barbellPlates(weight,Number(bar.value));result.textContent=!p?'Вкажи вагу підходу не меншу за вагу грифа.':p.plates.length?p.plates.map(n=>n.toLocaleString('uk-UA')).join(' + ')+' кг на бік'+(p.remainder?' · залишок '+p.remainder.toLocaleString('uk-UA')+' кг загалом':''):'Без дисків'+(p.remainder?' · залишок '+p.remainder.toLocaleString('uk-UA')+' кг загалом':'');}
modal.addEventListener('input',event=>{if(event.target.id==='plateBar')updatePlates();});

function updateTimer(){
  if(!state)return;
  const timing=document.getElementById('compactTiming');if(timing)timing.textContent=compactTiming(state);
  const compact=document.getElementById('restCompact'),idleBar=document.getElementById('restIdleBar'),slot=document.getElementById('restSlot');
  const hasRest=Boolean(state.restEndsAt);
  if(compact)compact.hidden=!hasRest;
  if(idleBar)idleBar.hidden=hasRest;
  if(slot){slot.classList.toggle('is-active',hasRest);slot.classList.toggle('is-idle',!hasRest);}
  const hud=document.getElementById('restHudTimer');
  if(hud){
    const seconds=remaining(state.restEndsAt,0);
    hud.textContent=formatClock(seconds);
    document.getElementById('restHudTotal').textContent=state.restEndsAt?'Ціль: '+(state.restDuration||state.restSeconds)+' с':'Таймер не запущено';
    document.getElementById('restRing').style.strokeDashoffset=String(100-Math.min(1,seconds/(state.restDuration||state.restSeconds))*100);
  }
  document.title=state.restEndsAt>Date.now()?'('+formatClock(remaining(state.restEndsAt,state.restSeconds))+') СЕТ':'СЕТ';
  const target=document.getElementById('restTimer');if(target)target.textContent=formatClock(remaining(state.restEndsAt,state.restSeconds));
  const label=document.getElementById('restLabel');
  if(label){
    const focused=state.session?focusExercise(state.session,ui.focusId):null;
    const nextEx=focused?upcomingExercise(state.session,focused.id):null;
    label.textContent=state.restEndsAt&&remaining(state.restEndsAt,state.restSeconds)===0
      ?'Відпочинок завершено'
      :state.restKind==='exercise'
        ?(nextEx?'Між вправами · Далі: '+nextEx.name:'Між вправами')
        :state.restKind==='warmup'?'Після розминки':'Між підходами';
  }
  if(state.restEndsAt&&state.restEndsAt<=Date.now()&&timerNotified!==state.restEndsAt&&!document.hidden){
    timerNotified=state.restEndsAt;if(pushNotifications.confirmedEnd!==state.restEndsAt)beep();toast('Час наступного підходу!');
  }
}
setInterval(()=>{if(!document.hidden)updateTimer();},1000);
document.addEventListener('visibilitychange',()=>{syncWakeLock();if(!document.hidden){updateTimer();syncPush();}});
window.addEventListener('pageshow',()=>{updateTimer();syncWakeLock();syncPush();});
window.addEventListener('pagehide',()=>{wakeLock.sync(false).catch(()=>{});});
window.addEventListener('beforeunload',event=>{if(pending||failed){event.preventDefault();event.returnValue='';}});

function storageChanged(){clearUndo();stale=true;showError(new Error('СЕТ оновлено в іншому вікні. За потреби збережи копію та перезавантаж сторінку.'));saveStatus();}
channel?.addEventListener('message',event=>{if(event.data.revision>repo.revision)storageChanged();});
window.addEventListener('set-storage-changed',storageChanged);
document.getElementById('noticeExport').addEventListener('click',()=>{if(state)exportBackup().catch(showError);else repo.recoveryText().then(text=>{if(text)download(text,'set-recovery.json');else toast('Попередніх локальних даних немає');});});
document.getElementById('noticeReload').addEventListener('click',()=>{if((pending||failed)&&!confirm('Є незбережені зміни. Спочатку збережи копію. Перезавантажити?'))return;location.reload();});

// VisualViewport handler: keep active input unobstructed when soft keyboard opens
if(window.visualViewport){
  const onViewport=()=>{
    const kbOpen=window.innerHeight-window.visualViewport.height>140;
    document.body.classList.toggle('keyboard-open',kbOpen);
  };
  window.visualViewport.addEventListener('resize',onViewport);
}
document.addEventListener('focusin',event=>{
  if(event.target.matches('input,textarea,select'))document.body.classList.add('input-focused');
});
document.addEventListener('focusout',event=>{
  if(event.target.matches('input,textarea,select'))setTimeout(()=>{if(!document.activeElement?.matches('input,textarea,select'))document.body.classList.remove('input-focused');},80);
});

async function boot(){
  try{
    const result=await repo.open();state=result.state;ui.tab=state.session?'workout':'home';render();
    if(result.migrated)toast('Дані перенесено. Попередня копія залишилася на пристрої.');
  }catch(error){
    app.innerHTML='<div class="shell"><h1 class="page-title">Не вдалося відкрити дані</h1><p class="subtle">Наявні записи не перезаписані. Збережи копію даних або повтори запуск.</p><button class="btn alt" id="startupImport">Відновити з JSON</button><input type="file" id="startupFile" accept=".json,application/json" hidden></div>';
    showError(error);
    document.getElementById('startupImport').onclick=()=>document.getElementById('startupFile').click();
    document.getElementById('startupFile').onchange=async event=>{
      try{
        const file=event.target.files[0];if(!file)return;
        if(file.size>30*1024*1024)throw new Error('Файл завеликий');
        const incoming=normalize(JSON.parse(await file.text()));
        if(!repo.db)throw new Error('Сховище недоступне. Відкрий СЕТ у звичайному режимі Safari.');
        if(!confirm('Відновити застосунок із перевіреної копії?'))return;
        await repo.write(incoming);location.reload();
      }catch(e){showError(e);}
    };
  }
}
await boot();
if(state)void pushNotifications.init().then(syncPush);
window.addEventListener('online',syncPush);
setupPWA({canUpdate:()=>!pending&&!failed&&!state?.session,onStatus:status=>{ui.offlineStatus=status;const target=document.getElementById('offlineStatus');if(target)target.textContent=status;},onUpdate:apply=>{const banner=document.getElementById('updateBanner');banner.hidden=false;document.getElementById('applyUpdate').onclick=async()=>{await queue;if(state?.session)return toast('Оновлення можна встановити після завершення тренування');if(failed)return toast('Спочатку збережи незбережені дані');apply();};}}).catch(error=>{ui.offlineStatus=`Офлайн не підготовлено: ${error.message}`;const target=document.getElementById('offlineStatus');if(target)target.textContent=ui.offlineStatus;});

document.addEventListener('click',event=>{for(const menu of document.querySelectorAll('.simple-menu[open]'))if(!menu.contains(event.target))menu.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const menu of document.querySelectorAll('.simple-menu[open]'))menu.open=false;});
document.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('.muscle-region')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
