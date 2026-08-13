import type {
  BattleEvent,
  BattleFrameView,
  EnemyState,
} from './BattleTypes';
import {
  SKILL_VARIANT_IDS,
  type SkillVariantId,
} from '../../src/domain/skill/SkillProgressionTypes';
import {
  EntityPool,
  type EntityPoolStats,
} from './EntityPool';
import type { RenderBudget } from './QualityMonitor';
import { LANE_X } from './BattleConfig';
import {
  getSkillEvolutionVisualSignature,
  type SkillEvolutionParticleKind,
} from './SkillEvolutionVisualCatalog';

export type EffectParticleKind =
  | SkillEvolutionParticleKind
  | 'muzzle'
  | 'brush-smear'
  | 'splash'
  | 'armour-shard'
  | 'defeat-shard'
  | 'defeat-squash'
  | 'ink-bubble'
  | 'loot'
  | 'skill'
  | 'warning'
  | 'core-pulse'
  | 'rank-volley-trail'
  | 'extreme-radial-stroke'
  | 'extreme-pull'
  | 'ranged-warning'
  | 'support-wave'
  | 'elite-charge'
  | 'boss-tide'
  | 'weakpoint-burst'
  | 'critical-shard'
  | 'armour-spark'
  | 'weakpoint-flare';

export interface EffectParticleView {
  readonly id: number;
  readonly kind: EffectParticleKind;
  readonly layer: 'enemies' | 'front-effects';
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: string;
  readonly secondaryColor?: string;
  readonly alpha: number;
  readonly rotation: number;
  readonly progress: number;
  readonly sourceEnemyId?: number | null;
  readonly originX?: number;
  readonly originY?: number;
}

export interface DamageNumberView {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly value: number;
  readonly critical: boolean;
  readonly alpha: number;
}

export interface ImpactRingView {
  readonly id: number;
  readonly kind?:
    | 'impact-ring'
    | 'barrier-membrane'
    | 'static-skill-silhouette'
    | 'boss-entrance-ripple';
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  readonly alpha: number;
  readonly secondaryColor?: string;
}

export interface EffectCameraView {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly amplitude: number;
}

export interface EffectCinematicView {
  readonly darken: number;
  readonly title: string | null;
  readonly slowMotion: number;
}

export interface EffectFrameView {
  readonly particles: readonly EffectParticleView[];
  readonly damageNumbers: readonly DamageNumberView[];
  readonly rings: readonly ImpactRingView[];
  readonly camera: EffectCameraView;
  readonly cinematic: EffectCinematicView;
}

export const EMPTY_EFFECT_FRAME_VIEW: EffectFrameView = {
  particles: [],
  damageNumbers: [],
  rings: [],
  camera: {
    x: 0,
    y: 0,
    rotation: 0,
    amplitude: 0,
  },
  cinematic: {
    darken: 0,
    title: null,
    slowMotion: 0,
  },
};

export interface EffectSystemOptions {
  readonly particleLimit: number;
  readonly damageNumberLimit: number;
  readonly impactLimit?: number;
  readonly reducedMotion: boolean;
}

interface MutableParticle {
  id: number;
  kind: EffectParticleKind;
  layer: EffectParticleView['layer'];
  color: string;
  secondaryColor?: string;
  size: number;
  lifetimeMs: number;
  priority: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  ageMs: number;
  sourceEnemyId: number | null;
  originX: number;
  originY: number;
}

interface MutableDamageNumber {
  id: number;
  value: number;
  critical: boolean;
  lifetimeMs: number;
  x: number;
  y: number;
  ageMs: number;
}

interface MutableImpactRing {
  id: number;
  kind: NonNullable<ImpactRingView['kind']>;
  evolutionId: SkillVariantId | null;
  evolutionExpiresAtMs: number | null;
  x: number;
  y: number;
  color: string;
  secondaryColor?: string;
  startRadius: number;
  endRadius: number;
  lifetimeMs: number;
  priority: number;
  ageMs: number;
}

interface ActiveEvolutionSignature {
  readonly authoritativeExpiresAtMs: number;
}

const EVOLUTION_MAIN_MOTIF_PRIORITY = 11;

export interface EffectPoolStats {
  readonly particles: EntityPoolStats;
  readonly damageNumbers: EntityPoolStats;
  readonly rings: EntityPoolStats;
}

export class EffectSystem {
  private particles: MutableParticle[] = [];
  private damageNumbers: MutableDamageNumber[] = [];
  private rings: MutableImpactRing[] = [];
  private readonly particlePool: EntityPool<MutableParticle>;
  private readonly damageNumberPool: EntityPool<MutableDamageNumber>;
  private readonly ringPool: EntityPool<MutableImpactRing>;
  private nextId = 1;
  private clockMs = 0;
  private cameraAmplitude = 0;
  private cameraRemainingMs = 0;
  private cameraDurationMs = 1;
  private lastShakeAtMs = -Infinity;
  private darken = 0;
  private darkenRemainingMs = 0;
  private title: string | null = null;
  private titleRemainingMs = 0;
  private slowMotionRemainingMs = 0;
  private lastEventX = 195;
  private lastEventY = 360;
  private reducedMotion: boolean;
  private particleLimit: number;
  private damageNumberLimit: number;
  private impactLimit: number;
  private particleSpawnScale = 1;
  private activeSkillParticleBudget: number | null = null;
  private readonly activeEvolutionSignatures = new Map<
    SkillVariantId,
    ActiveEvolutionSignature
  >();

