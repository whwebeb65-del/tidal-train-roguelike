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

export type TidalArchiveEntryKey =
  | `enemy:${TideBeastArchiveId}`
  | `skill-variant:${SkillVariantId}`;

export interface TidalArchiveState {
  readonly version: 2;
  readonly discoveredEnemyKinds: readonly TideBeastArchiveId[];
  readonly discoveredSkillVariantIds: readonly SkillVariantId[];
  readonly unreadEntryKeys: readonly TidalArchiveEntryKey[];
}

export const tidalArchiveEnemyKey = (
  id: TideBeastArchiveId,
): TidalArchiveEntryKey => `enemy:${id}`;

export const tidalArchiveSkillVariantKey = (
  id: SkillVariantId,
): TidalArchiveEntryKey => `skill-variant:${id}`;

const ALL_ENTRY_KEYS: readonly TidalArchiveEntryKey[] = Object.freeze([
  ...TIDE_BEAST_ARCHIVE_IDS.map(tidalArchiveEnemyKey),
  ...SKILL_VARIANT_IDS.map(tidalArchiveSkillVariantKey),
]);

function makeState(
  enemies: readonly TideBeastArchiveId[],
  variants: readonly SkillVariantId[],
  unreadEntryKeys: readonly TidalArchiveEntryKey[],
): TidalArchiveState {
  return Object.freeze({
    version: 2,
    discoveredEnemyKinds: Object.freeze([...enemies]),
    discoveredSkillVariantIds: Object.freeze([...variants]),
    unreadEntryKeys: Object.freeze([...unreadEntryKeys]),
  });
}

export function createTidalArchiveState(): TidalArchiveState {
  return makeState([], [], []);
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
  const enemies = TIDE_BEAST_ARCHIVE_IDS.filter((id) => enemySet.has(id));
  const variants = SKILL_VARIANT_IDS.filter((id) => variantSet.has(id));
  const discoveredEntryKeys = new Set<TidalArchiveEntryKey>([
    ...enemies.map(tidalArchiveEnemyKey),
    ...variants.map(tidalArchiveSkillVariantKey),
  ]);
  const unreadEntrySet = new Set(
    record.version === 2 && Array.isArray(record.unreadEntryKeys)
      ? record.unreadEntryKeys
      : [],
  );

  return makeState(
    enemies,
    variants,
    ALL_ENTRY_KEYS.filter(
      (key) => unreadEntrySet.has(key) && discoveredEntryKeys.has(key),
    ),
  );
}

export function discoverTideBeast(
  state: TidalArchiveState,
  id: TideBeastArchiveId,
): TidalArchiveState {
  if (state.discoveredEnemyKinds.includes(id)) return state;
  return normalizeTidalArchiveState({
    version: 2,
    discoveredEnemyKinds: [...state.discoveredEnemyKinds, id],
    discoveredSkillVariantIds: state.discoveredSkillVariantIds,
    unreadEntryKeys: [...state.unreadEntryKeys, tidalArchiveEnemyKey(id)],
  });
}

export function discoverSkillVariant(
  state: TidalArchiveState,
  id: SkillVariantId,
): TidalArchiveState {
  if (state.discoveredSkillVariantIds.includes(id)) return state;
  return normalizeTidalArchiveState({
    version: 2,
    discoveredEnemyKinds: state.discoveredEnemyKinds,
    discoveredSkillVariantIds: [...state.discoveredSkillVariantIds, id],
    unreadEntryKeys: [...state.unreadEntryKeys, tidalArchiveSkillVariantKey(id)],
  });
}

export function markTidalArchiveRead(
  state: TidalArchiveState,
): TidalArchiveState {
  if (state.unreadEntryKeys.length === 0) return state;
  return makeState(
    state.discoveredEnemyKinds,
    state.discoveredSkillVariantIds,
    [],
  );
}
