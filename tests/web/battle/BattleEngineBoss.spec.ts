import { describe, expect, it } from 'vitest';
import {
  ENEMY_CONFIG,
  FIXED_STEP_MS,
  MAIN_PROJECTILE_SPEED,
} from '../../../web/battle/BattleConfig';
import {
  ENEMY_GEOMETRY,
  enemySpawnY,
} from '../../../web/battle/EnemyGeometry';
import type { EnemyKind } from '../../../web/battle/BattleTypes';
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
    skillMasteryPower: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 1 },
    unlockedSkillVariants: [],
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
  it('uses the approved balance and starts every enemy below the HUD', () => {
    expect(ENEMY_CONFIG['bubble-fin'].hp).toBe(100);
    expect(ENEMY_CONFIG['needle-jelly'].hp).toBe(56);
    expect(ENEMY_CONFIG['reef-crab'].hp).toBe(225);
    expect(ENEMY_CONFIG['storm-ray-elite'].hp).toBe(1200);
    expect(ENEMY_CONFIG['deep-echo-boss'].hp).toBe(4200);
    expect(MAIN_PROJECTILE_SPEED).toBe(480);

    for (const kind of Object.keys(ENEMY_GEOMETRY) as EnemyKind[]) {
      const y = enemySpawnY(kind, 108);
      const top = y - ENEMY_GEOMETRY[kind].height * 0.52;
      expect(top).toBeGreaterThanOrEqual(120);
    }
  });

  it('enters elite, pauses for boss intro and settles victory once', () => {
    const engine = createEngine();
    runFor(engine, 390_000);
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

  it('does not start the boss sequence before the six-minute milestone', () => {
    const engine = createEngine();
    runFor(engine, 359_000);
    expect(engine.drainEvents().some((event) => event.type === 'boss-intro-started')).toBe(false);

    runFor(engine, 8_000);
    const events = engine.drainEvents();
    expect(events.filter((event) => event.type === 'boss-intro-started')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'boss-intro-ended')).toHaveLength(1);
  });

  it('ends an unresolved encounter at the eight-minute hard cap', () => {
    const eliteFailure = new BattleEngine({
      ...createEngine().inputForTest(),
      battleId: 'elite-timeout',
      mainCannonDamage: 0,
      enemyDamageMultiplier: 0,
    });
    runFor(eliteFailure, 480_100);

    expect(eliteFailure.outcome?.victory).toBe(false);
  });
});
