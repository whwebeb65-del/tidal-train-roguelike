import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';

function runFor(engine: BattleEngine, durationMs: number): void {
  const steps = Math.ceil(durationMs / FIXED_STEP_MS);
  for (let index = 0; index < steps; index += 1) {
    engine.update(FIXED_STEP_MS);
  }
}

describe('BattleEngine auto fire', () => {
  it('spawns enemies and fires automatically without an attack command', () => {
    const engine = new BattleEngine({
      battleId: 'auto-1',
      seed: 7,
      mode: 'normal',
      mapId: 'drift-suburb',
      maxTrainHp: 100,
      mainCannonDamage: 25,
      initialEnergy: 0,
      repairBonus: 0,
      enemyHpFlatBonus: 0,
      enemyHpMultiplier: 1,
      enemyDamageMultiplier: 1,
    });

    runFor(engine, 2400);
    const events = engine.drainEvents();
    expect(events.some((event) => event.type === 'enemy-spawned')).toBe(true);
    expect(events.some((event) => event.type === 'weapon-fired')).toBe(true);
    expect(events.some((event) => event.type === 'projectile-hit')).toBe(true);
    expect(engine.frame.energy).toBeGreaterThan(0);
  });

  it('freezes all simulation values while paused', () => {
    const engine = new BattleEngine({
      battleId: 'pause-1',
      seed: 7,
      mode: 'normal',
      mapId: 'drift-suburb',
      maxTrainHp: 100,
      mainCannonDamage: 25,
      initialEnergy: 0,
      repairBonus: 0,
      enemyHpFlatBonus: 0,
      enemyHpMultiplier: 1,
      enemyDamageMultiplier: 1,
    });
    runFor(engine, 1000);
    engine.pause('manual');
    const before = JSON.stringify({
      elapsedMs: engine.frame.elapsedMs,
      enemies: engine.frame.enemies.map((enemy) => [
        enemy.id,
        enemy.x,
        enemy.y,
        enemy.hp,
      ]),
    });

    runFor(engine, 5000);

    expect(JSON.stringify({
      elapsedMs: engine.frame.elapsedMs,
      enemies: engine.frame.enemies.map((enemy) => [
        enemy.id,
        enemy.x,
        enemy.y,
        enemy.hp,
      ]),
    })).toBe(before);
  });
});
