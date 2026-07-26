import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';

const input = {
  battleId: 'skills',
  seed: 11,
  mode: 'normal' as const,
  mapId: 'drift-suburb' as const,
  maxTrainHp: 100,
  mainCannonDamage: 25,
  initialEnergy: 100,
  repairBonus: 6,
  enemyHpFlatBonus: 0,
  enemyHpMultiplier: 1,
  enemyDamageMultiplier: 1,
  skillMasteryPower: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 1 },
  unlockedSkillVariants: [],
};

function runFor(engine: BattleEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed < durationMs; elapsed += FIXED_STEP_MS) {
    engine.update(FIXED_STEP_MS);
  }
}

describe('BattleEngine skills', () => {
  it('simulates extreme tide variants at exact deterministic timings', () => {
    const engine = new BattleEngine(input);
    runFor(engine, 500);
    const internals = engine as unknown as {
      battleBuild: unknown;
      nextSpawnIndex: number;
      spawnEnemy: (kind: 'bubble-fin', lane: 0 | 1 | 2) => { hp: number; maxHp: number; y: number };
    };
    internals.nextSpawnIndex = Number.MAX_SAFE_INTEGER;
    internals.battleBuild = {
      generalLevels: {},
      skillRanks: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 2 },
      skillVariants: {
        'tidal-volley': [],
        'bubble-barrier': [],
        'extreme-tide': ['undertow-eye', 'lingering-vortex', 'energy-return', 'double-crest'],
      },
    };
    for (const enemy of engine.frame.enemies) {
      enemy.alive = false;
    }
    const target = internals.spawnEnemy('bubble-fin', 0);
    target.hp = target.maxHp = 10_000;
    target.y = 300;
    engine.drainEvents();

    expect(engine.useSkill('extreme-tide')).toBe(true);
    expect(engine.drainEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'extreme-pull-started', durationMs: 2000 }),
      expect.objectContaining({ type: 'extreme-vortex-started', durationMs: 4000 }),
    ]));
    runFor(engine, 1200);
    const earlyEvents = engine.drainEvents();
    const crestEvents = earlyEvents.filter((event) => (
      event.type === 'extreme-second-crest'
    ));
    expect(crestEvents).toHaveLength(1);
    expect(crestEvents[0]).toMatchObject({ durationMs: 1200 });

    const earlyVortexHits = earlyEvents.filter((event) => (
      event.type === 'projectile-hit' && event.source === 'extreme-tide'
    ));
    runFor(engine, 4000);
    const laterVortexHits = engine.drainEvents().filter((event) => (
      event.type === 'projectile-hit' && event.source === 'extreme-tide'
    ));
    expect([...earlyVortexHits, ...laterVortexHits]).toHaveLength(9);

    const refundEngine = new BattleEngine(input);
    const refundInternals = refundEngine as unknown as typeof internals;
    refundInternals.battleBuild = internals.battleBuild;
    for (let index = 0; index < 10; index += 1) refundInternals.spawnEnemy('bubble-fin', 1);
    expect(refundEngine.useSkill('extreme-tide')).toBe(true);
    expect(refundEngine.frame.energy).toBe(20);
    expect(refundEngine.drainEvents().filter((event) => event.type === 'extreme-energy-refunded'))
      .toHaveLength(10);
  });

  it('applies volley variants alongside the rank multiplier', () => {
    const engine = new BattleEngine(input);
    runFor(engine, 500);
    engine.drainEvents();
    (engine as unknown as { battleBuild: unknown }).battleBuild = {
      generalLevels: {},
      skillRanks: { 'tidal-volley': 2, 'bubble-barrier': 1, 'extreme-tide': 1 },
      skillVariants: {
        'tidal-volley': ['split-tide-arrow', 'reef-piercer', 'returning-volley', 'rainstorm-school'],
        'bubble-barrier': [],
        'extreme-tide': [],
      },
    };

    expect(engine.useSkill('tidal-volley')).toBe(true);
    expect(engine.frame.cooldowns['tidal-volley']).toBe(13_824);
    const volleyProjectiles = engine.frame.projectiles.filter((projectile) => projectile.source === 'volley');
    expect(volleyProjectiles).toHaveLength(16);
    expect(volleyProjectiles.every((projectile) => (
      projectile.damage === 15
      && projectile.pierceRemaining === 1
      && projectile.splitMultiplier === 0.35
    ))).toBe(true);
  });

  it('preserves split and pierce properties on returning volley projectiles', () => {
    const engine = new BattleEngine(input);
    runFor(engine, 500);
    (engine as unknown as { battleBuild: unknown }).battleBuild = {
      generalLevels: {},
      skillRanks: { 'tidal-volley': 2, 'bubble-barrier': 1, 'extreme-tide': 1 },
      skillVariants: {
        'tidal-volley': ['split-tide-arrow', 'reef-piercer', 'returning-volley'],
        'bubble-barrier': [],
        'extreme-tide': [],
      },
    };

    engine.useSkill('tidal-volley');
    const originalProjectileId = Math.max(...engine.frame.projectiles.map((projectile) => projectile.id));
    runFor(engine, 510);
    const returningProjectiles = engine.frame.projectiles.filter((projectile) => (
      projectile.id > originalProjectileId && projectile.source === 'volley'
    ));

    expect(returningProjectiles).toHaveLength(4);
    expect(returningProjectiles.every((projectile) => (
      projectile.pierceRemaining === 1 && projectile.splitMultiplier === 0.35
    ))).toBe(true);
  });

  it('scales the complete emergency barrier heal and retains non-variant shield precision', () => {
    const emergencyEngine = new BattleEngine(input);
    (emergencyEngine as unknown as { battleBuild: unknown }).battleBuild = {
      generalLevels: {},
      skillRanks: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 1 },
      skillVariants: {
        'tidal-volley': [],
        'bubble-barrier': ['emergency-trigger'],
        'extreme-tide': [],
      },
    };
    emergencyEngine.debugDamageTrain(76);
    expect(emergencyEngine.frame.trainHp).toBe(32);
    expect(emergencyEngine.frame.shield).toBe(15);

    const baselineEngine = new BattleEngine({ ...input, maxTrainHp: 101 });
    expect(baselineEngine.useSkill('bubble-barrier')).toBe(true);
    expect(baselineEngine.frame.shield).toBe(25.25);
  });

  it('fires volley, applies barrier and spends full extreme energy', () => {
    const engine = new BattleEngine(input);
    runFor(engine, 500);

    expect(engine.useSkill('tidal-volley')).toBe(true);
    expect(engine.frame.cooldowns['tidal-volley']).toBe(12_000);

    expect(engine.useSkill('bubble-barrier')).toBe(true);
    expect(engine.frame.shield).toBe(25);
    expect(engine.frame.shieldRemainingMs).toBe(4000);

    expect(engine.refreshActiveSkillCooldowns()).toBe(true);
    expect(engine.frame.cooldowns['tidal-volley']).toBe(0);
    expect(engine.frame.cooldowns['bubble-barrier']).toBe(0);
    expect(engine.frame.skillRefreshUsed).toBe(true);
    expect(engine.refreshActiveSkillCooldowns()).toBe(false);

    expect(engine.useSkill('extreme-tide')).toBe(true);
    expect(engine.frame.energy).toBe(0);
    expect(engine.useSkill('extreme-tide')).toBe(false);
  });

  it('revives only from defeat and grants temporary protection', () => {
    const engine = new BattleEngine({
      ...input,
      maxTrainHp: 1,
      initialEnergy: 0,
    });
    engine.debugDamageTrain(999);
    expect(engine.frame.status).toBe('defeat');
    expect(engine.revive(60, 3000)).toBe(true);
    expect(engine.frame.trainHp).toBe(1);
    expect(engine.frame.adReviveUsed).toBe(true);
    expect(engine.frame.status).toBe('running');

    engine.debugDamageTrain(999);
    expect(engine.frame.trainHp).toBe(1);
    runFor(engine, 3100);
    engine.debugDamageTrain(999);
    expect(engine.frame.status).toBe('defeat');
    expect(engine.revive(60, 3000)).toBe(false);
  });

  it('emits visual impact direction without changing damage', () => {
    const engine = new BattleEngine(input);
    const hpBefore = engine.frame.trainHp;
    engine.debugDamageTrain(7);
    expect(engine.frame.trainHp).toBe(hpBefore - 7);
    expect(engine.drainEvents()).toContainEqual(expect.objectContaining({
      type: 'train-damaged', amount: 7, impactDirectionX: 0,
    }));
  });
});
