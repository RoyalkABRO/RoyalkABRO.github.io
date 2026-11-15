import {createHash,randomBytes} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
export class PushStore{
 constructor(sql){this.sql=sql;for(const statement of [
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,subscription TEXT NOT NULL,sequence INTEGER NOT NULL DEFAULT 0,last_test INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS timers (device_id TEXT PRIMARY KEY,sequence INTEGER NOT NULL,ends_at INTEGER NOT NULL,kind TEXT NOT NULL,retry_at INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS recaps (device_id TEXT NOT NULL,kind TEXT NOT NULL,sequence INTEGER NOT NULL,period_id TEXT,ends_at INTEGER,retry_at INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(device_id,kind))'
 ])sql.exec(statement);}
 one(query,...args){return this.sql.exec(query,...args).toArray()[0];}
 getKeys(generate){const row=this.one('SELECT value FROM meta WHERE key=?','vapid');if(row)return JSON.parse(row.value);const keys=generate();this.sql.exec('INSERT INTO meta VALUES (?,?)','vapid',JSON.stringify(keys));return keys;}
 enroll(subscription){if(this.one('SELECT COUNT(*) AS n FROM devices').n>=16)throw Object.assign(Error('Device limit reached'),{status:429});const id=randomBytes(16).toString('hex'),token=randomBytes(32).toString('base64url');this.sql.exec('INSERT INTO devices(id,token_hash,subscription) VALUES (?,?,?)',id,hash(token),JSON.stringify(subscription));return {id,token};}
 authenticate(token){if(typeof token!=='string'||token.length>=200)return;return this.one('SELECT * FROM devices WHERE token_hash=?',hash(token));}
 updateTimer(device,sequence,endsAt,kind){const current=this.one('SELECT sequence FROM devices WHERE id=?',device.id);if(!current)throw Object.assign(Error('Device revoked'),{status:401});if(sequence<=current.sequence)return {accepted:sequence===current.sequence,sequence:current.sequence};this.sql.exec('UPDATE devices SET sequence=? WHERE id=?',sequence,device.id);if(endsAt===null)this.sql.exec('DELETE FROM timers WHERE device_id=?',device.id);else this.sql.exec('INSERT INTO timers(device_id,sequence,ends_at,kind) VALUES (?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET sequence=excluded.sequence,ends_at=excluded.ends_at,kind=excluded.kind,retry_at=0,attempts=0',device.id,sequence,endsAt,kind);return {accepted:true,sequence};}
 due(now){return this.sql.exec('SELECT t.*,d.subscription FROM timers t JOIN devices d ON d.id=t.device_id WHERE t.ends_at<=? AND t.retry_at<=? ORDER BY t.ends_at LIMIT 32',now,now).toArray();}
 current(timer){return this.one('SELECT sequence FROM timers WHERE device_id=?',timer.device_id)?.sequence===timer.sequence;}
 removeTimer(timer){this.sql.exec('DELETE FROM timers WHERE device_id=? AND sequence=?',timer.device_id,timer.sequence);}
 retry(timer,now){this.sql.exec('UPDATE timers SET attempts=attempts+1,retry_at=? WHERE device_id=? AND sequence=?',now+Math.min(10000,2000*2**timer.attempts),timer.device_id,timer.sequence);}
 scheduleRecaps(device,sequence,week,month){
  this.sql.exec('INSERT INTO recaps(device_id,kind,sequence,period_id,ends_at) VALUES (?,?,?,?,?),(?,?,?,?,?) ON CONFLICT(device_id,kind) DO UPDATE SET sequence=excluded.sequence,period_id=excluded.period_id,ends_at=excluded.ends_at,retry_at=0,attempts=0 WHERE excluded.sequence > recaps.sequence',
   device.id,'week',sequence,week.id,week.endsAt,device.id,'month',sequence,month.id,month.endsAt);
  const current=this.one('SELECT MAX(sequence) AS n FROM recaps WHERE device_id=?',device.id).n;
  return {accepted:current===sequence,sequence:current};
 }
 dueRecaps(now){
  return this.sql.exec('SELECT r.*,d.subscription FROM recaps r JOIN devices d ON d.id=r.device_id WHERE r.ends_at<=? AND r.retry_at<=? ORDER BY r.ends_at LIMIT 32',now,now).toArray();
 }
 currentRecap(row){
  const current=this.one('SELECT sequence,ends_at FROM recaps WHERE device_id=? AND kind=?',row.device_id,row.kind);
  return current?.ends_at===row.ends_at&&current.sequence===row.sequence;
 }
 consumeRecap(row){this.sql.exec('UPDATE recaps SET ends_at=NULL WHERE device_id=? AND kind=? AND sequence=?',row.device_id,row.kind,row.sequence);}
 retryRecap(row,now){this.sql.exec('UPDATE recaps SET attempts=attempts+1,retry_at=? WHERE device_id=? AND kind=? AND sequence=?',
  now+60000*2**row.attempts,row.device_id,row.kind,row.sequence);}
 revoke(id){this.sql.exec('DELETE FROM recaps WHERE device_id=?',id);this.sql.exec('DELETE FROM timers WHERE device_id=?',id);this.sql.exec('DELETE FROM devices WHERE id=?',id);}
 allowTest(device,now){const d=this.one('SELECT last_test FROM devices WHERE id=?',device.id);if(!d||d.last_test>now-10000)return false;this.sql.exec('UPDATE devices SET last_test=? WHERE id=?',now,device.id);return true;}
 nextAlarm(){return this.one('SELECT MIN(deadline) AS next FROM (SELECT MAX(ends_at,retry_at) AS deadline FROM timers UNION ALL SELECT MAX(ends_at,retry_at) FROM recaps WHERE ends_at IS NOT NULL)')?.next??null;}
}
