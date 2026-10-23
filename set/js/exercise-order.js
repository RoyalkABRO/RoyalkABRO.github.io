import {workingSets} from './progression.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function canSaveProgramOrder(state){const w=state.session,t=state.templates.find(t=>t.id===w?.templateId);return Boolean(t&&w.exercises.length===t.exercises.length&&new Set(t.exercises.map(e=>e.exerciseId)).size===t.exercises.length&&new Set(w.exercises.map(e=>e.exerciseId)).size===w.exercises.length&&w.exercises.every(e=>t.exercises.some(p=>p.exerciseId===e.exerciseId)));}
export function reorderExercises(state,ids,saveProgram=false){
 const rows=state.session?.exercises;if(!rows||ids.length!==rows.length||new Set(ids).size!==rows.length||ids.some(id=>!rows.some(e=>e.id===id)))throw Error('Список вправ змінився. Відкрий його ще раз.');
 if(saveProgram&&!canSaveProgramOrder(state))throw Error('Заміни та додаткові вправи можна впорядкувати лише на сьогодні.');
 const byId=new Map(rows.map(e=>[e.id,e]));state.session.exercises=ids.map(id=>byId.get(id));
 if(saveProgram){const t=state.templates.find(t=>t.id===state.session.templateId),plan=new Map(t.exercises.map(e=>[e.exerciseId,e]));t.exercises=state.session.exercises.map(e=>plan.get(e.exerciseId));}
}
export function exerciseOrderForm(state,selectedId){
 const grip='<svg viewBox="0 0 16 24" width="16" height="24" aria-hidden="true">'+[5,11].flatMap(x=>[5,12,19].map(y=>'<circle cx="'+x+'" cy="'+y+'" r="1.5" fill="currentColor"/>')).join('')+'</svg>';
 return '<button type="button" class="modal-close icon-btn" data-action="close-modal" aria-label="Закрити">×</button><h2>Вправи</h2><p class="subtle">Натисни назву або потягни за ручку зліва.</p><div id="exercise-order-form"><div class="exercise-order-list" role="list" aria-label="Вправи тренування">'+state.session.exercises.map((e,i)=>{const ss=workingSets(e),done=ss.filter(s=>s.done).length;return '<div class="exercise-order-row" role="listitem" data-order-id="'+esc(e.id)+'"><button type="button" class="order-handle" aria-label="Перемістити '+esc(e.name)+'" aria-pressed="false">'+grip+'</button><button type="button" class="order-row-text" data-action="select-exercise" data-id="'+esc(e.id)+'" '+(selectedId===e.id?'aria-current="true"':'')+'><strong>'+esc(e.name)+'</strong><span>'+done+' / '+ss.length+' підходів</span></button><span class="order-position">'+(i+1)+'</span></div>';}).join('')+'</div><p id="order-status" class="visually-hidden" role="status" aria-live="polite"></p>'+'</div>';
}
// Pointer capture keeps the same gesture working with touch, a pen and a mouse.
// Only the handle disables page scrolling; the rest of the list scrolls normally.
export function bindExerciseOrder(root,onReorder=()=>{}){
 const list=root.querySelector('.exercise-order-list');if(!list)return ()=>{};
 const controller=new AbortController(),opts={signal:controller.signal};let drag=null,frame=0;
 const rows=()=>[...list.querySelectorAll(':scope > [data-order-id]')];
 function visualRows(){return [...list.children].flatMap(row=>row===drag?.row?[]:row===drag?.placeholder?[drag.row]:row.matches('[data-order-id]')?[row]:[]);}
 function announce(row){const ordered=drag?visualRows():rows();ordered.forEach((r,i)=>r.querySelector('.order-position').textContent=String(i+1));root.querySelector('#order-status').textContent=row.querySelector('strong').textContent+': позиція '+(ordered.indexOf(row)+1)+' з '+ordered.length;}
 function position(y){if(!drag)return;const rect=list.getBoundingClientRect();drag.row.style.top=(y-drag.offset-rect.top+list.scrollTop)+'px';const before=rows().filter(r=>r!==drag.row).find(r=>{const b=r.getBoundingClientRect();return y<b.top+b.height/2;});if(before)list.insertBefore(drag.placeholder,before);else list.append(drag.placeholder);announce(drag.row);}
 function tick(){if(!drag)return;const rect=list.getBoundingClientRect(),edge=42,delta=drag.y<rect.top+edge?-9:drag.y>rect.bottom-edge?9:0;if(delta){list.scrollTop+=delta;position(drag.y);}frame=requestAnimationFrame(tick);}
 function finish(cancel=false){if(!drag)return;const active=drag;drag=null;cancelAnimationFrame(frame);
  // Keep the captured element in its original DOM position until the gesture ends.
  // Moving it during pointermove can drop pointer capture in mobile WebKit.
  if(active.handle.hasPointerCapture?.(active.pointerId))active.handle.releasePointerCapture(active.pointerId);
  if(!cancel)list.insertBefore(active.row,active.placeholder);
  active.placeholder.remove();active.row.style.cssText=active.style;active.row.classList.remove('is-dragging');active.handle.setAttribute('aria-pressed','false');announce(active.row);
  const ids=rows().map(r=>r.dataset.orderId);if(!cancel&&ids.some((id,i)=>id!==active.before[i]))onReorder(ids);
 }
 list.addEventListener('pointerdown',event=>{const handle=event.target.closest('.order-handle');if(!handle||(event.pointerType!=='touch'&&event.button!==0)||drag)return;event.preventDefault();handle.focus({preventScroll:true});const row=handle.closest('[data-order-id]'),rect=row.getBoundingClientRect(),parent=list.getBoundingClientRect(),placeholder=document.createElement('div');placeholder.className='order-placeholder';placeholder.style.height=rect.height+'px';placeholder.setAttribute('aria-hidden','true');const before=rows().map(r=>r.dataset.orderId);list.insertBefore(placeholder,row);drag={handle,row,placeholder,pointerId:event.pointerId,before,style:row.style.cssText,offset:event.clientY-rect.top,y:event.clientY};row.style.cssText+=';position:absolute;left:0;right:0;top:'+(rect.top-parent.top+list.scrollTop)+'px;width:100%;height:'+rect.height+'px;';row.classList.add('is-dragging');handle.setAttribute('aria-pressed','true');try{handle.setPointerCapture(event.pointerId);}catch{}frame=requestAnimationFrame(tick);},opts);
 document.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointerId)return;event.preventDefault();drag.y=event.clientY;position(event.clientY);},{...opts,passive:false});
 document.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointerId)finish();},opts);
 document.addEventListener('pointercancel',()=>finish(true),opts);window.addEventListener('blur',()=>finish(true),opts);document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(true);},opts);
 list.addEventListener('keydown',event=>{const handle=event.target.closest('.order-handle');if(!handle)return;if(event.key==='Escape'&&drag){finish(true);event.preventDefault();return;}if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const row=handle.closest('[data-order-id]'),before=rows().map(r=>r.dataset.orderId);if(event.key==='ArrowUp'&&row.previousElementSibling)list.insertBefore(row,row.previousElementSibling);if(event.key==='ArrowDown'&&row.nextElementSibling)list.insertBefore(row.nextElementSibling,row);announce(row);handle.focus({preventScroll:true});row.scrollIntoView({block:'nearest'});const ids=rows().map(r=>r.dataset.orderId);if(ids.some((id,i)=>id!==before[i]))onReorder(ids);},opts);
 return ()=>{finish(true);controller.abort();};
}
