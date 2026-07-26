import { describe, expect, it } from 'vitest';
import {
  barrierProfile,
  extremeProfile,
  reflectBarrierDamage,
  shouldEmergencyTrigger,
  volleyProfile,
} from '../../../web/battle/SkillVariantSystem';

describe('SkillVariantSystem', () => {
  it('builds all extreme tide variant values', () => {
    expect(extremeProfile([
      'undertow-eye',
      'lingering-vortex',
      'energy-return',
      'double-crest',
    ])).toEqual({
      pullDurationMs: 2000,
      vortexDurationMs: 4000,
      vortexTotalDamageMultiplier: 2,
      energyPerKill: 2,
      energyRefundCap: 20,
      secondCrestDelayMs: 1200,
      secondCrestDamageRatio: 0.45,
    });
  });

  it('builds the approved volley mutation profile', () => {
    expect(volleyProfile([
      'split-tide-arrow',
      'rainstorm-school',
    ])).toEqual({
      projectileCount: 16,
      projectileDamageMultiplier: 0.75,
      cooldownMultiplier: 1.2,
      splitMultiplier: 0.35,
      pierceCount: 0,
      pierceRetention: 0.6,
      returningCount: 0,
      returningMultiplier: 0.45,
    });
  });

  it('maps every volley mutation without mutating its loadout', () => {
    const variants = [
      'split-tide-arrow',
      'reef-piercer',
      'returning-volley',
    ] as const;

    expect(volleyProfile(variants)).toMatchObject({
      projectileCount: 8,
      projectileDamageMultiplier: 1,
      cooldownMultiplier: 1,
      splitMultiplier: 0.35,
      pierceCount: 1,
      pierceRetention: 0.6,
      returningCount: 4,
      returningMultiplier: 0.45,
    });
    expect(variants).toEqual([
      'split-tide-arrow',
      'reef-piercer',
      'returning-volley',
    ]);
  });

  it('builds barrier break, reflect, overflow and emergency flags', () => {
    expect(barrierProfile([
      'bursting-bubble',
      'reflective-spines',
      'overflow-membrane',
      'emergency-trigger',
    ])).toMatchObject({
      breakDamageMultiplier: 1.5,
      reflectRatio: 0.35,
      overflowShieldCapRatio: 0.15,
      emergencyEffectRatio: 0.6,
    });
  });

  it('reflects absorbed damage and triggers once below the emergency threshold', () => {
    expect(reflectBarrierDamage(40, 0.35)).toBe(14);
    expect(shouldEmergencyTrigger({
      currentHp: 24,
      maxHp: 100,
      consumed: false,
      effectRatio: 0.6,
    })).toBe(true);
    expect(shouldEmergencyTrigger({
      currentHp: 25,
      maxHp: 100,
      consumed: false,
      effectRatio: 0.6,
    })).toBe(false);
    expect(shouldEmergencyTrigger({
      currentHp: 1,
      maxHp: 100,
      consumed: true,
      effectRatio: 0.6,
    })).toBe(false);
  });
});
