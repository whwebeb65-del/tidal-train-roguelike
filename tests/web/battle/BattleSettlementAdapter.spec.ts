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
