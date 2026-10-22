export const remaining = (endsAt,seconds,now=Date.now()) => endsAt?Math.max(0,Math.ceil((endsAt-now)/1000)):seconds;
export function formatClock(seconds){const n=Math.max(0,Math.ceil(seconds));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
let audio;
export function unlockSound(){try{audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{}}
export function beep(){try{if(audio?.state!=='running')return;const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);oscillator.frequency.value=880;gain.gain.setValueAtTime(.15,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.5);oscillator.start();oscillator.stop(audio.currentTime+.5);}catch{}}
