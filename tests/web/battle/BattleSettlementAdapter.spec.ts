import { describe, expect, it } from 'vitest';
import { BattleSettlementAdapter } from '../../../web/app/BattleSettlementAdapter';

describe('BattleSettlementAdapter', () => {
  it('applies a battle outcome exactly once', () => {
    const adapter = new BattleSettlementAdapter<{ gears: number }>();
    const outcome = {
      battleId: 'b-1',
      victory: true,
      elapsedMs: 180_000,
      completedWaves: 6,
      remainingHp: 50,
      kills: 100,
      killCounts: { normal: 100, elite: 0, boss: 0 },
      skillCastCounts: {
        'tidal-volley': 2,
        'bubble-barrier': 0,
        'extreme-tide': 0,
      },
      hardCapReached: false,
      adReviveUsed: false,
    };
    const first = adapter.settle({ gears: 0 }, outcome, (state) => ({
      gears: state.gears + 400,
    }));
    const duplicate = adapter.settle(first.state, outcome, (state) => ({
      gears: state.gears + 400,
    }));

    expect(first).toEqual({ accepted: true, state: { gears: 400 } });
    expect(duplicate).toEqual({
      accepted: false,
      state: { gears: 400 },
    });
    expect(adapter.hasSettled('b-1')).toBe(true);
  });
});
