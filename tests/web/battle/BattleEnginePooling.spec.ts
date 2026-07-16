import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';

function runBattle(battleId: string): BattleEngine {
  const engine = new BattleEngine({
    battleId,
    seed: 4,
    mode: 'normal',
    mapId: 'drift-suburb',
    maxTrainHp: 10_000,
    mainCannonDamage: 500,
    initialEnergy: 100,
    repairBonus: 0,
    enemyHpFlatBonus: 0,
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
  });
  for (let elapsed = 0; elapsed < 230_000; elapsed += FIXED_STEP_MS) {
    engine.update(FIXED_STEP_MS);
    if (engine.frame.status === 'upgrade') {
      const choice = engine.frame.offeredUpgradeIds[0];
      if (choice) engine.chooseUpgrade(choice);
    }
  }
  return engine;
}

describe('BattleEngine pooled entities', () => {
  it('reuses projectile and loot objects without changing deterministic results', () => {
    const first = runBattle('pool-first');
    const second = runBattle('pool-second');

    expect({
      ...first.outcome,
      battleId: 'stable',
    }).toEqual({
      ...second.outcome,
      battleId: 'stable',
    });
    expect(first.frame.upgradeLevels).toEqual(second.frame.upgradeLevels);
    expect(first.frame.projectiles.every((item) => item.active)).toBe(true);
    expect(first.frame.loot.every((item) => !item.collected)).toBe(true);
    expect(first.poolStats.projectiles.reused).toBeGreaterThan(0);
    expect(first.poolStats.loot.reused).toBeGreaterThan(0);
  });
});
