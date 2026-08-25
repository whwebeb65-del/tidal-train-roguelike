import { describe, expect, it } from 'vitest';
import { EffectSystem } from '../../../web/battle/EffectSystem';
import { BattleRenderer } from '../../../web/battle/BattleRenderer';
import type {
  BattleEvent,
  BattleFrameView,
} from '../../../web/battle/BattleTypes';
import {
  getRenderBudget,
  type QualityLevel,
} from '../../../web/battle/QualityMonitor';
import {
  getSkillEvolutionVisualSignature,
} from '../../../web/battle/SkillEvolutionVisualCatalog';
import {
  SKILL_VARIANT_IDS,
  SKILL_VARIANTS_BY_SKILL,
  type BattleSkillId,
  type SkillVariantId,
} from '../../../src/domain/skill/SkillProgressionTypes';
import {
  createFrameFixture,
  createPresentationFixture,
} from './helpers/BattleFixtures';
import { createRecordingPainter } from './helpers/RecordingPainter';

const DEDICATED_EVOLUTION_EVENTS: Readonly<Partial<Record<
  SkillVariantId,
  BattleEvent
>>> = {
  'bursting-bubble': { type: 'barrier-burst' },
  'emergency-trigger': { type: 'barrier-emergency-triggered', effectRatio: 0.6 },
  'undertow-eye': { type: 'extreme-pull-started', durationMs: 2000 },
  'lingering-vortex': { type: 'extreme-vortex-started', durationMs: 4000 },
  'energy-return': { type: 'extreme-energy-refunded', amount: 2 },
  'double-crest': { type: 'extreme-second-crest', durationMs: 1200, amount: 45 },
};

function createVariantFrame(ids: readonly SkillVariantId[]): BattleFrameView {
  return createFrameFixture({
    skillRanks: { 'tidal-volley': 5, 'bubble-barrier': 5, 'extreme-tide': 5 },
    skillVariants: {
      'tidal-volley': ids.filter((id) => (
        getSkillEvolutionVisualSignature(id).skillId === 'tidal-volley'
      )),
      'bubble-barrier': ids.filter((id) => (
        getSkillEvolutionVisualSignature(id).skillId === 'bubble-barrier'
      )),
      'extreme-tide': ids.filter((id) => (
        getSkillEvolutionVisualSignature(id).skillId === 'extreme-tide'
      )),
    },
  });
}

function authoritativeEventsForVariant(id: SkillVariantId): readonly BattleEvent[] {
  const dedicated = DEDICATED_EVOLUTION_EVENTS[id];
  return dedicated
    ? [dedicated]
    : [{
        type: 'skill-used',
        skillId: getSkillEvolutionVisualSignature(id).skillId,
      }];
}

function allSkillUseEvents(): readonly BattleEvent[] {
  return [
    { type: 'skill-used', skillId: 'tidal-volley' },
    { type: 'skill-used', skillId: 'bubble-barrier' },
    { type: 'skill-used', skillId: 'extreme-tide' },
    ...Object.values(DEDICATED_EVOLUTION_EVENTS).filter(
      (event): event is BattleEvent => event !== undefined,
    ),
  ];
}

function createEffectsForQuality(quality: QualityLevel, reducedMotion = false): EffectSystem {
  const effects = new EffectSystem({
    particleLimit: 200,
    damageNumberLimit: 18,
    impactLimit: 24,
    reducedMotion,
  });
  effects.setRenderBudget(getRenderBudget(quality));
  return effects;
}

