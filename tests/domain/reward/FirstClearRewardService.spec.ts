import { describe, expect, it } from 'vitest';
import { claimFirstClear } from '../../../src/domain/reward/FirstClearRewardService';

describe('FirstClearRewardService', () => {
  it('grants a high-value first clear reward once per map', () => {
    const reward = {
      mapId: 'drift-suburb',
      gears: 200,
      routeMarks: 3,
      starTickets: 0,
      collectionId: 'suburb-lantern',
    };
    const first = claimFirstClear({ claimedMapIds: [] }, reward);
    const repeat = claimFirstClear(first.state, reward);
    expect(first.granted).toBe(true);
    expect(first.reward.gears).toBe(200);
    expect(repeat.granted).toBe(false);
    expect(repeat.reward.gears).toBe(0);
  });
});
