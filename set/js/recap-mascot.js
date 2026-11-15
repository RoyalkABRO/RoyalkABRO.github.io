const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const MASCOT_TIMING={
 idle:0,anticipation:400,up:1050,down:1470,stable:950,record:1500,celebration:1200,insufficient:0
};

export function mascotSequence(state){
 if(!Object.hasOwn(MASCOT_TIMING,state))throw RangeError('Невідомий стан маскота.');
 return ['up','down','stable','record','celebration'].includes(state)?['anticipation',state]:[state];
}

const body='M150 44q10-11 20 0l52 56q9 11-5 15h-24v68q0 12-12 12h-42q-12 0-12-12v-68h-24q-14-4-5-15Z';
const shoe='M9 8q12-7 19 9l12 5q6 3 3 11H4q-6-4 1-13Z';
const glove='<path d="M-9 4q-6-6-1-11 3-5 8-4 7-2 12 3 6 8-1 15-9 8-18-3Z" fill="#f7f5dc" stroke="#293024" stroke-width="3"/><path d="M-6-4q3-2 7 0" fill="none" stroke="#a9ae93" stroke-width="2" stroke-linecap="round"/>';
const barbell=`<g class="mascot-barbell"><path d="M72 216h176" fill="none" stroke="#141914" stroke-width="12" stroke-linecap="round"/><path d="M72 214h176" fill="none" stroke="#c5c9b0" stroke-width="5"/>
 ${[65,255].map(x=>`<g transform="translate(${x} 216)"><rect x="-15" y="-21" width="30" height="42" rx="9" fill="#242c23" stroke="#121911" stroke-width="4"/><ellipse cx="-2" cy="0" rx="8" ry="18" fill="#424e39" stroke="#c0ea40" stroke-width="3"/><path d="M8-14v28" stroke="#7b885f" stroke-width="2"/></g>`).join('')}
 <g transform="translate(115 213)">${glove}</g><g transform="translate(205 213)">${glove}</g></g>`;

export function mascotSVG(state='idle',{card=false}={}){
 const jubilant=['up','record','celebration'].includes(state);
 const eyes=jubilant?
  '<path d="M140 113q7-10 14 0m12 0q7-10 14 0" stroke="#222c16" stroke-width="4" fill="none" stroke-linecap="round"/>':
  '<g class="mascot-eye-open"><ellipse cx="146" cy="110" rx="9" ry="12" fill="#f7f9dd"/><ellipse cx="174" cy="110" rx="9" ry="12" fill="#f7f9dd"/><g class="mascot-pupils" fill="#222c16"><ellipse cx="148" cy="111" rx="4" ry="7"/><ellipse cx="176" cy="111" rx="4" ry="7"/><circle cx="149" cy="108" r="1.5" fill="#fff"/><circle cx="177" cy="108" r="1.5" fill="#fff"/></g></g>';
 const mouth=jubilant?'<path d="M148 129q12 2 24 0-2 19-12 19t-12-19Z" fill="#263019"/><path d="M155 143q5-5 10 0-5 5-10 0" fill="#ff998d"/>':
  '<path d="M151 132q9 9 18 0" fill="none" stroke="#263019" stroke-width="4" stroke-linecap="round"/>';
 return `<svg class="mascot-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 256" aria-hidden="true" focusable="false">
 <defs><linearGradient id="set-mascot-lime" x2=".7" y2="1"><stop stop-color="#e6ff81"/><stop offset=".46" stop-color="#c7f33d"/><stop offset="1" stop-color="#92bd23"/></linearGradient></defs>
 <ellipse class="mascot-shadow" cx="160" cy="232" rx="67" ry="7" fill="#0b130d" opacity=".32"/>
 <g class="mascot-actor">
  <g class="mascot-step-left"><path d="M145 180l-7 26-8 12" fill="none" stroke="#263124" stroke-width="10" stroke-linecap="round"/><path d="${shoe}" transform="translate(99 198)" fill="#f3f2d6" stroke="#263124" stroke-width="3"/><path d="M109 218h17m-19 9h28" stroke="#a4bd67" stroke-width="2" stroke-linecap="round"/></g>
  <g class="mascot-step-right"><path d="M175 180l7 26 8 12" fill="none" stroke="#263124" stroke-width="10" stroke-linecap="round"/><path d="${shoe}" transform="translate(176 198)" fill="#f3f2d6" stroke="#263124" stroke-width="3"/><path d="M189 218h17m-19 9h28" stroke="#a4bd67" stroke-width="2" stroke-linecap="round"/></g>
  ${state==='record'&&!card?`<g class="mascot-lift-arms" fill="none" stroke="#263124" stroke-width="9" stroke-linecap="round"><path class="mascot-lift-left" d="M134 146l-19 53"/><path class="mascot-lift-right" d="M186 146l19 53"/></g>`:''}
  <g class="mascot-arm-left"><path d="M134 137q-25-5-27 13l-9 9" fill="none" stroke="#263124" stroke-width="9" stroke-linecap="round"/><g transform="translate(97 159)">${glove}</g></g>
  <g class="mascot-arm-right"><path d="M187 136q29 1 31 19l10 2" fill="none" stroke="#263124" stroke-width="9" stroke-linecap="round"/>
   <g class="mascot-fist" transform="translate(228 157)">${glove}</g>
   ${state==='stable'?`<g class="mascot-thumb" transform="translate(228 157)"><path d="M-9-2h5l2-11q5-6 8 0l-1 9h7q5 1 3 7l-3 9H-2l-7-5Z" fill="#f7f5dc" stroke="#293024" stroke-width="3" stroke-linejoin="round"/></g>`:''}
  </g>
  <path d="${body}" transform="translate(0 7)" fill="#526d1e" stroke="#202c1b" stroke-width="6" stroke-linejoin="round"/>
  <path class="mascot-skin" d="${body}" fill="url(#set-mascot-lime)" stroke="#27341b" stroke-width="5" stroke-linejoin="round"/>
  <path d="M110 101l46-50q4-4 8 0l14 15" fill="none" stroke="#f5ffb8" stroke-width="4" stroke-linecap="round"/>
  <g class="mascot-face">${eyes}${mouth}</g>
  ${!card&&state==='down'?'<g class="mascot-worry" fill="#263019" stroke="#263019"><ellipse cx="146" cy="110" rx="5" ry="9"/><ellipse cx="174" cy="110" rx="5" ry="9"/><ellipse cx="160" cy="138" rx="7" ry="9"/></g>':''}
  ${card?'':'<g class="mascot-strain" fill="none" stroke="#263019" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="m140 108 11 6-11 4m40-10-11 6 11 4"/><path d="M149 137q11-9 22 0"/></g>'}
 </g>
 ${state==='record'&&!card?barbell:''}
 </svg>`;
}

