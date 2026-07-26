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
