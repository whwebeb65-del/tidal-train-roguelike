import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';
import { EffectSystem } from '../../../web/battle/EffectSystem';
import {
  getRenderBudget,
  type QualityLevel,
} from '../../../web/battle/QualityMonitor';

function runAtQuality(level: QualityLevel) {
  const engine = new BattleEngine({
    battleId: `quality-${level}`,
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
  const effects = new EffectSystem({
    particleLimit: 200,
    damageNumberLimit: 18,
    impactLimit: 24,
    reducedMotion: false,
  });
  effects.setRenderBudget(getRenderBudget(level));

  for (let elapsed = 0; elapsed < 230_000; elapsed += FIXED_STEP_MS) {
    engine.update(FIXED_STEP_MS);
    effects.consume(engine.drainEvents(), engine.frame);
    effects.update(FIXED_STEP_MS);
    if (engine.frame.status === 'upgrade') {
      const choice = engine.frame.offeredUpgradeIds[0];
      if (choice) engine.chooseUpgrade(choice);
    }
  }

  return {
    outcome: engine.outcome && {
      ...engine.outcome,
      battleId: 'quality-stable',
    },
    kills: engine.frame.kills,
    remainingHp: engine.frame.trainHp,
    upgradeLevels: engine.frame.upgradeLevels,
  };
}

describe('battle visual quality determinism', () => {
  it('produces the same result at high, medium and low quality', () => {
    const high = runAtQuality('high');

    expect(runAtQuality('medium')).toEqual(high);
    expect(runAtQuality('low')).toEqual(high);
  });
});
