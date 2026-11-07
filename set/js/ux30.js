// Derived presentation facts. No storage or application state is changed here.
const plural=(n,one,few,many)=>n%10===1&&n%100!==11?one:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?few:many;
export const setWord=n=>plural(n,'підхід','підходи','підходів');
export function sessionSummary(session){const sets=session?.exercises.flatMap(e=>e.sets)||[];return{total:sets.length,done:sets.filter(s=>s.done).length,skipped:sets.filter(s=>s.skipped&&!s.done).length};}
export function finishPrompt(session){const{total,done}=sessionSummary(session);return{title:done?'Завершити тренування достроково?':'Ще немає виконаних підходів',message:done?`Виконано ${done} із ${total} підходів. Збережемо лише виконані результати.`:'Познач виконані підходи, щоб зберегти заняття. Або окремо скасуй це заняття — історія залишиться.',accept:done?`Зберегти ${done} ${setWord(done)} і завершити`:null,decline:'Продовжити тренування'};}
export function trendDescription(points,metric='weight'){
 if(points.length<2)return 'Потрібні щонайменше 2 тренування для графіка динаміки.';
 const ordered=[...points].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)),first=ordered[0],last=ordered.at(-1),diff=Math.round((last.value-first.value)*100)/100;
 if(ordered.every(p=>p.value===first.value))return `Без змін за ${points.length} ${points.length%10>=1&&points.length%10<=4&&(points.length%100<11||points.length%100>14)?'тренування':'тренувань'}`;
 if(!diff)return 'Останнє значення таке саме, як на початку періоду; між ними були зміни.';
 const weeks=Math.max(0,Math.ceil((Date.parse(last.date)-Date.parse(first.date))/604800000)),span=weeks?`${weeks} ${plural(weeks,'тиждень','тижні','тижнів')}`:`${points.length} ${plural(points.length,'тренування','тренування','тренувань')}`,unit=metric==='reps'?plural(Math.abs(diff),'повторення','повторення','повторень'):metric==='volume'?'кг обсягу':metric==='e1rm'?'кг оцінки ≈1RM':'кг';
 return `${diff>0?'+':''}${diff.toLocaleString('uk-UA')} ${unit} за ${span}`;
}
const key=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
export function weekActivity(history,anchor=new Date()){
 const start=new Date(anchor);start.setHours(12,0,0,0);start.setDate(start.getDate()-(start.getDay()+6)%7);const counts=new Map();for(const w of history){const k=key(new Date(w.finishedAt));counts.set(k,(counts.get(k)||0)+1);}
 return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return{date:key(d),day:d.getDate(),label:['Пн','Вт','Ср','Чт','Пт','Сб','Нд'][i],count:counts.get(key(d))||0};});
}
