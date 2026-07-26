import { describe, expect, it } from 'vitest';
import {
  recoverStamina,
  spendNormalRunStamina,
} from '../../../src/domain/progression/StaminaSystem';

describe('StaminaSystem', () => {
  it('recovers one point per ten minutes and preserves remainder time', () => {
    expect(recoverStamina(
      { stamina: 20, staminaUpdatedAtMs: 1_000 },
      1_231_000,
    )).toEqual({ stamina: 22, staminaUpdatedAtMs: 1_201_000 });
  });

  it('caps at thirty and normalizes clock rollback without granting stamina', () => {
    expect(recoverStamina(
      { stamina: 29, staminaUpdatedAtMs: 1_000 },
      1_801_000,
    )).toEqual({ stamina: 30, staminaUpdatedAtMs: 1_801_000 });
    expect(recoverStamina(
      { stamina: 9, staminaUpdatedAtMs: 5_000 },
      4_000,
    )).toEqual({ stamina: 9, staminaUpdatedAtMs: 4_000 });
  });

  it('spends exactly five stamina or returns an unchanged failure', () => {
    expect(spendNormalRunStamina(
      { stamina: 5, staminaUpdatedAtMs: 100 },
    )).toEqual({
      accepted: true,
      spent: 5,
      state: { stamina: 0, staminaUpdatedAtMs: 100 },
    });
    expect(spendNormalRunStamina(
      { stamina: 4, staminaUpdatedAtMs: 100 },
    ).accepted).toBe(false);
  });
});
