import { describe, expect, it } from 'vitest';
import { EffectSystem } from '../../../web/battle/EffectSystem';
import { getRenderBudget } from '../../../web/battle/QualityMonitor';
import { createFrameFixture } from './helpers/BattleFixtures';

describe('EffectSystem', () => {
  it('adds brush smears to weapon fire and projectile impacts', () => {
    const weaponEffects = new EffectSystem({
      particleLimit: 80,
      damageNumberLimit: 8,
      reducedMotion: false,
    });
    weaponEffects.consume([{
      type: 'weapon-fired',
      projectileId: 3,
      source: 'main',
    }], createFrameFixture());

    expect(weaponEffects.view.particles.filter((item) => item.kind === 'muzzle')).toHaveLength(3);
    expect(weaponEffects.view.particles.filter((item) => item.kind === 'brush-smear')).toHaveLength(2);

    const normalHit = new EffectSystem({
      particleLimit: 80,
      damageNumberLimit: 8,
      reducedMotion: false,
    });
    normalHit.consume([{
      type: 'projectile-hit',
      enemyId: 1,
      damage: 25,
      critical: false,
      source: 'main',
    }], createFrameFixture());
    expect(normalHit.view.particles.filter((item) => item.kind === 'brush-smear')).toHaveLength(3);

    const criticalHit = new EffectSystem({
      particleLimit: 80,
      damageNumberLimit: 8,
      reducedMotion: false,
    });
    criticalHit.consume([{
      type: 'projectile-hit',
      enemyId: 1,
      damage: 50,
      critical: true,
      source: 'main',
    }], createFrameFixture());
    expect(criticalHit.view.particles.filter((item) => item.kind === 'brush-smear')).toHaveLength(6);
  });

  it.each([
    ['bubble-fin', 6],
    ['storm-ray-elite', 9],
    ['deep-echo-boss', 14],
  ] as const)('spawns one squash before %s ink bubbles', (kind, bubbleCount) => {
    const effects = new EffectSystem({
      particleLimit: 80,
      damageNumberLimit: 8,
      reducedMotion: false,
    });
    effects.consume([{
      type: 'enemy-killed',
      enemyId: 7,
      kind,
      x: 120,
      y: 260,
    }], createFrameFixture());

    const kinds = effects.view.particles.map((item) => item.kind);
    expect(kinds.filter((item) => item === 'defeat-squash')).toHaveLength(1);
    expect(kinds.filter((item) => item === 'ink-bubble')).toHaveLength(bubbleCount);
    expect(kinds.indexOf('defeat-squash')).toBeLessThan(kinds.indexOf('ink-bubble'));
  });

  it('turns an enemy kill into one high-priority squash followed by ink bubbles', () => {
    const effects = new EffectSystem({
      particleLimit: 80,
      damageNumberLimit: 8,
      reducedMotion: false,
    });
    effects.consume([{
      type: 'enemy-killed',
      enemyId: 7,
      kind: 'bubble-fin',
      x: 120,
      y: 260,
    }], createFrameFixture());

    expect(effects.view.particles.filter((item) => item.kind === 'defeat-squash')).toHaveLength(1);
    expect(effects.view.particles.filter((item) => item.kind === 'ink-bubble').length).toBeGreaterThanOrEqual(4);
    expect(effects.view.particles.every((item) => item.progress >= 0 && item.progress <= 1)).toBe(true);
    effects.update(120);
    expect(effects.view.particles.find((item) => item.kind === 'defeat-squash')!.progress).toBeGreaterThan(0);
  });

  it('retains the defeat squash when the low-quality particle budget trims decoration', () => {
    const effects = new EffectSystem({
      particleLimit: 8,
      damageNumberLimit: 4,
      reducedMotion: false,
    });
    effects.consume([{ type: 'battle-won' }], createFrameFixture());
    effects.consume([{
      type: 'enemy-killed',
      enemyId: 9,
      kind: 'bubble-fin',
      x: 195,
      y: 260,
    }], createFrameFixture());

    expect(effects.view.particles.some((item) => item.kind === 'defeat-squash')).toBe(true);
  });

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

  it('reuses expired effects and releases every active object on reset', () => {
    const effects = new EffectSystem({
      particleLimit: 32,
      damageNumberLimit: 8,
      impactLimit: 8,
      reducedMotion: false,
    });
    const events = [{
      type: 'projectile-hit' as const,
      enemyId: 1,
      damage: 50,
      critical: true,
      source: 'main' as const,
    }];

    effects.consume(events, createFrameFixture());
    effects.update(2000);
    effects.consume(events, createFrameFixture());

    expect(effects.poolStats.particles.reused).toBeGreaterThan(0);
    expect(effects.poolStats.damageNumbers.reused).toBeGreaterThan(0);
    expect(effects.poolStats.rings.reused).toBeGreaterThan(0);

    effects.reset();

    expect(effects.poolStats.particles.inUse).toBe(0);
    expect(effects.poolStats.damageNumbers.inUse).toBe(0);
    expect(effects.poolStats.rings.inUse).toBe(0);
    expect(effects.view.particles).toHaveLength(0);
    expect(effects.view.damageNumbers).toHaveLength(0);
    expect(effects.view.rings).toHaveLength(0);
  });

  it('reduces effect acquisition immediately when the render budget drops', () => {
    const effects = new EffectSystem({
      particleLimit: 200,
      damageNumberLimit: 18,
      reducedMotion: false,
    });
    effects.setRenderBudget(getRenderBudget('low'));

    effects.consume([{ type: 'battle-won' }], createFrameFixture());

    expect(effects.view.particles.length).toBeLessThanOrEqual(8);
    expect(effects.poolStats.particles.created).toBeLessThanOrEqual(8);
  });
});