  public constructor(options: EffectSystemOptions) {
    assertLimit(options.particleLimit, 'Particle limit');
    assertLimit(options.damageNumberLimit, 'Damage number limit');
    assertLimit(options.impactLimit ?? 24, 'Impact limit');
    this.reducedMotion = options.reducedMotion;
    this.particleLimit = options.particleLimit;
    this.damageNumberLimit = options.damageNumberLimit;
    this.impactLimit = options.impactLimit ?? 24;
    this.particlePool = new EntityPool(
      createParticle,
      resetParticle,
      Math.max(200, options.particleLimit),
    );
    this.damageNumberPool = new EntityPool(
      createDamageNumber,
      resetDamageNumber,
      Math.max(18, options.damageNumberLimit),
    );
    this.ringPool = new EntityPool(
      createImpactRing,
      resetImpactRing,
      Math.max(24, options.impactLimit ?? 24),
    );
  }

  public get poolStats(): EffectPoolStats {
    return {
      particles: this.particlePool.stats,
      damageNumbers: this.damageNumberPool.stats,
      rings: this.ringPool.stats,
    };
  }

  public setReducedMotion(reducedMotion: boolean): void {
    const enteringReducedMotion = reducedMotion && !this.reducedMotion;
    this.reducedMotion = reducedMotion;
    if (reducedMotion) {
      this.cameraAmplitude = 0;
      this.cameraRemainingMs = 0;
    }
    if (enteringReducedMotion) {
      const activeEvolutionSignatures = [...this.activeEvolutionSignatures]
        .filter(([, active]) => (
          active.authoritativeExpiresAtMs > this.clockMs
        ));
      this.particlePool.releaseAll();
      this.damageNumberPool.releaseAll();
      this.ringPool.releaseAll();
      this.particles.length = 0;
      this.damageNumbers.length = 0;
      this.rings.length = 0;
      this.activeSkillParticleBudget = null;
      for (const [id, active] of activeEvolutionSignatures) {
        this.addOrRefreshReducedEvolutionSignature(
          id,
          195,
          470,
          active.authoritativeExpiresAtMs,
        );
      }
    }
  }

  public setRenderBudget(budget: RenderBudget): void {
    assertLimit(budget.particles, 'Particle budget');
    assertLimit(budget.damageNumbers, 'Damage number budget');
    assertLimit(budget.impactRings, 'Impact ring budget');
    this.particleLimit = budget.particles;
    this.damageNumberLimit = budget.damageNumbers;
    this.impactLimit = budget.impactRings;
    this.particleSpawnScale = Math.min(1, budget.particles / 200);
    this.trim();
  }

  public get view(): EffectFrameView {
    const cameraStrength = this.reducedMotion
      ? 0
      : this.cameraAmplitude * Math.min(
        1,
        this.cameraRemainingMs / Math.max(1, this.cameraDurationMs),
      );
    return {
      particles: this.particles.map((particle) => ({
        id: particle.id,
        kind: particle.kind,
        layer: particle.layer,
        x: particle.x,
        y: particle.y,
        size: particle.size,
        color: particle.color,
        ...(particle.secondaryColor === undefined
          ? {}
          : { secondaryColor: particle.secondaryColor }),
        alpha: fade(particle.ageMs, particle.lifetimeMs),
        rotation: particle.rotation,
        progress: Math.min(
          1,
          Math.max(0, particle.ageMs / Math.max(1, particle.lifetimeMs)),
        ),
        sourceEnemyId: particle.sourceEnemyId,
        originX: particle.originX,
        originY: particle.originY,
      })),
      damageNumbers: this.damageNumbers.map((number) => ({
        id: number.id,
        x: number.x,
        y: number.y,
        value: number.value,
        critical: number.critical,
        alpha: fade(number.ageMs, number.lifetimeMs),
      })),
      rings: this.rings.map((ring) => {
        const progress = Math.min(1, ring.ageMs / ring.lifetimeMs);
        return {
          id: ring.id,
          kind: ring.kind,
          x: ring.x,
          y: ring.y,
          radius: ring.startRadius
            + (ring.endRadius - ring.startRadius) * progress,
          color: ring.color,
          alpha: 1 - progress,
          secondaryColor: ring.secondaryColor,
        };
      }),
      camera: {
        x: cameraStrength === 0
          ? 0
          : Math.sin(this.clockMs * 0.087) * cameraStrength,
        y: cameraStrength === 0
          ? 0
          : Math.cos(this.clockMs * 0.113) * cameraStrength * 0.72,
        rotation: cameraStrength === 0
          ? 0
          : Math.sin(this.clockMs * 0.053) * cameraStrength * 0.0018,
        amplitude: cameraStrength,
      },
      cinematic: {
        darken: this.darken,
        title: this.title,
        slowMotion: Math.min(1, this.slowMotionRemainingMs / 500),
      },
    };
  }

