import type {
  BattleModifiers,
  BattleSkillId,
  BattleUpgradeId,
  EnemyKind,
} from './BattleTypes';

export const LOGICAL_WIDTH = 390;
export const LOGICAL_HEIGHT = 844;
export const DEFENCE_LINE_Y = 716;
export const FIXED_STEP_MS = 1000 / 60;
export const MAX_CATCH_UP_STEPS = 5;
export const MAIN_CANNON_INTERVAL_MS = 400;
export const MAIN_PROJECTILE_SPEED = 620;
export const EXPERIENCE_THRESHOLDS = [180, 560, 1080] as const;
export const LANE_X = [92, 195, 298] as const;

export const ENEMY_CONFIG: Readonly<Record<EnemyKind, {
  readonly hp: number;
  readonly speedPerSecond: number;
  readonly defenceDamage: number;
  readonly attackIntervalMs: number;
  readonly experience: number;
}>> = {
  'bubble-fin': {
    hp: 80,
    speedPerSecond: 52,
    defenceDamage: 7,
    attackIntervalMs: 1200,
    experience: 10,
  },
  'needle-jelly': {
    hp: 45,
    speedPerSecond: 85,
    defenceDamage: 4,
    attackIntervalMs: 800,
    experience: 8,
  },
  'reef-crab': {
    hp: 180,
    speedPerSecond: 34,
    defenceDamage: 12,
    attackIntervalMs: 1500,
    experience: 18,
  },
  'storm-ray-elite': {
    hp: 1200,
    speedPerSecond: 26,
    defenceDamage: 16,
    attackIntervalMs: 1200,
    experience: 120,
  },
  'deep-echo-boss': {
    hp: 4200,
    speedPerSecond: 0,
    defenceDamage: 0,
    attackIntervalMs: 0,
    experience: 0,
  },
};

export const SKILL_CONFIG: Readonly<Record<BattleSkillId, {
  readonly cooldownMs: number;
}>> = {
  'tidal-volley': { cooldownMs: 12_000 },
  'bubble-barrier': { cooldownMs: 18_000 },
  'extreme-tide': { cooldownMs: 0 },
};

export const UPGRADE_IDS: readonly BattleUpgradeId[] = [
  'multi-barrel',
  'rapid-reload',
  'coral-warhead',
  'echo-chain',
  'precision-lens',
  'bubble-capacitor',
  'tidal-resonance',
  'magnetic-salvage',
  'overload-core',
];

export function createBaseModifiers(): BattleModifiers {
  return {
    mainProjectileCount: 1,
    mainProjectileDamageMultiplier: 1,
    reloadMultiplier: 1,
    splashRadius: 0,
    splashDamageMultiplier: 0,
    chainCount: 0,
    chainDamageMultiplier: 0,
    criticalChance: 0,
    criticalMultiplier: 1.8,
    barrierShieldMultiplier: 1,
    barrierHealPercent: 0.08,
    activeCooldownMultiplier: 1,
    lootAttractMultiplier: 1,
    experienceMultiplier: 1,
    energyGainMultiplier: 1,
    extremeDamageMultiplier: 1,
  };
}
