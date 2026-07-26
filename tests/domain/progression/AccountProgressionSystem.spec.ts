import { describe, expect, it } from 'vitest';
import {
  accountXpToNextLevel,
  availableBattleSpeeds,
  calculateBattleAccountXp,
  grantAccountXp,
} from '../../../src/domain/progression/AccountProgressionSystem';

describe('AccountProgressionSystem', () => {
  it('uses the fast early curve and carries XP across multiple levels', () => {
    expect(accountXpToNextLevel(1)).toBe(80);
    expect(accountXpToNextLevel(9)).toBe(160);
    expect(accountXpToNextLevel(10)).toBe(170);
    expect(grantAccountXp({ level: 1, xp: 70 }, 30)).toEqual({
      level: 2,
      xp: 20,
      levelsGained: 1,
    });
  });

  it('awards account XP from kills, first clear, and stamina', () => {
    expect(calculateBattleAccountXp({
      normalKills: 100,
      eliteKills: 1,
      bossKills: 1,
      firstClear: true,
      staminaSpent: 5,
    })).toEqual({
      normalKills: 100,
      eliteKills: 15,
      bossKills: 30,
      firstClear: 120,
      staminaSpent: 50,
      total: 315,
    });
  });

  it('unlocks speed tiers at levels 10, 20 and 30', () => {
    expect(availableBattleSpeeds(9)).toEqual([1]);
    expect(availableBattleSpeeds(10)).toEqual([1, 1.5]);
    expect(availableBattleSpeeds(20)).toEqual([1, 1.5, 2]);
    expect(availableBattleSpeeds(30)).toEqual([1, 1.5, 2, 3]);
  });
});
