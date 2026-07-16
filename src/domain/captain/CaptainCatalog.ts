import type { PermanentStatModifiers } from '../progression/ProgressionTypes';
import { zeroPermanentStatModifiers } from '../progression/ProgressionTypes';

export type CaptainId = 'captain-tide-female' | 'captain-tide-male';

export interface CaptainDefinition {
  readonly id: CaptainId;
  readonly name: string;
  readonly pronounLabel: string;
  readonly baseSkinId: 'skin-tide-base';
  readonly baseStats: PermanentStatModifiers;
}

export const CAPTAIN_CATALOG: readonly CaptainDefinition[] = [
  {
    id: 'captain-tide-female',
    name: '潮灯列车长',
    pronounLabel: '女列车长',
    baseSkinId: 'skin-tide-base',
    baseStats: zeroPermanentStatModifiers(),
  },
  {
    id: 'captain-tide-male',
    name: '罗盘列车长',
    pronounLabel: '男列车长',
    baseSkinId: 'skin-tide-base',
    baseStats: zeroPermanentStatModifiers(),
  },
];

export function getCaptainDefinition(id: CaptainId): CaptainDefinition {
  const definition = CAPTAIN_CATALOG.find((captain) => captain.id === id);
  if (!definition) throw new Error(`Unknown captain: ${id}`);
  return definition;
}
