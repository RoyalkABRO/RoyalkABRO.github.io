import {historyCSV,workoutImage} from './js/exports.js';
import {WorkoutWakeLock} from './js/wake-lock.js';
import {Repository} from './js/storage.js';
import {fresh,normalize,clone,uid,getOrCreateExercise,validSet,startSession,finishSession,moveItem} from './js/model.js';
import {renderView,renderNavigation,shareProgramForm,templateForm,historyDetail,historyEditor,catalogList,esc,button,programPreview} from './js/views.js';
import {programText} from './js/share.js';
import {addPersonalProgram} from './js/programs.js';
import {remaining,formatClock,unlockSound,beep} from './js/timer.js';
import {setupPWA,checkOffline,requestPersistence} from './js/pwa.js';

const app=document.getElementById('app'),modal=document.getElementById('modal'),modalContent=document.getElementById('modalContent');
const notice=document.getElementById('notice'),noticeText=document.getElementById('noticeText');
const navigation=document.getElementById('navigation');
const repo=new Repository();
let state,queue=Promise.resolve(),pending=0,failed=false,stale=false,toastHandle,draft=null,historyDraft=null,modalMode='',timerNotified=null,resultFile=null,resultURL=null;
const ui={tab:'home',historyDays:0,progressDays:0,metric:'weight',exerciseId:null,offlineStatus:'Перевіряємо офлайн-готовність…',storageStatus:'Сховище на пристрої'};
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('set-workout-updates'):null;
function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastHandle);toastHandle=setTimeout(()=>el.classList.remove('show'),3200);}
function showError(error){noticeText.textContent=error?.message||String(error);notice.hidden=false;}
function saveStatus(){const target=document.getElementById('saveStatus');if(target)target.textContent=stale?'Є зміни в іншому вікні':failed?'Є незбережені зміни':pending?'Збереження…':'Збережено на пристрої';}
const wakeLock=new WorkoutWakeLock(navigator,document,message=>{const target=document.getElementById('wakeStatus');if(target)target.textContent=message;});
function syncWakeLock(){wakeLock.sync(Boolean(state?.keepAwake&&state.session&&ui.tab==='workout')).catch(()=>{});}
function render(){
  app.innerHTML=renderView(state,ui);
  if(!navigation.childElementCount)navigation.innerHTML=renderNavigation();
  const current=ui.tab==='workout'?'home':ui.tab;
  for(const tab of navigation.querySelectorAll('[data-tab]')){
    const active=tab.dataset.tab===current;tab.classList.toggle('active',active);
    if(active)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
  }
  navigation.hidden=false;saveStatus();updateTimer();syncWakeLock();
}
function commit(mutator,{redraw=true,preserve=false}={}) {
  pending++;saveStatus();
  const task=queue.then(async()=>{
    if(stale)throw new Error('Дані змінені в іншому вікні. Збережи копію й перезавантаж СЕТ.');
    const next=clone(state);mutator(next);
    try {
      const saved=await repo.write(next);state=saved;failed=false;
      if(!stale)notice.hidden=true;
      channel?.postMessage({revision:repo.revision});
    } catch(error){if(preserve)state=next;failed=true;throw error;}
    if(redraw)render();
  }).catch(error=>{showError(error);throw error;}).finally(()=>{pending--;saveStatus();});
  queue=task.catch(()=>{});return task;
}
function openModal(html,mode){modalContent.innerHTML=html;modalMode=mode;if(!modal.open)modal.showModal();}
function syncDraft(){if(!draft)return;const name=document.getElementById('template-name');if(!name)return;draft.name=name.value;draft.day=Number(document.getElementById('template-day').value);draft.addName=document.getElementById('template-add-name').value;for(const root of modalContent.querySelectorAll('[data-draft-ex]')){const e=draft.exercises.find(x=>x.id===root.dataset.draftEx);if(!e)continue;for(const input of root.querySelectorAll('[data-target]')){if(input.dataset.target==='targetReps'){e.targetRepsUnspecified=input.value==='';e.targetReps=input.value===''?8:Number(input.value);}else if(input.dataset.target==='targetRepsMax'){if(input.value==='')delete e.targetRepsMax;else e.targetRepsMax=Number(input.value);}else e[input.dataset.target]=Number(input.value);}}}
function syncHistoryDraft(){if(!historyDraft)return;const title=document.getElementById('history-title');if(!title)return;historyDraft.title=title.value;historyDraft.note=document.querySelector('[data-history-workout-note]')?.value||'';for(const x of modalContent.querySelectorAll('[data-history-note-ex]')){const e=historyDraft.exercises.find(e=>e.id===x.dataset.historyNoteEx);if(e)e.note=x.value;}const date=document.getElementById('history-date').value;if(date){const startedAt=new Date(date);if(!Number.isNaN(startedAt.getTime())){const duration=Date.parse(historyDraft.finishedAt)-Date.parse(historyDraft.startedAt);historyDraft.startedAt=startedAt.toISOString();historyDraft.finishedAt=new Date(startedAt.getTime()+duration).toISOString();}}for(const input of modalContent.querySelectorAll('[data-set][data-field]')){const set=historyDraft.exercises.find(e=>e.id===input.dataset.ex)?.sets.find(s=>s.id===input.dataset.set);if(set)set[input.dataset.field]=input.value.replace(',','.');}}
function closeModal(force=false){if(!force&&['template','history-edit'].includes(modalMode)&&!confirm('Закрити редактор без збереження змін?'))return;modal.close();if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;resultFile=null;modalContent.innerHTML='';modalMode='';draft=null;historyDraft=null;}
function editTemplate(id){const source=state.templates.find(t=>t.id===id);draft=source?{...clone(source),isNew:false,addName:''}:{id:uid(),name:'',day:new Date().getDay(),exercises:[],isNew:true,addName:''};openModal(templateForm(draft,state),'template');}
function download(text,name,type='application/json'){const url=URL.createObjectURL(text instanceof Blob?text:new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function backup(value=state,prefix='set-backup'){download(JSON.stringify({...value,exportedAt:new Date().toISOString()},null,2),`${prefix}-${new Date().toISOString().slice(0,10)}.json`);}
async function exportBackup(){await queue;backup();toast(failed?'Копія містить також незбережені зміни':'Файл резервної копії підготовлено');if(!failed&&!stale)await commit(s=>{s.lastBackupAt=new Date().toISOString();},{redraw:ui.tab==='settings'});}
async function importBackup(file){if(!file)return;try{if(file.size>30*1024*1024)throw new Error('Файл більший за 30 МБ');const incoming=normalize(JSON.parse(await file.text()));await queue;if(!confirm(`Відновити ${incoming.templates.length} планів і ${incoming.history.length} тренувань? Поточні дані будуть замінені. Спочатку завантажиться їхня резервна копія.`))return;backup(state,'set-before-import');await commit(s=>{Object.keys(s).forEach(key=>delete s[key]);Object.assign(s,incoming);});ui.tab=state.session?'workout':'home';render();toast('Дані перевірено й відновлено');}catch(error){showError(new Error(`Не вдалося імпортувати: ${error.message}`));}finally{const input=document.getElementById('backup-file');if(input)input.value='';}}
function sessionExercise(s,id){const found=s.session?.exercises.find(e=>e.id===id);if(!found)throw new Error('Вправу не знайдено');return found;}
function sessionSet(s,ex,id){const found=sessionExercise(s,ex).sets.find(x=>x.id===id);if(!found)throw new Error('Підхід не знайдено');return found;}
function displayDraft(){openModal(templateForm(draft,state),'template');}
async function copyProgramText(){
  const preview=document.getElementById('share-text');
  if(!preview?.value)return;
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
async function handleAction(b){
  const action=b.dataset.action,id=b.dataset.id;unlockSound();
  if(action==='tab'){await queue;if(window.scrollY)window.scrollTo(0,0);ui.tab=b.dataset.tab;render();if(window.scrollY)window.scrollTo(0,0);return;}
  if(action==='resume'){if(window.scrollY)window.scrollTo(0,0);ui.tab='workout';render();return;}
  if(action==='calendar-month'){const base=ui.calendarMonth?new Date(ui.calendarMonth+'-01T12:00:00'):new Date();const month=new Date(base.getFullYear(),base.getMonth()+Number(b.dataset.direction),1);ui.calendarMonth=month.getFullYear()+'-'+String(month.getMonth()+1).padStart(2,'0');render();return;}
  if(action==='export-csv'){await queue;download(historyCSV(state.history),'set-history-'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8');return;}
  if(action==='result-card')return showResultCard(id);
  if(action==='save-result'){if(resultFile)download(resultFile,resultFile.name);return;}
  if(action==='share-result'){
    if(!resultFile)return;
    if(navigator.canShare?.({files:[resultFile]})&&navigator.share){try{await navigator.share({files:[resultFile],title:'Тренування — СЕТ'});return;}catch(error){if(error.name==='AbortError')return;}}
    document.getElementById('result-status').textContent='Натисни «Завантажити PNG», щоб зберегти або надіслати картку.';return;
  }
  if(action==='copy-set'){await commit(s=>{const e=sessionExercise(s,b.dataset.ex),i=e.sets.findIndex(x=>x.id===b.dataset.set);if(i<1)return;const previous=e.sets[i-1];Object.assign(e.sets[i],{weight:previous.weight,reps:previous.reps,done:false});});return;}
  if(action==='new-template')return editTemplate();
  if(action==='preview-program'){await queue;openModal(programPreview(state),'program');return;}
  if(action==='add-program'){let added=0;await commit(s=>{added=addPersonalProgram(s);});closeModal(true);toast(added?'Програму додано: по 4 підходи у кожній вправі':'Програму вже додано');return;}
  if(action==='edit-template')return editTemplate(id);
  if(action==='start'){await commit(s=>startSession(s,id),{redraw:false});if(window.scrollY)window.scrollTo(0,0);ui.tab='workout';render();toast('Тренування розпочато');return;}
  if(action==='add-set')return commit(s=>{const e=sessionExercise(s,id);if(e.sets.length>=200)throw new Error('Максимум 200 підходів');const p=e.sets.at(-1);e.sets.push({id:uid(),weight:p?.weight??'',reps:p?.reps??'',done:false});});
  if(action==='remove-set'){await queue;const e=state.session?.exercises.find(e=>e.id===id);if(!e||e.sets.length<=1)return toast('Залиш хоча б один підхід');if(e.sets.at(-1).done&&!confirm('Видалити виконаний підхід?'))return;return commit(s=>sessionExercise(s,id).sets.pop());}
  if(action==='toggle-set')return commit(s=>{const set=sessionSet(s,b.dataset.ex,b.dataset.set);if(!set.done&&!validSet({...set,done:true},true))throw new Error('Вкажи вагу 0–10000 кг і цілу кількість повторень 1–1000');set.done=!set.done;if(set.done){s.restEndsAt=Date.now()+s.restSeconds*1000;timerNotified=null;}});
  if(action==='session-move')return commit(s=>moveItem(s.session.exercises,id,Number(b.dataset.direction)));
  if(action==='remove-session-ex'){if(confirm('Прибрати вправу та її підходи з поточного тренування?'))return commit(s=>{s.session.exercises=s.session.exercises.filter(e=>e.id!==id);});return;}
  if(action==='session-add-ex'){openModal(`${button('close-modal','×','aria-label="Закрити"','modal-close')}<h2>Додати вправу</h2><form id="session-ex-form"><div class="labels"><label for="session-ex-name">Назва вправи</label><input id="session-ex-name" class="field" maxlength="90" required list="exercise-names" autofocus></div>${catalogList(state)}<button class="btn block" type="submit">Додати до тренування</button></form>`,'session-ex');return;}
  if(action==='finish-workout'){await queue;const unmarked=state.session.exercises.reduce((n,e)=>n+e.sets.filter(s=>!s.done).length,0);if(unmarked&&!confirm(`Не позначено ${unmarked} підходів. Зберегти лише виконані й завершити тренування?`))return;const completedId=state.session.id;await commit(finishSession,{redraw:false});ui.finishedId=completedId;if(window.scrollY)window.scrollTo(0,0);ui.tab='history';render();toast('Тренування збережено! 💪');return;}
  if(action==='cancel-workout'){if(confirm('Скасувати поточне тренування та видалити введені результати?')){await commit(s=>{s.session=null;s.restEndsAt=null;},{redraw:false});if(window.scrollY)window.scrollTo(0,0);ui.tab='home';render();}return;}
  if(action==='rest-start'||action==='rest-adjust')return commit(s=>{if(!s.session)return;s.restEndsAt=action==='rest-adjust'?Math.max(Date.now(),s.restEndsAt||Date.now())+30000:Date.now()+s.restSeconds*1000;timerNotified=null;},{redraw:false}).then(updateTimer);
  if(action==='rest-stop')return commit(s=>{s.restEndsAt=null;timerNotified=null;},{redraw:false}).then(updateTimer);
  if(action==='export')return exportBackup();
  if(action==='share-program'){await queue;openModal(shareProgramForm(state),'share-program');return;}
  if(action==='share-text')return shareProgramText();
  if(action==='copy-share-text')return copyProgramText();
  if(action==='export-legacy'){const text=await repo.recoveryText();if(!text)return toast('Даних попередньої версії немає');download(text,'set-before-v2.json');return;}
  if(action==='import')return document.getElementById('backup-file').click();
  if(action==='reset'){if(confirm('Очистити всі поточні плани та історію? Перед очищенням завантажиться резервна копія.')){await queue;backup(state,'set-before-reset');await commit(s=>{Object.assign(s,fresh());},{redraw:false});ui.tab='home';render();toast('Поточні дані очищено');}return;}
  if(action==='close-modal')return closeModal();
  if(action==='draft-add'){syncDraft();const name=draft.addName.trim();if(!name)return toast('Введи назву вправи');if(draft.exercises.length>=200)return toast('Максимум 200 вправ');draft.exercises.push({id:uid(),exerciseId:null,name,targetSets:4,targetReps:8});draft.addName='';displayDraft();return;}
  if(action==='draft-remove'){syncDraft();draft.exercises=draft.exercises.filter(e=>e.id!==id);displayDraft();return;}
  if(action==='draft-move'){syncDraft();moveItem(draft.exercises,id,Number(b.dataset.direction));displayDraft();return;}
  if(action==='delete-template'){if(confirm('Видалити план? Історія тренувань залишиться.')){await commit(s=>{s.templates=s.templates.filter(t=>t.id!==draft.id);});closeModal(true);}return;}
  if(action==='history-detail'){const w=state.history.find(w=>w.id===id);if(w)openModal(historyDetail(w),'history-detail');return;}
  if(action==='delete-history'){if(confirm('Видалити цей запис історії?')){await commit(s=>{s.history=s.history.filter(w=>w.id!==id);});closeModal(true);}return;}
  if(action==='edit-history'){historyDraft=clone(state.history.find(w=>w.id===id));openModal(historyEditor(historyDraft),'history-edit');return;}
  if(action==='history-remove-set'){syncHistoryDraft();const e=historyDraft.exercises.find(e=>e.id===b.dataset.ex);if(e.sets.length===1){if(!confirm('Прибрати вправу з цього запису?'))return;historyDraft.exercises=historyDraft.exercises.filter(x=>x.id!==e.id);}else e.sets=e.sets.filter(s=>s.id!==b.dataset.set);openModal(historyEditor(historyDraft),'history-edit');return;}
  if(action==='history-add-set'){syncHistoryDraft();const e=historyDraft.exercises.find(e=>e.id===id);if(e.sets.length>=200)return toast('Максимум 200 підходів');e.sets.push({id:uid(),weight:e.sets.at(-1)?.weight??0,reps:e.sets.at(-1)?.reps??8,done:true});openModal(historyEditor(historyDraft),'history-edit');return;}
  if(action==='chart-metric'){ui.metric=b.dataset.metric;render();return;}
  if(action==='rename-exercise'){const e=state.catalog.find(e=>e.id===id);openModal(`${button('close-modal','×','aria-label="Закрити"','modal-close')}<h2>Назва вправи</h2><form id="rename-form" data-id="${esc(id)}"><label for="exercise-new-name" class="filter-label">Нова назва<input id="exercise-new-name" class="field" maxlength="90" required value="${esc(e.name)}"></label><button type="submit" class="btn block">Зберегти</button></form>`,'rename');return;}
  if(action==='check-offline'){ui.offlineStatus=await checkOffline();render();toast(ui.offlineStatus);return;}
  if(action==='persist-storage'){ui.storageStatus=await requestPersistence();render();return;}
}
document.addEventListener('click',event=>{const b=event.target.closest('[data-action]');if(b&&!b.disabled)handleAction(b).catch(showError);});
app.addEventListener('input',event=>{const x=event.target;
if(x.matches('[data-note-ex],[data-workout-note]')){const value=x.value;commit(s=>{if(x.hasAttribute('data-workout-note'))s.session.note=value;else{const e=sessionExercise(s,x.dataset.noteEx);e.note=value;const catalog=s.catalog.find(c=>c.id===e.exerciseId);if(catalog)catalog.note=value;}},{redraw:false,preserve:true}).catch(()=>{});return;}
if(!x.matches('[data-set][data-field]'))return;const {ex,set,field}=x.dataset,value=x.value.replace(',','.');const row=x.closest('.set-grid'),btn=row.querySelector('.done');row.closest('.set-block')?.querySelector('.pr-badge')?.remove();btn?.classList.remove('yes');btn?.setAttribute('aria-pressed','false');commit(s=>{const target=sessionSet(s,ex,set);target[field]=value;target.done=false;},{redraw:false,preserve:true}).catch(()=>{});});
app.addEventListener('change',event=>{const x=event.target;if(x.id==='keep-awake')commit(s=>{s.keepAwake=x.checked;},{redraw:false}).then(syncWakeLock).catch(()=>{});if(x.id==='rest-duration')commit(s=>{s.restSeconds=Number(x.value);},{redraw:false}).then(()=>toast('Тривалість відпочинку збережено')).catch(()=>{});if(x.id==='progress-ex'){ui.exerciseId=x.value;render();}if(x.id==='progress-period'){ui.progressDays=Number(x.value);render();}if(x.id==='history-period'){ui.historyDays=Number(x.value);render();}if(x.id==='backup-file')importBackup(x.files[0]);});
modal.addEventListener('cancel',event=>{event.preventDefault();closeModal();});
modal.addEventListener('change',event=>{if(event.target.id==='share-plan'){document.getElementById('share-text').value=programText(state.templates,event.target.value);document.getElementById('share-status').textContent='';}});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
modal.addEventListener('submit',event=>{event.preventDefault();const form=event.target;(async()=>{
  if(form.id==='template-form'){syncDraft();const saved=clone(draft);await commit(s=>{const exercises=saved.exercises.map(e=>({...e,exerciseId:e.exerciseId||getOrCreateExercise(s,e.name).id}));const t={id:saved.id,name:saved.name.trim(),day:saved.day,exercises};const index=s.templates.findIndex(x=>x.id===t.id);if(index<0)s.templates.push(t);else s.templates[index]=t;});closeModal(true);toast('План збережено');}
  if(form.id==='session-ex-form'){const name=document.getElementById('session-ex-name').value;await commit(s=>{if(s.session.exercises.length>=200)throw new Error('Максимум 200 вправ');const exercise=getOrCreateExercise(s,name);s.session.exercises.push({id:uid(),exerciseId:exercise.id,name:exercise.name,...(exercise.note!==undefined?{note:exercise.note}:{}),sets:Array.from({length:4},()=>({id:uid(),weight:'',reps:'',done:false}))});});closeModal(true);}
  if(form.id==='history-form'){syncHistoryDraft();const saved=clone(historyDraft);await commit(s=>{const index=s.history.findIndex(w=>w.id===saved.id);s.history[index]=saved;});closeModal(true);toast('Запис виправлено');}
  if(form.id==='rename-form'){const name=document.getElementById('exercise-new-name').value.trim().replace(/\s+/g,' '),id=form.dataset.id;await commit(s=>{const existing=getOrCreateExercise(clone(s),name);if(existing.id!==id&&s.catalog.some(e=>e.id===existing.id))throw new Error('Вправа з такою назвою вже є. Обери іншу назву.');s.catalog.find(e=>e.id===id).name=name;for(const t of s.templates)for(const e of t.exercises)if(e.exerciseId===id)e.name=name;});closeModal(true);toast('Назву оновлено, історію збережено');}
})().catch(showError);});
function updateTimer(){if(!state)return;const elapsed=document.getElementById('workoutElapsed');if(elapsed&&state.session)elapsed.textContent=formatClock(Math.max(0,Math.floor((Date.now()-Date.parse(state.session.startedAt))/1000)));document.title=state.restEndsAt>Date.now()?'('+formatClock(remaining(state.restEndsAt,state.restSeconds))+') СЕТ':'СЕТ';const target=document.getElementById('restTimer');if(target)target.textContent=formatClock(remaining(state.restEndsAt,state.restSeconds));const label=document.getElementById('restLabel');if(label)label.textContent=state.restEndsAt&&remaining(state.restEndsAt,state.restSeconds)===0?'Відпочинок завершено':'Відпочинок між підходами';if(state.restEndsAt&&state.restEndsAt<=Date.now()&&timerNotified!==state.restEndsAt&&!document.hidden){timerNotified=state.restEndsAt;beep();toast('Час наступного підходу!');}}
setInterval(()=>{if(!document.hidden)updateTimer();},1000);
document.addEventListener('visibilitychange',()=>{syncWakeLock();if(!document.hidden)updateTimer();});
window.addEventListener('pageshow',()=>{updateTimer();syncWakeLock();});
window.addEventListener('pagehide',()=>{wakeLock.sync(false).catch(()=>{});});
window.addEventListener('beforeunload',event=>{if(pending||failed){event.preventDefault();event.returnValue='';}});
function storageChanged(){stale=true;showError(new Error('СЕТ оновлено в іншому вікні. За потреби збережи копію та перезавантаж сторінку.'));saveStatus();}
channel?.addEventListener('message',event=>{if(event.data.revision>repo.revision)storageChanged();});
window.addEventListener('set-storage-changed',storageChanged);
document.getElementById('noticeExport').addEventListener('click',()=>{if(state)exportBackup().catch(showError);else repo.recoveryText().then(text=>{if(text)download(text,'set-recovery.json');else toast('Попередніх локальних даних немає');});});
document.getElementById('noticeReload').addEventListener('click',()=>{if((pending||failed)&&!confirm('Є незбережені зміни. Спочатку збережи копію. Перезавантажити?'))return;location.reload();});
async function boot(){try{const result=await repo.open();state=result.state;ui.tab=state.session?'workout':'home';render();if(result.migrated)toast('Дані перенесено. Попередня копія залишилася на пристрої.');}catch(error){app.innerHTML='<div class="shell"><h1>Не вдалося відкрити дані</h1><p class="subtle">Наявні записи не перезаписані. Збережи копію даних або повтори запуск.</p><button class="btn alt" id="startupImport">Відновити з JSON</button><input type="file" id="startupFile" accept=".json,application/json" hidden></div>';showError(error);document.getElementById('startupImport').onclick=()=>document.getElementById('startupFile').click();document.getElementById('startupFile').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>30*1024*1024)throw new Error('Файл завеликий');const incoming=normalize(JSON.parse(await file.text()));if(!repo.db)throw new Error('Сховище недоступне. Відкрий СЕТ у звичайному режимі Safari.');if(!confirm('Відновити застосунок із перевіреної копії?'))return;await repo.write(incoming);location.reload();}catch(e){showError(e);}};}}
await boot();
setupPWA({canUpdate:()=>!pending&&!failed&&!state?.session,onStatus:status=>{ui.offlineStatus=status;const target=document.getElementById('offlineStatus');if(target)target.textContent=status;},onUpdate:apply=>{const banner=document.getElementById('updateBanner');banner.hidden=false;document.getElementById('applyUpdate').onclick=async()=>{await queue;if(state?.session)return toast('Оновлення можна встановити після завершення тренування');if(failed)return toast('Спочатку збережи незбережені дані');apply();};}}).catch(error=>{ui.offlineStatus=`Офлайн не підготовлено: ${error.message}`;const target=document.getElementById('offlineStatus');if(target)target.textContent=ui.offlineStatus;});
for(const name of ['online','offline'])window.addEventListener(name,()=>{const target=document.getElementById('connectionStatus');if(target)target.textContent=navigator.onLine?'НА ПРИСТРОЇ':'БЕЗ ІНТЕРНЕТУ';});
