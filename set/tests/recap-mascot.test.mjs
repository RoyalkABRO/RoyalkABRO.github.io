import test from 'node:test';
import assert from 'node:assert/strict';
import {MASCOT_TIMING,mascotScene,mascotSequence,mascotSVG,mountMascot} from '../js/recap-mascot.js';
import {recapSlides} from '../js/recap-view.js';
import {buildRecap,periodFor} from '../js/recap.js';
import {demoData,TODAY} from './recap-fixtures.mjs';

function fixture(reduced=false){
 const clock=new EventTarget(),motion=new EventTarget(),scene={
  dataset:{mascot:'up'},querySelector:()=>clock,style:{setProperty(){}}
 };
 clock.getBoundingClientRect=()=>({});
 motion.matches=reduced;
 const end=phase=>clock.dispatchEvent(Object.assign(new Event('animationend'),{
  animationName:'mascot-beat',elapsedTime:MASCOT_TIMING[phase]/1000
 }));
 const prefers=matches=>{motion.matches=matches;motion.dispatchEvent(new Event('change'));};
 return {scene,motion,end,prefers};
}
test('mascot cue phases are explicit for every active and resting state',()=>{
 for(const state of ['up','down','stable','record','celebration'])assert.deepEqual(mascotSequence(state),['anticipation',state]);
 for(const state of ['idle','insufficient','anticipation'])assert.deepEqual(mascotSequence(state),[state]);
 assert.throws(()=>mascotSequence('random'),RangeError);
});
test('phase clock coordinates pause, skip, restart and completion without double events',()=>{
 const f=fixture();
 let completed=0;
 const player=mountMascot(f.scene,{motion:f.motion,onComplete:()=>completed++});
 assert.equal(f.scene.dataset.phase,'anticipation');
 assert.equal(player.pause(),true);
 assert.equal(f.scene.dataset.paused,'true');
 assert.equal(player.pause(),false);
 f.end('anticipation');
 assert.equal(f.scene.dataset.phase,'up');
 f.end('anticipation');
 assert.equal(f.scene.dataset.phase,'up');
 f.end('up');
 assert.equal(f.scene.dataset.phase,'settled');
 player.skip();
 assert.equal(completed,1);
 player.restart();
 assert.equal(f.scene.dataset.phase,'anticipation');
 player.skip();
 assert.equal(completed,2);
 assert.equal(f.scene.dataset.phase,'settled');
});
test('reduced motion starts settled and cancels ongoing choreography when enabled',()=>{
 const f=fixture(true);
 let completed=0;
 const player=mountMascot(f.scene,{motion:f.motion,onComplete:()=>completed++});
 assert.equal(f.scene.dataset.phase,'settled');
 assert.equal(player.pause(),false);
 f.prefers(false);player.restart();
 assert.equal(f.scene.dataset.phase,'anticipation');
 f.end('anticipation');
 f.prefers(true);
 assert.equal(f.scene.dataset.phase,'settled');
 f.end('up');
 assert.equal(completed,2);
});
test('disposing removes phase and preference listeners and clears a paused state',()=>{
 const f=fixture();
 let complete=0;
 const player=mountMascot(f.scene,{motion:f.motion,onComplete:()=>complete++});
 player.pause();player.dispose();
 f.end('anticipation');f.prefers(true);player.restart();player.skip();
 assert.equal(f.scene.dataset.phase,'settled');
 assert.equal(f.scene.dataset.paused,undefined);
 assert.equal(complete,0);
});
const report=mode=>buildRecap(demoData(mode),periodFor('week','2026-11-16'),TODAY);
test('upward score and falling graph come from measured values, with escaped labels',()=>{
 const up=report('up'),down=report('down');
 assert.equal(recapSlides(up)[1].scene.prop.value.includes('%'),true);
 up.strength.delta=null;
 assert.equal(recapSlides(up)[1].scene.prop.value,up.strength.comparable+' зіставних вправ');
 const row=down.strength.rows.find(r=>r.direction==='down');
 row.name='<ім’я>';
 const {prop}=recapSlides(down)[1].scene;
 assert.equal(prop.before,row.before);
 assert.equal(prop.after,row.after);
 assert.match(mascotScene({state:'down',prop}),/&lt;ім’я&gt;/);
 assert.match(mascotScene({state:'down',prop}),/mascot-graph/);
});
test('record lift and celebration depend on the journal, and use one SVG avatar',()=>{
 const records=report('records'),slides=recapSlides(records);
 const lift=slides.find(slide=>slide.scene?.state==='record').scene;
 assert.ok(records.prs.some(p=>p.name===lift.prop.label&&lift.prop.value.includes(String(p.reps))));
 assert.match(mascotScene(lift),/mascot-barbell/);
 assert.equal(slides.at(-1).scene.state,'celebration');
 assert.equal(recapSlides(report('empty')).at(-1).scene,null);
 assert.ok(!recapSlides(report('stable')).some(slide=>slide.scene?.state==='record'));
 for(const state of Object.keys(MASCOT_TIMING))assert.match(mascotSVG(state),/class="mascot-skin" d="M150 44/);
 assert.doesNotMatch(mascotSVG('record',{card:true}),/mascot-barbell/);
});
