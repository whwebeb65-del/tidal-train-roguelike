import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';

function createEngine(): BattleEngine {
  return new BattleEngine({
    battleId: 'boss-1',
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
}

function runFor(engine: BattleEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed < durationMs; elapsed += FIXED_STEP_MS) {
    engine.update(FIXED_STEP_MS);
    if (engine.frame.status === 'upgrade') {
      const choice = engine.frame.offeredUpgradeIds[0];
      if (choice) engine.chooseUpgrade(choice);
    }
  }
}

describe('BattleEngine elite and boss', () => {
  it('enters elite, pauses for boss intro and settles victory once', () => {
    const engine = createEngine();
    runFor(engine, 230_000);
    const events = engine.drainEvents();

    expect(
      events.filter((event) => event.type === 'elite-entered'),
    ).toHaveLength(1);
    expect(
      events.filter((event) => event.type === 'boss-intro-started'),
    ).toHaveLength(1);
    expect(
      events.filter((event) => event.type === 'boss-intro-ended'),
    ).toHaveLength(1);
    expect(
      events.filter((event) => event.type === 'battle-won'),
    ).toHaveLength(1);
    expect(engine.outcome).toMatchObject({
      battleId: 'boss-1',
      victory: true,
    });

    runFor(engine, 5000);
    expect(
      engine.drainEvents().filter((event) => event.type === 'battle-won'),
    ).toHaveLength(0);
  });

  it('fails an elite after its timeout', () => {
    const eliteFailure = new BattleEngine({
      ...createEngine().inputForTest(),
      battleId: 'elite-timeout',
      mainCannonDamage: 0,
      enemyDamageMultiplier: 0,
    });
    runFor(eliteFailure, 210_000);

    expect(eliteFailure.outcome?.victory).toBe(false);
  });
});