  public consume(
    events: readonly BattleEvent[],
    frame: BattleFrameView,
  ): void {
    const evolutionIds = this.triggeredEvolutionIds(events, frame);
    const hasSkillPresentation = evolutionIds.length > 0 || events.some(
      (event) => event.type === 'skill-used',
    );
    this.activeSkillParticleBudget = hasSkillPresentation
      ? this.evolutionParticleBudget()
      : null;
    if (this.reducedMotion) {
      this.addReducedEvolutionSignatures(evolutionIds, 195, 470);
    } else {
      for (const id of evolutionIds) {
        const signature = getSkillEvolutionVisualSignature(id);
        const y = signature.skillId === 'tidal-volley'
          ? 650
          : signature.skillId === 'bubble-barrier'
            ? 665
            : 430;
        this.spawnEvolutionSignature(
          id,
          195,
          y,
          frame.skillRanks[signature.skillId],
        );
      }
    }
    for (const event of events) {
      if (event.type === 'weapon-fired') {
        const projectile = frame.projectiles.find(
          (candidate) => candidate.id === event.projectileId,
        );
        const x = projectile?.x ?? 195;
        const y = projectile?.y ?? 690;
        this.spawnBurst(
          x,
          y,
          2,
          '#fff2d2',
          'brush-smear',
          260,
          1,
          'front-effects',
        );
        this.spawnBurst(
          x,
          y,
          3,
          '#efffff',
          'muzzle',
          320,
          1,
          'front-effects',
        );
      }
      if (event.type === 'projectile-hit') {
        const enemy = findEnemy(frame, event.enemyId);
        const x = enemy?.x ?? this.lastEventX;
        const y = enemy?.y ?? this.lastEventY;
        this.remember(x, y);
        this.spawnBurst(
          x,
          y,
          event.critical ? 6 : 3,
          event.critical ? '#fff0a8' : '#baf7ff',
          'brush-smear',
          420,
          event.critical ? 2 : 1,
          'front-effects',
        );
        if (event.critical) {
          this.spawnBurst(
            x,
            y,
            this.majorCount(5),
            '#fff0a8',
            'critical-shard',
            520,
            5,
            'front-effects',
          );
        }
        this.addRing(
          x,
          y,
          event.critical ? 10 : 6,
          event.critical ? 35 : 24,
          '#fff2d2',
          1,
          event.critical ? '#17344c' : undefined,
        );
        if (
          event.critical
          || event.source === 'volley'
          || event.source === 'extreme-tide'
        ) {
          this.addDamageNumber(x, y, event.damage, event.critical);
        }
      }
      if (event.type === 'enemy-armour-broken') {
        const enemy = findEnemy(frame, event.enemyId);
        const x = enemy?.x ?? this.lastEventX;
        const y = enemy?.y ?? this.lastEventY;
        this.spawnBurst(
          x,
          y,
          8,
          '#fff2df',
          'armour-shard',
          620,
          2,
          'front-effects',
        );
        if (!this.isLowQuality()) {
          this.spawnBurst(
            x,
            y,
            4,
            '#ff9c69',
            'armour-spark',
            440,
            5,
            'front-effects',
          );
        }
        this.addRing(x, y, 8, 38, '#eaffff', 2);
      }
      if (event.type === 'enemy-ranged-warning') {
        const enemy = findEnemy(frame, event.enemyId);
        const x = enemy?.x ?? this.lastEventX;
        const y = enemy?.y ?? this.lastEventY;
        this.spawnBurst(x, y, this.majorCount(5), '#ffd978', 'ranged-warning', 800, 6, 'front-effects');
        this.addRing(x, y, 18, 58, '#ff806b', 7);
      }
      if (event.type === 'enemy-ranged-fired') {
        const enemy = findEnemy(frame, event.enemyId);
        const x = enemy?.x ?? this.lastEventX;
        const y = enemy?.y ?? this.lastEventY;
        this.spawnBurst(x, y, this.majorCount(5), '#ffb36d', 'ranged-warning', 420, 6, 'front-effects');
      }
      if (event.type === 'enemy-support-pulse') {
        const source = findEnemy(frame, event.enemyId);
        const x = source?.x ?? this.lastEventX;
        const y = source?.y ?? this.lastEventY;
        this.spawnBurst(x, y, this.majorCount(7), '#9effbd', 'support-wave', 720, 6, 'front-effects');
        this.addRing(x, y, 14, 72, '#b8ffd0', 6);
        for (const targetId of event.targetIds) {
          const target = findEnemy(frame, targetId);
          if (target) this.addRing(target.x, target.y, 8, 34, '#b8f8ff', 5);
        }
      }
      if (event.type === 'elite-charge-telegraph') {
        const x = LANE_X[event.lane];
        this.spawnBurst(x, 320, this.majorCount(9), '#ff806b', 'elite-charge', event.durationMs, 8, 'front-effects');
        this.addRing(x, 320, 30, 108, '#ff735f', 8);
        this.title = '雷鳐冲锋 · 注意航道';
        this.titleRemainingMs = event.durationMs;
        this.shake(2.2, event.durationMs);
      }
      if (event.type === 'elite-exposed') {
        const enemy = findEnemy(frame, event.enemyId);
        const x = enemy?.x ?? this.lastEventX;
        const y = enemy?.y ?? this.lastEventY;
        this.spawnBurst(x, y, this.majorCount(8), '#ffe48a', 'elite-charge', event.durationMs, 8, 'front-effects');
        this.addRing(x, y, 12, 74, '#fff0a3', 8);
      }
      if (event.type === 'boss-phase-changed') {
        this.title = event.phase === 'boss-tide'
          ? '断潮航道'
          : event.phase === 'boss-enraged'
            ? '狂暴潮眼'
            : '回响召集';
        this.titleRemainingMs = 1400;
      }
      if (event.type === 'boss-tide-warning') {
        const x = LANE_X[event.safeLane];
        this.spawnBurst(x, 390, this.majorCount(10), '#69ffd1', 'boss-tide', event.durationMs, 9, 'front-effects');
        this.addRing(x, 390, 28, 120, '#79ffda', 9);
        this.title = '点按绿色安全航道';
        this.titleRemainingMs = event.durationMs;
      }
      if (event.type === 'boss-tide-impact') {
        const x = LANE_X[event.safeLane];
        this.spawnBurst(x, 500, this.majorCount(12), event.avoided ? '#8fffe1' : '#ff765e', 'boss-tide', 620, 9, 'front-effects');
        if (!event.avoided) this.shake(5, 220);
      }
      if (event.type === 'boss-weakpoint-hit') {
        const enemy = findEnemy(frame, event.enemyId);
        const x = enemy?.x ?? this.lastEventX;
        const y = enemy?.y ?? this.lastEventY;
        this.spawnBurst(x, y, this.majorCount(10), '#fff09a', 'weakpoint-burst', 620, 10, 'front-effects');
        this.spawnBurst(x, y, this.majorCount(4), '#fff4a8', 'weakpoint-flare', 480, 10, 'front-effects');
        this.addRing(x, y, 8, 62, '#fff4a8', 10, '#ff765e');
        this.addDamageNumber(x, y, event.bonusDamage, true);
        this.title = '精准破潮';
        this.titleRemainingMs = 720;
        this.shake(3.5, 120);
      }
      if (event.type === 'enemy-killed') {
        this.remember(event.x, event.y);
        const boss = event.kind === 'deep-echo-boss';
        const count = boss
          ? 14
          : event.kind === 'storm-ray-elite'
            ? 9
            : 6;
        this.spawnDefeatSquash(event.enemyId, event.x, event.y, boss);
        this.spawnBurst(
          event.x,
          event.y,
          count,
          event.kind === 'storm-ray-elite'
            ? '#ac9cff'
            : '#b9f6ff',
          'ink-bubble',
          boss ? 1100 : 720,
          4,
          'front-effects',
        );
        this.addRing(
          event.x,
          event.y,
          12,
          event.kind === 'deep-echo-boss' ? 96 : 44,
          '#fff2d2',
          3,
          '#17344c',
        );
        this.shake(event.kind === 'deep-echo-boss' ? 6 : 2.4, 180);
      }
      if (event.type === 'loot-created') {
        const loot = frame.loot.find(
          (candidate) => candidate.id === event.lootId,
        );
        this.spawnBurst(
          loot?.x ?? this.lastEventX,
          loot?.y ?? this.lastEventY,
          4,
          event.kind === 'experience' ? '#d9fff7' : '#ffd37f',
          'loot',
          700,
          1,
          'enemies',
        );
      }
      if (event.type === 'loot-collected') {
        this.spawnBurst(
          195,
          724,
          5,
          event.kind === 'experience' ? '#c8fff2' : '#ffd37f',
          'core-pulse',
          520,
          2,
          'front-effects',
        );
        this.addRing(195, 724, 8, 34, '#dffff9', 2);
      }
      if (event.type === 'skill-used') {
        const isExtreme = event.skillId === 'extreme-tide';
        const rank = frame.skillRanks[event.skillId];
        if (this.reducedMotion) {
          // Variant silhouettes are allocated before all animated rank layers.
        } else if (event.skillId === 'tidal-volley') {
          this.spawnRankBurst(195, 680, this.rankCount(rank, 3, 5, 7), '#65edff', 'rank-volley-trail', 480, 5, rank);
        } else if (event.skillId === 'bubble-barrier') {
          const rings = this.rankCount(rank, 1, 3, 5);
          for (let index = 0; index < rings; index += 1) {
            this.addRing(195, 700, 22 + rank * 4 + index * 10, 54 + rank * 8 + index * 14, '#74f5cf', 6, '#e7c66e', 'barrier-membrane');
          }
        } else {
          this.spawnRankBurst(195, 470, this.rankCount(rank, 8, 12, 16), '#ffd793', 'extreme-radial-stroke', 720, 5, rank);
        }
        if (!this.reducedMotion && !this.isLowQuality()) {
          this.spawnSkillBurst(
            195,
            isExtreme ? 470 : 700,
            isExtreme ? 16 : 8,
            isExtreme ? '#b5efff' : '#b9fff4',
            'skill',
            isExtreme ? 900 : 620,
            isExtreme ? 4 : 3,
            'front-effects',
          );
          this.addRing(
            195,
            isExtreme ? 470 : 700,
            18,
            isExtreme ? 180 : 74,
            '#e8ffff',
            4,
          );
          if (isExtreme) this.shake(6, 180);
        }
      }
      if (event.type === 'extreme-second-crest') {
        this.addDamageNumber(195, 430, event.amount, false);
      }
      if (event.type === 'elite-entered') {
        this.title = '精英潮兽来袭';
        this.titleRemainingMs = 1500;
        this.spawnWarningBurst(195, 154, 8);
        this.shake(3, 180);
      }
      if (event.type === 'boss-intro-started') {
        this.title = '深海回响正在靠近';
        this.titleRemainingMs = 6000;
        this.darken = 0.58;
        this.darkenRemainingMs = 6000;
        this.spawnWarningBurst(195, 170, 14);
        this.addRing(
          195,
          260,
          24,
          168,
          '#ff7b72',
          10,
          '#706cff',
          'boss-entrance-ripple',
        );
      }
      if (event.type === 'boss-charge-started') {
        this.title = '潮压冲锋';
        this.titleRemainingMs = event.durationMs;
        this.spawnWarningBurst(195, 390, 10);
        this.shake(2.5, event.durationMs);
      }
      if (event.type === 'battle-won') {
        this.slowMotionRemainingMs = 500;
        this.title = '航线突破';
        this.titleRemainingMs = 1400;
        this.spawnBurst(
          195,
          330,
          20,
          '#fff0aa',
          'skill',
          1200,
          5,
          'front-effects',
        );
      }
      if (event.type === 'battle-lost') {
        this.darken = 0.5;
        this.darkenRemainingMs = 1000;
      }
    }
    this.activeSkillParticleBudget = null;
    this.trim();
  }

