import { describe, expect, it } from 'vitest';
import {
  canCaptainWearSkin,
  getSkinCollectionModifiers,
  normalizeOwnedSkinIds,
} from '../../../src/domain/skin/SkinCollectionSystem';

describe('SkinCollectionSystem', () => {
  it('deduplicates skin ownership and always retains the base skin', () => {
    expect(normalizeOwnedSkinIds([
      'skin-aurora-whale-song',
      'skin-aurora-whale-song',
    ])).toEqual(['skin-tide-base', 'skin-aurora-whale-song']);
  });

  it('adds all unique owned-skin bonuses without a cap', () => {
    const modifiers = getSkinCollectionModifiers([
      'skin-seafoam-departure',
      'skin-aurora-whale-song',
    ]);

    expect(modifiers.maxHpPercent).toBeCloseTo(0.015);
    expect(modifiers.damagePercent).toBeCloseTo(0.005);
    expect(modifiers.gearsPercent).toBeCloseTo(0.005);
  });

  it('allows both captains to wear each launch skin', () => {
    expect(canCaptainWearSkin(
      'captain-tide-female',
      'skin-aurora-whale-song',
    )).toBe(true);
    expect(canCaptainWearSkin(
      'captain-tide-male',
      'skin-aurora-whale-song',
    )).toBe(true);
  });

  it('ignores unknown skin IDs when aggregating stats', () => {
    expect(getSkinCollectionModifiers(['unknown-skin']).maxHpPercent).toBe(0);
  });
});
