import { UPGRADE_IDS } from './BattleConfig';
import {
  BATTLE_UPGRADE_DEFINITIONS,
  getBattleUpgradeDefinition,
} from './BattleUpgradeCatalog';
import { SeededRandom } from './SeededRandom';
import type {
  BattleBuildState,
  BattleGeneralUpgradeId,
  BattleModifiers,
  BattleSkillId,
  BattleUpgradeId,
  SkillRanks,
  SkillVariantId,
  SkillVariantLoadout,
} from './BattleTypes';

export interface UpgradeApplyResult {
  readonly accepted: boolean;
  readonly modifiers: BattleModifiers;
  readonly levels: Record<BattleUpgradeId, number>;
}

export function createEmptyBattleBuild(
  overrides: Partial<BattleBuildState> = {},
): BattleBuildState {
  const generalLevels = Object.fromEntries(
    UPGRADE_IDS.map((id) => [id, 0]),
  ) as Record<BattleGeneralUpgradeId, number>;
  const skillRanks: SkillRanks = {
    'tidal-volley': 1,
    'bubble-barrier': 1,
    'extreme-tide': 1,
  };
  const skillVariants: SkillVariantLoadout = {
    'tidal-volley': [],
    'bubble-barrier': [],
    'extreme-tide': [],
  };

  return {
    generalLevels: { ...generalLevels, ...overrides.generalLevels },
    skillRanks: { ...skillRanks, ...overrides.skillRanks },
    skillVariants: { ...skillVariants, ...overrides.skillVariants },
  };
}

function cloneBattleBuild(build: BattleBuildState): BattleBuildState {
  return {
    generalLevels: { ...build.generalLevels },
    skillRanks: { ...build.skillRanks },
    skillVariants: {
      'tidal-volley': [...build.skillVariants['tidal-volley']],
      'bubble-barrier': [...build.skillVariants['bubble-barrier']],
      'extreme-tide': [...build.skillVariants['extreme-tide']],
    },
  };
}

function isUpgradeLegal(
  build: BattleBuildState,
  unlockedVariants: readonly SkillVariantId[],
  upgradeId: BattleUpgradeId,
): boolean {
  const definition = getBattleUpgradeDefinition(upgradeId);
  if (definition.kind === 'general') {
    return build.generalLevels[upgradeId as BattleGeneralUpgradeId] < definition.maxLevel;
  }

  const skillId = definition.skillId as BattleSkillId;
  if (definition.kind === 'skill-rank') {
    return build.skillRanks[skillId] < 5;
  }

  const variants = build.skillVariants[skillId];
  return unlockedVariants.includes(upgradeId as SkillVariantId)
    && build.skillRanks[skillId] >= (definition.requiredRank ?? 1)
    && !variants.includes(upgradeId as SkillVariantId)
    && variants.length < 2;
}

function takeRandom(
  random: SeededRandom,
  candidates: BattleUpgradeId[],
): BattleUpgradeId | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  return candidates.splice(random.int(0, candidates.length - 1), 1)[0];
}

export function createUpgradeOffer(
  seed: number,
  runLevel: number,
  build: BattleBuildState,
  unlockedVariants: readonly SkillVariantId[],
  roll?: number,
): readonly BattleUpgradeId[];
/** @deprecated Kept for the current battle engine until its build-state migration. */
export function createUpgradeOffer(
  seed: number,
  runLevel: number,
  levels: Readonly<Record<BattleUpgradeId, number>>,
  roll?: number,
): readonly BattleUpgradeId[];
export function createUpgradeOffer(
  seed: number,
  runLevel: number,
  buildOrLevels: BattleBuildState | Readonly<Record<BattleUpgradeId, number>>,
  unlockedVariantsOrRoll: readonly SkillVariantId[] | number = [],
  suppliedRoll = 0,
): readonly BattleUpgradeId[] {
  if (!('generalLevels' in buildOrLevels)) {
    const levels = buildOrLevels;
    const roll = typeof unlockedVariantsOrRoll === 'number' ? unlockedVariantsOrRoll : 0;
    const candidates = UPGRADE_IDS.filter((id) => levels[id] < 3);
    const random = new SeededRandom(
      seed ^ Math.imul(runLevel, 0x9e3779b1) ^ Math.imul(roll, 0x85ebca6b),
    );
    const offer: BattleUpgradeId[] = [];
    while (offer.length < 3) {
      const upgradeId = takeRandom(random, candidates);
      if (upgradeId === undefined) break;
      offer.push(upgradeId);
    }
    return offer;
  }

  const build = buildOrLevels;
  const unlockedVariants = unlockedVariantsOrRoll as readonly SkillVariantId[];
  const random = new SeededRandom(
    seed ^ Math.imul(runLevel, 0x9e3779b1) ^ Math.imul(suppliedRoll, 0x85ebca6b),
  );
  const allCandidates = (Object.keys(BATTLE_UPGRADE_DEFINITIONS) as BattleUpgradeId[])
    .filter((id) => isUpgradeLegal(build, unlockedVariants, id));
  const skillCandidates = allCandidates.filter(
    (id) => getBattleUpgradeDefinition(id).kind !== 'general',
  );
  const generalCandidates = allCandidates.filter(
    (id) => getBattleUpgradeDefinition(id).kind === 'general',
  );
  const offer: BattleUpgradeId[] = [];
  for (const candidates of [skillCandidates, generalCandidates]) {
    const upgradeId = takeRandom(random, candidates);
    if (upgradeId !== undefined) offer.push(upgradeId);
  }
  const remaining = allCandidates.filter((id) => !offer.includes(id));
  while (offer.length < 3) {
    const upgradeId = takeRandom(random, remaining);
    if (upgradeId === undefined) break;
    offer.push(upgradeId);
  }
  return offer;
}

