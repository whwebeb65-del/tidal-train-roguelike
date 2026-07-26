import { describe, expect, it } from 'vitest';
import {
  createSkillMasteryXp,
  settleSkillMastery,
  skillMasteryLevelFromXp,
  skillMasteryPowerMultiplier,
  unlockedSkillVariants,
} from '../../../src/domain/progression/SkillMasterySystem';

describe('SkillMasterySystem', () => {
  it('uses the 20 + 8n curve and caps level and power at twenty', () => {
    expect(skillMasteryLevelFromXp(0)).toBe(1);
    expect(skillMasteryLevelFromXp(19)).toBe(1);
    expect(skillMasteryLevelFromXp(20)).toBe(2);
    expect(skillMasteryLevelFromXp(Number.MAX_SAFE_INTEGER)).toBe(20);
    expect(skillMasteryPowerMultiplier(20)).toBeCloseTo(1.1425);
  });

  it('caps cast XP per skill and adds first-clear XP only to used skills', () => {
    const result = settleSkillMastery(createSkillMasteryXp(), {
      castCounts: {
        'tidal-volley': 99,
        'bubble-barrier': 2,
        'extreme-tide': 1,
      },
      firstClear: true,
    });

    expect(result.gainedXp).toEqual({
      'tidal-volley': 100,
      'bubble-barrier': 50,
      'extreme-tide': 50,
    });
    expect(result.nextXp).toEqual(result.gainedXp);
  });

  it('unlocks one ordered variant at mastery 5, 10, 15 and 20', () => {
    expect(unlockedSkillVariants('tidal-volley', 4)).toEqual([]);
    expect(unlockedSkillVariants('tidal-volley', 10)).toEqual([
      'split-tide-arrow',
      'reef-piercer',
    ]);
    expect(unlockedSkillVariants('tidal-volley', 20)).toHaveLength(4);
  });
});
