export const EQUIPMENT_TYPES = {
  dumbbell: 'Гантелі', barbell: 'Штанга', cable: 'Блочний тренажер',
  machine: 'Інший тренажер', bodyweight: 'Власна вага', pullup: 'Турнік / резинки',
  other: 'Інше'
};

export const DUMBBELL_WEIGHTS = [
  ...Array.from({length:10}, (_, i) => (i + 1) * 2),
  ...Array.from({length:10}, (_, i) => 20 + (i + 1) * 2.5)
];

// Apply missing positions only to the two identifiable built-in templates.
export const PERSONAL_PLAN_ADDITIONS = {
  'set-program-four-sets-mon': {name:'Махи на середню дельту', after:'Ікри стоячи'},
  'set-program-four-sets-fri': {name:'Згинання ніг', after:'Ікри сидячи'}
};

const presets = [
  [['Жим лежачи','Жим штанги лежачи'], 180, 'barbell', 2.5, 5, 8],
  [['Підтягування','Підтягування з резинкою','Підтягування із резинкою'], 150, 'pullup', 2.5, 6, 12],
  [['Жим гантелей над головою (плечі)','Жим гантелей над головою','Жим гантелей сидячи','Жим гантелей сидячи на плечі'], 150, 'dumbbell', null, 8, 12],
  [['Розгинання ніг'], 120, 'cable', 5, 10, 15],
  [['Ікри стоячи','Підйом на носки стоячи'], 120, 'machine', 10, 10, 20],
  [['Махи на середню дельту','Махи гантелями в сторони'], 90, 'dumbbell', null, 12, 20],
  [['Біцепс з грифом','Біцепс із грифом','Біцепс зі штангою'], 120, 'barbell', 2.5, 8, 12],
  [['Трицепс вниз на блоці','Трицепс на блоці','Трицепс'], 120, 'cable', 5, 10, 15],
  [['Прес'], 90, 'bodyweight', 2.5, 12, 20],
  [['Жим гантелей під кутом','Жим гантелей на похилій лавці'], 180, 'dumbbell', null, 8, 12],
  [['Тяга нижнього блока','Тяга нижнього блоку','Горизонтальна тяга блока'], 150, 'cable', 5, 8, 12],
  [['Румунська тяга','Румунка','RDL'], 180, 'barbell', 5, 6, 10],
  [['Згинання ніг'], 120, 'cable', 5, 10, 15],
  [['Біцепс — молотки','Молотки'], 120, 'dumbbell', null, 8, 12],
  [['Трицепс — розгинання над головою','Трицепс над головою'], 120, 'cable', 5, 10, 15],
  [['Жим ногами'], 180, 'machine', 10, 8, 12],
  [['Тяга верхнього блока','Тяга верхнього блоку','Вертикальна тяга блока'], 150, 'cable', 5, 8, 12],
  [['Butterfly / Pec Deck','Butterfly','Pec Deck','Пек-дек'], 120, 'cable', 5, 10, 15],
  [['Задня дельта в Pec Deck','Задня дельта у Pec Deck','Зворотний Pec Deck','Задня дельта'], 90, 'cable', 5, 12, 20],
  [['Ікри сидячи','Підйом на носки сидячи'], 120, 'machine', 10, 12, 20],
  [['Біцепс на похилій лавці','Біцепс на похилій'], 120, 'dumbbell', null, 8, 12],
  [['Трицепс — розгинання однією рукою'], 120, 'cable', 5, 12, 15]
];

export const exerciseNameKey = name => String(name ?? '').toLowerCase()
  .replace(/[’ʼ]/g, "'").replace(/[—–-]/g, ' ').replace(/\s+/g, ' ').trim();

const byName = new Map(presets.flatMap(([names, restSeconds, equipmentType, step, min, max]) =>
  names.map(name => [exerciseNameKey(name), {key:exerciseNameKey(names[0]), restSeconds, equipmentType, step, min, max}])));

export const exercisePreset = name => byName.get(exerciseNameKey(name));
export const exerciseIdentity = name => exercisePreset(name)?.key || exerciseNameKey(name);

const steps = {dumbbell:null, barbell:2.5, cable:5, machine:5, bodyweight:2.5, pullup:2.5, other:2.5};
const physicalSteps = {barbell:2.5, cable:5};

function inferredType(name) {
  if (/гіперекстензі|віджиман|планка/.test(name)) return 'bodyweight';
  if (/гантел|молотк/.test(name)) return 'dumbbell';
  if (/блок|кросовер|pec deck|тренажер метелик/.test(name)) return 'cable';
  if (/штанг|гриф|присід|станов/.test(name)) return 'barbell';
  if (/тренажер/.test(name)) return 'machine';
  return 'other';
}

