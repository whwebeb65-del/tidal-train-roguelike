import {
  SKILL_VARIANT_IDS,
  type SkillVariantId,
} from '../skill/SkillProgressionTypes';

export const TIDE_BEAST_ARCHIVE_IDS = [
  'bubble-fin',
  'needle-jelly',
  'reef-crab',
  'tide-shell-hatchling',
  'lantern-ray',
  'tide-parasite-snail',
  'storm-ray-elite',
  'deep-echo-boss',
] as const;
export type TideBeastArchiveId = (typeof TIDE_BEAST_ARCHIVE_IDS)[number];

export interface TidalArchiveState {
  readonly version: 1;
  readonly discoveredEnemyKinds: readonly TideBeastArchiveId[];
  readonly discoveredSkillVariantIds: readonly SkillVariantId[];
}

function makeState(
  enemies: readonly TideBeastArchiveId[],
  variants: readonly SkillVariantId[],
): TidalArchiveState {
  return Object.freeze({
    version: 1,
    discoveredEnemyKinds: Object.freeze([...enemies]),
    discoveredSkillVariantIds: Object.freeze([...variants]),
  });
}

export function createTidalArchiveState(): TidalArchiveState {
  return makeState([], []);
}

export function normalizeTidalArchiveState(value: unknown): TidalArchiveState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createTidalArchiveState();
  }

  const record = value as Record<string, unknown>;
  const enemySet = new Set(
    Array.isArray(record.discoveredEnemyKinds)
      ? record.discoveredEnemyKinds
      : [],
  );
  const variantSet = new Set(
    Array.isArray(record.discoveredSkillVariantIds)
      ? record.discoveredSkillVariantIds
      : [],
  );

  return makeState(
    TIDE_BEAST_ARCHIVE_IDS.filter((id) => enemySet.has(id)),
    SKILL_VARIANT_IDS.filter((id) => variantSet.has(id)),
  );
}

export function discoverTideBeast(
  state: TidalArchiveState,
  id: TideBeastArchiveId,
): TidalArchiveState {
  if (state.discoveredEnemyKinds.includes(id)) return state;
  return normalizeTidalArchiveState({
    ...state,
    discoveredEnemyKinds: [...state.discoveredEnemyKinds, id],
  });
}

export function discoverSkillVariant(
  state: TidalArchiveState,
  id: SkillVariantId,
): TidalArchiveState {
  if (state.discoveredSkillVariantIds.includes(id)) return state;
  return normalizeTidalArchiveState({
    ...state,
    discoveredSkillVariantIds: [...state.discoveredSkillVariantIds, id],
  });
}