describe('EffectSystem', () => {
  it('separates critical, armour, weak-point, and boss-arrival signatures', () => {
    const effects = new EffectSystem({
      particleLimit: 120,
      damageNumberLimit: 8,
      reducedMotion: false,
    });
    effects.consume([
      { type: 'projectile-hit', enemyId: 1, damage: 90, critical: true, source: 'main' },
      { type: 'enemy-armour-broken', enemyId: 2 },
      { type: 'boss-weakpoint-hit', enemyId: 1, bonusDamage: 40 },
      { type: 'boss-intro-started' },
    ], createFrameFixture());

    const kinds = effects.view.particles.map((item) => item.kind);
    expect(kinds).toEqual(expect.arrayContaining([
      'critical-shard',
      'armour-spark',
      'weakpoint-flare',
    ]));
    expect(kinds.filter((kind) => kind === 'critical-shard').length).toBeLessThan(8);
    expect(effects.view.rings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'boss-entrance-ripple' }),
    ]));
  });

  it('maps tide-beast warnings and weak points to distinct bounded effects', () => {
    const effects = new EffectSystem({
      particleLimit: 80,
      damageNumberLimit: 8,
      reducedMotion: false,
    });
    effects.consume([
      { type: 'enemy-ranged-warning', enemyId: 1 },
      { type: 'enemy-support-pulse', enemyId: 3, targetIds: [1, 2] },
      { type: 'elite-charge-telegraph', enemyId: 4, lane: 0, durationMs: 800 },
      { type: 'boss-tide-warning', safeLane: 2, durationMs: 1200 },
      { type: 'boss-weakpoint-hit', enemyId: 5, bonusDamage: 40 },
    ], createFrameFixture());

    expect(effects.view.particles.map((item) => item.kind)).toEqual(expect.arrayContaining([
      'ranged-warning',
      'support-wave',
      'elite-charge',
      'boss-tide',
      'weakpoint-burst',
    ]));
    expect(effects.view.damageNumbers).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 40, critical: true }),
    ]));
    expect(effects.view.camera.amplitude).toBeLessThanOrEqual(6);
  });

  it('retains static danger feedback with reduced motion', () => {
    const effects = new EffectSystem({
      particleLimit: 20,
      damageNumberLimit: 4,
      reducedMotion: true,
    });
    effects.consume([
      { type: 'elite-charge-telegraph', enemyId: 1, lane: 1, durationMs: 800 },
      { type: 'boss-tide-warning', safeLane: 0, durationMs: 1200 },
    ], createFrameFixture());

    expect(effects.view.camera.amplitude).toBe(0);
    expect(effects.view.rings).toHaveLength(1);
    expect(effects.view.particles.some((particle) => (
      particle.kind === 'boss-tide'
    ))).toBe(false);
    expect(effects.view.cinematic.bossTideWarningActive).toBe(true);
  });

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

  it('clears moving particles and camera state when reduced motion is enabled at runtime', () => {
    const effects = createEffectsForQuality('high');
    effects.consume([{ type: 'skill-used', skillId: 'extreme-tide' }], createFrameFixture({
      skillRanks: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 5 },
    }));
    effects.update(80);
    expect(effects.view.particles.length).toBeGreaterThan(0);
    expect(effects.view.camera.amplitude).toBeGreaterThan(0);

    effects.setReducedMotion(true);

    expect(effects.view.particles).toEqual([]);
    expect(effects.view.camera).toEqual({ x: 0, y: 0, rotation: 0, amplitude: 0 });
    effects.update(120);
    expect(effects.view.particles).toEqual([]);
    expect(effects.view.camera).toEqual({ x: 0, y: 0, rotation: 0, amplitude: 0 });
  });

  it('converts active evolution into one static catalog silhouette on a runtime toggle', () => {
    const effects = createEffectsForQuality('high');
    const frame = createVariantFrame(['reef-piercer']);
    effects.consume([
      { type: 'skill-used', skillId: 'tidal-volley' },
      {
        type: 'enemy-killed',
        enemyId: 99,
        kind: 'bubble-fin',
        x: 120,
        y: 260,
      },
    ], frame);
    effects.update(40);
    expect(effects.view.particles.length).toBeGreaterThan(0);
    expect(effects.view.rings.some((ring) => (
      ring.kind !== 'static-skill-silhouette'
    ))).toBe(true);
    expect(effects.view.camera.amplitude).toBeGreaterThan(0);

    effects.setReducedMotion(true);

    const catalog = getSkillEvolutionVisualSignature('reef-piercer');
    const silhouettes = () => effects.view.rings.filter((ring) => (
      ring.kind === 'static-skill-silhouette'
    ));
    expect(effects.view.particles).toEqual([]);
    expect(effects.view.rings).toHaveLength(1);
    expect(silhouettes()).toEqual([
      expect.objectContaining({ color: catalog.primary }),
    ]);
    expect(effects.view.camera).toEqual({ x: 0, y: 0, rotation: 0, amplitude: 0 });
    const staticRadius = silhouettes()[0]!.radius;

    effects.update(120);
    expect(effects.view.particles).toEqual([]);
    expect(effects.view.rings).toHaveLength(1);
    expect(silhouettes()[0]!.radius).toBe(staticRadius);
    expect(effects.view.camera).toEqual({ x: 0, y: 0, rotation: 0, amplitude: 0 });
    effects.update(199);
    expect(silhouettes()).toHaveLength(1);
    effects.update(161);
    expect(silhouettes()).toHaveLength(0);
  });

  it('keeps a newer animated expiry when an older static ring expires', () => {
    const effects = createEffectsForQuality('high', true);
    const frame = createVariantFrame(['energy-return']);
    const refund = [{
      type: 'extreme-energy-refunded' as const,
      amount: 2,
    }];
    const silhouettes = () => effects.view.rings.filter((ring) => (
      ring.kind === 'static-skill-silhouette'
    ));

    effects.consume(refund, frame);
    expect(silhouettes()).toHaveLength(1);
    effects.update(100);
    effects.setReducedMotion(false);
    effects.consume(refund, frame);
    expect(effects.view.particles.filter((particle) => (
      particle.kind === 'energy-return'
    ))).toHaveLength(1);

    effects.update(320);
    expect(silhouettes()).toHaveLength(0);
    effects.setReducedMotion(true);

    expect(effects.view.particles).toEqual([]);
    expect(silhouettes()).toEqual([
      expect.objectContaining({
        color: getSkillEvolutionVisualSignature('energy-return').primary,
      }),
    ]);
    const radius = silhouettes()[0]!.radius;
    effects.update(419);
    expect(silhouettes()).toHaveLength(1);
    expect(silhouettes()[0]!.radius).toBe(radius);
    effects.update(1);
    expect(silhouettes()).toHaveLength(0);
  });

  it('preserves the original absolute silhouette expiry across repeated toggles', () => {
    const effects = createEffectsForQuality('high', true);
    const frame = createVariantFrame(['energy-return']);
    const silhouettes = () => effects.view.rings.filter((ring) => (
      ring.kind === 'static-skill-silhouette'
    ));

    effects.consume([{
      type: 'extreme-energy-refunded',
      amount: 2,
    }], frame);
    effects.update(400);
    effects.setReducedMotion(false);
    effects.setReducedMotion(true);
    expect(silhouettes()).toHaveLength(1);

    effects.update(10);
    effects.setReducedMotion(false);
    effects.setReducedMotion(true);
    expect(silhouettes()).toHaveLength(1);
    effects.update(9);
    expect(silhouettes()).toHaveLength(1);
    effects.update(1);
    expect(silhouettes()).toHaveLength(0);
    expect(effects.poolStats.rings.inUse).toBe(0);

    effects.setReducedMotion(false);
    effects.setReducedMotion(true);
    expect(silhouettes()).toHaveLength(0);
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

  it('replays an identical deterministic view after reset', () => {
    const effects = createEffectsForQuality('high');
    const events = [
      {
        type: 'projectile-hit' as const,
        enemyId: 999,
        damage: 50,
        critical: true,
        source: 'main' as const,
      },
      {
        type: 'enemy-killed' as const,
        enemyId: 999,
        kind: 'bubble-fin' as const,
        x: 120,
        y: 260,
      },
    ];
    const frame = createFrameFixture();

    effects.consume(events, frame);
    const first = effects.view;
    effects.update(120);
    effects.reset();
    effects.consume(events, frame);

    expect(effects.view).toEqual(first);
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

  it('maps all five skill ranks to strictly increasing volley, barrier, and extreme layers', () => {
    const count = (skillId: 'tidal-volley' | 'bubble-barrier' | 'extreme-tide', rank: 1 | 2 | 3 | 4 | 5) => {
      const effects = new EffectSystem({
        particleLimit: 200,
        damageNumberLimit: 18,
        reducedMotion: false,
      });
      effects.consume([{ type: 'skill-used', skillId }], createFrameFixture({
        skillRanks: {
          'tidal-volley': skillId === 'tidal-volley' ? rank : 1,
          'bubble-barrier': skillId === 'bubble-barrier' ? rank : 1,
          'extreme-tide': skillId === 'extreme-tide' ? rank : 1,
        },
      }));
      return effects.view;
    };

    const layerCounts = (
      skillId: BattleSkillId,
      kind: 'rank-volley-trail' | 'barrier-membrane' | 'extreme-radial-stroke',
    ) => ([1, 2, 3, 4, 5] as const).map((rank) => {
      const view = count(skillId, rank);
      return kind === 'barrier-membrane'
        ? view.rings.filter((item) => item.kind === kind).length
        : view.particles.filter((item) => item.kind === kind).length;
    });

    expect(layerCounts('tidal-volley', 'rank-volley-trail')).toEqual([3, 4, 5, 6, 7]);
    expect(layerCounts('bubble-barrier', 'barrier-membrane')).toEqual([1, 2, 3, 4, 5]);
    expect(layerCounts('extreme-tide', 'extreme-radial-stroke')).toEqual([8, 10, 12, 14, 16]);
  });

  it.each(['medium', 'low'] as const)(
    'keeps all five ranks strictly layered within the %s particle budget',
    (quality) => {
      const particleBudget = quality === 'medium' ? 20 : 12;
      for (const skillId of [
        'tidal-volley',
        'bubble-barrier',
        'extreme-tide',
      ] as const) {
        const layers = ([1, 2, 3, 4, 5] as const).map((rank) => {
          const effects = createEffectsForQuality(quality);
          effects.consume([{ type: 'skill-used', skillId }], createFrameFixture({
            skillRanks: {
              'tidal-volley': skillId === 'tidal-volley' ? rank : 1,
              'bubble-barrier': skillId === 'bubble-barrier' ? rank : 1,
              'extreme-tide': skillId === 'extreme-tide' ? rank : 1,
            },
          }));
          expect(effects.view.particles.length).toBeLessThanOrEqual(particleBudget);
          if (skillId === 'bubble-barrier') {
            return effects.view.rings.find(
              (item) => item.kind === 'barrier-membrane',
            )!.radius;
          }
          const kind = skillId === 'tidal-volley'
            ? 'rank-volley-trail'
            : 'extreme-radial-stroke';
          return effects.view.particles.find((item) => item.kind === kind)!.size;
        });
        expect(layers.every((layer, index) => (
          index === 0 || layer > layers[index - 1]!
        ))).toBe(true);
      }
    },
  );

  it('keeps sequential low-quality rank signatures monotonic in one effect lifetime', () => {
    const effects = createEffectsForQuality('low');
    const sampleRanks = (
      skillId: 'tidal-volley' | 'extreme-tide',
      kind: 'rank-volley-trail' | 'extreme-radial-stroke',
    ) => ([1, 2, 3, 4, 5] as const).map((rank) => {
      effects.consume([{ type: 'skill-used', skillId }], createFrameFixture({
        skillRanks: {
          'tidal-volley': skillId === 'tidal-volley' ? rank : 1,
          'bubble-barrier': 1,
          'extreme-tide': skillId === 'extreme-tide' ? rank : 1,
        },
      }));
      const rankSignature = effects.view.particles.find(
        (particle) => particle.kind === kind,
      );
      expect(rankSignature).toBeDefined();
      expect(effects.view.particles.length).toBeLessThanOrEqual(12);
      const metric = rankSignature!.size;
      effects.update(800);
      expect(effects.view.particles.filter((particle) => (
        particle.kind === kind
      ))).toHaveLength(0);
      return metric;
    });

    for (const [skillId, kind] of [
      ['tidal-volley', 'rank-volley-trail'],
      ['extreme-tide', 'extreme-radial-stroke'],
    ] as const) {
      const metrics = sampleRanks(skillId, kind);
      expect(metrics.every((metric, index) => (
        index === 0 || metric > metrics[index - 1]!
      ))).toBe(true);
    }
  });

  it.each(SKILL_VARIANT_IDS)(
    'maps the authoritative event for %s to its catalog motif and color',
    (id) => {
      const effects = createEffectsForQuality('high');
      const signature = getSkillEvolutionVisualSignature(id);

      effects.consume(authoritativeEventsForVariant(id), createVariantFrame([id]));

      expect(effects.view.particles).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: signature.particleKind,
          color: signature.primary,
        }),
      ]));
    },
  );

  it('keeps every bubble evolution motif above the 390px skill-button protection line', () => {
    const effects = createEffectsForQuality('high');
    const ids = [
      'bursting-bubble',
      'reflective-spines',
      'overflow-membrane',
      'emergency-trigger',
    ] as const;
    effects.consume([
      { type: 'skill-used', skillId: 'bubble-barrier' },
      { type: 'barrier-burst' },
      { type: 'barrier-emergency-triggered', effectRatio: 0.6 },
    ], createVariantFrame(ids));

    const bubbleMotifs = effects.view.particles.filter((particle) => (
      ids.some((id) => (
        getSkillEvolutionVisualSignature(id).particleKind === particle.kind
      ))
    ));
    expect(bubbleMotifs).toHaveLength(ids.length);
    for (const particle of bubbleMotifs) {
      const maximumRendererMotifScale = 1.1;
      const conservativeRendererExtent = 3.2;
      const motifBottom = particle.y
        + particle.size * maximumRendererMotifScale * conservativeRendererExtent;
      expect(motifBottom).toBeLessThanOrEqual(688);
    }
  });

  it.each([
    { id: 'bursting-bubble', expectedRadius: 54 },
    { id: 'reflective-spines', expectedRadius: 58 },
    { id: 'overflow-membrane', expectedRadius: 62 },
    { id: 'emergency-trigger', expectedRadius: 66 },
  ] as const)(
    'keeps the reduced-motion $id catalog silhouette above the real 390px bubble button',
    ({ id, expectedRadius }) => {
      const effects = createEffectsForQuality('low', true);
      const signature = getSkillEvolutionVisualSignature(id);

      effects.consume(authoritativeEventsForVariant(id), createVariantFrame([id]));

      const ring = effects.view.rings.find((candidate) => (
        candidate.color === signature.primary
      ));
      expect(ring).toMatchObject({
        kind: signature.reducedMotionRingKind,
        color: signature.primary,
        secondaryColor: signature.secondary,
        radius: expectedRadius,
      });
      const real390BubbleButtonLogicalTop = (723 - 97) / 0.9170616;
      const rendererOutlineHalfWidth = 2.5 / 2;
      const smokeConservativeMargin = 3;
      const conservativeRendererBottom = ring!.y
        + ring!.radius * 0.72
        + rendererOutlineHalfWidth
        + smokeConservativeMargin;
      const clearance = real390BubbleButtonLogicalTop - conservativeRendererBottom;

      expect(real390BubbleButtonLogicalTop).toBeCloseTo(682.615, 3);
      expect(conservativeRendererBottom).toBeLessThan(real390BubbleButtonLogicalTop);
      if (id === 'emergency-trigger') expect(clearance).toBeGreaterThanOrEqual(4);
    },
  );

  it.each(['high', 'medium', 'low'] as const)(
    'keeps every selected motif while respecting the %s signature budget',
    (quality) => {
      const effects = createEffectsForQuality(quality);
      effects.consume(allSkillUseEvents(), createVariantFrame(SKILL_VARIANT_IDS));
      const kinds = new Set(effects.view.particles.map((item) => item.kind));
      for (const id of SKILL_VARIANT_IDS) {
        expect(kinds).toContain(getSkillEvolutionVisualSignature(id).particleKind);
      }
      expect(effects.view.particles.length).toBeLessThanOrEqual(
        quality === 'high' ? 30 : quality === 'medium' ? 20 : 12,
      );
    },
  );

  it.each(Object.keys(SKILL_VARIANTS_BY_SKILL) as BattleSkillId[])(
    'retains every %s motif before rank and decorative particles when constrained',
    (skillId) => {
      const ids = SKILL_VARIANTS_BY_SKILL[skillId];
      const effects = new EffectSystem({
        particleLimit: ids.length,
        damageNumberLimit: 4,
        impactLimit: 8,
        reducedMotion: false,
      });
      const events = [
        { type: 'skill-used' as const, skillId },
        ...ids.flatMap((id) => {
          const event = DEDICATED_EVOLUTION_EVENTS[id];
          return event ? [event] : [];
        }),
      ];

      effects.consume(events, createVariantFrame(ids));

      expect(new Set(effects.view.particles.map((item) => item.kind))).toEqual(
        new Set(ids.map((id) => getSkillEvolutionVisualSignature(id).particleKind)),
      );
    },
  );

  it.each([
    {
      label: 'tidal-volley representative',
      ids: ['split-tide-arrow'],
      events: [{ type: 'skill-used', skillId: 'tidal-volley' }],
    },
    {
      label: 'bubble-barrier representative',
      ids: ['reflective-spines'],
      events: [{ type: 'skill-used', skillId: 'bubble-barrier' }],
    },
    {
      label: 'extreme-tide representative',
      ids: ['undertow-eye'],
      events: [
        { type: 'skill-used', skillId: 'extreme-tide' },
        { type: 'extreme-pull-started', durationMs: 2000 },
      ],
    },
    {
      label: 'multi-variant tidal-volley batch',
      ids: ['split-tide-arrow', 'reef-piercer', 'returning-volley', 'rainstorm-school'],
      events: [{ type: 'skill-used', skillId: 'tidal-volley' }],
    },
  ] satisfies readonly {
    readonly label: string;
    readonly ids: readonly SkillVariantId[];
    readonly events: readonly BattleEvent[];
  }[])(
    'retains each newly triggered motif under pre-existing boss pressure: $label',
    ({ ids, events }) => {
      const effects = createEffectsForQuality('low');
      const frame = createVariantFrame(ids);
      const bossPressure = Array.from({ length: 80 }, (_, index): BattleEvent => ({
        type: 'boss-tide-impact',
        safeLane: (index % 3) as 0 | 1 | 2,
        avoided: false,
      }));
      effects.consume(bossPressure, frame);
      expect(effects.view.particles).toHaveLength(80);
      expect(effects.view.particles.every((particle) => (
        particle.kind === 'boss-tide'
      ))).toBe(true);

      for (let repeat = 0; repeat < 3; repeat += 1) {
        effects.consume(events, frame);
        const kinds = new Set(effects.view.particles.map((particle) => particle.kind));
        for (const id of ids) {
          expect(kinds).toContain(
            getSkillEvolutionVisualSignature(id).particleKind,
          );
        }
        expect(effects.view.particles.length).toBeLessThanOrEqual(80);
        expect(effects.poolStats.particles.inUse).toBeLessThanOrEqual(80);
      }
    },
  );

  it('uses one distinct static catalog silhouette per selected variant in reduced motion', () => {
    const effects = createEffectsForQuality('high', true);
    effects.consume(allSkillUseEvents(), createVariantFrame(SKILL_VARIANT_IDS));

    const silhouettes = effects.view.rings.filter(
      (item) => item.kind === 'static-skill-silhouette',
    );
    expect(effects.view.particles).toEqual([]);
    expect(effects.view.camera.amplitude).toBe(0);
    expect(silhouettes).toHaveLength(SKILL_VARIANT_IDS.length);
    expect(new Set(silhouettes.map((item) => item.radius)).size).toBe(SKILL_VARIANT_IDS.length);
    expect(new Set(silhouettes.map((item) => item.color))).toEqual(
      new Set(SKILL_VARIANT_IDS.map((id) => getSkillEvolutionVisualSignature(id).primary)),
    );
  });

  it('retains all twelve low-quality reduced-motion signatures for 320–480ms', () => {
    const effects = createEffectsForQuality('low', true);
    effects.consume(allSkillUseEvents(), createVariantFrame(SKILL_VARIANT_IDS));

    const signatures = () => effects.view.rings.filter(
      (item) => item.kind === 'static-skill-silhouette',
    );
    expect(signatures()).toHaveLength(SKILL_VARIANT_IDS.length);
    expect(new Set(signatures().map((item) => item.radius)).size)
      .toBe(SKILL_VARIANT_IDS.length);
    expect(new Set(signatures().map((item) => item.color))).toEqual(
      new Set(SKILL_VARIANT_IDS.map((id) => (
        getSkillEvolutionVisualSignature(id).primary
      ))),
    );

    effects.update(319);
    expect(signatures()).toHaveLength(SKILL_VARIANT_IDS.length);
    effects.update(161);
    expect(signatures()).toHaveLength(0);
  });

  it('protects twelve unique low-quality silhouettes ahead of a boss ring', () => {
    const effects = createEffectsForQuality('low', true);
    effects.consume([
      ...allSkillUseEvents(),
      { type: 'boss-intro-started' },
    ], createVariantFrame(SKILL_VARIANT_IDS));

    const silhouettes = effects.view.rings.filter((ring) => (
      ring.kind === 'static-skill-silhouette'
    ));
    expect(silhouettes).toHaveLength(SKILL_VARIANT_IDS.length);
    expect(new Set(silhouettes.map((ring) => ring.color))).toEqual(
      new Set(SKILL_VARIANT_IDS.map((id) => (
        getSkillEvolutionVisualSignature(id).primary
      ))),
    );
    expect(effects.view.rings.length).toBeLessThanOrEqual(SKILL_VARIANT_IDS.length);
    expect(effects.poolStats.rings.inUse).toBeLessThanOrEqual(SKILL_VARIANT_IDS.length);
  });

  it('refreshes one energy-return silhouette across 25 events and releases it at 420ms', () => {
    const effects = createEffectsForQuality('low', true);
    const frame = createVariantFrame(['energy-return']);
    for (let index = 0; index < 25; index += 1) {
      effects.consume([{
        type: 'extreme-energy-refunded',
        amount: 2,
      }], frame);
    }

    const silhouettes = () => effects.view.rings.filter((ring) => (
      ring.kind === 'static-skill-silhouette'
    ));
    expect(silhouettes()).toHaveLength(1);
    expect(silhouettes()[0]).toMatchObject({
      color: getSkillEvolutionVisualSignature('energy-return').primary,
    });
    expect(effects.view.rings).toHaveLength(1);
    expect(effects.poolStats.rings.inUse).toBe(1);

    effects.update(419);
    expect(silhouettes()).toHaveLength(1);
    effects.update(1);
    expect(silhouettes()).toHaveLength(0);
    expect(effects.poolStats.rings.inUse).toBe(0);
  });

  it('keeps variant cues identifiable while low quality and reduced motion use static bounded fallbacks', () => {
    const frame = createFrameFixture({
      skillRanks: { 'tidal-volley': 5, 'bubble-barrier': 5, 'extreme-tide': 5 },
      skillVariants: {
        'tidal-volley': ['reef-piercer'],
        'bubble-barrier': ['reflective-spines'],
        'extreme-tide': ['undertow-eye', 'lingering-vortex', 'double-crest'],
      },
    });
    const events = [
      { type: 'skill-used' as const, skillId: 'tidal-volley' as const },
      { type: 'skill-used' as const, skillId: 'bubble-barrier' as const },
      { type: 'extreme-pull-started' as const, durationMs: 2000 },
      { type: 'extreme-vortex-started' as const, durationMs: 4000 },
      { type: 'extreme-second-crest' as const, durationMs: 1200, amount: 45 },
    ];
    const high = new EffectSystem({ particleLimit: 200, damageNumberLimit: 18, reducedMotion: false });
    high.consume(events, frame);
    expect(high.view.particles.map((item) => item.kind)).toEqual(expect.arrayContaining([
      'coral-pierce', 'reflection', 'undertow-eye', 'extreme-vortex', 'second-crest',
    ]));

    const low = new EffectSystem({ particleLimit: 200, damageNumberLimit: 18, reducedMotion: false });
    low.setRenderBudget(getRenderBudget('low'));
    low.consume(events, frame);
    expect(low.view.particles.filter((item) => item.kind === 'rank-volley-trail')).toHaveLength(1);
    expect(low.view.rings.filter((item) => item.kind === 'barrier-membrane')).toHaveLength(1);
    const lowBarrier = new EffectSystem({ particleLimit: 200, damageNumberLimit: 18, reducedMotion: false });
    lowBarrier.setRenderBudget(getRenderBudget('low'));
    lowBarrier.consume([{ type: 'skill-used', skillId: 'bubble-barrier' }], frame);
    expect(lowBarrier.view.rings).toHaveLength(1);

    const reduced = new EffectSystem({ particleLimit: 200, damageNumberLimit: 18, reducedMotion: true });
    reduced.consume([{ type: 'extreme-vortex-started', durationMs: 4000 }], frame);
    expect(reduced.view.particles).toHaveLength(0);
    expect(reduced.view.particles.filter((item) => item.kind === 'extreme-vortex')).toHaveLength(0);
    expect(reduced.view.rings.filter((item) => item.kind === 'static-skill-silhouette')).toHaveLength(1);
    expect(reduced.view.camera).toMatchObject({ x: 0, y: 0, rotation: 0, amplitude: 0 });
  });

  it.each([
    ['boss-summon', '船长：回响集结 · 留意援军'],
    ['boss-tide', '船长：断潮来袭 · 顺流换道'],
    ['boss-enraged', '船长：潮眼暴露 · 集中火力'],
  ] as const)('uses a captain callout for %s', (phase, title) => {
    const effects = createEffectsForQuality('high');
    effects.consume([{ type: 'boss-phase-changed', phase }], createFrameFixture());
    expect(effects.view.cinematic.title).toBe(title);
  });

  it('keeps the real tide-warning duration and gives the safe lane a captain callout', () => {
    const effects = createEffectsForQuality('high');
    effects.consume([{ type: 'boss-tide-warning', safeLane: 1, durationMs: 1200 }], createFrameFixture());
    expect(effects.view.cinematic.title).toBe('船长：绿色潮线是安全航道');
    effects.update(1199);
    expect(effects.view.cinematic.title).not.toBeNull();
    effects.update(1);
    expect(effects.view.cinematic.title).toBeNull();
  });

  it('exposes the existing tide-warning event for exactly its authoritative duration', () => {
    const effects = createEffectsForQuality('high');
    effects.consume(
      [{ type: 'boss-tide-warning', safeLane: 1, durationMs: 1200 }],
      createFrameFixture(),
    );

    expect(effects.view.cinematic.bossTideWarningActive).toBe(true);
    effects.update(1199);
    expect(effects.view.cinematic.bossTideWarningActive).toBe(true);
    effects.update(1);
    expect(effects.view.cinematic.bossTideWarningActive).toBe(false);
    effects.reset();
    expect(effects.view.cinematic.bossTideWarningActive).toBe(false);
  });

  it('keeps the complete reduced-motion boss warning presentation static', () => {
    const frame = createFrameFixture({
      enemies: [{
        id: 77, kind: 'deep-echo-boss', lane: 1, x: 195, y: 250,
        hp: 600, maxHp: 1000, shield: 0, speedPerSecond: 0,
        defenceBroken: false, attackCooldownMs: 1000, ageMs: 0, alive: true,
        behaviour: {
          phase: 'boss-tide', phaseRemainingMs: 1100, phaseDurationMs: 1200,
          cycle: 2, targetLane: 1, safeLane: 1, invulnerable: false,
          damageTakenMultiplier: 1, weakPointOpen: false,
        },
      }],
      projectiles: [],
      loot: [],
    });
    const effects = createEffectsForQuality('high', true);
    effects.consume([
      { type: 'boss-phase-changed', phase: 'boss-tide' },
      { type: 'boss-tide-warning', safeLane: 1, durationMs: 1200 },
    ], frame);

    const capture = (timeMs: number) => {
      const view = effects.view;
      const painter = createRecordingPainter();
      new BattleRenderer(painter).render(createPresentationFixture({
        frame,
        effects: view,
        reducedMotion: true,
        timeMs,
      }));
      return {
        view,
        commands: painter.commands.filter((command) => (
          command.kind.startsWith('boss-')
          || command.kind === 'effect-boss-tide'
          || command.kind === 'effect-impact-ring'
        )),
      };
    };

    effects.update(300);
    const first = capture(300);
    effects.update(300);
    const second = capture(600);

    expect(first.view).toEqual(second.view);
    expect(first.commands).toEqual(second.commands);
    expect(first.view.particles).toEqual([]);
    expect(first.view.rings).toEqual([]);
    expect(first.view.cinematic).toMatchObject({
      title: '船长：绿色潮线是安全航道',
      bossTideWarningActive: true,
    });

    effects.update(600);
    const expired = capture(1200);
    expect(expired.view.cinematic.bossTideWarningActive).toBe(false);
    expect(expired.commands.some(
      (command) => command.kind === 'boss-tide-countdown',
    )).toBe(false);
  });
});
