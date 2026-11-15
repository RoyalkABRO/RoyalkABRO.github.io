export const remaining = (endsAt,seconds,now=Date.now()) => endsAt?Math.max(0,Math.ceil((endsAt-now)/1000)):seconds;
export function formatClock(seconds){const n=Math.max(0,Math.ceil(seconds));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
let audio;
export function unlockSound(){try{audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{}}
export function beep(){try{if(audio?.state!=='running')return;const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);oscillator.frequency.value=880;gain.gain.setValueAtTime(.15,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.5);oscillator.start();oscillator.stop(audio.currentTime+.5);}catch{}}

export function restOwner(state) {
  return state.restSetId ? state.session?.exercises.find(e=>e.sets.some(s=>s.id===state.restSetId)) : null;
}

export function stopRest(state) {
  state.restEndsAt=null;
  state.restSetId=null;
}

export function startRest(state,seconds,kind='set',setId=null,now=Date.now()) {
  state.restBaseSeconds=seconds||state.restSeconds;
  state.restDuration=state.restBaseSeconds;
  state.restKind=kind;
  state.restEndsAt=seconds>0?now+seconds*1000:null;
  state.restSetId=seconds>0?setId:null;
}

export function shiftRest(state,seconds,now=Date.now()) {
  if(!state.restEndsAt)return;
  const next=Math.max(0,Math.min(86400000,Math.max(0,state.restEndsAt-now)+seconds*1000));
  state.restEndsAt=now+next;
  state.restDuration=Math.max(state.restDuration,Math.ceil(next/1000));
}

export function restartRest(state,now=Date.now()) {
  if(state.restEndsAt)startRest(state,state.restBaseSeconds,state.restKind,state.restSetId,now);
}
