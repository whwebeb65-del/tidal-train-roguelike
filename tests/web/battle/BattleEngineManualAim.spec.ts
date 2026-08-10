import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS, MAIN_CANNON_INTERVAL_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';
import { SimulationRateController } from '../../../web/battle/SimulationRateController';
import type { BattleSpeed } from '../../../src/domain/progression/AccountProgressionSystem';
import { getBossWeakPoint } from '../../../web/battle/BossWeakPointSystem';
import type { EnemyState } from '../../../web/battle/BattleTypes';

const input = {
  battleId: 'manual-aim',
  seed: 19,
  mode: 'normal' as const,
  mapId: 'drift-suburb' as const,
  maxTrainHp: 100,
  mainCannonDamage: 25,
  initialEnergy: 100,
  repairBonus: 0,
  enemyHpFlatBonus: 0,
  enemyHpMultiplier: 1,
  enemyDamageMultiplier: 1,
  skillMasteryPower: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 1 },
  unlockedSkillVariants: [],
};

type EngineInternals = {
  status: 'running' | 'boss-intro' | 'upgrade' | 'paused' | 'victory' | 'defeat';
  nextSpawnIndex: number;
  fireCooldownMs: number;
  modifiers: { mainProjectileCount: number };
  spawnEnemy: (
    kind: 'bubble-fin' | 'deep-echo-boss',
    lane: 0 | 1 | 2,
  ) => EnemyState;
};

function internals(engine: BattleEngine): EngineInternals {
  return engine as unknown as EngineInternals;
}

function runFor(engine: BattleEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed < durationMs; elapsed += FIXED_STEP_MS) {
    engine.update(FIXED_STEP_MS);
  }
}

function addStationaryEnemy(
  engine: BattleEngine,
  lane: 0 | 1 | 2,
  x: number,
  y: number,
  hp = 10_000,
) {
  const enemy = internals(engine).spawnEnemy('bubble-fin', lane);
  enemy.x = x;
  enemy.y = y;
  enemy.hp = hp;
  enemy.maxHp = hp;
  enemy.speedPerSecond = 0;
  return enemy;
}