  public update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new Error('Effect delta must be finite and non-negative');
    }
    this.clockMs += deltaMs;
    const deltaSeconds = deltaMs / 1000;
    for (const particle of this.particles) {
      particle.ageMs += deltaMs;
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      particle.vy += 42 * deltaSeconds;
      particle.rotation += particle.spin * deltaSeconds;
    }
    for (const number of this.damageNumbers) {
      number.ageMs += deltaMs;
      number.y -= 32 * deltaSeconds;
    }
    for (const ring of this.rings) ring.ageMs += deltaMs;
    this.releaseExpiredEffects();
    this.cameraRemainingMs = Math.max(
      0,
      this.cameraRemainingMs - deltaMs,
    );
    if (this.cameraRemainingMs === 0) this.cameraAmplitude = 0;
    this.titleRemainingMs = Math.max(0, this.titleRemainingMs - deltaMs);
    if (this.titleRemainingMs === 0) this.title = null;
    this.darkenRemainingMs = Math.max(
      0,
      this.darkenRemainingMs - deltaMs,
    );
    if (this.darkenRemainingMs === 0) this.darken = 0;
    this.slowMotionRemainingMs = Math.max(
      0,
      this.slowMotionRemainingMs - deltaMs,
    );
    for (const [id, active] of this.activeEvolutionSignatures) {
      if (active.authoritativeExpiresAtMs <= this.clockMs) {
        this.activeEvolutionSignatures.delete(id);
      }
    }
  }

  public reset(): void {
    this.particlePool.releaseAll();
    this.damageNumberPool.releaseAll();
    this.ringPool.releaseAll();
    this.particles.length = 0;
    this.damageNumbers.length = 0;
    this.rings.length = 0;
    this.cameraAmplitude = 0;
    this.cameraRemainingMs = 0;
    this.title = null;
    this.titleRemainingMs = 0;
    this.darken = 0;
    this.darkenRemainingMs = 0;
    this.slowMotionRemainingMs = 0;
    this.nextId = 1;
    this.clockMs = 0;
    this.cameraDurationMs = 1;
    this.lastShakeAtMs = -Infinity;
    this.lastEventX = 195;
    this.lastEventY = 360;
    this.activeSkillParticleBudget = null;
    this.activeEvolutionSignatures.clear();
  }

  private spawnBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    kind: EffectParticleKind,
    lifetimeMs: number,
    priority: number,
    layer: EffectParticleView['layer'],
    maximumCount = Number.POSITIVE_INFINITY,
  ): number {
    const scaledCount = this.particleLimit <= 0
      ? 0
      : Math.min(
          maximumCount,
          Math.max(1, Math.floor(count * this.particleSpawnScale)),
        );
    for (let index = 0; index < scaledCount; index += 1) {
      const id = this.nextId++;
      const angle = id * 2.399963 + index * 0.31;
      const speed = 34 + id % 5 * 13;
      const particle = this.particlePool.acquire();
      particle.id = id;
      particle.kind = kind;
      particle.layer = layer;
      particle.color = color;
      particle.secondaryColor = undefined;
      particle.size = 2.5 + id % 4 * 1.1;
      particle.lifetimeMs = lifetimeMs;
      particle.priority = priority;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed - 18;
      particle.rotation = angle;
      particle.spin =
        (id % 2 === 0 ? 1 : -1) * (1.2 + id % 4);
      particle.ageMs = 0;
      particle.sourceEnemyId = null;
      particle.originX = x;
      particle.originY = y;
      this.particles.push(particle);
    }
    return scaledCount;
  }

  private spawnSkillBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    kind: EffectParticleKind,
    lifetimeMs: number,
    priority: number,
    layer: EffectParticleView['layer'],
  ): void {
    const maximumCount = this.activeSkillParticleBudget
      ?? Number.POSITIVE_INFINITY;
    const spawned = this.spawnBurst(
      x,
      y,
      count,
      color,
      kind,
      lifetimeMs,
      priority,
      layer,
      maximumCount,
    );
    if (this.activeSkillParticleBudget !== null) {
      this.activeSkillParticleBudget = Math.max(
        0,
        this.activeSkillParticleBudget - spawned,
      );
    }
  }

  private spawnRankBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    kind: EffectParticleKind,
    lifetimeMs: number,
    priority: number,
    rank: number,
  ): void {
    const firstParticleIndex = this.particles.length;
    this.spawnSkillBurst(
      x,
      y,
      count,
      color,
      kind,
      lifetimeMs,
      priority,
      'front-effects',
    );
    for (
      let index = firstParticleIndex;
      index < this.particles.length;
      index += 1
    ) {
      const particle = this.particles[index];
      if (particle) particle.size = 3.6 + (rank - 1) * 0.6;
    }
  }

  private spawnEvolutionSignature(
    id: SkillVariantId,
    x: number,
    y: number,
    rank: number,
  ): void {
    if (
      this.particleLimit <= 0
      || this.activeSkillParticleBudget === 0
    ) return;
    const signature = getSkillEvolutionVisualSignature(id);
    const catalogIndex = SKILL_VARIANT_IDS.indexOf(id);
    const offsetX = (catalogIndex % 4 - 1.5) * 6;
    const offsetY = (Math.floor(catalogIndex / 4) - 1) * 5;
    const angle = (catalogIndex + 1) * 0.71;
    const lifetimeMs = 480 + rank * 60;
    const particle = this.particlePool.acquire();
    particle.id = this.nextId++;
    particle.kind = signature.particleKind;
    particle.layer = 'front-effects';
    particle.color = signature.primary;
    particle.secondaryColor = signature.secondary;
    particle.size = 3.2 + rank * 0.65;
    particle.lifetimeMs = lifetimeMs;
    particle.priority = EVOLUTION_MAIN_MOTIF_PRIORITY;
    particle.x = x + offsetX;
    particle.y = y + offsetY;
    particle.vx = Math.cos(angle) * (18 + catalogIndex % 3 * 4);
    particle.vy = Math.sin(angle) * 16 - 12;
    particle.rotation = angle;
    particle.spin = (catalogIndex % 2 === 0 ? 1 : -1) * 1.4;
    particle.ageMs = 0;
    particle.sourceEnemyId = null;
    particle.originX = x;
    particle.originY = y;
    this.particles.push(particle);
    this.activeEvolutionSignatures.set(id, {
      authoritativeExpiresAtMs: this.clockMs + lifetimeMs,
    });
    if (this.activeSkillParticleBudget !== null) {
      this.activeSkillParticleBudget -= 1;
    }
  }

  private addReducedEvolutionSignatures(
    ids: readonly SkillVariantId[],
    x: number,
    y: number,
  ): void {
    for (const id of ids) {
      const authoritativeExpiresAtMs = this.clockMs + 420;
      this.activeEvolutionSignatures.set(id, {
        authoritativeExpiresAtMs,
      });
      this.addOrRefreshReducedEvolutionSignature(
        id,
        x,
        y,
        authoritativeExpiresAtMs,
      );
    }
  }

  private addOrRefreshReducedEvolutionSignature(
    id: SkillVariantId,
    x: number,
    y: number,
    authoritativeExpiresAtMs: number,
  ): void {
    const signature = getSkillEvolutionVisualSignature(id);
    const catalogIndex = SKILL_VARIANT_IDS.indexOf(id);
    const radius = 38 + catalogIndex * 4;
    const signatureY = signature.skillId === 'extreme-tide'
      ? y - 40
      : signature.skillId === 'tidal-volley'
        ? y + 180
        : y + 168;
    const displayExpiresAtMs = Math.min(
      authoritativeExpiresAtMs,
      this.clockMs + 420,
    );
    const remainingMs = displayExpiresAtMs - this.clockMs;
    if (remainingMs <= 0) return;
    const existing = this.rings.find((ring) => ring.evolutionId === id);
    if (existing) {
      existing.x = x;
      existing.y = signatureY;
      existing.color = signature.primary;
      existing.secondaryColor = signature.secondary;
      existing.startRadius = radius;
      existing.endRadius = radius;
      existing.lifetimeMs = remainingMs;
      existing.priority = 100;
      existing.ageMs = 0;
      existing.evolutionExpiresAtMs = displayExpiresAtMs;
    } else {
      this.addRing(
        x,
        signatureY,
        radius,
        radius,
        signature.primary,
        100,
        signature.secondary,
        signature.reducedMotionRingKind,
        id,
        remainingMs,
        displayExpiresAtMs,
      );
    }
  }

  private triggeredEvolutionIds(
    events: readonly BattleEvent[],
    frame: BattleFrameView,
  ): readonly SkillVariantId[] {
    return SKILL_VARIANT_IDS.filter((id) => {
      const signature = getSkillEvolutionVisualSignature(id);
      if (!frame.skillVariants[signature.skillId].includes(id)) return false;
      return events.some((event) => evolutionEventTriggers(id, event));
    });
  }

  private evolutionParticleBudget(): number {
    if (this.particleLimit >= 200) return 30;
    if (this.particleLimit >= 130) return 20;
    return 12;
  }

  private spawnWarningBurst(x: number, y: number, count: number): void {
    this.spawnBurst(
      x,
      y,
      count,
      '#ff9f89',
      'warning',
      900,
      4,
      'front-effects',
    );
    this.addRing(x, y, 18, 110, '#ffb49f', 4);
  }

  private rankCount(rank: number, low: number, medium: number, high: number): number {
    if (this.isLowQuality()) return 1;
    if (rank === 3) return medium;
    return Math.round(low + (high - low) * (rank - 1) / 4);
  }

  private majorCount(count: number): number {
    return this.isLowQuality() ? 1 : count;
  }

  private isLowQuality(): boolean {
    return this.particleLimit <= 80;
  }

  private spawnDefeatSquash(
    enemyId: number,
    x: number,
    y: number,
    boss: boolean,
  ): void {
    if (this.particleLimit <= 0) return;
    const particle = this.particlePool.acquire();
    particle.id = this.nextId++;
    particle.kind = 'defeat-squash';
    particle.layer = 'front-effects';
    particle.color = boss ? '#243f67' : '#315c70';
    particle.size = boss ? 42 : 24;
    particle.lifetimeMs = boss ? 420 : 260;
    particle.priority = 8;
    particle.x = x;
    particle.y = y;
    particle.vx = 0;
    particle.vy = 0;
    particle.rotation = 0;
    particle.spin = 0;
    particle.ageMs = 0;
    particle.sourceEnemyId = enemyId;
    particle.originX = x;
    particle.originY = y;
    this.particles.push(particle);
  }

  private addDamageNumber(
    x: number,
    y: number,
    value: number,
    critical: boolean,
  ): void {
    if (this.damageNumberLimit <= 0) return;
    const number = this.damageNumberPool.acquire();
    number.id = this.nextId++;
    number.x = x;
    number.y = y - 18;
    number.value = Math.max(0, Math.floor(value));
    number.critical = critical;
    number.lifetimeMs = critical ? 900 : 720;
    number.ageMs = 0;
    this.damageNumbers.push(number);
  }

  private addRing(
    x: number,
    y: number,
    startRadius: number,
    endRadius: number,
    color = '#fff2d2',
    priority = 1,
    secondaryColor?: string,
    kind: MutableImpactRing['kind'] = 'impact-ring',
    evolutionId: SkillVariantId | null = null,
    lifetimeMs = 420,
    evolutionExpiresAtMs: number | null = null,
  ): void {
    if (this.impactLimit <= 0) return;
    const ring = this.ringPool.acquire();
    ring.id = this.nextId++;
    ring.kind = kind;
    ring.evolutionId = evolutionId;
    ring.evolutionExpiresAtMs = evolutionExpiresAtMs;
    ring.x = x;
    ring.y = y;
    ring.color = color;
    ring.secondaryColor = secondaryColor;
    ring.startRadius = startRadius;
    ring.endRadius = endRadius;
    ring.lifetimeMs = lifetimeMs;
    ring.priority = priority;
    ring.ageMs = 0;
    this.rings.push(ring);
  }

  private shake(amplitude: number, durationMs: number): void {
    if (this.reducedMotion) return;
    const merged = this.clockMs - this.lastShakeAtMs <= 120;
    this.cameraAmplitude = merged
      ? Math.max(this.cameraAmplitude, amplitude)
      : Math.max(this.cameraAmplitude * 0.5, amplitude);
    this.cameraAmplitude = Math.min(6, this.cameraAmplitude);
    this.cameraDurationMs = Math.max(1, durationMs);
    this.cameraRemainingMs = Math.max(
      this.cameraRemainingMs,
      durationMs,
    );
    this.lastShakeAtMs = this.clockMs;
  }

  private remember(x: number, y: number): void {
    this.lastEventX = x;
    this.lastEventY = y;
  }

  private trim(): void {
    trimByPriority(
      this.particles,
      this.particleLimit,
      this.particlePool,
    );
    while (this.damageNumbers.length > this.damageNumberLimit) {
      const removed = this.damageNumbers.shift();
      if (removed) this.damageNumberPool.release(removed);
    }
    trimByPriority(
      this.rings,
      Math.max(
        this.impactLimit,
        new Set(this.rings.flatMap((ring) => (
          ring.evolutionId === null ? [] : [ring.evolutionId]
        ))).size,
      ),
      this.ringPool,
    );
  }

  private releaseExpiredEffects(): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      if (!particle || particle.ageMs < particle.lifetimeMs) continue;
      this.particles.splice(index, 1);
      this.particlePool.release(particle);
    }
    for (
      let index = this.damageNumbers.length - 1;
      index >= 0;
      index -= 1
    ) {
      const number = this.damageNumbers[index];
      if (!number || number.ageMs < number.lifetimeMs) continue;
      this.damageNumbers.splice(index, 1);
      this.damageNumberPool.release(number);
    }
    for (let index = this.rings.length - 1; index >= 0; index -= 1) {
      const ring = this.rings[index];
      if (!ring || ring.ageMs < ring.lifetimeMs) continue;
      this.rings.splice(index, 1);
      if (
        ring.evolutionId !== null
        && ring.evolutionExpiresAtMs !== null
      ) {
        const active = this.activeEvolutionSignatures.get(ring.evolutionId);
        if (
          active?.authoritativeExpiresAtMs === ring.evolutionExpiresAtMs
          && active.authoritativeExpiresAtMs <= this.clockMs
        ) {
          this.activeEvolutionSignatures.delete(ring.evolutionId);
        }
      }
      this.ringPool.release(ring);
    }
  }
}

