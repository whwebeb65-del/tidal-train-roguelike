import type {
  BattleEvent,
  BattleFrameView,
  EnemyState,
} from './BattleTypes';
import {
  EntityPool,
  type EntityPoolStats,
} from './EntityPool';

export type EffectParticleKind =
  | 'muzzle'
  | 'splash'
  | 'armour-shard'
  | 'defeat-shard'
  | 'loot'
  | 'skill'
  | 'warning'
  | 'core-pulse';

export interface EffectParticleView {
  readonly id: number;
  readonly kind: EffectParticleKind;
  readonly layer: 'enemies' | 'front-effects';
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: string;
  readonly alpha: number;
  readonly rotation: number;
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
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  readonly alpha: number;
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
  x: number;
  y: number;
  color: string;
  startRadius: number;
  endRadius: number;
  lifetimeMs: number;
  priority: number;
  ageMs: number;
}

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

  public constructor(private readonly options: EffectSystemOptions) {
    assertLimit(options.particleLimit, 'Particle limit');
    assertLimit(options.damageNumberLimit, 'Damage number limit');
    assertLimit(options.impactLimit ?? 24, 'Impact limit');
    this.reducedMotion = options.reducedMotion;
    this.particlePool = new EntityPool(
      createParticle,
      resetParticle,
      options.particleLimit,
    );
    this.damageNumberPool = new EntityPool(
      createDamageNumber,
      resetDamageNumber,
      options.damageNumberLimit,
    );
    this.ringPool = new EntityPool(
      createImpactRing,
      resetImpactRing,
      options.impactLimit ?? 24,
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
    this.reducedMotion = reducedMotion;
    if (reducedMotion) {
      this.cameraAmplitude = 0;
      this.cameraRemainingMs = 0;
    }
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
        alpha: fade(particle.ageMs, particle.lifetimeMs),
        rotation: particle.rotation,
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
          x: ring.x,
          y: ring.y,
          radius: ring.startRadius
            + (ring.endRadius - ring.startRadius) * progress,
          color: ring.color,
          alpha: 1 - progress,
        };
      }),
      camera: {
        x: Math.sin(this.clockMs * 0.087) * cameraStrength,
        y: Math.cos(this.clockMs * 0.113) * cameraStrength * 0.72,
        rotation: Math.sin(this.clockMs * 0.053)
          * cameraStrength
          * 0.0018,
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
    for (const event of events) {
      if (event.type === 'weapon-fired') {
        const projectile = frame.projectiles.find(
          (candidate) => candidate.id === event.projectileId,
        );
        this.spawnBurst(
          projectile?.x ?? 195,
          projectile?.y ?? 690,
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
          'splash',
          420,
          event.critical ? 2 : 1,
          'front-effects',
        );
        this.addRing(x, y, event.critical ? 10 : 6, event.critical ? 35 : 24);
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
        this.addRing(x, y, 8, 38, '#eaffff', 2);
      }
      if (event.type === 'enemy-killed') {
        this.remember(event.x, event.y);
        const count = event.kind === 'deep-echo-boss' ? 12 : 8;
        this.spawnBurst(
          event.x,
          event.y,
          count,
          event.kind === 'storm-ray-elite'
            ? '#ac9cff'
            : '#b9f6ff',
          'defeat-shard',
          event.kind === 'deep-echo-boss' ? 1100 : 720,
          event.kind === 'deep-echo-boss' ? 4 : 2,
          'front-effects',
        );
        this.addRing(
          event.x,
          event.y,
          12,
          event.kind === 'deep-echo-boss' ? 96 : 44,
          '#efffff',
          3,
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
        this.spawnBurst(
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
  ): void {
    for (let index = 0; index < count; index += 1) {
      const id = this.nextId++;
      const angle = id * 2.399963 + index * 0.31;
      const speed = 34 + id % 5 * 13;
      const particle = this.particlePool.acquire();
      particle.id = id;
      particle.kind = kind;
      particle.layer = layer;
      particle.color = color;
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
      this.particles.push(particle);
    }
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

  private addDamageNumber(
    x: number,
    y: number,
    value: number,
    critical: boolean,
  ): void {
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
    color = '#cfffff',
    priority = 1,
  ): void {
    const ring = this.ringPool.acquire();
    ring.id = this.nextId++;
    ring.x = x;
    ring.y = y;
    ring.color = color;
    ring.startRadius = startRadius;
    ring.endRadius = endRadius;
    ring.lifetimeMs = 420;
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
      this.options.particleLimit,
      this.particlePool,
    );
    while (this.damageNumbers.length > this.options.damageNumberLimit) {
      const removed = this.damageNumbers.shift();
      if (removed) this.damageNumberPool.release(removed);
    }
    trimByPriority(
      this.rings,
      this.options.impactLimit ?? 24,
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
  };
}

function resetParticle(particle: MutableParticle): void {
  particle.id = 0;
  particle.kind = 'muzzle';
  particle.layer = 'front-effects';
  particle.color = '';
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
    x: 0,
    y: 0,
    color: '',
    startRadius: 0,
    endRadius: 0,
    lifetimeMs: 0,
    priority: 0,
    ageMs: 0,
  };
}

function resetImpactRing(ring: MutableImpactRing): void {
  ring.id = 0;
  ring.x = 0;
  ring.y = 0;
  ring.color = '';
  ring.startRadius = 0;
  ring.endRadius = 0;
  ring.lifetimeMs = 0;
  ring.priority = 0;
  ring.ageMs = 0;
}
