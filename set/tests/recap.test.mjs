import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecap,completedPeriod,kyivDay,kyivMidnight,periodFor,previousPeriod,recapArchive} from '../js/recap.js';
import {recapDeadlines,recapPreferences,saveRecapPreferences,unreadRecaps} from '../js/recap-notices.js';
import {arrowArt,recapHub,recapSlides} from '../js/recap-view.js';
import {OFFLINE_ASSETS,CACHE_NAME} from '../js/pwa.js';
import {demoData,TODAY} from './recap-fixtures.mjs';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';

const week=periodFor('week','2026-11-16');
const report=mode=>buildRecap(demoData(mode),week,TODAY);
test('Kyiv midnight, leap February, weeks and months cross years and DST',()=>{
 assert.equal(kyivDay('2026-12-31T22:30:00Z'),'2027-01-01');
 assert.equal(kyivDay('2026-06-20T21:00:00Z'),'2026-06-21');
 assert.equal(new Date(kyivMidnight('2026-03-30')).toISOString(),'2026-03-29T21:00:00.000Z');
 const end=periodFor('week','2027-01-01');
 assert.equal(end.id,'week:2026-12-28');
 assert.equal(end.end,'2027-01-04');
 assert.equal(previousPeriod(periodFor('month','2027-01-04')).start,'2026-12-01');
 assert.equal(periodFor('month','2028-02-29').end,'2028-03-01');
 assert.equal(completedPeriod(end.id,'2027-01-03'),null);
 assert.deepEqual(completedPeriod(end.id,'2027-01-04'),end);
 for(const bad of ['week:2026-12-29','month:2026-02-30','month:2026-11-02','all','week:2026-12-28:test'])assert.equal(completedPeriod(bad,'2027-01-10'),null);
});
test('weekly rollup uses working sets, archived comparisons and calendar attendance',()=>{
 const r=report('up');
 assert.deepEqual(r.totals,{workouts:2,minutes:130,sets:6,reps:48,volume:2880,days:2});
 assert.equal(r.consistency.matched,1);
 assert.equal(r.consistency.planned,1);
 assert.equal(r.consistency.streak,2);
 assert.equal(r.strength.comparable,3);
 assert.equal(r.strength.delta,12.5);
 assert.equal(r.prs.length,3);
 assert.ok(r.prs.every(p=>p.metric==='weight'&&p.before.reps===8));
 assert.ok(r.awards.some(a=>a.name==='Машина рекордів'));
 assert.equal(r.muscles.groups.reduce((sum,g)=>sum+g.sets,0),6);
});
test('same-load repetitions have their own PR with prior result and delta',()=>{
 const data=demoData('stable');
 data.history[2].exercises[0].sets[1].reps=10;
 const r=buildRecap(data,week,TODAY);
 assert.deepEqual(r.prs.map(p=>[p.metric,p.before.reps,p.reps,p.delta]),[['reps',8,10,2]]);
});
test('four reveal states depend on logged performance, with distinct SVG/CSS motion',()=>{
 for(const [mode,status] of [['up','up'],['records','up'],['stable','stable'],['down','down'],['insufficient','insufficient'],['empty','insufficient']]){
  const r=report(mode);
  assert.equal(r.strength.status,status);
  const slides=recapSlides(r);
  assert.equal(slides.length,8);
  assert.equal(slides[1].art,status);
  assert.match(arrowArt(status),new RegExp('data-motion="'+status+'"'));
  assert.match(slides[6].body,/class="muscle-body"/);
 }
 const css=readFileSync(new URL('../recap.css',import.meta.url),'utf8');
 for(const name of ['recap-up','recap-steady','recap-down','recap-scan','prefers-reduced-motion'])assert.ok(css.includes(name));
});
test('deload, machine changes, bands and new exercises do not create false progress',()=>{
 const data=demoData('down');
 data.history[2].easy=true;data.history[3].easy=true;
 assert.equal(buildRecap(data,week,TODAY).strength.status,'insufficient');
 for(const [i,w] of data.history.entries()){
  w.easy=false;
  w.exercises=w.exercises.slice(0,1);
  const e=w.exercises[0];
  e.name='Згинання ніг';e.training.equipmentType='cable';
  e.equipment={station:i<2?'Згинання сидячи':'Згинання лежачи'};
 }
 assert.equal(buildRecap(data,week,TODAY).strength.rows.length,0);
 for(const [i,w] of data.history.entries()){
  const e=w.exercises[0];e.name='Підтягування';e.training.equipmentType='pullup';
  e.training.band=i<2?'Синя №1':'Синя №2';
  e.equipment={};
  e.sets[1].weight=0;e.sets[1].reps=i<2?5:11;
 }
 assert.equal(buildRecap(data,week,TODAY).strength.rows.length,0);
 data.history[2].exercises[0].training.band='Синя №1';
 const result=buildRecap(data,week,TODAY).strength;
 assert.equal(result.status,'insufficient');
 assert.equal(result.rows[0].metric,'reps');
 assert.equal(result.rows[0].after,11);
 assert.equal(result.delta,null);
});
test('reducing sets changes work totals but leaves strength stable',()=>{
 const data=demoData('stable');
 for(const w of data.history.slice(0,2))for(const e of w.exercises)e.sets.push({...e.sets[1],id:e.id+'-second'});
 const r=buildRecap(data,week,TODAY);
 assert.equal(r.totals.volume,r.prior.volume/2);
 assert.equal(r.strength.status,'stable');
 assert.equal(r.strength.delta,null);
});
test('monthly detail, all-time chart and archive recompute after an edit or date move',()=>{
 const data=demoData('up'),month=periodFor('month','2026-11-01');
 const reports=recapArchive(data.history,'2026-12-01');
 assert.equal(reports.length,3);
 assert.equal(new Set(reports.map(p=>p.id)).size,3);
 const m=buildRecap(data,month,'2026-12-01');
 assert.equal(m.weeks.length,6);
 assert.equal(m.half.length,3);
 assert.equal(recapSlides(m).length,12);
 assert.match(recapHub(data,{recapMode:'all'}),/id="recap-trend"/);
 const old=data.history[2];
 old.exercises[0].sets[1].weight=0;
 assert.ok(buildRecap(data,month,'2026-12-01').totals.volume<m.totals.volume);
 old.startedAt='2026-12-01T00:00:00Z';old.finishedAt='2026-12-01T01:00:00Z';
 assert.equal(recapArchive(data.history,'2026-12-01').find(p=>p.id===month.id).count,3);
});
test('notification IDs survive reload, preferences suppress inbox and only current active periods schedule',()=>{
 const data=demoData('up'),archive=recapArchive(data.history,TODAY),cache=new Map();
 const storage={getItem:key=>cache.get(key),setItem:(key,value)=>cache.set(key,value)};
 assert.deepEqual(unreadRecaps(archive,recapPreferences(storage),TODAY).map(p=>p.id),[week.id]);
 saveRecapPreferences(storage,{seen:[week.id,week.id]});
 assert.deepEqual(recapPreferences(storage).seen,[week.id]);
 assert.deepEqual(unreadRecaps(archive,recapPreferences(storage),TODAY),[]);
 assert.deepEqual(unreadRecaps(archive,saveRecapPreferences(storage,{enabled:false,seen:[]}),TODAY),[]);
 const now=Date.parse('2026-11-20T21:00:00Z'),alerts=recapDeadlines(data.history,true,now);
 assert.equal(alerts[0].id,week.id);
 assert.equal(new Date(alerts[1].endsAt).toISOString(),'2026-11-30T22:00:00.000Z');
 assert.ok(recapDeadlines(data.history,false,now).every(item=>item.endsAt===null));
 assert.ok(recapDeadlines([],true,now).every(item=>item.endsAt===null));
});