describe('BattleEngine manual main-cannon aim', () => {
  it('rejects aiming changes outside an actively running battle', () => {
    const engine = new BattleEngine(input);
    const state = internals(engine);
    expect(engine.setMainCannonAim({ x: 195, y: 180 })).toBe(true);

    for (const status of ['boss-intro', 'upgrade', 'paused', 'victory', 'defeat'] as const) {
      state.status = status;
      expect(engine.setMainCannonAim({ x: 300, y: 180 })).toBe(false);
      expect(engine.setMainCannonAim(null)).toBe(false);
      expect(engine.frame.mainCannonAim).toEqual({ x: 195, y: 180 });
    }
  });

  it('clamps and safely exposes the saved aim point', () => {
    const engine = new BattleEngine(input);

    expect(engine.setMainCannonAim({ x: -50, y: 900 })).toBe(true);
    expect(engine.frame.mainCannonAim).toEqual({ x: 0, y: 716 });
    expect(Object.isFrozen(engine.frame.mainCannonAim)).toBe(true);
    expect(engine.setMainCannonAim(null)).toBe(true);
    expect(engine.frame.mainCannonAim).toBeNull();
  });

  it('fires manual main-cannon shots in a fixed aimed direction', () => {
    const engine = new BattleEngine(input);
    const state = internals(engine);
    state.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
    state.fireCooldownMs = 0;
    engine.setMainCannonAim({ x: 380, y: 108 });

    engine.update(FIXED_STEP_MS);
    const first = engine.frame.projectiles[0]!;
    expect(first.trajectory).toBe('manual');
    expect(first.velocityX).toBeGreaterThan(0);
    expect(first.velocityY).toBeLessThan(0);
    const heading = first.velocityY / first.velocityX;

    engine.update(FIXED_STEP_MS);
    const second = engine.frame.projectiles.find((projectile) => projectile.id === first.id)!;
    expect(second.velocityY / second.velocityX).toBeCloseTo(heading, 10);
  });

  it('fans multi-barrel manual shots around the same aim direction', () => {
    const engine = new BattleEngine(input);
    const state = internals(engine);
    state.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
    state.fireCooldownMs = 0;
    state.modifiers.mainProjectileCount = 3;
    engine.setMainCannonAim({ x: 195, y: 108 });

    engine.update(FIXED_STEP_MS);
    const headings = engine.frame.projectiles.map((projectile) => Math.atan2(
      projectile.velocityY,
      projectile.velocityX,
    ));

    expect(headings).toHaveLength(3);
    expect(headings[0]).toBeLessThan(headings[1]!);
    expect(headings[1]).toBeLessThan(headings[2]!);
  });

  it('hits the first living enemy intersected by a manual shot segment', () => {
    const engine = new BattleEngine(input);
    const state = internals(engine);
    state.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
    state.fireCooldownMs = 0;
    const nearer = addStationaryEnemy(engine, 1, 195, 530, 1);
    const farther = addStationaryEnemy(engine, 1, 195, 390, 1);
    engine.setMainCannonAim({ x: 195, y: 108 });

    runFor(engine, 500);

    expect(nearer.alive).toBe(false);
    expect(farther.alive).toBe(true);
  });

  it('chooses the earliest intersection when one long step crosses two enemies', () => {
    const engine = new BattleEngine(input);
    const state = internals(engine);
    state.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
    state.fireCooldownMs = 0;
    const nearer = addStationaryEnemy(engine, 1, 195, 620, 1);
    const farther = addStationaryEnemy(engine, 1, 195, 560, 1);
    engine.setMainCannonAim({ x: 195, y: 108 });

    engine.update(FIXED_STEP_MS);
    state.fireCooldownMs = 100_000;
    engine.update(400);

    expect(nearer.alive).toBe(false);
    expect(farther.alive).toBe(true);
  });

  it('recycles a manual shot that leaves the logical battle area without a hit', () => {
    const engine = new BattleEngine(input);
    const state = internals(engine);
    state.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
    state.fireCooldownMs = 0;
    engine.setMainCannonAim({ x: 195, y: 108 });

    engine.update(FIXED_STEP_MS);
    state.fireCooldownMs = 100_000;
    runFor(engine, 2000);

    expect(engine.frame.projectiles).toHaveLength(0);
  });

  it('recycles a manual shot in the same step that crosses a logical boundary', () => {
    const engine = new BattleEngine(input);
    const state = internals(engine);
    state.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
    state.fireCooldownMs = 0;
    engine.setMainCannonAim({ x: 195, y: 108 });

    engine.update(FIXED_STEP_MS);
    state.fireCooldownMs = 100_000;
    engine.update(1500);

    expect(engine.frame.projectiles).toHaveLength(0);
  });

  it('resets pooled manual projectile trajectory state before reusing it for homing', () => {
    const engine = new BattleEngine(input);
    const state = internals(engine);
    state.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
    state.fireCooldownMs = 0;
    engine.setMainCannonAim({ x: 195, y: 108 });
    engine.update(FIXED_STEP_MS);
    state.fireCooldownMs = 100_000;
    engine.update(1500);
    expect(engine.frame.projectiles).toHaveLength(0);

    engine.setMainCannonAim(null);
    addStationaryEnemy(engine, 1, 195, 500);
    state.fireCooldownMs = 0;
    engine.update(FIXED_STEP_MS);

    const homing = engine.frame.projectiles[0]!;
    expect(homing.trajectory).toBe('homing');
    expect(homing.velocityX).toBe(0);
    expect(homing.velocityY).toBe(0);
  });

  it('keeps automatic target tracking when no manual aim has been set', () => {
    const engine = new BattleEngine(input);
    const state = internals(engine);
    state.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
    state.fireCooldownMs = 0;
    const target = addStationaryEnemy(engine, 0, 92, 500, 10_000);

    engine.update(FIXED_STEP_MS);
    const projectile = engine.frame.projectiles[0]!;
    expect(projectile.trajectory).toBe('homing');
    expect(projectile.targetId).toBeGreaterThan(0);
    runFor(engine, 1000);
    expect(target.hp).toBeLessThan(target.maxHp);
  });

  it('rewards only a manual trajectory that crosses the open boss weak point', () => {
    const prepareBoss = (battleId: string) => {
      const engine = new BattleEngine({ ...input, battleId, initialEnergy: 0 });
      const state = internals(engine);
      state.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
      state.fireCooldownMs = 0;
      const target = state.spawnEnemy('deep-echo-boss', 1);
      target.x = 195;
      target.y = 400;
      target.hp = 10_000;
      target.maxHp = 10_000;
      target.speedPerSecond = 0;
      target.behaviour = {
        phase: 'boss-enraged', phaseRemainingMs: 5000, cycle: 1,
        targetLane: 1, safeLane: 0, invulnerable: false,
        damageTakenMultiplier: 1, weakPointOpen: true,
      };
      return { engine, target };
    };

    const manual = prepareBoss('manual-precision');
    manual.engine.setMainCannonAim(getBossWeakPoint(manual.target)!);
    runFor(manual.engine, 540);
    const manualEvents = manual.engine.drainEvents();
    expect(manualEvents).toContainEqual({
      type: 'boss-weakpoint-hit',
      enemyId: expect.any(Number),
      bonusDamage: 18,
    });
    expect(manual.target.hp).toBe(9957);
    expect(manual.engine.frame.energy).toBe(4);

    const automatic = prepareBoss('automatic-no-precision');
    runFor(automatic.engine, 700);
    expect(automatic.engine.drainEvents().some(
      (event) => event.type === 'boss-weakpoint-hit',
    )).toBe(false);
    expect(automatic.target.hp).toBe(9975);
    expect(automatic.engine.frame.energy).toBe(2);
  });

  it('does not change the main cannon firing interval and leaves volley homing', () => {
    const autoEngine = new BattleEngine(input);
    const autoState = internals(autoEngine);
    autoState.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
    autoState.fireCooldownMs = 0;
    addStationaryEnemy(autoEngine, 1, 195, 400);
    runFor(autoEngine, MAIN_CANNON_INTERVAL_MS * 3 + FIXED_STEP_MS);
    const automaticShots = autoEngine.drainEvents().filter((event) => (
      event.type === 'weapon-fired' && event.source === 'main'
    ));

    const manualEngine = new BattleEngine(input);
    const manualState = internals(manualEngine);
    manualState.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
    manualState.fireCooldownMs = 0;
    manualEngine.setMainCannonAim({ x: 300, y: 180 });
    runFor(manualEngine, MAIN_CANNON_INTERVAL_MS * 3 + FIXED_STEP_MS);
    const manualShots = manualEngine.drainEvents().filter((event) => (
      event.type === 'weapon-fired' && event.source === 'main'
    ));

    expect(manualShots).toHaveLength(automaticShots.length);

    addStationaryEnemy(manualEngine, 2, 298, 420);
    expect(manualEngine.useSkill('tidal-volley')).toBe(true);
    expect(manualEngine.frame.projectiles.some((projectile) => (
      projectile.source === 'volley' && projectile.trajectory === 'homing'
    ))).toBe(true);
  });

  it('keeps explicit manual-aim trajectories equivalent across all simulation rates', () => {
    const simulate = (speed: BattleSpeed) => {
      const engine = new BattleEngine({ ...input, battleId: `manual-rate-${speed}` });
      const state = internals(engine);
      state.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
      state.fireCooldownMs = 0;
      addStationaryEnemy(engine, 1, 195, 530, 10_000);
      addStationaryEnemy(engine, 2, 292, 430, 10_000);
      addStationaryEnemy(engine, 0, 98, 350, 10_000);
      const rate = new SimulationRateController(FIXED_STEP_MS, speed);
      const hits: unknown[] = [];

      const realSteps = Math.round(3000 / speed / FIXED_STEP_MS);
      for (let stepIndex = 0; stepIndex < realSteps; stepIndex += 1) {
        rate.consume(FIXED_STEP_MS, (stepMs) => {
          const elapsed = engine.frame.elapsedMs;
          if (elapsed < 600) engine.setMainCannonAim({ x: 195, y: 108 });
          else if (elapsed < 1300) engine.setMainCannonAim({ x: 292, y: 160 });
          else engine.setMainCannonAim({ x: 98, y: 170 });
          engine.update(stepMs);
          hits.push(...engine.drainEvents().filter((event) => event.type === 'projectile-hit'));
        });
      }

      return {
        elapsedMs: engine.frame.elapsedMs,
        enemies: engine.frame.enemies.map((enemy) => ({
          id: enemy.id, hp: enemy.hp, alive: enemy.alive, x: enemy.x, y: enemy.y,
        })),
        projectiles: engine.frame.projectiles.map((projectile) => ({
          trajectory: projectile.trajectory,
          x: projectile.x,
          y: projectile.y,
          velocityX: projectile.velocityX,
          velocityY: projectile.velocityY,
        })),
        hits,
      };
    };

    const baseline = simulate(1);
    for (const speed of [1.5, 2, 3] as const) {
      expect(simulate(speed)).toEqual(baseline);
    }
  });
});
