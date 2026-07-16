import type { MapId } from '../../src/domain/station/MapProgression';
import type { RunMode } from '../app/AppTypes';

export type BattleStatus =
  | 'running'
  | 'upgrade'
  | 'boss-intro'
  | 'paused'
  | 'victory'
  | 'defeat';

export type EnemyKind =
  | 'bubble-fin'
  | 'needle-jelly'
  | 'reef-crab'
  | 'storm-ray-elite'
  | 'deep-echo-boss';

export type BattleSkillId =
  | 'tidal-volley'
  | 'bubble-barrier'
  | 'extreme-tide';

export type BattleUpgradeId =
  | 'multi-barrel'
  | 'rapid-reload'
  | 'coral-warhead'
  | 'echo-chain'
  | 'precision-lens'
  | 'bubble-capacitor'
  | 'tidal-resonance'
  | 'magnetic-salvage'
  | 'overload-core';

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

export interface ProjectileState {
  readonly id: number;
  readonly source: 'main' | 'volley' | 'chain';
  x: number;
  y: number;
  readonly targetId: number;
  readonly speedPerSecond: number;
  readonly damage: number;
  readonly splashRadius: number;
  readonly chainRemaining: number;
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
  readonly experience: number;
  readonly nextExperienceThreshold: number | null;
  readonly offeredUpgradeIds: readonly BattleUpgradeId[];
  readonly upgradeLevels: Readonly<Record<BattleUpgradeId, number>>;
  readonly cooldowns: Readonly<Record<BattleSkillId, number>>;
  readonly adReviveUsed: boolean;
  readonly skillRefreshUsed: boolean;
  readonly upgradeRerollUsed: boolean;
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
    }
  | { readonly type: 'shield-changed'; readonly shield: number }
  | { readonly type: 'skill-used'; readonly skillId: BattleSkillId }
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
      readonly level: number;
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
  readonly adReviveUsed: boolean;
}