export function applyBattleUpgrade(
  build: BattleBuildState,
  upgradeId: BattleUpgradeId,
): BattleBuildState {
  const next = cloneBattleBuild(build);
  const definition = getBattleUpgradeDefinition(upgradeId);
  if (definition.kind === 'general') {
    const generalId = upgradeId as BattleGeneralUpgradeId;
    if (build.generalLevels[generalId] < definition.maxLevel) {
      return {
        ...next,
        generalLevels: {
          ...next.generalLevels,
          [generalId]: build.generalLevels[generalId] + 1,
        },
      };
    }
    return next;
  }
  const skillId = definition.skillId as BattleSkillId;
  if (definition.kind === 'skill-rank') {
    if (build.skillRanks[skillId] < 5) {
      return {
        ...next,
        skillRanks: {
          ...next.skillRanks,
          [skillId]: build.skillRanks[skillId] + 1,
        },
      };
    }
    return next;
  }
  const variants = build.skillVariants[skillId];
  if (build.skillRanks[skillId] < (definition.requiredRank ?? 1)
    || variants.includes(upgradeId as SkillVariantId) || variants.length >= 2) {
    return next;
  }
  return {
    ...next,
    skillVariants: {
      ...next.skillVariants,
      [skillId]: [...variants, upgradeId as SkillVariantId],
    },
  };
}

export function applyUpgrade(
  current: BattleModifiers,
  currentLevels: Readonly<Record<BattleUpgradeId, number>>,
  upgradeId: BattleUpgradeId,
): UpgradeApplyResult {
  if (currentLevels[upgradeId] >= 3) return { accepted: false, modifiers: { ...current }, levels: { ...currentLevels } };
  const modifiers = { ...current };
  if (upgradeId === 'multi-barrel') { modifiers.mainProjectileCount += 1; modifiers.mainProjectileDamageMultiplier = 0.72; }
  if (upgradeId === 'rapid-reload') modifiers.reloadMultiplier -= 0.12;
  if (upgradeId === 'coral-warhead') { modifiers.splashRadius = 54; modifiers.splashDamageMultiplier += 0.35; }
  if (upgradeId === 'echo-chain') { modifiers.chainCount += 1; modifiers.chainDamageMultiplier = 0.45; }
  if (upgradeId === 'precision-lens') modifiers.criticalChance += 0.08;
  if (upgradeId === 'bubble-capacitor') { modifiers.barrierShieldMultiplier += 0.25; modifiers.barrierHealPercent += 0.04; }
  if (upgradeId === 'tidal-resonance') modifiers.activeCooldownMultiplier -= 0.15;
  if (upgradeId === 'magnetic-salvage') { modifiers.lootAttractMultiplier += 0.4; modifiers.experienceMultiplier += 0.1; }
  if (upgradeId === 'overload-core') { modifiers.energyGainMultiplier += 0.25; modifiers.extremeDamageMultiplier += 0.2; }
  return { accepted: true, modifiers, levels: { ...currentLevels, [upgradeId]: currentLevels[upgradeId] + 1 } };
}
