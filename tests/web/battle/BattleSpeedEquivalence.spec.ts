import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';
import { SimulationRateController } from '../../../web/battle/SimulationRateController';
import type { BattleSpeed } from '../../../src/domain/progression/AccountProgressionSystem';

function runAtSpeed(speed: BattleSpeed) {
  const engine = new BattleEngine({
    battleId: 'speed-equivalence',
    seed: 17,
    mode: 'normal',
    mapId: 'drift-suburb',
    maxTrainHp: 10_000,
    mainCannonDamage: 500,
    initialEnergy: 100,
    repairBonus: 0,
    enemyHpFlatBonus: 0,
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    skillMasteryPower: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 1 },
    unlockedSkillVariants: [],
  });
  const rate = new SimulationRateController(FIXED_STEP_MS, speed);
  const events: unknown[] = [];

  for (let realElapsed = 0; realElapsed < 480_000 && !engine.outcome; realElapsed += FIXED_STEP_MS) {
    rate.consume(FIXED_STEP_MS, (stepMs) => {
      engine.update(stepMs);
      if (engine.frame.status === 'upgrade') {
        const choice = engine.frame.offeredUpgradeIds[0];
        if (choice) engine.chooseUpgrade(choice, 'manual');
      }
      events.push(...engine.drainEvents());
    });
  }

  return {
    outcome: engine.outcome,
    kills: engine.frame.kills,
    hp: engine.frame.trainHp,
    energy: engine.frame.energy,
    level: engine.frame.runLevel,
    ranks: engine.frame.skillRanks,
    variants: engine.frame.skillVariants,
    events,
  };
}

describe('fixed-seed battle speed equivalence', () => {
  it('preserves authoritative outcomes across 1x, 1.5x, 2x, and 3x', () => {
    const baseline = runAtSpeed(1);
    for (const speed of [1.5, 2, 3] as const) {
      expect(runAtSpeed(speed)).toEqual(baseline);
    }
  });
});
