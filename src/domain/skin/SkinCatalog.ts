import type { CaptainId } from '../captain/CaptainCatalog';
import type { PermanentStatModifiers } from '../progression/ProgressionTypes';
import { zeroPermanentStatModifiers } from '../progression/ProgressionTypes';

export type SkinId =
  | 'skin-tide-base'
  | 'skin-seafoam-departure'
  | 'skin-aurora-whale-song';

export type SkinRarity = 'base' | 'common' | 'rare' | 'epic' | 'legendary';

export interface SkinDefinition {
  readonly id: SkinId;
  readonly name: string;
  readonly rarity: SkinRarity;
  readonly wearableBy: readonly CaptainId[];
  readonly variants: Readonly<Record<CaptainId, string>>;
  readonly modifiers: PermanentStatModifiers;
}

const BOTH_CAPTAINS: readonly CaptainId[] = [
  'captain-tide-female',
  'captain-tide-male',
];

export const SKIN_CATALOG: readonly SkinDefinition[] = [
  {
    id: 'skin-tide-base',
    name: '潮汐制服',
    rarity: 'base',
    wearableBy: BOTH_CAPTAINS,
    variants: {
      'captain-tide-female': 'captain-female-base',
      'captain-tide-male': 'captain-male-base',
    },
    modifiers: zeroPermanentStatModifiers(),
  },
  {
    id: 'skin-seafoam-departure',
    name: '海沫启航',
    rarity: 'common',
    wearableBy: BOTH_CAPTAINS,
    variants: {
      'captain-tide-female': 'captain-female-seafoam',
      'captain-tide-male': 'captain-male-seafoam',
    },
    modifiers: {
      ...zeroPermanentStatModifiers(),
      maxHpPercent: 0.005,
    },
  },
  {
    id: 'skin-aurora-whale-song',
    name: '极光鲸歌',
    rarity: 'legendary',
    wearableBy: BOTH_CAPTAINS,
    variants: {
      'captain-tide-female': 'captain-female-aurora',
      'captain-tide-male': 'captain-male-aurora',
    },
    modifiers: {
      ...zeroPermanentStatModifiers(),
      maxHpPercent: 0.01,
      damagePercent: 0.005,
      gearsPercent: 0.005,
    },
  },
];

export function getSkinDefinition(id: string): SkinDefinition | undefined {
  return SKIN_CATALOG.find((skin) => skin.id === id);
}
