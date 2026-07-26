import { describe, expect, it } from 'vitest';
import {
  EXPERIENCE_THRESHOLDS,
  FIXED_STEP_MS,
} from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';
import {
  applyBattleUpgrade,
  createEmptyBattleBuild,
} from '../../../web/battle/UpgradeSystem';

const EXPECTED_EXPERIENCE_THRESHOLDS = [
  50, 110, 180, 260, 350, 450, 565, 695, 840, 1000,
  1175, 1365, 1570, 1790, 2025, 2275, 2540, 2820, 3120,
] as const;

function reachFirstUpgrade(mode: 'normal' | 'daily-trial'): BattleEngine {
  const engine = new BattleEngine({
    battleId: `upgrade-${mode}`,
    seed: 17,
    mode,
    mapId: 'drift-suburb',
    maxTrainHp: 10_000,
    mainCannonDamage: 500,
    initialEnergy: 0,
    repairBonus: 0,
    enemyHpFlatBonus: 0,
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    skillMasteryPower: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 1 },
    unlockedSkillVariants: [],
  });
  for (let step = 0; step < 20_000; step += 1) {
    if (engine.frame.status === 'upgrade') return engine;
    engine.update(FIXED_STEP_MS);
  }
  throw new Error('First upgrade checkpoint was not reached');
}

describe('BattleEngine upgrade reroll', () => {
  it('starts at level one and exposes nineteen strictly increasing thresholds', () => {
    expect(EXPERIENCE_THRESHOLDS).toEqual(EXPECTED_EXPERIENCE_THRESHOLDS);
    expect(new BattleEngine({
      battleId: 'level-one',
      seed: 1,
      mode: 'normal',
      mapId: 'drift-suburb',
      maxTrainHp: 100,
      mainCannonDamage: 10,
      initialEnergy: 0,
      repairBonus: 0,
      enemyHpFlatBonus: 0,
      enemyHpMultiplier: 1,
      enemyDamageMultiplier: 1,
      skillMasteryPower: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 1 },
      unlockedSkillVariants: [],
    }).frame.runLevel).toBe(1);
    expect(EXPERIENCE_THRESHOLDS.every((threshold, index) => (
      index === 0 || threshold > EXPERIENCE_THRESHOLDS[index - 1]!
    ))).toBe(true);
  });

  it('raises a skill to rank five and rejects a sixth rank', () => {
    let build = createEmptyBattleBuild();
    for (let rank = 2; rank <= 5; rank += 1) {
      build = applyBattleUpgrade(build, 'rank-tidal-volley');
      expect(build.skillRanks['tidal-volley']).toBe(rank);
    }
    expect(applyBattleUpgrade(build, 'rank-tidal-volley')).toEqual(build);
  });

  it('advances exactly one run level and emits complete deterministic state', () => {
    const engine = reachFirstUpgrade('normal');
    const upgradeId = engine.frame.offeredUpgradeIds[0]!;

    expect(engine.chooseUpgrade(upgradeId, 'manual')).toBe(true);
    expect(engine.frame.runLevel).toBe(2);
    expect(engine.frame.nextExperienceThreshold).toBe(EXPECTED_EXPERIENCE_THRESHOLDS[1]);
    const events = engine.drainEvents();
    expect(events).toContainEqual(expect.objectContaining({
      type: 'upgrade-selected',
      upgradeId,
      source: 'manual',
      runLevel: 2,
      nextExperienceThreshold: EXPECTED_EXPERIENCE_THRESHOLDS[1],
      skillRanks: engine.frame.skillRanks,
      skillVariants: engine.frame.skillVariants,
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'run-level-reached',
      runLevel: 2,
      nextExperienceThreshold: EXPECTED_EXPERIENCE_THRESHOLDS[1],
      skillRanks: engine.frame.skillRanks,
      skillVariants: engine.frame.skillVariants,
    }));
  });

  it('allows one changed offer in normal mode and none in daily trial', () => {
    const normal = reachFirstUpgrade('normal');
    const first = [...normal.frame.offeredUpgradeIds];
    expect(normal.rerollUpgradeOffer()).toBe(true);
    expect(normal.frame.offeredUpgradeIds).not.toEqual(first);
    expect(normal.frame.upgradeRerollUsed).toBe(true);
    expect(normal.rerollUpgradeOffer()).toBe(false);

    const daily = reachFirstUpgrade('daily-trial');
    expect(daily.rerollUpgradeOffer()).toBe(false);
  });
});
