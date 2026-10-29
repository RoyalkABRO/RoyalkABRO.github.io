import {normalize,normalizeMeta,fresh,clone,LEGACY_KEY} from './model.js';
const DB_NAME='set-workout';
const STORES=['meta','catalog','templates','workouts'];
function completed(tx) {return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('Запис скасовано'));tx.onerror=()=>{};});}
function request(req) {return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function freezeHistory(state){
  const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
  freeze(state.history);freeze(state.templates);
  return state;
}
function snapshot(state){freezeHistory(state);return {...state,catalog:clone(state.catalog),session:clone(state.session)};}
export class Repository {
  constructor(factory,legacy){
    this.revision=0;this.last=null;
    try{this.factory=factory===undefined?globalThis.indexedDB:factory;}catch{this.factory=null;}
    try{this.legacy=legacy===undefined?globalThis.localStorage:legacy;}catch{this.legacyError=true;}
  }
  async open() {
    if(!this.factory) throw new Error('Браузер не надав доступ до сховища. Відкрий СЕТ через HTTPS або localhost.');
    const req=this.factory.open(DB_NAME,1);
    req.onupgradeneeded=()=>{for(const name of STORES) req.result.createObjectStore(name,{keyPath:'id'});};
    this.db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Закрий інші вікна СЕТ і спробувати ще раз'));});
    this.db.onversionchange=()=>{this.db.close();globalThis.dispatchEvent?.(new Event('set-storage-changed'));};
    const state=await this.read();
    if(state) return {state,migrated:false};
    let raw;try{if(this.legacyError)throw new Error();raw=this.legacy?.getItem(LEGACY_KEY);}catch{throw new Error('Не вдалося прочитати попередні дані. Сховище не змінено.');}
    // The old key is deliberately retained as a recovery copy, even after migration.
    const initial=raw?normalize(JSON.parse(raw)):fresh();
    await this.write(initial);
    const verified=await this.read();
    if(JSON.stringify(initial)!==JSON.stringify(verified)) throw new Error('Не вдалося перевірити перенесені дані');
    return {state:verified,migrated:Boolean(raw)};
  }
  async read() {
    const tx=this.db.transaction(STORES,'readonly'), done=completed(tx);
    const [meta,catalog,templates,history]=await Promise.all([request(tx.objectStore('meta').get('state')),request(tx.objectStore('catalog').getAll()),request(tx.objectStore('templates').getAll()),request(tx.objectStore('workouts').getAll())]);
    await done;
    if(!meta) return null;
    this.revision=meta.revision;
    const ordered=(rows,ids)=>{const byId=new Map(rows.map(row=>[row.id,row]));return ids.map(id=>byId.get(id));};
    const value=normalize({...meta.value,catalog:ordered(catalog,meta.catalogOrder),templates:ordered(templates,meta.templateOrder),history:ordered(history,meta.historyOrder)});
    this.last=snapshot(value);
    return freezeHistory(value);
  }
  async write(value, {sessionOnly=false}={}) {
    if(sessionOnly&&this.last&&value.history===this.last.history&&value.templates===this.last.templates&&this.last.catalog.every(e=>value.catalog.some(c=>c.id===e.id))){
      const next=normalizeMeta(value,this.last);
      const catalogChanged=JSON.stringify(next.catalog)!==JSON.stringify(this.last.catalog);
      const stores=catalogChanged?['meta','catalog']:['meta'];
      const tx=this.db.transaction(stores,'readwrite'), done=completed(tx);
      let conflict=false;
      const req=tx.objectStore('meta').get('state');
      req.onsuccess=()=>{
        if((req.result?.revision||0)!==this.revision){conflict=true;tx.abort();return;}
        try {
          if(catalogChanged){
            const before=new Map((this.last.catalog||[]).map(x=>[x.id,x]));
            const after=new Map(next.catalog.map(x=>[x.id,x]));
            for(const id of before.keys()) if(!after.has(id))tx.objectStore('catalog').delete(id);
            for(const [id,row] of after) if(JSON.stringify(row)!==JSON.stringify(before.get(id)))tx.objectStore('catalog').put(row);
          }
          const {catalog,templates,history,...settings}=next;
          tx.objectStore('meta').put({id:'state',revision:this.revision+1,value:settings,catalogOrder:catalog.map(x=>x.id),templateOrder:templates.map(x=>x.id),historyOrder:history.map(x=>x.id)});
        } catch {tx.abort();}
      };
      try{await done;}catch(error){if(conflict) throw new Error('Дані змінені в іншому вікні. Експортуй незбережене й перезавантаж сторінку.');throw error;}
      this.revision++;
      this.last={...next,catalog:clone(next.catalog),session:clone(next.session),templates:this.last.templates,history:this.last.history};
      return freezeHistory(next);
    }
    const next=normalize(value);
    const tx=this.db.transaction(STORES,'readwrite'), done=completed(tx);
    let conflict=false;
    const req=tx.objectStore('meta').get('state');
    req.onsuccess=()=>{
      if((req.result?.revision||0)!==this.revision){conflict=true;tx.abort();return;}
      try {
        for(const [store,key] of [['catalog','catalog'],['templates','templates'],['workouts','history']]) {
          const before=new Map((this.last?.[key]||[]).map(x=>[x.id,x]));
          const after=new Map(next[key].map(x=>[x.id,x]));
          for(const id of before.keys()) if(!after.has(id))tx.objectStore(store).delete(id);
          for(const [id,row] of after) if(JSON.stringify(row)!==JSON.stringify(before.get(id)))tx.objectStore(store).put(row);
        }
        const {catalog,templates,history,...settings}=next;
        tx.objectStore('meta').put({id:'state',revision:this.revision+1,value:settings,catalogOrder:catalog.map(x=>x.id),templateOrder:templates.map(x=>x.id),historyOrder:history.map(x=>x.id)});
      } catch {tx.abort();}
    };
    try{await done;}catch(error){if(conflict) throw new Error('Дані змінені в іншому вікні. Експортуй незбережене й перезавантаж сторінку.');throw error;}
    this.revision++;this.last=snapshot(next);
    return freezeHistory(next);
  }
  async recoveryText() {try{return this.legacy?.getItem(LEGACY_KEY)||'';}catch{return '';}}
  close(){this.db?.close();}
}
