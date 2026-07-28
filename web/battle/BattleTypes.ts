import type { MapId } from '../../src/domain/station/MapProgression';
import type {
  BattleSkillId,
  SkillVariantId,
} from '../../src/domain/skill/SkillProgressionTypes';
import type { RunMode } from '../app/AppTypes';

export type {
  BattleSkillId,
  SkillVariantId,
} from '../../src/domain/skill/SkillProgressionTypes';

export type BattleStatus =
  | 'running'
  | 'upgrade'
  | 'boss-intro'
  | 'paused'
  | 'victory'
  | 'defeat';

export type UpgradeSelectionSource = 'manual' | 'timeout';

export type EnemyKind =
  | 'bubble-fin'
  | 'needle-jelly'
  | 'reef-crab'
  | 'storm-ray-elite'
  | 'deep-echo-boss';

export type BattleGeneralUpgradeId =
  | 'multi-barrel'
  | 'rapid-reload'
  | 'coral-warhead'
  | 'echo-chain'
  | 'precision-lens'
  | 'bubble-capacitor'
  | 'tidal-resonance'
  | 'magnetic-salvage'
  | 'overload-core';

export type BattleSkillRankUpgradeId =
  | 'rank-tidal-volley'
  | 'rank-bubble-barrier'
  | 'rank-extreme-tide';

export type BattleUpgradeId =
  | BattleGeneralUpgradeId
  | BattleSkillRankUpgradeId
  | SkillVariantId;

export type SkillRanks = Record<BattleSkillId, 1 | 2 | 3 | 4 | 5>;

export type SkillVariantLoadout =
  Record<BattleSkillId, readonly SkillVariantId[]>;

export interface BattleBuildState {
  readonly generalLevels: Readonly<Record<BattleGeneralUpgradeId, number>>;
  readonly skillRanks: Readonly<SkillRanks>;
  readonly skillVariants: Readonly<SkillVariantLoadout>;
}

export type PauseReason =
  | 'manual'
  | 'visibility'
  | 'upgrade'
  | 'rewarded-ad'
  | 'revive'
  | 'boss-intro';

export interface BattleRunInput {
  readonly battleId: string;
  readonly seed: number;
  readonly mode: RunMode;
  readonly mapId: MapId;
  readonly maxTrainHp: number;
  readonly mainCannonDamage: number;
  readonly initialEnergy: number;
  readonly repairBonus: number;
  readonly enemyHpFlatBonus: number;
  readonly enemyHpMultiplier: number;
  readonly enemyDamageMultiplier: number;
  readonly skillMasteryPower: Readonly<Record<BattleSkillId, number>>;
  readonly unlockedSkillVariants: readonly SkillVariantId[];
}

export interface EnemyState {
  readonly id: number;
  readonly kind: EnemyKind;
  readonly lane: 0 | 1 | 2;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shield: number;
  speedPerSecond: number;
  defenceBroken: boolean;
  attackCooldownMs: number;
  ageMs: number;
  alive: boolean;
}

export interface BattleAimPoint {
  readonly x: number;
  readonly y: number;
}

export interface ProjectileState {
  readonly id: number;
  readonly source: 'main' | 'volley' | 'chain';
  x: number;
  y: number;
  readonly targetId: number;
  readonly trajectory: 'homing' | 'manual';
  readonly velocityX: number;
  readonly velocityY: number;
  readonly speedPerSecond: number;
  readonly damage: number;
  readonly splashRadius: number;
  readonly chainRemaining: number;
  pierceRemaining?: number;
  readonly splitMultiplier?: number;
  readonly critical: boolean;
  active: boolean;
}

export interface LootState {
  readonly id: number;
  readonly kind: 'experience' | 'gear';
  x: number;
  y: number;
  readonly amount: number;
  ageMs: number;
  collected: boolean;
}

export interface BattleModifiers {
  mainProjectileCount: number;
  mainProjectileDamageMultiplier: number;
  reloadMultiplier: number;
  splashRadius: number;
  splashDamageMultiplier: number;
  chainCount: number;
  chainDamageMultiplier: number;
  criticalChance: number;
  criticalMultiplier: number;
  barrierShieldMultiplier: number;
  barrierHealPercent: number;
  activeCooldownMultiplier: number;
  lootAttractMultiplier: number;
  experienceMultiplier: number;
  energyGainMultiplier: number;
  extremeDamageMultiplier: number;
}