test('offline install caches complete RECAP module graph and notification clicks target the period',async()=>{
 const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 const recovery=readFileSync(new URL('../../set-update.html',import.meta.url),'utf8');
 assert.ok(recovery.includes(CACHE_NAME));
 const listeners=new Map(),cache=new Map(),shown=[],navigated=[];
 const scope='https://test.invalid/set/';
 let online=true;
 vm.runInNewContext(source,{ // CacheStorage has the same put/match interface for testing.
  self:{addEventListener:(name,fn)=>listeners.set(name,fn),location:new URL(scope),
   registration:{scope,showNotification:async(title,options)=>shown.push({title,options})},
   clients:{matchAll:async()=>[],openWindow:async url=>navigated.push(url)}},
  caches:{open:async name=>{assert.equal(name,CACHE_NAME);return {put:(key,value)=>cache.set(key,value),match:key=>cache.get(key)};}},
  URL,Request,Response,Date,Number,
  fetch:async request=>{assert.ok(online);assert.equal(new URL(request.url).searchParams.get('set_release'),CACHE_NAME);return new Response(request.url);}
 });
 const event=(name,data={})=>new Promise(resolve=>listeners.get(name)({...data,waitUntil:resolve,respondWith:resolve}));
 await event('install');
 online=false;
 const recoveryPage=await event('fetch',{request:{url:scope,mode:'navigate',method:'GET'}});
 assert.ok(recoveryPage.ok);
 assert.equal(cache.size,OFFLINE_ASSETS.length);
 for(const file of OFFLINE_ASSETS){
  assert.ok(cache.has(new URL(file,scope).href));
  assert.ok(existsSync(new URL(file==='./'?'../index.html':'../'+file.slice(2),import.meta.url)));
 }
 for(const file of ['./recap.css','./js/recap.js','./js/recap-notices.js','./js/recap-view.js']){
  assert.ok((await event('fetch',{request:{url:new URL(file,scope).href,method:'GET'}})).ok);
 }
 assert.ok(!OFFLINE_ASSETS.some(file=>file.includes('demo')));
 await event('push',{data:{json:()=>({type:'recap',id:week.id,expiresAt:Date.now()+60000})}});
 assert.equal(shown[0].options.tag,'set-recap-'+week.id);
 await event('notificationclick',{notification:{data:shown[0].options.data,close(){}}});
 assert.equal(new URL(navigated[0]).searchParams.get('recap'),week.id);
 await event('push',{data:{json:()=>({type:'rest-complete',expiresAt:Date.now()+60000})}});
 assert.equal(shown[1].options.tag,'set-rest');
});

test('scheduling a RECAP while a rest request is pending preserves its confirmed deadline',async()=>{
 const {PushNotifications}=await import('../js/push-notifications.js');
 const requests=new Map();
 const client=new PushNotifications({storage:{getItem:()=>null,setItem(){}},fetcher:(url,options)=>new Promise(resolve=>{
  const {sequence}=JSON.parse(options.body);
  requests.set(new URL(url).pathname,()=>resolve(Response.json({accepted:true,sequence})));
 })});
 client.url='https://test.invalid';client.device={sequence:0,token:'synthetic'};
 const deadline=Date.now()+30000;
 const rest=client.sync({session:{},restEndsAt:deadline});
 const restSequence=client.device.sequence;
 const recap=client.syncRecaps([{kind:'week',id:null,endsAt:null},{kind:'month',id:null,endsAt:null}]);
 requests.get('/v1/recap')();
 assert.equal(await recap,true);
 requests.get('/v1/timer')();
 await rest;
 assert.equal(client.device.sequence,restSequence);
 assert.equal(client.confirmedEnd,deadline);
});
