import { describe, expect, it } from 'vitest';
import { EffectSystem } from '../../../web/battle/EffectSystem';
import { createFrameFixture } from './helpers/BattleFixtures';

describe('EffectSystem', () => {
  it('creates bounded hit, kill, loot and camera feedback', () => {
    const effects = new EffectSystem({
      particleLimit: 200,
      damageNumberLimit: 18,
      reducedMotion: false,
    });

    effects.consume([
      {
        type: 'projectile-hit',
        enemyId: 1,
        damage: 50,
        critical: true,
        source: 'main',
      },
      {
        type: 'enemy-killed',
        enemyId: 1,
        kind: 'bubble-fin',
        x: 100,
        y: 120,
      },
      { type: 'loot-created', lootId: 1, kind: 'experience' },
      { type: 'skill-used', skillId: 'extreme-tide' },
    ], createFrameFixture());

    expect(effects.view.particles.length).toBeGreaterThanOrEqual(6);
    expect(effects.view.damageNumbers).toHaveLength(1);
    expect(effects.view.camera.amplitude).toBeLessThanOrEqual(6);

    effects.update(1000);
    expect(effects.view.damageNumbers).toHaveLength(0);
    expect(effects.view.particles.length).toBeLessThanOrEqual(200);
  });

  it('suppresses camera motion and trims low-priority effects', () => {
    const effects = new EffectSystem({
      particleLimit: 5,
      damageNumberLimit: 2,
      reducedMotion: true,
    });
    const events = Array.from({ length: 8 }, (_, index) => ({
      type: 'enemy-killed' as const,
      enemyId: index + 1,
      kind: 'needle-jelly' as const,
      x: 80 + index * 10,
      y: 120,
    }));

    effects.consume([
      ...events,
      { type: 'elite-entered', enemyId: 1 },
    ], createFrameFixture());

    expect(effects.view.particles).toHaveLength(5);
    expect(effects.view.camera.amplitude).toBe(0);
  });
});
