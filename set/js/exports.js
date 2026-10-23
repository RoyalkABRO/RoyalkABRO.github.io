import {volume, localDay, setRecords} from './stats.js';

// Quotes preserve commas/newlines; a leading apostrophe prevents spreadsheet formulas.
const cell = value => '"' + String(value ?? '').replace(/^(\s*)([=+@-])/, "$1'$2").replaceAll('"', '""') + '"';
export function historyCSV(history) {
  const rows = [['Дата','Тренування','Початок','Завершення','Хвилини','Вправа','Підхід','Вага (кг)','Повторення','Нотатка вправи','Нотатка тренування']];
  for (const w of history) for (const e of w.exercises) e.sets.forEach((s,i) => rows.push([
    localDay(w.finishedAt), w.title, w.startedAt, w.finishedAt,
    Math.round((Date.parse(w.finishedAt)-Date.parse(w.startedAt))/60000),
    e.name, i+1, s.weight, s.reps, e.note || '', w.note || ''
  ]));
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}

export async function workoutImage(w, history = []) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1920;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Не вдалося створити картку');
  c.fillStyle = '#090b09'; c.fillRect(0,0,1080,1920);
  const gradient = c.createRadialGradient(900,100,10,900,100,950);
  gradient.addColorStop(0,'#263317'); gradient.addColorStop(1,'#090b09');
  c.fillStyle = gradient; c.fillRect(0,0,1080,1920);
  const text = (s,x,y,size,color='#f5f5f0',weight=500) => {
    c.font = `${weight} ${size}px system-ui, sans-serif`; c.fillStyle=color; c.fillText(String(s),x,y);
  };
  const clipped = (s,x,y,size,color='#f5f5f0',weight=500) => {
    c.font = `${weight} ${size}px system-ui, sans-serif`;
    let t=String(s); while(c.measureText(t).width>910 && t.length>1)t=t.slice(0,-1);
    text(t===String(s)?t:t.slice(0,-1)+'…',x,y,size,color,weight);
  };
  text('СЕТ',80,155,72,'#c8f542',800);
  text('ТРЕНУВАННЯ ЗАВЕРШЕНО',80,255,28,'#a3aaa0');
  // Two bounded lines prevent long user titles from colliding with the statistics.
  c.font='700 64px system-ui'; let first='',second='';
  for(const word of w.title.split(/\s+/)) {
    if(!second && c.measureText((first?first+' ':'')+word).width<=910)first+=(first?' ':'')+word;
    else second+=(second?' ':'')+word;
  }
  clipped(first||second,80,370,64,'#f5f5f0',700);
  if(first&&second)clipped(second,80,448,64,'#f5f5f0',700);
  text(new Date(w.finishedAt).toLocaleDateString('uk-UA',{day:'numeric',month:'long',year:'numeric'}),80,535,30,'#a3aaa0');
  const sets=w.exercises.reduce((n,e)=>n+e.sets.length,0);
  const minutes=Math.max(1,Math.round((Date.parse(w.finishedAt)-Date.parse(w.startedAt))/60000));
  text(volume(w).toLocaleString('uk-UA')+' кг',80,700,92,'#c8f542',700);
  text('СУМАРНИЙ ОБСЯГ',80,755,26,'#a3aaa0');
  const plural=(n,forms)=>forms[n%10===1&&n%100!==11?0:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?1:2];
  text(`${sets} ${plural(sets,['підхід','підходи','підходів'])}  ·  ${w.exercises.length} ${plural(w.exercises.length,['вправа','вправи','вправ'])}  ·  ${minutes} хв`,80,840,32);
  const prior=history.filter(x=>x.id!==w.id&&Date.parse(x.finishedAt)<=Date.parse(w.startedAt));
  const seen=new Map(); let prs=0;
  for(const e of w.exercises)for(const s of e.sets) {
    const earlier=seen.get(e.exerciseId)||[];
    if(setRecords(prior,e.exerciseId,s,earlier).length)prs++;
    earlier.push(s);seen.set(e.exerciseId,earlier);
  }
  if(prs)text(`Рекордних підходів: ${prs}`,80,905,28,'#c8f542');
  let y=990;
  for(const e of w.exercises.slice(0,7)) {
    clipped(e.name,80,y,32);
    clipped(e.sets.map(s=>`${s.weight} × ${s.reps}`).join('  ·  '),80,y+46,26,'#a3aaa0');
    y+=108;
  }
  if(w.exercises.length>7)text(`Ще ${w.exercises.length-7} вправ`,80,1760,26,'#a3aaa0');
  text('КОЖЕН ПІДХІД МАЄ ЗНАЧЕННЯ.',80,1840,27,'#c8f542',600);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Не вдалося зберегти картку')),'image/png'));
}
