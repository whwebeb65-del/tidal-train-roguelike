import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';
import { EffectSystem } from '../../../web/battle/EffectSystem';
import {
  getRenderBudget,
  type QualityLevel,
} from '../../../web/battle/QualityMonitor';
import {
  SKILL_VARIANT_IDS,
} from '../../../src/domain/skill/SkillProgressionTypes';
import type { BattleEvent } from '../../../web/battle/BattleTypes';
import { createFrameFixture } from './helpers/BattleFixtures';

function runAtQuality(level: QualityLevel) {
  const engine = new BattleEngine({
    battleId: `quality-${level}`,
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
  const effects = new EffectSystem({
    particleLimit: 200,
    damageNumberLimit: 18,
    impactLimit: 24,
    reducedMotion: false,
  });
  effects.setRenderBudget(getRenderBudget(level));

  for (let elapsed = 0; elapsed < 230_000; elapsed += FIXED_STEP_MS) {
    engine.update(FIXED_STEP_MS);
    effects.consume(engine.drainEvents(), engine.frame);
    effects.update(FIXED_STEP_MS);
    if (engine.frame.status === 'upgrade') {
      const choice = engine.frame.offeredUpgradeIds[0];
      if (choice) engine.chooseUpgrade(choice, 'manual');
    }
  }

  return {
    outcome: engine.outcome && {
      ...engine.outcome,
      battleId: 'quality-stable',
    },
    kills: engine.frame.kills,
    remainingHp: engine.frame.trainHp,
    upgradeLevels: engine.frame.upgradeLevels,
  };
}

function evolutionViewAtQuality(level: QualityLevel) {
  const effects = new EffectSystem({
    particleLimit: 200,
    damageNumberLimit: 18,
    impactLimit: 24,
    reducedMotion: false,
  });
  effects.setRenderBudget(getRenderBudget(level));
  const frame = createFrameFixture({
    skillRanks: { 'tidal-volley': 5, 'bubble-barrier': 5, 'extreme-tide': 5 },
    skillVariants: {
      'tidal-volley': ['split-tide-arrow', 'reef-piercer', 'returning-volley', 'rainstorm-school'],
      'bubble-barrier': ['bursting-bubble', 'reflective-spines', 'overflow-membrane', 'emergency-trigger'],
      'extreme-tide': ['undertow-eye', 'lingering-vortex', 'energy-return', 'double-crest'],
    },
  });
  const events: readonly BattleEvent[] = [
    { type: 'skill-used', skillId: 'tidal-volley' },
    { type: 'skill-used', skillId: 'bubble-barrier' },
    { type: 'skill-used', skillId: 'extreme-tide' },
    { type: 'barrier-burst' },
    { type: 'barrier-emergency-triggered', effectRatio: 0.6 },
    { type: 'extreme-pull-started', durationMs: 2000 },
    { type: 'extreme-vortex-started', durationMs: 4000 },
    { type: 'extreme-energy-refunded', amount: 2 },
    { type: 'extreme-second-crest', durationMs: 1200, amount: 45 },
  ];
  effects.consume(events, frame);
  expect(frame.skillVariants['tidal-volley'].length
    + frame.skillVariants['bubble-barrier'].length
    + frame.skillVariants['extreme-tide'].length).toBe(SKILL_VARIANT_IDS.length);
  return effects.view;
}

describe('battle visual quality determinism', () => {
  it('produces the same result at high, medium and low quality', () => {
    const high = runAtQuality('high');

    expect(runAtQuality('medium')).toEqual(high);
    expect(runAtQuality('low')).toEqual(high);
  });

  it.each(['high', 'medium', 'low'] as const)(
    'produces deep-equal evolution effect views for identical %s-quality input',
    (quality) => {
      expect(evolutionViewAtQuality(quality)).toEqual(evolutionViewAtQuality(quality));
    },
  );
});
