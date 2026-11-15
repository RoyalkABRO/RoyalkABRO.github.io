import {timingSafeEqual} from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const safeEqual=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
export function validSubscription(s){try{const u=new URL(s?.endpoint),allowed=u.hostname.endsWith('.push.apple.com')||u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.notify.windows.com');return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&allowed&&s.endpoint.length<=4096&&Buffer.from(s.keys?.p256dh||'','base64url').length===65&&Buffer.from(s.keys?.auth||'','base64url').length===16;}catch{return false;}}
const KYIV_DAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'});
const DAY=86400000,RECAP_TTL=12*3600000;
function recapDeadline(entry,kind,now){
 if(entry?.kind!==kind)fail('Некоректний тип RECAP');
 const {id,endsAt}=entry;
 if(id===null&&endsAt===null)return {id,endsAt};
 const match=typeof id==='string'&&id.match(/^(week|month):(\d{4}-\d{2}-\d{2})$/);
 if(!match||match[1]!==kind||!Number.isSafeInteger(endsAt)||endsAt<=now||endsAt>now+32*DAY)fail('Некоректний дедлайн RECAP');
 const start=new Date(match[2]+'T00:00:00Z');
 if(!Number.isFinite(+start)||start.toISOString().slice(0,10)!==match[2]||
   (kind==='week'?start.getUTCDay()!==1:start.getUTCDate()!==1))fail('Некоректний період RECAP');
 const end=new Date(+start);
 if(kind==='week')end.setUTCDate(end.getUTCDate()+7);else end.setUTCMonth(end.getUTCMonth()+1);
 const expected=end.toISOString().slice(0,10);
 if(KYIV_DAY.format(endsAt)!==expected||KYIV_DAY.format(endsAt-1)>=expected)fail('Некоректна дата завершення RECAP');
 return {id,endsAt};
}
export function createPushService({store,send,publicKey,pairingCode,origin='https://royalkabro.github.io',now=Date.now}){
 if(!pairingCode||pairingCode.length<16)throw Error('PAIRING_CODE must contain at least 16 characters.');
 const enrollAttempts=new Map(),inFlight=new Set();
 const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
 const payload=(kind,sequence,time)=>({type:'rest-complete',title:'СЕТ · Відпочинок завершено',body:kind==='exercise'?'Можна переходити до наступної вправи.':'Час наступного підходу.',sequence,expiresAt:time+60000});
 async function processTimers(){for(const timer of store.due(now())){if(inFlight.has(timer.device_id))continue;inFlight.add(timer.device_id);try{if(!store.current(timer))continue;if(now()-timer.ends_at>60000){store.removeTimer(timer);continue;}await send(JSON.parse(timer.subscription),payload(timer.kind,timer.sequence,timer.ends_at));store.removeTimer(timer);}catch(e){if(e.statusCode===404||e.statusCode===410)store.revoke(timer.device_id);else if(timer.attempts>=3||now()-timer.ends_at>60000)store.removeTimer(timer);else store.retry(timer,now());}finally{inFlight.delete(timer.device_id);}}}
 async function processDue(){
  await processTimers();
  for(const row of store.dueRecaps(now())){
   const key=row.device_id+':'+row.kind;
   if(inFlight.has(key))continue;
   inFlight.add(key);
   try{
    if(!store.currentRecap(row))continue;
    if(now()-row.ends_at>RECAP_TTL){store.consumeRecap(row);continue;}
    await send(JSON.parse(row.subscription),{type:'recap',id:row.period_id,expiresAt:row.ends_at+RECAP_TTL});
    store.consumeRecap(row);
   }catch(e){
    if(e.statusCode===404||e.statusCode===410)store.revoke(row.device_id);
    else if(row.attempts>=3)store.consumeRecap(row);
    else store.retryRecap(row,now());
   }finally{inFlight.delete(key);}
  }
 }
 async function handle(request){const url=new URL(request.url),requestOrigin=request.headers.get('Origin');const cors=requestOrigin===origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'}:{};
 try{if(url.pathname==='/health')return json({ok:true});if(requestOrigin!==origin)return json({error:'Origin не дозволений'},403);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(url.pathname==='/v1/config'&&request.method==='GET')return json({publicKey,recapScheduling:true},200,cors);
 let data={};if(request.method==='POST'){const text=await request.text();if(text.length>12288)fail('Запит завеликий',413);try{data=JSON.parse(text);}catch{fail('Некоректний JSON');}}
 if(url.pathname==='/v1/enroll'&&request.method==='POST'){const ip=request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown',time=now();let a=enrollAttempts.get(ip);if(!a||time-a.start>300000)a={start:time,n:0};a.n++;enrollAttempts.set(ip,a);if(enrollAttempts.size>1000){for(const [key,value] of enrollAttempts)if(time-value.start>300000)enrollAttempts.delete(key);}if(a.n>8)fail('Забагато спроб. Спробуй пізніше.',429);if(!safeEqual(data.pairingCode||'',pairingCode))fail('Невірний код підключення',403);if(!validSubscription(data.subscription))fail('Некоректна push-підписка');return json(store.enroll(data.subscription),201,cors);}
 const auth=request.headers.get('Authorization')||'',device=store.authenticate(auth.startsWith('Bearer ')?auth.slice(7):'');if(!device)fail('Пристрій не підключений',401);
 if(url.pathname==='/v1/timer'&&request.method==='POST'){if(!Number.isSafeInteger(data.sequence)||data.sequence<1)fail('Некоректна версія таймера');const endsAt=data.endsAt===null?null:Number(data.endsAt);if(endsAt!==null&&(!Number.isSafeInteger(endsAt)||endsAt<now()-5000||endsAt>now()+86400000))fail('Некоректний час таймера');if(!['warmup','set','exercise'].includes(data.kind))fail('Некоректний тип відпочинку');return json(store.updateTimer(device,data.sequence,endsAt,data.kind),200,cors);}
 if(url.pathname==='/v1/recap'&&request.method==='POST'){
  if(!Number.isSafeInteger(data.sequence)||data.sequence<1||!Array.isArray(data.periods)||data.periods.length!==2)fail('Некоректний запит RECAP');
  const week=recapDeadline(data.periods[0],'week',now()),month=recapDeadline(data.periods[1],'month',now());
  return json(store.scheduleRecaps(device,data.sequence,week,month),200,cors);
 }
 if(url.pathname==='/v1/test'&&request.method==='POST'){if(!store.allowTest(device,now()))fail('Зачекай 10 секунд перед наступним тестом',429);await send(JSON.parse(device.subscription),{type:'test',title:'СЕТ · Сповіщення працюють',body:'Це тестове сповіщення.',expiresAt:now()+60000});return json({accepted:true},200,cors);}
 if(url.pathname==='/v1/device'&&request.method==='DELETE'){store.revoke(device.id);return json({ok:true},200,cors);}return json({error:'Не знайдено'},404,cors);
 }catch(e){return json({error:e.status?e.message:'Не вдалося обробити запит'},e.status||503,cors);}}
 return {handle,processDue};
}