export interface BattleFrameView {
  readonly battleId: string;
  readonly mode: RunMode;
  readonly mapId: MapId;
  readonly status: BattleStatus;
  readonly elapsedMs: number;
  readonly phaseElapsedMs: number;
  readonly wave: number;
  readonly trainHp: number;
  readonly maxTrainHp: number;
  readonly shield: number;
  readonly shieldRemainingMs: number;
  readonly energy: number;
  readonly combo: number;
  readonly kills: number;
  /** Authoritative encounter latch for E2E/release checks; survives despawn. */
  readonly eliteEncountered: boolean;
  readonly experience: number;
  readonly nextExperienceThreshold: number | null;
  readonly runLevel: number;
  readonly skillRanks: Readonly<SkillRanks>;
  readonly skillVariants: Readonly<SkillVariantLoadout>;
  readonly offeredUpgradeIds: readonly BattleUpgradeId[];
  readonly upgradeLevels: Readonly<Record<BattleUpgradeId, number>>;
  readonly cooldowns: Readonly<Record<BattleSkillId, number>>;
  readonly adReviveUsed: boolean;
  readonly skillRefreshUsed: boolean;
  readonly upgradeRerollUsed: boolean;
  readonly mainCannonAim: Readonly<BattleAimPoint> | null;
  readonly enemies: readonly EnemyState[];
  readonly projectiles: readonly ProjectileState[];
  readonly loot: readonly LootState[];
}

export type BattleEvent =
  | { readonly type: 'wave-started'; readonly wave: number }
  | {
      readonly type: 'enemy-spawned';
      readonly enemyId: number;
      readonly kind: EnemyKind;
    }
  | {
      readonly type: 'weapon-fired';
      readonly projectileId: number;
      readonly source: ProjectileState['source'];
    }
  | {
      readonly type: 'projectile-hit';
      readonly enemyId: number;
      readonly damage: number;
      readonly critical: boolean;
      readonly source:
        | ProjectileState['source']
        | 'extreme-tide'
        | 'splash';
    }
  | { readonly type: 'enemy-armour-broken'; readonly enemyId: number }
  | {
      readonly type: 'enemy-killed';
      readonly enemyId: number;
      readonly kind: EnemyKind;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'loot-created';
      readonly lootId: number;
      readonly kind: LootState['kind'];
    }
  | {
      readonly type: 'loot-collected';
      readonly lootId: number;
      readonly kind: LootState['kind'];
      readonly amount: number;
    }
  | {
      readonly type: 'train-damaged';
      readonly amount: number;
      readonly shieldAbsorbed: number;
      readonly remainingHp: number;
      readonly impactDirectionX: -1 | 0 | 1;
    }
  | { readonly type: 'shield-changed'; readonly shield: number }
  | { readonly type: 'barrier-burst' }
  | { readonly type: 'skill-used'; readonly skillId: BattleSkillId }
  | { readonly type: 'extreme-pull-started'; readonly durationMs: number }
  | { readonly type: 'extreme-vortex-started'; readonly durationMs: number }
  | {
      readonly type: 'extreme-second-crest';
      readonly durationMs: number;
      readonly amount: number;
    }
  | { readonly type: 'extreme-energy-refunded'; readonly amount: number }
  | { readonly type: 'skill-cooldowns-refreshed' }
  | {
      readonly type: 'upgrade-offered';
      readonly upgradeIds: readonly BattleUpgradeId[];
    }
  | {
      readonly type: 'upgrade-rerolled';
      readonly upgradeIds: readonly BattleUpgradeId[];
    }
  | {
      readonly type: 'upgrade-selected';
      readonly upgradeId: BattleUpgradeId;
      readonly source: UpgradeSelectionSource;
      readonly level: number;
      readonly runLevel: number;
      readonly nextExperienceThreshold: number | null;
      readonly skillRanks: Readonly<SkillRanks>;
      readonly skillVariants: Readonly<SkillVariantLoadout>;
    }
  | {
      readonly type: 'run-level-reached';
      readonly runLevel: number;
      readonly nextExperienceThreshold: number | null;
      readonly skillRanks: Readonly<SkillRanks>;
      readonly skillVariants: Readonly<SkillVariantLoadout>;
    }
  | { readonly type: 'elite-entered'; readonly enemyId: number }
  | { readonly type: 'boss-intro-started' }
  | { readonly type: 'boss-intro-ended'; readonly enemyId: number }
  | { readonly type: 'boss-charge-started'; readonly durationMs: number }
  | { readonly type: 'battle-won' }
  | { readonly type: 'battle-lost' };

export interface BattleOutcome {
  readonly battleId: string;
  readonly victory: boolean;
  readonly elapsedMs: number;
  readonly completedWaves: number;
  readonly remainingHp: number;
  readonly kills: number;
  readonly killCounts?: Readonly<Record<'normal' | 'elite' | 'boss', number>>;
  readonly skillCastCounts?: Readonly<Record<BattleSkillId, number>>;
  readonly hardCapReached?: boolean;
  readonly adReviveUsed: boolean;
}
