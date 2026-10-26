import test from 'node:test';
import assert from 'node:assert/strict';
import {workoutTimes} from '../js/model.js';
import {monthActivity,filteredHistory,series} from '../js/stats.js';
import {historyEditor,historyDetail} from '../js/views.js';
import {healthPayload} from '../js/apple-health.js';
process.env.TZ='Europe/Kyiv';
const w={id:'overnight',title:'Понеділок',startedAt:'2026-10-26T19:29:00+02:00',finishedAt:'2026-10-27T00:18:00+02:00',exercises:[]};
test('overnight workout belongs to its local start day in calendar, detail and filters',()=>{
 const month=monthActivity([w],new Date(2026,9,1));
 assert.equal(month[25].count,1);assert.equal(month[26].count,0);
 assert.match(historyDetail(w),/26 жовтня/);
 assert.equal(filteredHistory([w],1,Date.parse('2026-10-27T20:00:00+02:00')).length,0);
});
test('correcting finish preserves start and changes duration supplied to Health',()=>{
 const corrected={...w,...workoutTimes('2026-10-26T19:29','2026-10-26T21:00')};
 assert.equal(Date.parse(corrected.startedAt),Date.parse(w.startedAt));
 assert.equal(healthPayload(corrected).durationMinutes,91);
 assert.equal(w.finishedAt,'2026-10-27T00:18:00+02:00');
});
test('reject missing, invalid, equal and reversed endpoints; allow real overnight session',()=>{
 for(const [a,b] of [['',''],['bad','2026-10-26'],['2026-10-26T20:00','2026-10-26T20:00'],['2026-10-26T20:00','2026-10-26T19:00']])assert.throws(()=>workoutTimes(a,b));
 assert.equal(healthPayload({...w,...workoutTimes(w.startedAt,w.finishedAt)}).durationMinutes,289);
});
test('editor exposes independent local start and finish values',()=>{
 const html=historyEditor(w);assert.match(html,/id="history-date"[^>]+value="2026-10-26T19:29"/);assert.match(html,/id="history-end"[^>]+value="2026-10-27T00:18"/);
});