function propMarkup(prop){
 if(!prop)return '';
 if(prop.kind==='graph'){
  const extent=Math.max(2,Math.min(22,Math.round((1-prop.after/prop.before)*100)));
  const y=10+extent;
  return `<div class="mascot-prop mascot-graph"><span>${escape(prop.label)}</span>
   <svg viewBox="0 0 94 40" aria-hidden="true"><path d="M6 7v26h82" fill="none" stroke="currentColor" opacity=".25"/><path d="M10 10l73 ${extent}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="10" cy="10" r="3" fill="currentColor"/><circle cx="83" cy="${y}" r="3" fill="currentColor"/></svg>
   <strong>${escape(prop.value)}</strong></div>`;
 }
 return `<div class="mascot-prop mascot-${prop.kind==='record'?'pr':'score'}"><strong>${escape(prop.value)}</strong><span>${escape(prop.label)}</span></div>`;
}

export function mascotScene({state='idle',prop=null}={}){
 mascotSequence(state);
 return `<div class="mascot-scene" data-mascot="${state}" data-phase="ready">
  <div class="mascot-rings" aria-hidden="true"></div>
  <div class="mascot-motion-art" aria-hidden="true">${mascotSVG(state)}<span class="mascot-trail"></span>
  ${['up','record','celebration'].includes(state)?Array.from({length:12},(_,i)=>`<i class="mascot-paper" style="--angle:${i*30}deg;--delay:${(i%4)*27}ms"></i>`).join(''):''}
  ${state==='down'?'<span class="mascot-dust"></span>':''}</div>
  ${propMarkup(prop)}<i class="mascot-clock" aria-hidden="true"></i>
 </div>`;
}

export function mountMascot(scene,{motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),onComplete=()=>{},onMotionChange=()=>{}}={}){
 const state=scene.dataset.mascot,sequence=mascotSequence(state);
 const clock=scene.querySelector('.mascot-clock');
 let phaseIndex=0,disposed=false,completed=false;
 const resetAnimation=phase=>{
  scene.dataset.phase='ready';
  // Commit the reset before applying a phase, including on replay.
  clock.getBoundingClientRect();
  scene.style.setProperty('--beat',MASCOT_TIMING[phase]+'ms');
  scene.dataset.phase=phase;
 };
 const complete=()=>{
  if(disposed||completed)return;
  completed=true;scene.dataset.phase='settled';delete scene.dataset.paused;
  onComplete();
 };
 const advance=event=>{
  if(disposed||completed||event.target!==clock||event.animationName!=='mascot-beat')return;
  if(Math.abs(event.elapsedTime*1000-MASCOT_TIMING[sequence[phaseIndex]])>10)return;
  phaseIndex++;
  if(phaseIndex===sequence.length)complete();else resetAnimation(sequence[phaseIndex]);
 };
 const restart=()=>{
  if(disposed)return;
  phaseIndex=0;completed=false;delete scene.dataset.paused;
  if(motion?.matches)complete();else resetAnimation(sequence[0]);
 };
 const onPreferenceChange=()=>{
  if(motion.matches)complete();
  onMotionChange(motion.matches,completed);
 };
 clock.addEventListener('animationend',advance);
 motion?.addEventListener('change',onPreferenceChange);
 restart();
 return {
  restart,
  skip:complete,
  pause(){
   if(disposed||completed)return false;
   if(scene.dataset.paused){delete scene.dataset.paused;return false;}
   scene.dataset.paused='true';return true;
  },
  dispose(){
   if(disposed)return;
   disposed=true;clock.removeEventListener('animationend',advance);
   motion?.removeEventListener('change',onPreferenceChange);
   scene.dataset.phase='settled';delete scene.dataset.paused;
  }
 };
}
