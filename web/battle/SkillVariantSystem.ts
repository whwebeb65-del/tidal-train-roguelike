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

export interface ExtremeProfile {
  readonly pullDurationMs: number;
  readonly vortexDurationMs: number;
  readonly vortexTotalDamageMultiplier: number;
  readonly energyPerKill: number;
  readonly energyRefundCap: number;
  readonly secondCrestDelayMs: number;
  readonly secondCrestDamageRatio: number;
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

const BASE_EXTREME_PROFILE: ExtremeProfile = {
  pullDurationMs: 0,
  vortexDurationMs: 0,
  vortexTotalDamageMultiplier: 0,
  energyPerKill: 0,
  energyRefundCap: 0,
  secondCrestDelayMs: 0,
  secondCrestDamageRatio: 0,
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

export function extremeProfile(
  variants: readonly SkillVariantId[],
): ExtremeProfile {
  return {
    ...BASE_EXTREME_PROFILE,
    ...(variants.includes('undertow-eye') ? { pullDurationMs: 2000 } : {}),
    ...(variants.includes('lingering-vortex') ? {
      vortexDurationMs: 4000,
      vortexTotalDamageMultiplier: 2,
    } : {}),
    ...(variants.includes('energy-return') ? {
      energyPerKill: 2,
      energyRefundCap: 20,
    } : {}),
    ...(variants.includes('double-crest') ? {
      secondCrestDelayMs: 1200,
      secondCrestDamageRatio: 0.45,
    } : {}),
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
