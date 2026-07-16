import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';

function reachFirstUpgrade(mode: 'normal' | 'daily-trial'): BattleEngine {
  const engine = new BattleEngine({
    battleId: `upgrade-${mode}`,
    seed: 17,
    mode,
    mapId: 'drift-suburb',
    maxTrainHp: 10_000,
    mainCannonDamage: 500,
    initialEnergy: 0,
    repairBonus: 0,
    enemyHpFlatBonus: 0,
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
  });
  for (let step = 0; step < 20_000; step += 1) {
    if (engine.frame.status === 'upgrade') return engine;
    engine.update(FIXED_STEP_MS);
  }
  throw new Error('First upgrade checkpoint was not reached');
}

describe('BattleEngine upgrade reroll', () => {
  it('allows one changed offer in normal mode and none in daily trial', () => {
    const normal = reachFirstUpgrade('normal');
    const first = [...normal.frame.offeredUpgradeIds];
    expect(normal.rerollUpgradeOffer()).toBe(true);
    expect(normal.frame.offeredUpgradeIds).not.toEqual(first);
    expect(normal.frame.upgradeRerollUsed).toBe(true);
    expect(normal.rerollUpgradeOffer()).toBe(false);

    const daily = reachFirstUpgrade('daily-trial');
    expect(daily.rerollUpgradeOffer()).toBe(false);
  });
});