function findEnemy(
  frame: BattleFrameView,
  enemyId: number,
): EnemyState | undefined {
  return frame.enemies.find((enemy) => enemy.id === enemyId);
}

function evolutionEventTriggers(
  id: SkillVariantId,
  event: BattleEvent,
): boolean {
  if (id === 'bursting-bubble') return event.type === 'barrier-burst';
  if (id === 'emergency-trigger') {
    return event.type === 'barrier-emergency-triggered';
  }
  if (id === 'undertow-eye') return event.type === 'extreme-pull-started';
  if (id === 'lingering-vortex') {
    return event.type === 'extreme-vortex-started';
  }
  if (id === 'energy-return') {
    return event.type === 'extreme-energy-refunded';
  }
  if (id === 'double-crest') return event.type === 'extreme-second-crest';
  return event.type === 'skill-used'
    && event.skillId === getSkillEvolutionVisualSignature(id).skillId;
}

function trimByPriority<
  T extends { readonly id: number; readonly priority: number },
>(
  items: T[],
  limit: number,
  pool: EntityPool<T>,
): void {
  if (items.length <= limit) return;
  const remove = new Set(
    [...items]
      .sort((left, right) => (
        left.priority - right.priority || left.id - right.id
      ))
      .slice(0, items.length - limit)
      .map((item) => item.id),
  );
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || !remove.has(item.id)) continue;
    items.splice(index, 1);
    pool.release(item);
  }
}

