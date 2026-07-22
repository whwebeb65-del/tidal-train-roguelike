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
    const evolvedSquash = effects.view.particles.find(
      (item) => item.kind === 'defeat-squash',
    )!;
    expect(evolvedSquash.progress).toBeGreaterThan(0);
    expect(evolvedSquash).toMatchObject({
      sourceEnemyId: 7,
      originX: 120,
      originY: 260,
    });
  });

  it('retains the first squash when later combat decoration exceeds the particle budget', () => {
    const effects = new EffectSystem({
      particleLimit: 7,
      damageNumberLimit: 4,
      reducedMotion: false,
    });
    effects.consume([{
      type: 'enemy-killed',
      enemyId: 9,
      kind: 'bubble-fin',
      x: 195,
      y: 260,
    }], createFrameFixture());
    const firstSquash = effects.view.particles.find(
      (item) => item.kind === 'defeat-squash',
    );
    expect(firstSquash).toBeDefined();

    effects.consume([
      {
        type: 'weapon-fired',
        projectileId: 3,
        source: 'main',
      },
      {
        type: 'enemy-killed',
        enemyId: 10,
        kind: 'bubble-fin',
        x: 205,
        y: 270,
      },
      {
        type: 'enemy-armour-broken',
        enemyId: 1,
      },
    ], createFrameFixture());

    expect(effects.poolStats.particles.created).toBe(27);
    expect(effects.view.particles).toHaveLength(7);
    expect(effects.view.particles.filter((item) => item.kind === 'defeat-squash')).toHaveLength(2);
    expect(effects.view.particles.filter((item) => item.kind === 'ink-bubble')).toHaveLength(5);
    expect(effects.view.particles.some((item) => item.id === firstSquash!.id)).toBe(true);
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

  it('keeps new impact semantics deterministic while reduced motion suppresses camera shake', () => {
    const animated = new EffectSystem({
      particleLimit: 32,
      damageNumberLimit: 8,
      reducedMotion: false,
    });
    const reduced = new EffectSystem({
      particleLimit: 32,
      damageNumberLimit: 8,
      reducedMotion: true,
    });
    const events = [{
      type: 'enemy-killed' as const,
      enemyId: 7,
      kind: 'bubble-fin' as const,
      x: 120,
      y: 260,
    }];

    animated.consume(events, createFrameFixture());
    reduced.consume(events, createFrameFixture());

    expect(reduced.view.particles).toEqual(animated.view.particles);
    expect(reduced.view.rings).toEqual(animated.view.rings);
    expect(reduced.view.particles.filter((item) => item.kind === 'defeat-squash')).toHaveLength(1);
    expect(reduced.view.particles.filter((item) => item.kind === 'ink-bubble')).toHaveLength(6);
    expect(animated.view.camera.amplitude).toBeGreaterThan(0);
    expect(reduced.view.camera).toMatchObject({ x: 0, y: 0, rotation: 0, amplitude: 0 });

    animated.update(120);
    reduced.update(120);
    expect(reduced.view.particles).toEqual(animated.view.particles);
    expect(reduced.view.particles.find((item) => item.kind === 'defeat-squash')!.progress)
      .toBeGreaterThan(0);
    expect(reduced.view.camera.amplitude).toBe(0);
  });

  it('clears pooled squash, ink and emphasized-ring state before reuse', () => {
    const effects = new EffectSystem({
      particleLimit: 32,
      damageNumberLimit: 8,
      impactLimit: 1,
      reducedMotion: false,
    });
    effects.consume([{
      type: 'enemy-killed',
      enemyId: 11,
      kind: 'deep-echo-boss',
      x: 160,
      y: 240,
    }], createFrameFixture());
    expect(effects.view.particles.filter((item) => item.kind === 'defeat-squash')).toHaveLength(1);
    expect(effects.view.particles.filter((item) => item.kind === 'ink-bubble')).toHaveLength(14);
    expect(effects.view.rings[0]!.secondaryColor).toBe('#17344c');

    const createdParticles = effects.poolStats.particles.created;
    const createdRings = effects.poolStats.rings.created;
    effects.update(2000);
    expect(effects.view.particles).toHaveLength(0);
    expect(effects.view.rings).toHaveLength(0);

    effects.consume([
      {
        type: 'weapon-fired',
        projectileId: 3,
        source: 'main',
      },
      {
        type: 'projectile-hit',
        enemyId: 1,
        damage: 25,
        critical: false,
        source: 'main',
      },
    ], createFrameFixture());

    expect(effects.poolStats.particles.created).toBe(createdParticles);
    expect(effects.poolStats.rings.created).toBe(createdRings);
    expect(effects.poolStats.particles.reused).toBeGreaterThanOrEqual(8);
    expect(effects.poolStats.rings.reused).toBeGreaterThanOrEqual(1);
    expect(effects.view.particles).toHaveLength(8);
    expect(effects.view.particles.every((item) => (
      item.kind === 'brush-smear' || item.kind === 'muzzle'
    ))).toBe(true);
    expect(effects.view.particles.every((item) => item.progress === 0)).toBe(true);
    expect(effects.view.particles.some((item) => (
      item.kind === 'defeat-squash'
      || item.kind === 'ink-bubble'
      || item.color === '#243f67'
      || item.color === '#b9f6ff'
    ))).toBe(false);
    expect(effects.view.rings).toHaveLength(1);
    expect(effects.view.rings[0]).toMatchObject({
      color: '#fff2d2',
      secondaryColor: undefined,
    });
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