export function exerciseConfig(e = {}) {
  const name = exerciseNameKey(e.name);
  const preset = exercisePreset(e.name);
  const equipmentType = e.training?.equipmentType || e.equipmentType ||
    (e.weightBasis === 'one-dumbbell' ? 'dumbbell' : preset?.equipmentType || inferredType(name));
  const sameType = preset?.equipmentType === equipmentType;
  const compound = /жим|тяга|присід/.test(name);
  const core = /прес|гіперекстензі|скручуван/.test(name);
  const fallbackRest = compound ? 180 : equipmentType === 'bodyweight' ? 90 : 120;
  return {
    equipmentType,
    restSeconds:e.training?.restSeconds ?? preset?.restSeconds ?? fallbackRest,
    min:e.training?.min ?? preset?.min ?? (core ? 12 : compound ? 8 : 10),
    max:e.training?.max ?? preset?.max ?? (core ? 20 : compound ? 12 : 15),
    step:e.training ? e.training.step ?? null : (e.weightStep ? Math.max(.001,Math.round(e.weightStep*1000)/1000) : null) ?? (sameType ? preset.step : steps[equipmentType]),
    increment:e.training ? e.training.increment ?? null : physicalSteps[equipmentType] ?? null,
    weights:e.training?.weights ?? DUMBBELL_WEIGHTS,
    bands:e.training?.bands ?? [],
    band:e.training?.band ?? null,
    progression:e.training?.progression ?? true,
    useRir:e.training?.useRir ?? false,
    weightBasis:e.weightBasis ?? (equipmentType === 'dumbbell' ? 'one-dumbbell' : 'total')
  };
}

export function normalizeTraining(value) {
  if (value === undefined) return {};
  const validNumber = (n, lo, hi, units = 1) => typeof n === 'number' &&
    n >= lo && n <= hi && Math.abs(n * units - Math.round(n * units)) < 1e-7;
  const {equipmentType,restSeconds,min,max,step,increment,weights,bands,band,progression,useRir} = value || {};
  if (!Object.hasOwn(EQUIPMENT_TYPES, equipmentType) || !validNumber(restSeconds, 1, 3600) ||
      !validNumber(min, 1, 1000) || !validNumber(max, min, 1000) ||
      (step != null && !validNumber(step, .001, 1000, 1000)) ||
      (increment != null && !validNumber(increment, .001, 1000, 1000)) ||
      typeof progression !== 'boolean' || typeof useRir !== 'boolean' ||
      (weights !== undefined && (!Array.isArray(weights) || !weights.length || weights.length > 100 ||
        weights.some((n, i) => !validNumber(n, .001, 10000, 1000) || (i > 0 && n <= weights[i - 1])))) ||
      !Array.isArray(bands) || bands.length > 20 || new Set(bands).size !== bands.length ||
      bands.some(label => typeof label !== 'string' || !label.trim() || label.length > 60 || label.trim() !== label) ||
      (band !== null && !bands.includes(band))) {
    throw Error('Перевір паузу, діапазон повторень і налаштування обладнання.');
  }
  return {training:{equipmentType,restSeconds,min,max,step:step ?? null,increment:increment ?? null,
    ...(weights ? {weights:[...weights]} : {}), bands:[...bands],band,progression,useRir}};
}

export function trainingSnapshot(e) {
  const {weightBasis,...training} = exerciseConfig(e);
  return {...normalizeTraining(training),weightBasis,
    ...(e.equipment ? {equipment:structuredClone(e.equipment)} : {}),
    ...(e.muscleGroup ? {muscleGroup:e.muscleGroup} : {})};
}

export function equipmentKey(e) {
  const c = exerciseConfig(e);
  return JSON.stringify([c.equipmentType,c.weightBasis,c.increment,
    c.equipmentType === 'dumbbell' ? c.weights : null,c.equipmentType === 'pullup' ? c.band : null,
    ['seat','bench','pin','grip'].map(key => e.equipment?.[key] || ''),
    ...(e.equipment?.station?[e.equipment.station]:[])]);
}

export function stepWeight(value, config, direction) {
  if(direction!==1&&direction!==-1)return null;
  const max = 10000000;
  const units = n => Math.round(n * 1000);
  const current = Number(value);
  const weight = Number.isFinite(current) ? Math.min(max, Math.max(0, units(current))) : 0;
  if (config.equipmentType === 'dumbbell') {
    const weights = [0,...config.weights.map(units)];
    const distance = config.step ? units(config.step) : 1;
    const next = direction > 0
      ? weights.find(n => n >= weight + distance) ?? weights.findLast(n => n > weight)
      : weights.findLast(n => n <= weight - distance) ?? weights.find(n => n < weight);
    return next === undefined ? null : next / 1000;
  }
  if (!config.step) return null;
  const next = Math.max(0, Math.min(max, weight + direction * units(config.step)));
  return next === weight ? null : next / 1000;
}

export function progressionWeight(value, config) {
  const next = stepWeight(value, config, 1);
  if (next === null || !config.increment || config.equipmentType === 'dumbbell') return next;
  // The recorded load is the anchor. Machines may start at an offset and bars include their own mass.
  const stepUnits = Math.round(config.step * 1000), physicalUnits = Math.round(config.increment * 1000);
  const total = Math.round(value * 1000) + Math.ceil(stepUnits / physicalUnits) * physicalUnits;
  return total <= 10000000 ? total / 1000 : null;
}
