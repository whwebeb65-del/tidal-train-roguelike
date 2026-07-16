import { describe, expect, it } from 'vitest';
import {
  getAvailableBattleInteractions,
} from '../../../web/battle/BattleInteractionSchedule';

describe('getAvailableBattleInteractions', () => {
  it('keeps the two-claim salvage interaction in the same run', () => {
    expect(
      getAvailableBattleInteractions(20_000, {}, 'normal')[0],
    ).toMatchObject({
      actionId: 'salvage-a',
      attempt: 0,
      maxClaims: 2,
      amount: 8,
    });
    expect(
      getAvailableBattleInteractions(
        25_000,
        { 'salvage-a': 1 },
        'normal',
      )[0]?.attempt,
    ).toBe(1);
    expect(
      getAvailableBattleInteractions(
        25_000,
        { 'salvage-a': 2 },
        'normal',
      ),
    ).toEqual([]);
  });

  it('shows only one prioritized interaction and hides daily trials', () => {
    expect(
      getAvailableBattleInteractions(
        75_000,
        { 'salvage-a': 2 },
        'normal',
      )[0]?.actionId,
    ).toBe('aid-b');
    expect(
      getAvailableBattleInteractions(20_000, {}, 'daily-trial'),
    ).toEqual([]);
  });
});
