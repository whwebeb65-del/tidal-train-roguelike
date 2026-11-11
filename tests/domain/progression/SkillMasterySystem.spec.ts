import { describe, expect, it } from 'vitest';
import {
  createSkillMasteryXp,
  getSkillMasteryProgress,
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

  it('reports in-level XP and resets the progress bar exactly at each boundary', () => {
    expect(getSkillMasteryProgress(-10)).toEqual({ level: 1, levelXp: 0, nextLevelXp: 20 });
    expect(getSkillMasteryProgress(19)).toEqual({ level: 1, levelXp: 19, nextLevelXp: 20 });
    expect(getSkillMasteryProgress(20)).toEqual({ level: 2, levelXp: 0, nextLevelXp: 28 });
    expect(getSkillMasteryProgress(127)).toEqual({ level: 4, levelXp: 43, nextLevelXp: 44 });
    expect(getSkillMasteryProgress(128)).toEqual({ level: 5, levelXp: 0, nextLevelXp: 52 });
    expect(getSkillMasteryProgress(1747)).toEqual({ level: 19, levelXp: 163, nextLevelXp: 164 });
    expect(getSkillMasteryProgress(1748)).toEqual({ level: 20, levelXp: 0, nextLevelXp: null });
  });

  it('starts with one evolution and expands the permanent pool at 5, 10 and 15', () => {
    expect(unlockedSkillVariants('tidal-volley', 1)).toEqual([
      'split-tide-arrow',
    ]);
    expect(unlockedSkillVariants('tidal-volley', 10)).toEqual([
      'split-tide-arrow',
      'reef-piercer',
      'returning-volley',
    ]);
    expect(unlockedSkillVariants('tidal-volley', 15)).toHaveLength(4);
  });
});
