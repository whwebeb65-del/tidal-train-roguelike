import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';

describe('twenty-level normal run release gate', () => {
  it('selects 19 upgrades, reaches Lv.20 around the boss, and ends under the timing caps', () => {
    const engine = new BattleEngine({
      battleId: 'twenty-level-release', seed: 17, mode: 'normal', mapId: 'drift-suburb',
      maxTrainHp: 10_000, mainCannonDamage: 500, initialEnergy: 100,
      repairBonus: 0, enemyHpFlatBonus: 0, enemyHpMultiplier: 1, enemyDamageMultiplier: 1,
      skillMasteryPower: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 1 },
      unlockedSkillVariants: [],
    });
    let selections = 0;
    let levelAtBoss: number | null = null;
    for (let elapsed = 0; elapsed < 480_000 && !engine.outcome; elapsed += FIXED_STEP_MS) {
      engine.update(FIXED_STEP_MS);
      for (const event of engine.drainEvents()) {
        if (event.type === 'boss-intro-started') levelAtBoss = engine.frame.runLevel;
      }
      if (engine.frame.status === 'upgrade') {
        const choice = engine.frame.offeredUpgradeIds[0];
        if (choice && engine.chooseUpgrade(choice, 'manual')) selections += 1;
      }
    }
    expect(selections).toBe(19);
    expect(levelAtBoss).toBeGreaterThanOrEqual(19);
    expect(engine.frame.runLevel).toBe(20);
    expect(engine.outcome?.elapsedMs).toBeLessThanOrEqual(480_000);
    expect((engine.outcome?.elapsedMs ?? Infinity) + selections * 6_000).toBeLessThanOrEqual(594_000);
  });
});
