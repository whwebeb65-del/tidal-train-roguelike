import {
  addPermanentStatModifiers,
  zeroPermanentStatModifiers,
  type PermanentStatModifiers,
} from '../progression/ProgressionTypes';
import {
  EQUIPMENT_SET_BONUSES,
  getEquipmentDefinition,
  type EquipmentAffix,
  type EquipmentAffixId,
  type EquipmentSetId,
  type EquipmentSlot,
} from './EquipmentCatalog';

export interface EquipmentInstance {
  readonly instanceId: string;
  readonly definitionId: string;
  readonly level: number;
  readonly stars: number;
  readonly affixes: readonly EquipmentAffix[];
}

export interface EquipmentState {
  readonly inventory: readonly EquipmentInstance[];
  readonly equippedEquipmentIds: Readonly<Record<EquipmentSlot, string | null>>;
  readonly fragments: Readonly<Record<string, number>>;
  readonly gears: number;
}

export interface EquipmentMutationResult {
  readonly accepted: boolean;
  readonly reason?:
    | 'not-found'
    | 'max-level'
    | 'max-stars'
    | 'insufficient-gears'
    | 'insufficient-fragments'
    | 'invalid-affixes';
  readonly state: EquipmentState;
}

const SLOTS: readonly EquipmentSlot[] = [
  'cannon',
  'carriage',
  'core',
  'instrument',
];
const VALID_AFFIXES: readonly EquipmentAffixId[] = [
  'max-hp-percent',
  'damage-percent',
  'gears-percent',
  'initial-momentum',
  'repair-flat',
];

export function createStarterEquipmentState(): EquipmentState {
  const definitions = [
    'tide-cannon',
    'pearl-carriage',
    'still-current-core',
    'seafoam-instrument',
  ];
  const inventory = definitions.map((definitionId) => ({
    instanceId: `starter:${definitionId}`,
    definitionId,
    level: 1,
    stars: 0,
    affixes: [],
  }));
  return {
    inventory,
    equippedEquipmentIds: {
      cannon: null,
      carriage: null,
      core: null,
      instrument: null,
    },
    fragments: {},
    gears: 0,
  };
}

function replaceInstance(
  state: EquipmentState,
  instanceId: string,
  update: (instance: EquipmentInstance) => EquipmentInstance,
): EquipmentState {
  return {
    ...state,
    inventory: state.inventory.map((instance) =>
      instance.instanceId === instanceId ? update(instance) : instance),
  };
}

export function equipEquipment(
  state: EquipmentState,
  instanceId: string,
): EquipmentState {
  const instance = state.inventory.find((item) => item.instanceId === instanceId);
  if (!instance) throw new Error(`Equipment instance not found: ${instanceId}`);
  const definition = getEquipmentDefinition(instance.definitionId);
  return {
    ...state,
    equippedEquipmentIds: {
      ...state.equippedEquipmentIds,
      [definition.slot]: instanceId,
    },
  };
}

export function upgradeEquipment(
  state: EquipmentState,
  instanceId: string,
): EquipmentMutationResult {
  const instance = state.inventory.find((item) => item.instanceId === instanceId);
  if (!instance) return { accepted: false, reason: 'not-found', state };
  if (instance.level >= 20) {
    return { accepted: false, reason: 'max-level', state };
  }
  const cost = instance.level * 20;
  if (state.gears < cost) {
    return { accepted: false, reason: 'insufficient-gears', state };
  }
  return {
    accepted: true,
    state: replaceInstance(
      { ...state, gears: state.gears - cost },
      instanceId,
      (current) => ({ ...current, level: current.level + 1 }),
    ),
  };
}

