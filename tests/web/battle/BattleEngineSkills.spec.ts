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
};

function runFor(engine: BattleEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed < durationMs; elapsed += FIXED_STEP_MS) {
    engine.update(FIXED_STEP_MS);
  }
}

describe('BattleEngine skills', () => {
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
