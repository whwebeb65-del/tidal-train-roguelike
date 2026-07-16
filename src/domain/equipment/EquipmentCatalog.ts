import type { PermanentStatModifiers } from '../progression/ProgressionTypes';
import { zeroPermanentStatModifiers } from '../progression/ProgressionTypes';

export type EquipmentSlot = 'cannon' | 'carriage' | 'core' | 'instrument';
export type EquipmentRarity = 'common' | 'rare' | 'epic';
export type EquipmentSetId = 'tide-guard' | 'coral-assault';
export type EquipmentAffixId =
  | 'max-hp-percent'
  | 'damage-percent'
  | 'gears-percent'
  | 'initial-momentum'
  | 'repair-flat';

export interface EquipmentAffix {
  readonly id: EquipmentAffixId;
  readonly value: number;
}

export interface EquipmentDefinition {
  readonly id: string;
  readonly name: string;
  readonly slot: EquipmentSlot;
  readonly rarity: EquipmentRarity;
  readonly setId: EquipmentSetId;
  readonly baseModifiers: PermanentStatModifiers;
}

function modifiers(
  overrides: Partial<PermanentStatModifiers>,
): PermanentStatModifiers {
  return { ...zeroPermanentStatModifiers(), ...overrides };
}

export const EQUIPMENT_CATALOG: readonly EquipmentDefinition[] = [
  {
    id: 'tide-cannon',
    name: '潮泡主炮',
    slot: 'cannon',
    rarity: 'common',
    setId: 'tide-guard',
    baseModifiers: modifiers({ damageFlat: 2 }),
  },
  {
    id: 'pearl-carriage',
    name: '珍珠车体',
    slot: 'carriage',
    rarity: 'common',
    setId: 'tide-guard',
    baseModifiers: modifiers({ maxHpFlat: 12 }),
  },
  {
    id: 'still-current-core',
    name: '静流动力核',
    slot: 'core',
    rarity: 'common',
    setId: 'tide-guard',
    baseModifiers: modifiers({ initialMomentum: 5 }),
  },
  {
    id: 'seafoam-instrument',
    name: '海沫潮汐仪',
    slot: 'instrument',
    rarity: 'common',
    setId: 'tide-guard',
    baseModifiers: modifiers({ repairFlat: 2 }),
  },
  {
    id: 'coral-cannon',
    name: '珊瑚主炮',
    slot: 'cannon',
    rarity: 'rare',
    setId: 'coral-assault',
    baseModifiers: modifiers({ damageFlat: 4 }),
  },
  {
    id: 'lightwave-carriage',
    name: '轻浪车体',
    slot: 'carriage',
    rarity: 'rare',
    setId: 'coral-assault',
    baseModifiers: modifiers({ maxHpFlat: 6 }),
  },
  {
    id: 'surge-core',
    name: '急流动力核',
    slot: 'core',
    rarity: 'rare',
    setId: 'coral-assault',
    baseModifiers: modifiers({ initialMomentum: 10 }),
  },
  {
    id: 'pursuit-instrument',
    name: '追潮仪',
    slot: 'instrument',
    rarity: 'rare',
    setId: 'coral-assault',
    baseModifiers: modifiers({ gearsPercent: 0.01 }),
  },
];

export const EQUIPMENT_SET_BONUSES = {
  'tide-guard': {
    twoPiece: modifiers({ maxHpPercent: 0.03 }),
    fourPiece: modifiers({ repairFlat: 6 }),
  },
  'coral-assault': {
    twoPiece: modifiers({ damagePercent: 0.03 }),
    fourPiece: modifiers({ initialMomentum: 15 }),
  },
} as const;

export function getEquipmentDefinition(id: string): EquipmentDefinition {
  const definition = EQUIPMENT_CATALOG.find((item) => item.id === id);
  if (!definition) throw new Error(`Unknown equipment: ${id}`);
  return definition;
}