export function starEquipment(
  state: EquipmentState,
  instanceId: string,
): EquipmentMutationResult {
  const instance = state.inventory.find((item) => item.instanceId === instanceId);
  if (!instance) return { accepted: false, reason: 'not-found', state };
  if (instance.stars >= 5) {
    return { accepted: false, reason: 'max-stars', state };
  }
  const cost = (instance.stars + 1) * 10;
  const fragments = state.fragments[instance.definitionId] ?? 0;
  if (fragments < cost) {
    return { accepted: false, reason: 'insufficient-fragments', state };
  }
  return {
    accepted: true,
    state: replaceInstance(
      {
        ...state,
        fragments: {
          ...state.fragments,
          [instance.definitionId]: fragments - cost,
        },
      },
      instanceId,
      (current) => ({ ...current, stars: current.stars + 1 }),
    ),
  };
}

export function rerollEquipment(
  state: EquipmentState,
  instanceId: string,
  nextAffixes: readonly EquipmentAffix[],
): EquipmentMutationResult {
  const instance = state.inventory.find((item) => item.instanceId === instanceId);
  if (!instance) return { accepted: false, reason: 'not-found', state };
  const valid = nextAffixes.length <= 2
    && nextAffixes.every((affix) =>
      VALID_AFFIXES.includes(affix.id)
      && Number.isFinite(affix.value)
      && affix.value > 0);
  if (!valid) return { accepted: false, reason: 'invalid-affixes', state };
  const cost = 50;
  if (state.gears < cost) {
    return { accepted: false, reason: 'insufficient-gears', state };
  }
  return {
    accepted: true,
    state: replaceInstance(
      { ...state, gears: state.gears - cost },
      instanceId,
      (current) => ({ ...current, affixes: [...nextAffixes] }),
    ),
  };
}

function scaleModifiers(
  modifiers: PermanentStatModifiers,
  scale: number,
): PermanentStatModifiers {
  return {
    maxHpFlat: modifiers.maxHpFlat * scale,
    maxHpPercent: modifiers.maxHpPercent * scale,
    damageFlat: modifiers.damageFlat * scale,
    damagePercent: modifiers.damagePercent * scale,
    gearsPercent: modifiers.gearsPercent * scale,
    initialMomentum: modifiers.initialMomentum * scale,
    repairFlat: modifiers.repairFlat * scale,
  };
}

function affixModifiers(affix: EquipmentAffix): PermanentStatModifiers {
  const result = zeroPermanentStatModifiers();
  switch (affix.id) {
    case 'max-hp-percent':
      return { ...result, maxHpPercent: affix.value };
    case 'damage-percent':
      return { ...result, damagePercent: affix.value };
    case 'gears-percent':
      return { ...result, gearsPercent: affix.value };
    case 'initial-momentum':
      return { ...result, initialMomentum: affix.value };
    case 'repair-flat':
      return { ...result, repairFlat: affix.value };
  }
}

export function getEquipmentModifiers(
  state: EquipmentState,
): PermanentStatModifiers {
  let total = zeroPermanentStatModifiers();
  const setCounts = new Map<EquipmentSetId, number>();
  const equippedInstanceIds = new Set(
    SLOTS.map((slot) => state.equippedEquipmentIds[slot])
      .filter((instanceId): instanceId is string => instanceId !== null),
  );

  for (const instanceId of equippedInstanceIds) {
    const instance = state.inventory.find((item) => item.instanceId === instanceId);
    if (!instance) continue;
    const definition = getEquipmentDefinition(instance.definitionId);
    const scale = 1 + (instance.level - 1) * 0.05 + instance.stars * 0.1;
    total = addPermanentStatModifiers(
      total,
      scaleModifiers(definition.baseModifiers, scale),
    );
    for (const affix of instance.affixes) {
      total = addPermanentStatModifiers(total, affixModifiers(affix));
    }
    setCounts.set(
      definition.setId,
      (setCounts.get(definition.setId) ?? 0) + 1,
    );
  }

  for (const [setId, count] of setCounts) {
    const bonus = EQUIPMENT_SET_BONUSES[setId];
    if (count >= 2) {
      total = addPermanentStatModifiers(total, bonus.twoPiece);
    }
    if (count >= 4) {
      total = addPermanentStatModifiers(total, bonus.fourPiece);
    }
  }

  return total;
}
