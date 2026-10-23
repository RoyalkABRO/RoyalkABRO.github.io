import {workingSets} from './progression.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function canSaveProgramOrder(state){const w=state.session,t=state.templates.find(t=>t.id===w?.templateId);return Boolean(t&&w.exercises.length===t.exercises.length&&new Set(t.exercises.map(e=>e.exerciseId)).size===t.exercises.length&&new Set(w.exercises.map(e=>e.exerciseId)).size===w.exercises.length&&w.exercises.every(e=>t.exercises.some(p=>p.exerciseId===e.exerciseId)));}
export function reorderExercises(state,ids,saveProgram=false){
 const rows=state.session?.exercises;if(!rows||ids.length!==rows.length||new Set(ids).size!==rows.length||ids.some(id=>!rows.some(e=>e.id===id)))throw Error('Список вправ змінився. Відкрий його ще раз.');
 if(saveProgram&&!canSaveProgramOrder(state))throw Error('Заміни та додаткові вправи можна впорядкувати лише на сьогодні.');
 const byId=new Map(rows.map(e=>[e.id,e]));state.session.exercises=ids.map(id=>byId.get(id));
 if(saveProgram){const t=state.templates.find(t=>t.id===state.session.templateId),plan=new Map(t.exercises.map(e=>[e.exerciseId,e]));t.exercises=state.session.exercises.map(e=>plan.get(e.exerciseId));}
}
export function exerciseOrderForm(state){
 const grip='<svg viewBox="0 0 16 24" width="16" height="24" aria-hidden="true">'+[5,11].flatMap(x=>[5,12,19].map(y=>'<circle cx="'+x+'" cy="'+y+'" r="1.5" fill="currentColor"/>')).join('')+'</svg>';
 return '<button type="button" class="modal-close icon-btn" data-action="close-modal" aria-label="Закрити">×</button><h2>Порядок вправ</h2><p class="subtle">Потягни за ручку зліва.</p><form id="exercise-order-form"><div class="exercise-order-list" role="list" aria-label="Вправи тренування">'+state.session.exercises.map((e,i)=>{const ss=workingSets(e),done=ss.filter(s=>s.done).length;return '<div class="exercise-order-row" role="listitem" data-order-id="'+esc(e.id)+'"><button type="button" class="order-handle" aria-label="Перемістити '+esc(e.name)+'" aria-pressed="false">'+grip+'</button><div class="order-row-text"><strong>'+esc(e.name)+'</strong><span>'+done+' / '+ss.length+' підходів</span></div><span class="order-position">'+(i+1)+'</span></div>';}).join('')+'</div><p id="order-status" class="visually-hidden" role="status" aria-live="polite"></p>'+(canSaveProgramOrder(state)?'<label class="order-save-option"><input id="save-program-order" type="checkbox"><span>Зберегти також у програмі</span></label>':'<p class="tiny">Порядок зміниться лише на це тренування.</p>')+'<button type="submit" class="btn block">Готово</button></form>';
}
// Pointer capture keeps the same gesture working with touch, a pen and a mouse.
// Only the handle disables page scrolling; the rest of the list scrolls normally.
export function bindExerciseOrder(root){
 const list=root.querySelector('.exercise-order-list');if(!list)return ()=>{};
 const controller=new AbortController(),opts={signal:controller.signal};let drag=null,frame=0;
 const rows=()=>[...list.children];
 function announce(row){rows().forEach((r,i)=>r.querySelector('.order-position').textContent=String(i+1));const i=rows().indexOf(row);root.querySelector('#order-status').textContent=row.querySelector('strong').textContent+': позиція '+(i+1)+' з '+rows().length;}
 function position(y){if(!drag)return;const others=rows().filter(r=>r!==drag.row),before=others.find(r=>y<r.getBoundingClientRect().top+r.getBoundingClientRect().height/2);if(before)list.insertBefore(drag.row,before);else list.append(drag.row);announce(drag.row);}
 function tick(){if(!drag)return;const rect=list.getBoundingClientRect(),top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom),edge=48;const delta=drag.y<top+edge?-10:drag.y>bottom-edge?10:0;if(delta){list.scrollTop+=delta;position(drag.y);}frame=requestAnimationFrame(tick);}
 function finish(cancel=false){if(!drag)return;const active=drag;drag=null;cancelAnimationFrame(frame);if(cancel)active.before.forEach(r=>list.append(r));active.row.classList.remove('is-dragging');active.handle.setAttribute('aria-pressed','false');if(active.handle.hasPointerCapture?.(active.pointerId))active.handle.releasePointerCapture(active.pointerId);announce(active.row);}
 list.addEventListener('pointerdown',event=>{const handle=event.target.closest('.order-handle');if(!handle||event.button!==0||drag)return;event.preventDefault();handle.focus({preventScroll:true});drag={handle,row:handle.closest('[data-order-id]'),pointerId:event.pointerId,before:rows(),y:event.clientY};handle.setPointerCapture(event.pointerId);handle.setAttribute('aria-pressed','true');drag.row.classList.add('is-dragging');frame=requestAnimationFrame(tick);},opts);
 list.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointerId)return;event.preventDefault();drag.y=event.clientY;position(event.clientY);},opts);
 list.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointerId)finish();},opts);
 list.addEventListener('pointercancel',()=>finish(true),opts);list.addEventListener('lostpointercapture',()=>finish(true),opts);
 list.addEventListener('keydown',event=>{const handle=event.target.closest('.order-handle');if(!handle)return;if(event.key==='Escape'&&drag){finish(true);event.preventDefault();return;}if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const row=handle.closest('[data-order-id]');if(event.key==='ArrowUp'&&row.previousElementSibling)list.insertBefore(row,row.previousElementSibling);if(event.key==='ArrowDown'&&row.nextElementSibling)list.insertBefore(row.nextElementSibling,row);announce(row);handle.focus({preventScroll:true});row.scrollIntoView({block:'nearest'});},opts);
 return ()=>{finish(true);controller.abort();};
}
