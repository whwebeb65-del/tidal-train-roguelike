import type { SkillVariantId } from './BattleTypes';

export interface VolleyProfile {
  readonly projectileCount: number;
  readonly projectileDamageMultiplier: number;
  readonly cooldownMultiplier: number;
  readonly splitMultiplier: number;
  readonly pierceCount: number;
  readonly pierceRetention: number;
  readonly returningCount: number;
  readonly returningMultiplier: number;
}

export interface BarrierProfile {
  readonly breakDamageMultiplier: number;
  readonly reflectRatio: number;
  readonly overflowShieldCapRatio: number;
  readonly emergencyEffectRatio: number;
}

export interface EmergencyTriggerInput {
  readonly currentHp: number;
  readonly maxHp: number;
  readonly consumed: boolean;
  readonly effectRatio: number;
}

const BASE_VOLLEY_PROFILE: VolleyProfile = {
  projectileCount: 8,
  projectileDamageMultiplier: 1,
  cooldownMultiplier: 1,
  splitMultiplier: 0,
  pierceCount: 0,
  pierceRetention: 0.6,
  returningCount: 0,
  returningMultiplier: 0.45,
};

const BASE_BARRIER_PROFILE: BarrierProfile = {
  breakDamageMultiplier: 0,
  reflectRatio: 0,
  overflowShieldCapRatio: 0,
  emergencyEffectRatio: 0,
};

export function volleyProfile(
  variants: readonly SkillVariantId[],
): VolleyProfile {
  return {
    ...BASE_VOLLEY_PROFILE,
    ...(variants.includes('rainstorm-school')
      ? { projectileCount: 16, projectileDamageMultiplier: 0.75, cooldownMultiplier: 1.2 }
      : {}),
    ...(variants.includes('split-tide-arrow') ? { splitMultiplier: 0.35 } : {}),
    ...(variants.includes('reef-piercer') ? { pierceCount: 1 } : {}),
    ...(variants.includes('returning-volley') ? { returningCount: 4 } : {}),
  };
}

export function barrierProfile(
  variants: readonly SkillVariantId[],
): BarrierProfile {
  return {
    ...BASE_BARRIER_PROFILE,
    ...(variants.includes('bursting-bubble') ? { breakDamageMultiplier: 1.5 } : {}),
    ...(variants.includes('reflective-spines') ? { reflectRatio: 0.35 } : {}),
    ...(variants.includes('overflow-membrane') ? { overflowShieldCapRatio: 0.15 } : {}),
    ...(variants.includes('emergency-trigger') ? { emergencyEffectRatio: 0.6 } : {}),
  };
}

export function reflectBarrierDamage(absorbedDamage: number, reflectRatio: number): number {
  return Math.max(0, Math.floor(absorbedDamage * reflectRatio));
}

export function shouldEmergencyTrigger(input: EmergencyTriggerInput): boolean {
  return input.effectRatio > 0
    && !input.consumed
    && input.maxHp > 0
    && input.currentHp < input.maxHp * 0.25;
}
