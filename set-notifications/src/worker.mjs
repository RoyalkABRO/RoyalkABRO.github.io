import webpush from 'web-push';
import {PushStore} from './store.mjs';
import {createPushService} from './service.mjs';
export default {async fetch(request,env){return env.PUSH.get(env.PUSH.idFromName('set-private-push-v1')).fetch(request);}};
export class PushScheduler{
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.store=new PushStore(ctx.storage.sql);}
 service(){if(this.instance)return this.instance;const keys=this.store.getKeys(()=>webpush.generateVAPIDKeys());this.instance=createPushService({store:this.store,publicKey:keys.publicKey,pairingCode:this.env.PAIRING_CODE,origin:this.env.ALLOWED_ORIGIN||'https://royalkabro.github.io',send:async(subscription,payload)=>{
  let details;try{details=webpush.generateRequestDetails(subscription,JSON.stringify(payload),{vapidDetails:{...keys,subject:'https://royalkabro.github.io/set/'},TTL:60,urgency:'high',topic:'set-rest',contentEncoding:'aes128gcm'});}catch(e){throw Object.assign(Error('Не вдалося підготувати сигнал (PUSH_ENCRYPTION: '+e.name+').'),{status:503,cause:e});}
  let response;try{response=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(10000)});}catch(e){throw Object.assign(Error('Не вдалося з’єднатися із сервісом сповіщень (PUSH_NETWORK: '+e.name+').'),{status:503,cause:e});}
  if(!response.ok){const raw=await response.text();let reason='';try{const r=JSON.parse(raw).reason;if(['BadJwtToken','BadTtl','BadTopic','BadMessageId','BadPayload','PayloadTooLarge','Forbidden','ExpiredToken','Unregistered','BadWebPushEndpoint'].includes(r))reason=' '+r;}catch{}throw Object.assign(Error('Сервіс сповіщень відхилив сигнал (HTTP '+response.status+reason+').'),{status:503,statusCode:response.status});}await response.body?.cancel();
 }});return this.instance;}
 async schedule(){const next=this.store.nextAlarm();if(next===null)await this.ctx.storage.deleteAlarm();else await this.ctx.storage.setAlarm(Math.max(Date.now()+1,next));}
 async fetch(request){return this.ctx.blockConcurrencyWhile(async()=>{if(!this.env.PAIRING_CODE||this.env.PAIRING_CODE.length<16)return Response.json({ok:false,setupRequired:true,error:'Set PAIRING_CODE secret with at least 16 characters in Settings > Variables and Secrets.'},{status:503});const response=await this.service().handle(request);await this.schedule();return response;});}
 async alarm(){return this.ctx.blockConcurrencyWhile(async()=>{try{await this.service().processDue();}finally{await this.schedule();}});}
}
