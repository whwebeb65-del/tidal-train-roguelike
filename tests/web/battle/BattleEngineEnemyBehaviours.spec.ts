import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';

function createBehaviourEngine(mainCannonDamage = 0): BattleEngine {
  return new BattleEngine({
    battleId: 'behaviour-integration',
    seed: 22,
    mode: 'normal',
    mapId: 'drift-suburb',
    maxTrainHp: 1_000_000,
    mainCannonDamage,
    initialEnergy: 0,
    repairBonus: 0,
    enemyHpFlatBonus: 0,
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    skillMasteryPower: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 1 },
    unlockedSkillVariants: [],
  });
}

function createRouteBehaviourEngine(mapId: 'old-port' | 'deep-tunnel'): BattleEngine {
  return new BattleEngine({
    battleId: `behaviour-${mapId}`,
    seed: 22,
    mode: 'normal',
    mapId,
    maxTrainHp: 1_000_000,
    mainCannonDamage: 0,
    initialEnergy: 0,
    repairBonus: 0,
    enemyHpFlatBonus: 0,
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    skillMasteryPower: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 1 },
    unlockedSkillVariants: [],
  });
}

describe('BattleEngine enemy behaviours', () => {
  it('applies lane shifts, cancellable ranged fire and support shields in simulation time', () => {
    const engine = createBehaviourEngine();
    const events: ReturnType<BattleEngine['drainEvents']>[number][] = [];

    for (let elapsed = 0; elapsed < 250_000; elapsed += FIXED_STEP_MS) {
      engine.update(FIXED_STEP_MS);
      if (engine.frame.status === 'upgrade') {
        const choice = engine.frame.offeredUpgradeIds[0];
        if (choice) engine.chooseUpgrade(choice, 'manual');
      }
      events.push(...engine.drainEvents());
    }

    expect(events.some((event) => event.type === 'enemy-lane-shifted')).toBe(true);
    expect(events.some((event) => event.type === 'enemy-ranged-warning')).toBe(true);
    expect(events.some((event) => event.type === 'enemy-ranged-fired')).toBe(true);
    expect(events.some((event) => event.type === 'enemy-support-pulse')).toBe(true);
    expect(engine.frame.enemies.some((enemy) => enemy.shield > 0)).toBe(true);
  });

  it('freezes behaviour timers while an upgrade choice pauses simulation', () => {
    const engine = createBehaviourEngine(500);
    while (engine.frame.status !== 'upgrade') engine.update(FIXED_STEP_MS);
    const before = engine.frame.enemies.map((enemy) => enemy.behaviour?.phaseRemainingMs);

    for (let index = 0; index < 120; index += 1) engine.update(FIXED_STEP_MS);

    expect(engine.frame.enemies.map((enemy) => enemy.behaviour?.phaseRemainingMs)).toEqual(before);
  });

  it.each([
    ['old-port', 1440],
    ['deep-tunnel', 1080],
  ] as const)('keeps scaled %s elite exposure duration authoritative', (mapId, expected) => {
    const engine = createRouteBehaviourEngine(mapId);
    const elite = (engine as unknown as {
      spawnEnemy: (kind: 'storm-ray-elite', lane: 1) => {
        behaviour?: { phase: string; phaseRemainingMs: number; phaseDurationMs: number };
      };
    }).spawnEnemy('storm-ray-elite', 1);

    engine.update(4_000);
    engine.update(800);
    engine.update(450);

    expect(elite.behaviour).toMatchObject({
      phase: 'elite-exposed',
      phaseRemainingMs: expected,
      phaseDurationMs: expected,
    });
  });
});