function fade(ageMs: number, lifetimeMs: number): number {
  const progress = Math.min(1, ageMs / Math.max(1, lifetimeMs));
  if (progress < 0.18) return progress / 0.18;
  return 1 - (progress - 0.18) / 0.82;
}

function assertLimit(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function createParticle(): MutableParticle {
  return {
    id: 0,
    kind: 'muzzle',
    layer: 'front-effects',
    color: '',
    secondaryColor: undefined,
    size: 0,
    lifetimeMs: 0,
    priority: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    rotation: 0,
    spin: 0,
    ageMs: 0,
    sourceEnemyId: null,
    originX: 0,
    originY: 0,
  };
}

function resetParticle(particle: MutableParticle): void {
  particle.id = 0;
  particle.kind = 'muzzle';
  particle.layer = 'front-effects';
  particle.color = '';
  particle.secondaryColor = undefined;
  particle.size = 0;
  particle.lifetimeMs = 0;
  particle.priority = 0;
  particle.x = 0;
  particle.y = 0;
  particle.vx = 0;
  particle.vy = 0;
  particle.rotation = 0;
  particle.spin = 0;
  particle.ageMs = 0;
  particle.sourceEnemyId = null;
  particle.originX = 0;
  particle.originY = 0;
}

function createDamageNumber(): MutableDamageNumber {
  return {
    id: 0,
    value: 0,
    critical: false,
    lifetimeMs: 0,
    x: 0,
    y: 0,
    ageMs: 0,
  };
}

function resetDamageNumber(number: MutableDamageNumber): void {
  number.id = 0;
  number.value = 0;
  number.critical = false;
  number.lifetimeMs = 0;
  number.x = 0;
  number.y = 0;
  number.ageMs = 0;
}

function createImpactRing(): MutableImpactRing {
  return {
    id: 0,
    kind: 'impact-ring',
    evolutionId: null,
    evolutionExpiresAtMs: null,
    x: 0,
    y: 0,
    color: '',
    secondaryColor: undefined,
    startRadius: 0,
    endRadius: 0,
    lifetimeMs: 0,
    priority: 0,
    ageMs: 0,
  };
}

function resetImpactRing(ring: MutableImpactRing): void {
  ring.id = 0;
  ring.kind = 'impact-ring';
  ring.evolutionId = null;
  ring.evolutionExpiresAtMs = null;
  ring.x = 0;
  ring.y = 0;
  ring.color = '';
  ring.secondaryColor = undefined;
  ring.startRadius = 0;
  ring.endRadius = 0;
  ring.lifetimeMs = 0;
  ring.priority = 0;
  ring.ageMs = 0;
}
