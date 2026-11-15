import {EQUIPMENT_TYPES, DUMBBELL_WEIGHTS, exerciseConfig, normalizeTraining} from './exercise-config.js';
import {equipmentFields} from './workout-tools-views.js';
import {muscleField} from './muscles.js';
import {button, esc} from './views.js';

const selected = (value, option) => value === option ? 'selected' : '';
const checked = value => value ? 'checked' : '';
const number = (name,label,value,min,max,step=1,required=true) => `
  <label class="filter-label">${label}<input class="field" type="number" name="${name}"
    inputmode="${step===1?'numeric':'decimal'}" min="${min}" max="${max}" step="${step}"
    ${required?'required':''} value="${esc(value??'')}"></label>`;

export function exerciseConfigForm(e) {
  const c=exerciseConfig(e);
  return `${button('close-modal','×','aria-label="Закрити"','modal-close')}
    <h2>Налаштування вправи</h2>
    <form id="rename-form" data-id="${esc(e.id)}">
      <label class="filter-label">Назва<input name="exerciseName" class="field" maxlength="90" required value="${esc(e.name)}"></label>
      ${number('restSeconds','Відпочинок, с',c.restSeconds,1,3600)}
      <div class="exercise-config-grid">
        ${number('min','Повторення від',c.min,1,1000)}
        ${number('max','Повторення до',c.max,1,1000)}
      </div>
      <label class="filter-label">Тип обладнання<select class="field" name="equipmentType">
        ${Object.entries(EQUIPMENT_TYPES).map(([key,label])=>`<option value="${key}" ${selected(c.equipmentType,key)}>${label}</option>`).join('')}
      </select></label>
      <label class="filter-label">Вага в журналі<select class="field" name="weightBasis">
        <option value="total" ${selected(c.weightBasis,'total')}>Загальна вага</option>
        <option value="one-dumbbell" ${selected(c.weightBasis,'one-dumbbell')}>Вага однієї гантелі</option>
      </select></label>
      <div class="exercise-config-grid">
        ${number('step','Крок кнопок і прогресії, кг',c.step,.001,1000,.001,false)}
        ${number('increment','Фізичний крок, кг',c.increment,.001,1000,.001,false)}
      </div>
      <div data-equipment-panel="dumbbell" ${c.equipmentType==='dumbbell'?'':'hidden'}>
        <label class="filter-label">Доступні гантелі, кг
          <input class="field" name="weights" maxlength="800" value="${esc(c.weights.join(' / '))}">
        </label>
        <p class="helper">Розділяй ваги знаком «/». Порожній крок кнопок означає перехід до сусідньої гантелі.</p>
      </div>
      <div data-equipment-panel="pullup" ${c.equipmentType==='pullup'?'':'hidden'}>
        <label class="filter-label">Резинки від більшої допомоги до меншої
          <textarea class="field" name="bands" rows="3" maxlength="1300" placeholder="Окрема назва в кожному рядку">${esc(c.bands.join('\n'))}</textarea>
        </label>
        <label class="filter-label">Рівень допомоги<select class="field" name="band">
          ${bandOptions(c.bands,c.band)}
        </select></label>
      </div>
      <label class="toggle-setting"><span>Рекомендації прогресії</span><input name="progression" type="checkbox" ${checked(c.progression)}></label>
      <label class="toggle-setting"><span>Враховувати записаний запас (RIR)</span><input name="useRir" type="checkbox" ${checked(c.useRir)}></label>
      <details class="quiet-note"><summary>Положення обладнання та група м’язів</summary>${equipmentFields(e)}${muscleField(e)}</details>
      <button type="submit" class="btn block">Зберегти</button>
    </form>`;
}

const bandsFrom = value => value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);

function bandOptions(bands,active) {
  return '<option value="">Без резинки</option>'+bands.map(label=>
    `<option value="${esc(label)}" ${selected(active,label)}>${esc(label)}</option>`).join('');
}

export function updateEquipmentFields(form,field) {
  const f=form.elements;
  if(field==='bands') {
    f.band.innerHTML=bandOptions(bandsFrom(f.bands.value),f.band.value);
  }
  if(field==='equipmentType') {
    const c=exerciseConfig({equipmentType:f.equipmentType.value});
    for(const panel of form.querySelectorAll('[data-equipment-panel]'))panel.hidden=panel.dataset.equipmentPanel!==c.equipmentType;
    f.weightBasis.value=c.weightBasis;
    f.step.value=c.step??'';
    f.increment.value=c.increment??'';
  }
}

export function readExerciseConfig(form) {
  const f=form.elements,numberOrNull=field=>field.value===''?null:Number(field.value);
  const equipmentType=f.equipmentType.value;
  const weights=equipmentType==='dumbbell'
    ?(f.weights.value.trim()?f.weights.value.split('/').map(n=>Number(n.trim().replace(',','.'))):DUMBBELL_WEIGHTS)
    :undefined;
  return normalizeTraining({
    equipmentType,restSeconds:Number(f.restSeconds.value),min:Number(f.min.value),max:Number(f.max.value),
    step:numberOrNull(f.step),increment:numberOrNull(f.increment),weights,bands:bandsFrom(f.bands.value),
    band:equipmentType==='pullup'?f.band.value||null:null,progression:f.progression.checked,useRir:f.useRir.checked
  }).training;
}
