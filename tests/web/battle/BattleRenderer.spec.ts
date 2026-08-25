import { describe, expect, it } from 'vitest';
import { BattleRenderer } from '../../../web/battle/BattleRenderer';
import {
  EffectSystem,
  type EffectParticleView,
  EffectFrameView,
  EffectParticleKind,
} from '../../../web/battle/EffectSystem';
import { TrainMotionController } from '../../../web/battle/TrainMotionController';
import type {
  BattleDrawCommand,
  EllipseDrawCommand,
  ImageDrawCommand,
  LineDrawCommand,
} from '../../../web/battle/BattleDrawTypes';
import {
  byBattleLayer,
  createFrameFixture,
  createPresentationFixture,
} from './helpers/BattleFixtures';
import { createRecordingPainter } from './helpers/RecordingPainter';
import { getRenderBudget } from '../../../web/battle/QualityMonitor';
import type { QualityLevel } from '../../../web/battle/QualityMonitor';
import {
  ENEMY_GEOMETRY,
  enemySpawnY,
} from '../../../web/battle/EnemyGeometry';
import type {
  BattleEvent,
  EnemyBehaviourPhase,
  EnemyKind,
  EnemyState,
} from '../../../web/battle/BattleTypes';
import {
  SKILL_VARIANT_IDS,
  type SkillVariantId,
} from '../../../src/domain/skill/SkillProgressionTypes';
import {
  getSkillEvolutionVisualSignature,
} from '../../../web/battle/SkillEvolutionVisualCatalog';

interface TestPose {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotation: number;
}

function renderCommands(
  input: Parameters<typeof createPresentationFixture>[0] = {},
): BattleDrawCommand[] {
  const painter = createRecordingPainter();
  new BattleRenderer(painter).render(createPresentationFixture(input));
  return painter.commands;
}

const BOSS_TELEGRAPH_KINDS = new Set([
  'boss-summon-beacon', 'boss-summon-echo',
  'boss-safe-lane', 'boss-danger-lane', 'boss-current-chevron',
  'boss-tide-countdown', 'boss-enraged-aura', 'boss-weakpoint',
  'boss-weakpoint-petal', 'boss-weakpoint-countdown',
]);

function renderBossPhase(
  phase: Extract<EnemyBehaviourPhase, 'boss-summon' | 'boss-tide' | 'boss-enraged'>,
  options: {
    readonly quality?: QualityLevel;
    readonly timeMs?: number;
    readonly reducedMotion?: boolean;
    readonly phaseRemainingMs?: number;
    readonly safeLane?: 0 | 1 | 2;
    readonly weakPointOpen?: boolean;
  } = {},
): BattleDrawCommand[] {
  const boss: EnemyState = {
    id: 77, kind: 'deep-echo-boss', lane: 1, x: 195, y: 250,
    hp: 800, maxHp: 1000, shield: 0, speedPerSecond: 0,
    defenceBroken: false, attackCooldownMs: 1000, ageMs: 0, alive: true,
    behaviour: {
      phase,
      phaseRemainingMs: options.phaseRemainingMs ?? (phase === 'boss-summon' ? 4000 : phase === 'boss-tide' ? 600 : 700),
      cycle: 3, targetLane: 1, safeLane: options.safeLane ?? 1,
      invulnerable: false,
      damageTakenMultiplier: phase === 'boss-enraged' ? 1.1 : 1,
      weakPointOpen: options.weakPointOpen ?? phase === 'boss-enraged',
    },
  };
  const input = createPresentationFixture({
    frame: { enemies: [boss], projectiles: [], loot: [] },
    timeMs: options.timeMs ?? 900,
    reducedMotion: options.reducedMotion ?? false,
  });
  const painter = createRecordingPainter();
  new BattleRenderer(painter).render({
    ...input,
    renderBudget: getRenderBudget(options.quality ?? 'high'),
  });
  return painter.commands;
}

function isBossTelegraphCommand(command: BattleDrawCommand): boolean {
  return BOSS_TELEGRAPH_KINDS.has(command.kind);
}

function onlyBossTelegraphCommands(commands: readonly BattleDrawCommand[]) {
  return commands.filter(isBossTelegraphCommand);
}

function commandMaxY(command: BattleDrawCommand): readonly number[] {
  if ('points' in command) {
    return command.points.map((point) => point.y + (command.lineWidth ?? 0) / 2);
  }
  if ('radiusY' in command) return [command.y + command.radiusY + (command.lineWidth ?? 0) / 2];
  return [];
}

function findCommand<T extends BattleDrawCommand>(
  commands: readonly BattleDrawCommand[],
  predicate: (command: BattleDrawCommand) => boolean,
): T {
  const command = commands.find(predicate);
  expect(command).toBeDefined();
  return command as T;
}

function expectSharedPose(
  before: ImageDrawCommand | EllipseDrawCommand,
  after: ImageDrawCommand | EllipseDrawCommand,
  pose: TestPose,
): void {
  const cosine = Math.cos(pose.rotation);
  const sine = Math.sin(pose.rotation);
  const expectedX = 195 + pose.offsetX
    + (before.x - 195) * cosine
    - (before.y - 842) * sine;
  const expectedY = 842 + pose.offsetY
    + (before.x - 195) * sine
    + (before.y - 842) * cosine;
  expect(after.x).toBeCloseTo(expectedX, 6);
  expect(after.y).toBeCloseTo(expectedY, 6);
  expect(after.rotation ?? 0).toBeCloseTo(
    (before.rotation ?? 0) + pose.rotation,
    6,
  );
}

function pointPairs(command: LineDrawCommand): readonly (readonly number[])[] {
  return command.points.map((point) => [point.x, point.y]);
}

function authoritativeEvolutionEvents(id: SkillVariantId): readonly BattleEvent[] {
  if (id === 'bursting-bubble') return [{ type: 'barrier-burst' }];
  if (id === 'emergency-trigger') {
    return [{ type: 'barrier-emergency-triggered', effectRatio: 0.6 }];
  }
  if (id === 'undertow-eye') {
    return [{ type: 'extreme-pull-started', durationMs: 2000 }];
  }
  if (id === 'lingering-vortex') {
    return [{ type: 'extreme-vortex-started', durationMs: 4000 }];
  }
  if (id === 'energy-return') {
    return [{ type: 'extreme-energy-refunded', amount: 2 }];
  }
  if (id === 'double-crest') {
    return [{ type: 'extreme-second-crest', durationMs: 1200, amount: 45 }];
  }
  return [{
    type: 'skill-used',
    skillId: getSkillEvolutionVisualSignature(id).skillId,
  }];
}

function commandHasVisibleColor(
  command: BattleDrawCommand,
  color: string,
): boolean {
  if ((command.alpha ?? 1) <= 0) return false;
  if ('points' in command) {
    return command.points.length >= 2
      && command.lineWidth > 0
      && command.stroke === color;
  }
  return 'radiusX' in command
    && command.radiusX > 0
    && command.radiusY > 0
    && (command.stroke === color || command.fill === color);
}

function commandBounds(
  commands: readonly BattleDrawCommand[],
  kind: string,
): {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
} {
  const points: { readonly x: number; readonly y: number }[] = [];
  for (const command of commands.filter((item) => item.kind === kind)) {
    if ('points' in command) {
      const padding = command.lineWidth / 2;
      for (const point of command.points) {
        points.push(
          { x: point.x - padding, y: point.y - padding },
          { x: point.x + padding, y: point.y + padding },
        );
      }
      continue;
    }
    if ('radiusX' in command) {
      const cosine = Math.cos(command.rotation ?? 0);
      const sine = Math.sin(command.rotation ?? 0);
      const padding = (command.lineWidth ?? 0) / 2;
      const halfWidth = Math.hypot(
        command.radiusX * cosine,
        command.radiusY * sine,
      ) + padding;
      const halfHeight = Math.hypot(
        command.radiusX * sine,
        command.radiusY * cosine,
      ) + padding;
      points.push(
        { x: command.x - halfWidth, y: command.y - halfHeight },
        { x: command.x + halfWidth, y: command.y + halfHeight },
      );
    }
  }
  expect(points.length).toBeGreaterThan(0);
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function distanceToSegment(
  x: number,
  y: number,
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared));
  return Math.hypot(x - (start.x + dx * amount), y - (start.y + dy * amount));
}

function trainSignatureFeature(commands: readonly BattleDrawCommand[]) {
  const sample = { x: 179, y: 683, width: 32, height: 32 };
  const brightLines = commands.filter((command): command is LineDrawCommand => {
    if (!('points' in command)) return false;
    const rgba = command.stroke.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/);
    const hex = command.stroke.match(/^#([\da-f]{6})$/i);
    const color = rgba
      ? [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])]
      : hex
        ? [
          Number.parseInt(hex[1]!.slice(0, 2), 16),
          Number.parseInt(hex[1]!.slice(2, 4), 16),
          Number.parseInt(hex[1]!.slice(4, 6), 16),
          1,
        ]
        : [0, 0, 0, 0];
    return color[0]! >= 210
      && color[1]! >= 235
      && color[2]! >= 235
      && color[3]! * (command.alpha ?? 1) >= 0.7;
  });
  let bright = 0;
  let centerBright = 0;
  for (let row = 0; row < sample.height; row += 1) {
    for (let column = 0; column < sample.width; column += 1) {
      const x = sample.x + column + 0.5;
      const y = sample.y + row + 0.5;
      const occupied = brightLines.some((line) => line.points.slice(1).some(
        (point, index) => distanceToSegment(x, y, line.points[index]!, point) <= line.lineWidth / 2,
      ));
      if (!occupied) continue;
      bright += 1;
      if (column >= 8 && column < 24 && row >= 8 && row < 24) centerBright += 1;
    }
  }
  return {
    brightCyanFraction: bright / (sample.width * sample.height),
    centerBrightFraction: centerBright / (16 * 16),
  };
}

describe('BattleRenderer', () => {
  it.each([
    ['boss-summon', ['boss-summon-beacon', 'boss-summon-echo']],
    ['boss-tide', ['boss-safe-lane', 'boss-danger-lane', 'boss-current-chevron', 'boss-tide-countdown']],
    ['boss-enraged', ['boss-enraged-aura', 'boss-weakpoint-petal', 'boss-weakpoint-countdown']],
  ] as const)('draws a distinct %s world telegraph', (phase, expectedKinds) => {
    const commands = renderBossPhase(phase, { quality: 'high' });
    expect(commands.map((command) => command.kind)).toEqual(expect.arrayContaining([...expectedKinds]));
  });

  it('includes the tide line stroke extent in its maximum Y bound', () => {
    const command: LineDrawCommand = {
      kind: 'boss-danger-lane',
      layer: 'front-effects',
      points: [{ x: 195, y: 600 }],
      stroke: '#ff6f67',
      lineWidth: 21,
    };

    expect(commandMaxY(command)).toEqual([610.5]);
  });

  it('keeps exactly one safe lane, two danger lanes, and all tide geometry above y 610', () => {
    const commands = renderBossPhase('boss-tide', { phaseRemainingMs: 600, safeLane: 1 });
    expect(commands.filter((command) => command.kind === 'boss-safe-lane')).toHaveLength(1);
    expect(commands.filter((command) => command.kind === 'boss-danger-lane')).toHaveLength(2);
    const tide = commands.filter((command) => command.kind.startsWith('boss-') && ['boss-safe-lane', 'boss-danger-lane', 'boss-current-chevron', 'boss-tide-countdown'].includes(command.kind));
    expect(Math.max(...tide.flatMap(commandMaxY))).toBeLessThanOrEqual(610);
  });

  it('distinguishes open and closed weak points without changing hit geometry', () => {
    const open = renderBossPhase('boss-enraged', { weakPointOpen: true, phaseRemainingMs: 700 });
    const closed = renderBossPhase('boss-enraged', { weakPointOpen: false, phaseRemainingMs: 900 });
    expect(open.some((command) => command.kind === 'boss-weakpoint')).toBe(true);
    expect(closed.some((command) => command.kind === 'boss-weakpoint')).toBe(false);
    expect(open.filter((command) => command.kind === 'boss-weakpoint-petal')).not.toEqual(
      closed.filter((command) => command.kind === 'boss-weakpoint-petal'),
    );
  });

  it.each([['high', 32], ['medium', 24], ['low', 18]] as const)(
    'keeps %s boss choreography under %i commands while retaining identity',
    (quality, limit) => {
      for (const phase of ['boss-summon', 'boss-tide', 'boss-enraged'] as const) {
        const bossCommands = renderBossPhase(phase, { quality }).filter(isBossTelegraphCommand);
        expect(bossCommands.length).toBeGreaterThan(0);
        expect(bossCommands.length).toBeLessThanOrEqual(limit);
      }
    },
  );

  it('freezes every boss telegraph command in reduced motion', () => {
    const before = renderBossPhase('boss-tide', { reducedMotion: true, timeMs: 0 });
    const after = renderBossPhase('boss-tide', { reducedMotion: true, timeMs: 5000 });
    expect(onlyBossTelegraphCommands(after)).toEqual(onlyBossTelegraphCommands(before));
    const animated = renderBossPhase('boss-tide', { reducedMotion: false, timeMs: 5000 });
    expect(onlyBossTelegraphCommands(animated)).not.toEqual(onlyBossTelegraphCommands(before));
  });

  it('layers atmosphere and one grounded shadow below every living enemy', () => {
    const commands = renderCommands({ reducedMotion: true });
    expect(commands.map((command) => command.kind)).toEqual(expect.arrayContaining([
      'atmosphere-wash',
      'horizon-glow',
      'danger-vignette',
    ]));
    const shadows = commands.filter((command) => command.kind === 'enemy-contact-shadow');
    expect(shadows).toHaveLength(createFrameFixture().enemies.filter((enemy) => enemy.alive).length);
    for (const enemy of createFrameFixture().enemies.filter((item) => item.alive)) {
      const shadowIndex = commands.findIndex((command) => (
        command.kind === 'enemy-contact-shadow'
        && 'x' in command
        && command.x === enemy.x
      ));
      const spriteIndex = commands.findIndex((command) => (
        command.kind === 'enemy'
        && command.enemyKind === enemy.kind
      ));
      expect(shadowIndex).toBeGreaterThan(-1);
      expect(shadowIndex).toBeLessThan(spriteIndex);
    }
  });

  it.each([
    ['tide-shell-hatchling', 'tideShellHatchling'],
    ['lantern-ray', 'lanternRay'],
    ['tide-parasite-snail', 'tideParasiteSnail'],
  ] as const)('uses dedicated %s art with a playable fallback', (enemyKind, failedArtId) => {
    const base = createFrameFixture().enemies[0]!;
    const commands = renderCommands({
      failedArtIds: [failedArtId],
      frame: {
        enemies: [{ ...base, id: 91, kind: enemyKind }],
      },
    });

    expect(commands).toContainEqual(expect.objectContaining({
      kind: 'fallback-silhouette',
      enemyKind,
    }));
    expect(commands).not.toContainEqual(expect.objectContaining({
      kind: 'enemy',
      enemyKind,
    }));
  });

  it('draws distinct role silhouettes and semantic combat warnings', () => {
    const base = createFrameFixture().enemies[0]!;
    const commands = renderCommands({
      reducedMotion: true,
      frame: {
        enemies: [
          {
            ...base, id: 11, kind: 'tide-shell-hatchling', x: 92, y: 250,
            behaviour: {
              phase: 'advance', phaseRemainingMs: 900, cycle: 1,
              targetLane: 1, safeLane: 0, invulnerable: false,
              damageTakenMultiplier: 1, weakPointOpen: false,
            },
          },
          {
            ...base, id: 12, kind: 'lantern-ray', x: 195, y: 270,
            behaviour: {
              phase: 'lantern-charge', phaseRemainingMs: 500, cycle: 1,
              targetLane: 1, safeLane: 0, invulnerable: false,
              damageTakenMultiplier: 1, weakPointOpen: false,
            },
          },
          {
            ...base, id: 13, kind: 'tide-parasite-snail', x: 298, y: 310,
            shield: 20,
            behaviour: {
              phase: 'advance', phaseRemainingMs: 700, cycle: 2,
              targetLane: 2, safeLane: 0, invulnerable: false,
              damageTakenMultiplier: 1, weakPointOpen: false,
            },
          },
          {
            ...base, id: 14, kind: 'storm-ray-elite', x: 195, y: 360,
            behaviour: {
              phase: 'elite-telegraph', phaseRemainingMs: 600, cycle: 2,
              targetLane: 0, safeLane: 0, invulnerable: false,
              damageTakenMultiplier: 1, weakPointOpen: false,
            },
          },
          {
            ...base, id: 15, kind: 'deep-echo-boss', x: 195, y: 250,
            behaviour: {
              phase: 'boss-enraged', phaseRemainingMs: 800, cycle: 3,
              targetLane: 1, safeLane: 2, invulnerable: false,
              damageTakenMultiplier: 1.1, weakPointOpen: true,
            },
          },
        ],
      },
    });

    expect(commands.map((item) => item.kind)).toEqual(expect.arrayContaining([
      'hatchling-claw',
      'lantern-core',
      'lantern-warning',
      'snail-spiral',
      'enemy-shield',
      'elite-lane-telegraph',
      'boss-enraged-aura',
      'boss-weakpoint-petal',
      'boss-weakpoint-countdown',
      'boss-weakpoint',
    ]));
    expect(commands.filter((item) => item.kind === 'boss-weakpoint-petal')).toHaveLength(4);
    expect(commands.filter((item) => item.kind === 'boss-weakpoint-countdown')).toHaveLength(4);
  });

  it('draws rank and variant effect semantics as distinct bounded commands', () => {
    const effects: EffectFrameView = {
      particles: [{
        id: 1, kind: 'rank-volley-trail', layer: 'front-effects', x: 195, y: 470,
        size: 8, color: '#65edff', alpha: 1, rotation: 0, progress: 0,
      }, {
        id: 2, kind: 'coral-pierce', layer: 'front-effects', x: 195, y: 470,
        size: 8, color: '#ff8d73', alpha: 1, rotation: 0, progress: 0,
      }, {
        id: 3, kind: 'extreme-radial-stroke', layer: 'front-effects', x: 195, y: 430,
        size: 10, color: '#ffd793', alpha: 1, rotation: 0, progress: 0,
      }, {
        id: 4, kind: 'reflection', layer: 'front-effects', x: 195, y: 430,
        size: 10, color: '#f5d77b', alpha: 1, rotation: 0, progress: 0,
      }, {
        id: 5, kind: 'extreme-pull', layer: 'front-effects', x: 195, y: 430,
        size: 10, color: '#6de8ff', alpha: 1, rotation: 0, progress: 0,
      }, {
        id: 6, kind: 'extreme-vortex', layer: 'front-effects', x: 195, y: 430,
        size: 10, color: '#9877ff', alpha: 1, rotation: 0, progress: 0,
      }, {
        id: 7, kind: 'second-crest', layer: 'front-effects', x: 195, y: 430,
        size: 10, color: '#ffb77d', alpha: 1, rotation: 0, progress: 0,
      }],
      damageNumbers: [],
      rings: [{
        id: 3, kind: 'barrier-membrane', x: 195, y: 700, radius: 48,
        color: '#74f5cf', alpha: 1,
      }, {
        id: 4, kind: 'static-skill-silhouette', x: 195, y: 430, radius: 64,
        color: '#9576ff', alpha: 1,
      }],
      camera: { x: 0, y: 0, rotation: 0, amplitude: 0 },
      cinematic: { darken: 0, title: null, slowMotion: 0 },
    };
    const commands = renderCommands({ effects });
    expect(commands.map((item) => item.kind)).toEqual(expect.arrayContaining([
      'effect-rank-volley-trail', 'effect-coral-pierce',
      'effect-extreme-radial-stroke', 'effect-reflection', 'effect-extreme-pull',
      'effect-extreme-vortex', 'effect-second-crest',
      'barrier-membrane', 'static-skill-silhouette',
    ]));
    for (const kind of [
      'effect-rank-volley-trail', 'effect-coral-pierce',
      'effect-extreme-radial-stroke', 'effect-reflection', 'effect-extreme-pull',
    ]) {
      expect(findCommand<LineDrawCommand>(commands, (item) => item.kind === kind).points).toHaveLength(2);
    }
    expect(findCommand<LineDrawCommand>(commands, (item) => item.kind === 'effect-extreme-vortex').points).toHaveLength(3);
    expect(findCommand<LineDrawCommand>(commands, (item) => item.kind === 'effect-second-crest').points).toHaveLength(5);
  });

  it.each([
    ['split-chevron', 'effect-split-chevron', 2],
    ['coral-pierce', 'effect-coral-pierce', 2],
    ['returning-arc', 'effect-returning-arc', 2],
    ['rainstorm-fin', 'effect-rainstorm-fin', 3],
    ['bubble-fracture', 'effect-bubble-fracture', 5],
    ['reflection', 'effect-reflection', 2],
    ['overflow-droplet', 'effect-overflow-droplet', 3],
    ['emergency-beacon', 'effect-emergency-beacon', 3],
    ['undertow-eye', 'effect-undertow-eye', 6],
    ['extreme-vortex', 'effect-extreme-vortex', 2],
    ['energy-return', 'effect-energy-return', 2],
    ['second-crest', 'effect-second-crest', 2],
  ] as const)(
    'draws %s as nonzero bounded %s commands',
    (particleKind, drawKind, expectedCount) => {
      const color = '#59e9ff';
      const effects: EffectFrameView = {
        particles: [{
          id: 101,
          kind: particleKind as EffectParticleKind,
          layer: 'front-effects',
          x: 195,
          y: 430,
          size: 12,
          color,
          alpha: 0.84,
          rotation: 0.35,
          progress: 0.4,
        }],
        damageNumbers: [],
        rings: [],
        camera: { x: 0, y: 0, rotation: 0, amplitude: 0 },
        cinematic: { darken: 0, title: null, slowMotion: 0 },
      };
      const motif = renderCommands({ effects }).filter(
        (command) => command.kind === drawKind,
      );

      expect(motif).toHaveLength(expectedCount);
      expect(motif.every((command) => {
        if (command.layer !== 'front-effects' || command.alpha !== 0.84) {
          return false;
        }
        if ('points' in command) {
          return command.lineWidth > 0
            && command.points.length >= 2
            && command.points.every((point) => (
              Number.isFinite(point.x) && Number.isFinite(point.y)
            ))
            && command.stroke === color;
        }
        return 'radiusX' in command
          && command.radiusX > 0
          && command.radiusY > 0
          && command.stroke === color;
      })).toBe(true);
      const bounds = commandBounds(motif, drawKind);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
      expect(bounds.width).toBeLessThan(180);
      expect(bounds.height).toBeLessThan(140);
    },
  );

  it.each(SKILL_VARIANT_IDS)(
    'renders both catalog colors for the real %s EffectSystem motif',
    (id) => {
      const signature = getSkillEvolutionVisualSignature(id);
      const frame = createFrameFixture({
        skillRanks: {
          'tidal-volley': 5,
          'bubble-barrier': 5,
          'extreme-tide': 5,
        },
        skillVariants: {
          'tidal-volley': signature.skillId === 'tidal-volley' ? [id] : [],
          'bubble-barrier': signature.skillId === 'bubble-barrier' ? [id] : [],
          'extreme-tide': signature.skillId === 'extreme-tide' ? [id] : [],
        },
      });
      const effects = new EffectSystem({
        particleLimit: 200,
        damageNumberLimit: 18,
        impactLimit: 24,
        reducedMotion: false,
      });
      effects.consume(authoritativeEvolutionEvents(id), frame);
      effects.update(17);
      const particle = effects.view.particles.find((candidate) => (
        candidate.kind === signature.particleKind
      ));
      expect(particle).toMatchObject({
        color: signature.primary,
        secondaryColor: signature.secondary,
      } satisfies Partial<EffectParticleView>);

      const commands = renderCommands({ frame, effects: effects.view }).filter(
        (command) => command.kind === `effect-${signature.particleKind}`,
      );
      expect(commands.some((command) => (
        commandHasVisibleColor(command, signature.primary)
      ))).toBe(true);
      expect(commands.some((command) => (
        commandHasVisibleColor(command, signature.secondary)
      ))).toBe(true);
    },
  );

  it.each(([
    ['split-chevron', 'effect-split-chevron'],
    ['coral-pierce', 'effect-coral-pierce'],
    ['returning-arc', 'effect-returning-arc'],
    ['rainstorm-fin', 'effect-rainstorm-fin'],
    ['bubble-fracture', 'effect-bubble-fracture'],
    ['reflection', 'effect-reflection'],
    ['overflow-droplet', 'effect-overflow-droplet'],
    ['emergency-beacon', 'effect-emergency-beacon'],
    ['undertow-eye', 'effect-undertow-eye'],
    ['extreme-vortex', 'effect-extreme-vortex'],
    ['energy-return', 'effect-energy-return'],
    ['second-crest', 'effect-second-crest'],
  ] as const).flatMap(([particleKind, drawKind]) => ([
    { particleKind, drawKind, progress: 0, rotation: 0, x: 20, y: 30, size: 3.2 },
    { particleKind, drawKind, progress: 1, rotation: Math.PI, x: 370, y: 814, size: 12 },
    { particleKind, drawKind, progress: 0.5, rotation: Math.PI * 2 - 1e-7, x: 195, y: 430, size: 7 },
  ])))(
    'keeps $particleKind finite and locally bounded at progress=$progress rotation=$rotation',
    ({ particleKind, drawKind, progress, rotation, x, y, size }) => {
      const effects: EffectFrameView = {
        particles: [{
          id: 160,
          kind: particleKind,
          layer: 'enemies',
          x,
          y,
          size,
          color: '#f5d77b',
          alpha: 0.62,
          rotation,
          progress,
        }],
        damageNumbers: [], rings: [],
        camera: { x: 0, y: 0, rotation: 0, amplitude: 0 },
        cinematic: { darken: 0, title: null, slowMotion: 0 },
      };
      const motif = renderCommands({ effects }).filter(
        (command) => command.kind === drawKind,
      );

      expect(motif.length).toBeGreaterThan(0);
      expect(motif.every((command) => {
        if (command.layer !== 'enemies' || command.alpha !== 0.62) return false;
        if ('points' in command) {
          return Number.isFinite(command.lineWidth)
            && command.lineWidth > 0
            && command.points.every((point) => (
              Number.isFinite(point.x) && Number.isFinite(point.y)
            ));
        }
        return 'radiusX' in command
          && Number.isFinite(command.x)
          && Number.isFinite(command.y)
          && Number.isFinite(command.radiusX)
          && Number.isFinite(command.radiusY)
          && Number.isFinite(command.rotation ?? 0)
          && command.radiusX > 0
          && command.radiusY > 0;
      })).toBe(true);
      const bounds = commandBounds(motif, drawKind);
      expect(Object.values(bounds).every(Number.isFinite)).toBe(true);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
      expect(bounds.width).toBeLessThan(size * 8);
      expect(bounds.height).toBeLessThan(size * 8);
      expect(bounds.minX).toBeGreaterThanOrEqual(-size * 4);
      expect(bounds.minY).toBeGreaterThanOrEqual(-size * 4);
      expect(bounds.maxX).toBeLessThanOrEqual(390 + size * 4);
      expect(bounds.maxY).toBeLessThanOrEqual(844 + size * 4);
    },
  );

  it('uses recognisable hollow geometry for the eight new evolution motifs', () => {
    const particle = (kind: EffectParticleKind, id: number) => ({
      id, kind, layer: 'front-effects' as const, x: 195, y: 430,
      size: 12, color: '#67efc3', alpha: 1, rotation: 0, progress: 0.5,
    });
    const effects: EffectFrameView = {
      particles: [
        particle('split-chevron', 1),
        particle('returning-arc', 2),
        particle('rainstorm-fin', 3),
        particle('bubble-fracture', 4),
        particle('overflow-droplet', 5),
        particle('emergency-beacon', 6),
        particle('undertow-eye', 7),
        particle('energy-return', 8),
      ],
      damageNumbers: [], rings: [],
      camera: { x: 0, y: 0, rotation: 0, amplitude: 0 },
      cinematic: { darken: 0, title: null, slowMotion: 0 },
    };
    const commands = renderCommands({ effects });
    const split = commands.filter(
      (item): item is LineDrawCommand => item.kind === 'effect-split-chevron' && 'points' in item,
    );
    expect(split).toHaveLength(2);
    expect(split[0]!.points[1]).toEqual(split[1]!.points[0]);

    const returning = findCommand<LineDrawCommand>(
      commands,
      (item) => item.kind === 'effect-returning-arc',
    );
    expect(returning.points).toHaveLength(7);
    const returningBounds = commandBounds(commands, 'effect-returning-arc');
    expect(returningBounds.width).toBeGreaterThan(returningBounds.height);

    expect(commands.filter((item) => item.kind === 'effect-rainstorm-fin')).toHaveLength(3);
    expect(commands.filter((item) => item.kind === 'effect-bubble-fracture')).toHaveLength(5);
    expect(commands.filter((item) => item.kind === 'effect-overflow-droplet')).toHaveLength(3);
    expect(commands.filter((item) => item.kind === 'effect-emergency-beacon')).toHaveLength(3);
    expect(commands.filter((item) => item.kind === 'effect-undertow-eye')).toHaveLength(6);
    expect(commands.filter((item) => item.kind === 'effect-energy-return')).toHaveLength(2);

    for (const kind of [
      'effect-bubble-fracture',
      'effect-overflow-droplet',
      'effect-undertow-eye',
      'effect-energy-return',
    ]) {
      const ellipses = commands.filter((item) => (
        item.kind === kind && 'radiusX' in item
      )) as EllipseDrawCommand[];
      expect(ellipses.length).toBeGreaterThan(0);
      expect(ellipses.every((ellipse) => ellipse.fill === undefined)).toBe(true);
    }
  });

  it('aims the energy-return stroke toward the train despite particle rotation', () => {
    const effects: EffectFrameView = {
      particles: [{
        id: 108,
        kind: 'energy-return',
        layer: 'front-effects',
        x: 160,
        y: 430,
        size: 12,
        color: '#71f3c0',
        alpha: 1,
        rotation: Math.PI,
        progress: 0.5,
      }],
      damageNumbers: [], rings: [],
      camera: { x: 0, y: 0, rotation: 0, amplitude: 0 },
      cinematic: { darken: 0, title: null, slowMotion: 0 },
    };
    const command = findCommand<LineDrawCommand>(
      renderCommands({ effects }),
      (item) => item.kind === 'effect-energy-return' && 'points' in item,
    );
    const [start, end] = command.points;
    const distanceToTrain = (point: { readonly x: number; readonly y: number }) => (
      Math.hypot(point.x - 195, point.y - 842)
    );

    expect(distanceToTrain(end!)).toBeLessThan(distanceToTrain(start!));
  });

  it('renders premium impact signatures as readable strokes and ripples', () => {
    const effects: EffectFrameView = {
      particles: [
        { id: 31, kind: 'critical-shard', layer: 'front-effects', x: 140, y: 260, size: 9, color: '#fff0a8', alpha: 1, rotation: 0.4, progress: 0.2 },
        { id: 32, kind: 'armour-spark', layer: 'front-effects', x: 170, y: 280, size: 8, color: '#ff9c69', alpha: 1, rotation: 1.1, progress: 0.3 },
        { id: 33, kind: 'weakpoint-flare', layer: 'front-effects', x: 195, y: 240, size: 12, color: '#fff4a8', alpha: 1, rotation: 0, progress: 0.1 },
      ],
      rings: [{ id: 34, kind: 'boss-entrance-ripple', x: 195, y: 250, radius: 88, color: '#ff7b72', secondaryColor: '#706cff', alpha: 0.8 }],
      damageNumbers: [],
      camera: { x: 0, y: 0, rotation: 0, amplitude: 0 },
      cinematic: { darken: 0, title: null, slowMotion: 0 },
    };
    const commands = renderCommands({ effects });
    expect(commands.map((item) => item.kind)).toEqual(expect.arrayContaining([
      'effect-critical-shard',
      'effect-armour-spark',
      'effect-weakpoint-flare',
      'boss-entrance-ripple',
      'boss-entrance-ripple-secondary',
    ]));
    expect(commands.filter((item) => item.kind === 'effect-weakpoint-flare')).toHaveLength(2);
  });
  it.each(Object.keys(ENEMY_GEOMETRY) as EnemyKind[])(
    'keeps animated %s sprite, label, and health bar below the HUD gap',
    (kind) => {
      const source = createFrameFixture().enemies[0]!;
      const commands = renderCommands({
        reducedMotion: false,
        frame: {
          enemies: [{
            ...source,
            id: 1,
            kind,
            y: enemySpawnY(kind),
            alive: true,
          }],
        },
      });
      const sprite = findCommand<ImageDrawCommand>(
        commands,
        (item) => item.kind === 'enemy' && item.enemyKind === kind,
      );
      const label = findCommand<BattleDrawCommand>(
        commands,
        (item) => item.kind === 'enemy-name',
      );
      const health = findCommand<LineDrawCommand>(
        commands,
        (item) => item.kind === 'enemy-hp-track',
      );
      expect(sprite.y - sprite.height).toBeGreaterThanOrEqual(120);
      expect('y' in label ? label.y : 0).toBeGreaterThanOrEqual(120);
      expect(health.points[0]?.y).toBeGreaterThanOrEqual(120);
    },
  );

  it('draws one name and health bar per living enemy below the HUD-safe edge', () => {
    const frame = createFrameFixture();
    const commands = renderCommands({
      frame: {
        enemies: frame.enemies.map((enemy) => ({
          ...enemy,
          y: 120 + ENEMY_GEOMETRY[enemy.kind].height * 0.52,
          alive: true,
        })),
      },
      reducedMotion: true,
    });
    const livingEnemies = frame.enemies.filter((enemy) => enemy.alive);
    expect(commands.filter((item) => item.kind === 'enemy-name')).toHaveLength(livingEnemies.length);
    expect(commands.filter((item) => item.kind === 'enemy-hp-track')).toHaveLength(livingEnemies.length);
    expect(commands.filter((item) => item.kind === 'enemy-hp')).toHaveLength(livingEnemies.length);
    const topmost = commands
      .filter((item) => item.kind === 'enemy-name' || item.kind === 'enemy-hp-track' || item.kind === 'enemy-hp')
      .flatMap((item) => 'y' in item ? [item.y] : item.points.map((point) => point.y));
    expect(Math.min(...topmost)).toBeGreaterThanOrEqual(120);
  });

  it.each([
    ['bubble-fin', 78, 78],
    ['needle-jelly', 72, 84],
    ['reef-crab', 84, 72],
  ] as const)(
    'keeps the ordinary %s enemy readable at mobile gameplay scale',
    (kind, minimumWidth, minimumHeight) => {
      const baseEnemy = createFrameFixture().enemies[0];
      expect(baseEnemy).toBeDefined();
      const commands = renderCommands({
        frame: {
          enemies: [{
            ...baseEnemy!,
            kind,
            alive: true,
          }],
        },
      });
      const enemy = findCommand<ImageDrawCommand>(
        commands,
        (item) => item.kind === 'enemy' && item.enemyKind === kind,
      );

      expect(enemy.width).toBeGreaterThanOrEqual(minimumWidth);
      expect(enemy.height).toBeGreaterThanOrEqual(minimumHeight);
    },
  );

  it('draws exact matte impacts before emphasized rings and damage numbers', () => {
    const effects: EffectFrameView = {
      particles: [
        {
          id: 1,
          kind: 'defeat-squash',
          layer: 'front-effects',
          x: 120,
          y: 260,
          size: 20,
          color: '#315c70',
          alpha: 0.72,
          rotation: 0.25,
          progress: 0.5,
        },
        {
          id: 2,
          kind: 'brush-smear',
          layer: 'front-effects',
          x: 140,
          y: 280,
          size: 10,
          color: '#fff2d2',
          alpha: 0.64,
          rotation: 0.75,
          progress: 0.25,
        },
        {
          id: 3,
          kind: 'ink-bubble',
          layer: 'front-effects',
          x: 160,
          y: 300,
          size: 6,
          color: '#b9f6ff',
          alpha: 0.56,
          rotation: 0.5,
          progress: 0.4,
        },
      ],
      rings: [{
        id: 4,
        x: 180,
        y: 320,
        radius: 30,
        color: '#fff2d2',
        alpha: 0.48,
        secondaryColor: '#17344c',
      }],
      damageNumbers: [{
        id: 5,
        x: 200,
        y: 340,
        value: 50,
        critical: true,
        alpha: 0.4,
      }],
      camera: { x: 0, y: 0, rotation: 0, amplitude: 0 },
      cinematic: { darken: 0, title: null, slowMotion: 0 },
    };

    const commands = renderCommands({ effects });
    const squash = findCommand<EllipseDrawCommand>(
      commands,
      (item) => item.kind === 'effect-defeat-squash',
    );
    expect(squash).toMatchObject({
      x: 120,
      y: 262.2,
      radiusX: 29,
      radiusY: 11,
      fill: '#315c70',
      stroke: '#17344c',
      lineWidth: 3,
      alpha: 0.72,
      blendMode: 'source-over',
    });

    const smear = findCommand<EllipseDrawCommand>(
      commands,
      (item) => item.kind === 'effect-brush-smear',
    );
    expect(smear).toMatchObject({
      x: 140,
      y: 280,
      radiusX: 22,
      radiusY: 4.2,
      rotation: 0.75,
      alpha: 0.64,
      blendMode: 'source-over',
    });

    const bubble = findCommand<EllipseDrawCommand>(
      commands,
      (item) => item.kind === 'effect-ink-bubble',
    );
    expect(bubble).toMatchObject({
      x: 160,
      y: 300,
      radiusX: 6,
      radiusY: 6,
      stroke: '#17344c',
      lineWidth: 1.5,
      alpha: 0.56,
      blendMode: 'source-over',
    });
    for (const command of [squash, smear, bubble]) {
      expect(command.blendMode).toBe('source-over');
      expect(command).not.toHaveProperty('shadowBlur');
      expect(command).not.toHaveProperty('shadowColor');
    }

    const primaryRing = findCommand<EllipseDrawCommand>(
      commands,
      (item) => item.kind === 'impact-ring',
    );
    expect(primaryRing).toMatchObject({
      radiusX: 30,
      stroke: '#fff2d2',
      alpha: 0.48,
      blendMode: 'source-over',
    });
    expect(primaryRing.radiusY).toBeCloseTo(21.6, 6);
    const secondaryRing = findCommand<EllipseDrawCommand>(
      commands,
      (item) => item.kind === 'impact-ring-secondary',
    );
    expect(secondaryRing).toMatchObject({
      radiusX: 27,
      radiusY: 19.5,
      stroke: '#17344c',
      lineWidth: 1.5,
      alpha: 0.48,
      blendMode: 'source-over',
    });

    expect(commands.filter((item) => (
      item.kind === 'effect-defeat-squash'
      || item.kind === 'effect-brush-smear'
      || item.kind === 'effect-ink-bubble'
      || item.kind === 'impact-ring'
      || item.kind === 'impact-ring-secondary'
      || item.kind === 'damage-number'
    )).map((item) => item.kind)).toEqual([
      'effect-defeat-squash',
      'effect-brush-smear',
      'effect-ink-bubble',
      'impact-ring',
      'impact-ring-secondary',
      'damage-number',
    ]);
  });

  it('keeps both defeat evidence samples inside opaque squash fill', () => {
    const samples = [
      { x: 112, y: 252, width: 2, height: 2 },
      { x: 70, y: 252, width: 2, height: 2 },
    ];
    for (const progress of [0.2, 0.5, 0.8]) {
      const effects: EffectFrameView = {
        particles: [{
          id: 1,
          kind: 'defeat-squash',
          layer: 'front-effects',
          x: 92,
          y: 250,
          size: 24,
          color: '#315c70',
          alpha: 0.6,
          rotation: 0,
          progress,
        }],
        rings: [],
        damageNumbers: [],
        camera: { x: 0, y: 0, rotation: 0, amplitude: 0 },
        cinematic: { darken: 0, title: null, slowMotion: 0 },
      };
      const squash = findCommand<EllipseDrawCommand>(
        renderCommands({ effects }),
        (item) => item.kind === 'effect-defeat-squash',
      );
      expect(squash.fill).toBe('#315c70');
      expect(squash.alpha).toBeGreaterThan(0);
      for (const sample of samples) {
        for (const x of [sample.x, sample.x + sample.width]) {
          for (const y of [sample.y, sample.y + sample.height]) {
            const normalizedDistance = (
              ((x - squash.x) / squash.radiusX) ** 2
              + ((y - squash.y) / squash.radiusY) ** 2
            );
            expect(normalizedDistance).toBeLessThan(0.8);
          }
        }
      }
    }
  });

  it('draws ordered hand-drawn background layers with adjacent repeats', () => {
    const commands = renderCommands().filter(
      (command): command is ImageDrawCommand => (
        command.kind.startsWith('background-')
        && command.layer === 'background'
      ),
    );

    expect(commands.map((command) => command.kind)).toEqual([
      'background-sky',
      'background-horizon',
      'background-track',
      'background-track',
      'background-foreground',
      'background-foreground',
    ]);
    expect(commands.map(({ width, height }) => ({ width, height }))).toEqual(
      Array.from({ length: 6 }, () => ({ width: 398, height: 860 })),
    );
    expect(commands[0]).toMatchObject({
      x: 195 + Math.sin(42_000 / 5000) * 3,
      y: 422,
    });
    expect(commands[1]).toMatchObject({ x: 195, y: 422 - 120 * 0.08 });
    expect(commands[2]).toMatchObject({ x: 195, y: 422 + 120 });
    expect(commands[3]).toMatchObject({ x: 195, y: 422 + 120 - 860 });
    expect(commands[4]?.y).toBeCloseTo(422 + 120 * 1.42, 10);
    expect(commands[5]?.y).toBeCloseTo(422 + 120 * 1.42 - 860, 10);
  });

  it('skips missing optional art and keeps a warm fallback for critical art', () => {
    const optionalMissing = renderCommands({
      failedArtIds: ['backgroundHorizon', 'backgroundForeground'],
    });
    expect(optionalMissing.filter(
      (command) => command.kind.startsWith('background-')
        && command.layer === 'background',
    ).map((command) => command.kind)).toEqual([
      'background-sky',
      'background-track',
      'background-track',
    ]);

    const painter = createRecordingPainter();
    let clearColor = '';
    painter.clear = (color: string) => {
      clearColor = color;
    };
    new BattleRenderer(painter).render(createPresentationFixture({
      failedArtIds: ['backgroundSky', 'backgroundTrack'],
    }));
    expect(clearColor).toBe('#d98a62');
    expect(painter.commands.filter(
      (command) => command.kind === 'background-sky'
        || command.kind === 'background-track',
    )).toHaveLength(0);
    expect(painter.commands.some((command) => command.kind === 'train')).toBe(
      true,
    );
  });

  it('removes horizon and foreground draws at low quality', () => {
    const painter = createRecordingPainter();
    new BattleRenderer(painter).render({
      ...createPresentationFixture(),
      effects: {
        particles: [{
          id: 77,
          kind: 'defeat-squash',
          layer: 'front-effects',
          x: 92,
          y: 250,
          size: 20,
          color: '#315c70',
          alpha: 0.72,
          rotation: 0,
          progress: 0.5,
        }],
        rings: [],
        damageNumbers: [],
        camera: { x: 0, y: 0, rotation: 0, amplitude: 0 },
        cinematic: { darken: 0, title: null, slowMotion: 0 },
      },
      renderBudget: getRenderBudget('low'),
    });

    expect(painter.commands.filter(
      (command) => command.kind.startsWith('background-')
        && command.layer === 'background',
    ).map((command) => command.kind)).toEqual([
      'background-sky',
      'background-track',
      'background-track',
    ]);
    expect(painter.commands.some((command) => command.kind === 'train')).toBe(true);
    expect(painter.commands.some((command) => command.kind === 'enemy')).toBe(true);
    expect(painter.commands.some(
      (command) => command.kind === 'effect-defeat-squash',
    )).toBe(true);
  });

  it('uses time-independent fixed background poses for reduced motion', () => {
    const backgroundCommands = (
      timeMs: number,
      laneOffset: number,
    ): readonly ImageDrawCommand[] => {
      const painter = createRecordingPainter();
      new BattleRenderer(painter).render({
        ...createPresentationFixture({
          reducedMotion: true,
          trainMotion: { laneOffset },
        }),
        timeMs,
      });
      return painter.commands.filter(
        (command): command is ImageDrawCommand => (
          command.kind.startsWith('background-')
          && command.layer === 'background'
        ),
      );
    };

    const first = backgroundCommands(1000, 240);
    const second = backgroundCommands(9000, 999);
    expect(second).toEqual(first);
    expect(first.filter((command) => command.kind === 'background-track'))
      .toMatchObject([{ y: 428 }, { y: -432 }]);
  });

  it('draws stable layers and falls back for failed art', () => {
    const painter = createRecordingPainter();
    const renderer = new BattleRenderer(painter);

    renderer.render(createPresentationFixture({
      failedArtIds: ['needleJelly'],
    }));

    expect(painter.layers()).toEqual(
      [...painter.layers()].sort(byBattleLayer),
    );
    expect(painter.commands).toContainEqual(
      expect.objectContaining({
        kind: 'fallback-silhouette',
        enemyKind: 'needle-jelly',
      }),
    );
    expect(painter.commands).toContainEqual(
      expect.objectContaining({
        kind: 'sprite-part',
        actor: 'captain',
      }),
    );
  });

  it('keeps the train and companions below combat effects', () => {
    const painter = createRecordingPainter();
    const renderer = new BattleRenderer(painter);

    renderer.render(createPresentationFixture());

    const trainIndex = painter.commands.findIndex(
      (command) => command.kind === 'train',
    );
    const captainIndex = painter.commands.findIndex(
      (command) => command.actor === 'captain',
    );
    expect(trainIndex).toBeGreaterThan(-1);
    expect(captainIndex).toBeGreaterThan(trainIndex);
  });

  it('scales only decorative particles and trails with visual quality', () => {
    const painter = createRecordingPainter();
    const renderer = new BattleRenderer(painter);
    const budget = {
      ...getRenderBudget('low'),
      backgroundParticles: 3,
      visibleProjectileTrails: 0,
    };

    renderer.render({
      ...createPresentationFixture(),
      renderBudget: budget,
    });

    expect(
      painter.commands.filter(
        (command) => command.kind === 'background-particle',
      ),
    ).toHaveLength(3);
    expect(
      painter.commands.filter(
        (command) => command.kind === 'projectile-trail',
      ),
    ).toHaveLength(0);
    expect(
      painter.commands.filter(
        (command) => command.kind === 'projectile',
      ),
    ).toHaveLength(1);
  });

  it('draws a manual projectile trail behind its velocity vector', () => {
    const commands = renderCommands({
      frame: {
        projectiles: [{
          id: 42,
          source: 'main',
          x: 220,
          y: 460,
          targetId: -1,
          trajectory: 'manual',
          velocityX: 240,
          velocityY: -320,
          speedPerSecond: 400,
          damage: 10,
          splashRadius: 0,
          chainRemaining: 0,
          critical: false,
          active: true,
        }],
      },
    });
    const trail = findCommand<LineDrawCommand>(
      commands,
      (item) => item.kind === 'projectile-trail',
    );
    expect(trail.points[1]).toEqual({ x: 220, y: 460 });
    expect(trail.points[0]!.x).toBeLessThan(220);
    expect(trail.points[0]!.y).toBeGreaterThan(460);
  });

  it('draws moving route markers and a bounded train wake', () => {
    const painter = createRecordingPainter();
    new BattleRenderer(painter).render(createPresentationFixture());
    expect(painter.commands.filter((item) => item.kind === 'travel-marker')).toHaveLength(15);
    expect(painter.commands.filter((item) => item.kind === 'train-wake')).toHaveLength(6);
  });

  it('applies one base pose to train and all crew anchors', () => {
    const pose = {
      offsetX: 2,
      offsetY: -3,
      rotation: 0.008,
      scale: 1.04,
    };
    const neutral = renderCommands();
    const posed = renderCommands({ trainMotion: pose });
    const pairs = [
      [
        findCommand<ImageDrawCommand>(neutral, (item) => item.kind === 'train'),
        findCommand<ImageDrawCommand>(posed, (item) => item.kind === 'train'),
      ],
      [
        findCommand<EllipseDrawCommand>(neutral, (item) => item.kind === 'train-shield'),
        findCommand<EllipseDrawCommand>(posed, (item) => item.kind === 'train-shield'),
      ],
      [
        findCommand<ImageDrawCommand>(neutral, (item) => item.actor === 'captain' && item.partId === 'body'),
        findCommand<ImageDrawCommand>(posed, (item) => item.actor === 'captain' && item.partId === 'body'),
      ],
      [
        findCommand<ImageDrawCommand>(neutral, (item) => item.actor === 'otter' && item.partId === 'body'),
        findCommand<ImageDrawCommand>(posed, (item) => item.actor === 'otter' && item.partId === 'body'),
      ],
      [
        findCommand<ImageDrawCommand>(neutral, (item) => item.actor === 'jelly-medic' && item.partId === 'body'),
        findCommand<ImageDrawCommand>(posed, (item) => item.actor === 'jelly-medic' && item.partId === 'body'),
      ],
      [
        findCommand<EllipseDrawCommand>(neutral, (item) => item.partId === 'barrier-ring'),
        findCommand<EllipseDrawCommand>(posed, (item) => item.partId === 'barrier-ring'),
      ],
      [
        findCommand<EllipseDrawCommand>(neutral, (item) => item.kind === 'train-core'),
        findCommand<EllipseDrawCommand>(posed, (item) => item.kind === 'train-core'),
      ],
    ] as const;
    for (const [before, after] of pairs) {
      expectSharedPose(before, after, pose);
    }

    const beforeTrain = pairs[0][0];
    const afterTrain = pairs[0][1];
    expect(afterTrain).toMatchObject({ x: 197, y: 839, rotation: 0.008 });
    expect(afterTrain.width).toBeCloseTo(beforeTrain.width * pose.scale, 6);
    expect(afterTrain.height).toBeCloseTo(beforeTrain.height * pose.scale, 6);

    const beforeCannon = findCommand<LineDrawCommand>(
      neutral,
      (item) => item.kind === 'main-cannon',
    );
    const afterCannon = findCommand<LineDrawCommand>(
      posed,
      (item) => item.kind === 'main-cannon',
    );
    for (let index = 0; index < beforeCannon.points.length; index += 1) {
      const before = beforeCannon.points[index];
      const after = afterCannon.points[index];
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      const cosine = Math.cos(pose.rotation);
      const sine = Math.sin(pose.rotation);
      expect(after?.x).toBeCloseTo(
        195 + pose.offsetX + (before!.x - 195) * cosine
          - (before!.y - 842) * sine,
        6,
      );
      expect(after?.y).toBeCloseTo(
        842 + pose.offsetY + (before!.x - 195) * sine
          + (before!.y - 842) * cosine,
        6,
      );
    }
  });

  it('poses fallback train and crew art from the same anchors', () => {
    const failedArtIds = [
      'train',
      'captainFemaleBase',
      'otter',
      'jellyMedic',
    ] as const;
    const pose = { offsetX: -1.5, offsetY: 2.25, rotation: -0.01 };
    const neutral = renderCommands({ failedArtIds });
    const posed = renderCommands({ failedArtIds, trainMotion: pose });
    const selectors = [
      (item: BattleDrawCommand) => item.kind === 'train',
      (item: BattleDrawCommand) => item.kind === 'captain-fallback',
      (item: BattleDrawCommand) => item.actor === 'otter' && item.partId === 'body',
      (item: BattleDrawCommand) => item.actor === 'jelly-medic' && item.partId === 'body',
    ];

    for (const selector of selectors) {
      expectSharedPose(
        findCommand<EllipseDrawCommand>(neutral, selector),
        findCommand<EllipseDrawCommand>(posed, selector),
        pose,
      );
    }
  });

  it('selects greatest alive y with the smallest-id tie and recoils backward', () => {
    const seed = createFrameFixture().enemies;
    const first = seed[0];
    const second = seed[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const enemies = [
      { ...first!, id: 10, x: 80, y: 520, alive: true },
      { ...second!, id: 7, x: 310, y: 600, alive: true },
      { ...first!, id: 3, x: 70, y: 600, alive: true },
      { ...second!, id: 1, x: 390, y: 700, alive: false },
    ];
    const neutral = renderCommands({ frame: { enemies } });
    const recoil = 5;
    const recoiled = renderCommands({
      frame: { enemies },
      trainMotion: { cannonRecoil: recoil },
    });
    const before = findCommand<LineDrawCommand>(
      neutral,
      (item) => item.kind === 'main-cannon',
    );
    const after = findCommand<LineDrawCommand>(
      recoiled,
      (item) => item.kind === 'main-cannon',
    );
    const angle = Math.atan2(600 - 692, 70 - 195);
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    expect(before.points[0]).toMatchObject({ x: 195, y: 699 });
    expect(before.points[1]?.x).toBeCloseTo(195 + directionX * 38, 6);
    expect(before.points[1]?.y).toBeCloseTo(699 + directionY * 38, 6);

    for (let index = 0; index < before.points.length; index += 1) {
      expect(after.points[index]?.x).toBeCloseTo(
        before.points[index]!.x - directionX * recoil,
        6,
      );
      expect(after.points[index]?.y).toBeCloseTo(
        before.points[index]!.y - directionY * recoil,
        6,
      );
    }
  });

  it('turns the cannon toward the manual aim and draws a coral-and-cream reticle above the battlefield', () => {
    const commands = renderCommands({
      frame: { mainCannonAim: { x: 304, y: 214 } },
      timeMs: 42_200,
    });
    const cannon = findCommand<LineDrawCommand>(
      commands,
      (item) => item.kind === 'main-cannon',
    );
    const outer = findCommand<EllipseDrawCommand>(
      commands,
      (item) => item.kind === 'aim-reticle-outer',
    );
    const inner = findCommand<EllipseDrawCommand>(
      commands,
      (item) => item.kind === 'aim-reticle-inner',
    );
    const ticks = commands.filter((item): item is LineDrawCommand => (
      item.kind === 'aim-reticle-tick'
    ));

    expect(cannon.points[1]!.x).toBeGreaterThan(cannon.points[0]!.x);
    expect(cannon.points[1]!.y).toBeLessThan(cannon.points[0]!.y);
    expect(outer).toMatchObject({ x: 304, y: 214, stroke: '#ef785f', layer: 'front-effects' });
    expect(inner).toMatchObject({ x: 304, y: 214, stroke: '#fff2d2', layer: 'front-effects' });
    expect(ticks).toHaveLength(4);
    expect(ticks.every((tick) => tick.stroke === '#fff2d2')).toBe(true);
  });

  it('keeps the aim reticle geometry static when reduced motion is enabled', () => {
    const early = renderCommands({
      frame: { mainCannonAim: { x: 195, y: 214 } },
      reducedMotion: true,
      timeMs: 0,
    });
    const late = renderCommands({
      frame: { mainCannonAim: { x: 195, y: 214 } },
      reducedMotion: true,
      timeMs: 900,
    });
    const compact = (commands: readonly BattleDrawCommand[]) => commands
      .filter((item) => item.kind.startsWith('aim-reticle-'))
      .map((item) => JSON.stringify(item));

    expect(compact(late)).toEqual(compact(early));
  });

  it('renders calibrated cannon and body recoil from a real fire event', () => {
    const frame = createFrameFixture();
    const baselineController = new TrainMotionController(false, 'high');
    const firedController = new TrainMotionController(false, 'high');
    baselineController.reset(frame);
    firedController.reset(frame);
    baselineController.update(100 / 6, frame, []);
    firedController.update(100 / 6, frame, [{
      type: 'weapon-fired', projectileId: 99, source: 'main',
    }]);

    const recoilEnvelope = 5 / 6;
    expect(firedController.view.cannonRecoil).toBeCloseTo(
      recoilEnvelope * 4,
      6,
    );
    expect(Math.abs(
      firedController.view.offsetY - baselineController.view.offsetY,
    )).toBeLessThanOrEqual(recoilEnvelope * 0.6 + Number.EPSILON);

    const baseline = renderCommands({
      frame,
      trainMotion: baselineController.view,
    });
    const fired = renderCommands({
      frame,
      trainMotion: firedController.view,
    });
    const baselineTrain = findCommand<ImageDrawCommand>(
      baseline,
      (item) => item.kind === 'train',
    );
    const firedTrain = findCommand<ImageDrawCommand>(
      fired,
      (item) => item.kind === 'train',
    );
    expect(Math.abs(firedTrain.y - baselineTrain.y)).toBeLessThanOrEqual(
      recoilEnvelope * 0.6 + Number.EPSILON,
    );

    const firedCannon = findCommand<LineDrawCommand>(
      fired,
      (item) => item.kind === 'main-cannon',
    );
    const posedOnly = renderCommands({
      frame,
      trainMotion: { ...firedController.view, cannonRecoil: 0 },
    });
    const posedOnlyCannon = findCommand<LineDrawCommand>(
      posedOnly,
      (item) => item.kind === 'main-cannon',
    );
    expect(Math.hypot(
      firedCannon.points[0]!.x - posedOnlyCannon.points[0]!.x,
      firedCannon.points[0]!.y - posedOnlyCannon.points[0]!.y,
    )).toBeCloseTo(recoilEnvelope * 4, 6);
  });

  it('keeps essential travel motion in the low budget', () => {
    const painter = createRecordingPainter();
    new BattleRenderer(painter).render({
      ...createPresentationFixture(), renderBudget: getRenderBudget('low'),
    });
    const markers = painter.commands.filter(
      (item): item is LineDrawCommand => item.kind === 'travel-marker',
    );
    const wake = painter.commands.filter(
      (item): item is LineDrawCommand => item.kind === 'train-wake',
    );
    expect(markers).toHaveLength(3);
    expect(wake).toHaveLength(2);
    const markerMidpoints = markers.map((item) => (
      (item.points[0]!.x + item.points[1]!.x) / 2
    ));
    expect(markerMidpoints[0]).toBeLessThan(195);
    expect(markerMidpoints[1]).toBeCloseTo(195, 6);
    expect(markerMidpoints[2]).toBeGreaterThan(195);
    expect(wake[0]!.points[0]!.x).toBeLessThan(195);
    expect(wake[1]!.points[0]!.x).toBeGreaterThan(195);
  });

  it('requires the real cannon signature over low-quality waterway backgrounds at every travel phase', async () => {
    // @ts-expect-error The executable smoke helper intentionally ships as plain ESM.
    const { passesObjectEvidence } = await import('../../../scripts/lib/battle-pixel-evidence.mjs');
    for (const laneOffset of [0, 33, 91, 143]) {
      const painter = createRecordingPainter();
      new BattleRenderer(painter).render({
        ...createPresentationFixture({ trainMotion: { laneOffset } }),
        renderBudget: getRenderBudget('low'),
      });
      const commands = painter.commands;
      expect(commands.some((item) => item.kind === 'water-lane')).toBe(true);
      expect(commands.some((item) => item.kind === 'travel-marker')).toBe(true);
      const withoutTrain = commands.filter((item) => item.layer !== 'train');
      expect(passesObjectEvidence({
        target: trainSignatureFeature(withoutTrain),
        signature: 'train-cannon',
      })).toBe(false);
      expect(passesObjectEvidence({
        target: trainSignatureFeature(commands),
        signature: 'train-cannon',
      })).toBe(true);
    }
  });

  it('moves route markers deterministically with lane offset', () => {
    const first = renderCommands({ trainMotion: { laneOffset: 33 } });
    const repeated = renderCommands({ trainMotion: { laneOffset: 33 } });
    const advanced = renderCommands({ trainMotion: { laneOffset: 91 } });
    const markerPoints = (commands: readonly BattleDrawCommand[]) => commands
      .filter((item): item is LineDrawCommand => item.kind === 'travel-marker')
      .map(pointPairs);

    expect(markerPoints(repeated)).toEqual(markerPoints(first));
    expect(markerPoints(advanced)).not.toEqual(markerPoints(first));
  });

  it('isolates engine, low-power and detail alpha in observable commands', () => {
    const pose = { offsetX: 1, offsetY: -2, rotation: 0.006 };
    const dim = renderCommands({
      trainMotion: { ...pose, engineGlow: 0.2, lowPowerPulse: 0, detailAlpha: 1 },
    });
    const baseline = renderCommands({
      trainMotion: { ...pose, engineGlow: 0.9, lowPowerPulse: 0, detailAlpha: 1 },
    });
    const lowPowerOnly = renderCommands({
      trainMotion: { ...pose, engineGlow: 0.9, lowPowerPulse: 1, detailAlpha: 1 },
    });
    const detailOnly = renderCommands({
      trainMotion: { ...pose, engineGlow: 0.9, lowPowerPulse: 0, detailAlpha: 0.5 },
    });
    const dimEngine = findCommand<EllipseDrawCommand>(dim, (item) => item.kind === 'train-engine-glow');
    const baselineEngine = findCommand<EllipseDrawCommand>(baseline, (item) => item.kind === 'train-engine-glow');
    const lowPowerEngine = findCommand<EllipseDrawCommand>(lowPowerOnly, (item) => item.kind === 'train-engine-glow');
    const detailEngine = findCommand<EllipseDrawCommand>(detailOnly, (item) => item.kind === 'train-engine-glow');
    expect(baselineEngine.radiusX).toBeGreaterThan(dimEngine.radiusX);
    expect(baselineEngine.radiusY).toBeGreaterThan(dimEngine.radiusY);
    expect(baselineEngine.alpha).toBeGreaterThan(dimEngine.alpha!);
    expect(lowPowerEngine.alpha).toBeLessThan(baselineEngine.alpha!);
    expect(detailEngine.alpha).toBeLessThan(baselineEngine.alpha!);
    expect(lowPowerEngine).toMatchObject({
      x: baselineEngine.x,
      y: baselineEngine.y,
      rotation: baselineEngine.rotation,
    });
    expect(detailEngine).toMatchObject({
      x: baselineEngine.x,
      y: baselineEngine.y,
      rotation: baselineEngine.rotation,
    });

    for (const kind of ['train-core', 'train-window-flow'] as const) {
      const baselineCommand = findCommand<BattleDrawCommand>(baseline, (item) => item.kind === kind);
      const lowPowerCommand = findCommand<BattleDrawCommand>(lowPowerOnly, (item) => item.kind === kind);
      const detailCommand = findCommand<BattleDrawCommand>(detailOnly, (item) => item.kind === kind);
      expect(lowPowerCommand.alpha).toBeLessThan(baselineCommand.alpha!);
      expect(detailCommand.alpha).toBeLessThan(baselineCommand.alpha!);
    }

    for (const kind of ['travel-marker', 'train-wake'] as const) {
      const baselineCommands = baseline.filter((item) => item.kind === kind);
      const detailCommands = detailOnly.filter((item) => item.kind === kind);
      expect(detailCommands).toHaveLength(baselineCommands.length);
      for (let index = 0; index < baselineCommands.length; index += 1) {
        expect(detailCommands[index]?.alpha).toBeLessThan(
          baselineCommands[index]!.alpha!,
        );
        expect(detailCommands[index]).toMatchObject({
          points: (baselineCommands[index] as LineDrawCommand).points,
        });
      }
    }

    const baselineTrain = findCommand<ImageDrawCommand>(baseline, (item) => item.kind === 'train');
    for (const commands of [lowPowerOnly, detailOnly]) {
      expect(findCommand<ImageDrawCommand>(commands, (item) => item.kind === 'train')).toMatchObject({
        x: baselineTrain.x,
        y: baselineTrain.y,
        rotation: baselineTrain.rotation,
        width: baselineTrain.width,
        height: baselineTrain.height,
      });
    }
  });

  it('shuts down defeat power exactly while victory stays powered', () => {
    const defeatFrame = createFrameFixture({ status: 'defeat' });
    const defeatMotion = new TrainMotionController(false, 'high');
    defeatMotion.reset(createFrameFixture());
    for (let index = 0; index < 9; index += 1) {
      defeatMotion.update(100, defeatFrame, []);
    }

    expect(defeatMotion.view.speed).toBe(0);
    expect(defeatMotion.view.engineGlow).toBe(0);
    const defeated = renderCommands({
      frame: defeatFrame,
      trainMotion: defeatMotion.view,
    });
    for (const kind of [
      'train-engine-glow',
      'train-window-flow',
      'train-core',
    ] as const) {
      expect(findCommand<BattleDrawCommand>(
        defeated,
        (item) => item.kind === kind,
      ).alpha).toBe(0);
    }

    const victoryFrame = createFrameFixture({ status: 'victory' });
    const victoryMotion = new TrainMotionController(false, 'high');
    victoryMotion.reset(createFrameFixture());
    for (let index = 0; index < 14; index += 1) {
      victoryMotion.update(100, victoryFrame, []);
    }

    expect(victoryMotion.view.speed).toBeCloseTo(0.25, 6);
    expect(victoryMotion.view.engineGlow).toBeGreaterThan(0);
    const victorious = renderCommands({
      frame: victoryFrame,
      trainMotion: victoryMotion.view,
    });
    expect(findCommand<BattleDrawCommand>(
      victorious,
      (item) => item.kind === 'train-engine-glow',
    ).alpha).toBeGreaterThan(0);
    expect(findCommand<BattleDrawCommand>(
      victorious,
      (item) => item.kind === 'train-core',
    ).alpha).toBeGreaterThan(0);
  });

  it('moves only the window highlight with its flow phase', () => {
    const early = renderCommands({ trainMotion: { windowGlowPhase: 0.1 } });
    const late = renderCommands({ trainMotion: { windowGlowPhase: 0.8 } });
    const earlyWindow = findCommand<LineDrawCommand>(early, (item) => item.kind === 'train-window-flow');
    const lateWindow = findCommand<LineDrawCommand>(late, (item) => item.kind === 'train-window-flow');
    expect(pointPairs(lateWindow)).not.toEqual(pointPairs(earlyWindow));

    const earlyTrain = findCommand<ImageDrawCommand>(early, (item) => item.kind === 'train');
    const lateTrain = findCommand<ImageDrawCommand>(late, (item) => item.kind === 'train');
    expect(lateTrain).toMatchObject({
      x: earlyTrain.x,
      y: earlyTrain.y,
      rotation: earlyTrain.rotation,
    });
  });

  it('uses sea-foam shield treatment without changing the shared train pose', () => {
    const unshielded = renderCommands({ frame: { shield: 0 } });
    const shielded = renderCommands({ frame: { shield: 20 } });
    expect(unshielded.some((item) => item.kind === 'train-shield')).toBe(false);
    const shield = findCommand<EllipseDrawCommand>(shielded, (item) => item.kind === 'train-shield');
    expect(shield).toMatchObject({
      fill: 'rgba(132, 255, 226, 0.1)',
      stroke: 'rgba(159, 255, 234, 0.82)',
    });
    const unshieldedEngine = findCommand<EllipseDrawCommand>(unshielded, (item) => item.kind === 'train-engine-glow');
    const shieldedEngine = findCommand<EllipseDrawCommand>(shielded, (item) => item.kind === 'train-engine-glow');
    expect(shieldedEngine.fill).not.toBe(unshieldedEngine.fill);
    const unshieldedWindow = findCommand<LineDrawCommand>(unshielded, (item) => item.kind === 'train-window-flow');
    const shieldedWindow = findCommand<LineDrawCommand>(shielded, (item) => item.kind === 'train-window-flow');
    expect(shieldedWindow.stroke).not.toBe(unshieldedWindow.stroke);

    const unshieldedTrain = findCommand<ImageDrawCommand>(unshielded, (item) => item.kind === 'train');
    const shieldedTrain = findCommand<ImageDrawCommand>(shielded, (item) => item.kind === 'train');
    expect(shieldedTrain).toMatchObject({
      x: unshieldedTrain.x,
      y: unshieldedTrain.y,
      rotation: unshieldedTrain.rotation,
      width: unshieldedTrain.width,
      height: unshieldedTrain.height,
    });
  });

  it.each([
    ['high', 15, 6, 23, 24],
    ['medium', 9, 4, 14, 14],
    ['low', 3, 2, 6, 8],
  ] as const)(
    'keeps %s train effects within the painter-command cap',
    (quality, markerCount, wakeCount, expectedCount, cap) => {
      const painter = createRecordingPainter();
      new BattleRenderer(painter).render({
        ...createPresentationFixture(),
        renderBudget: getRenderBudget(quality),
      });
      const trainEffects = painter.commands.filter((item) => (
        item.kind === 'travel-marker'
        || item.kind === 'train-wake'
        || item.kind === 'train-engine-glow'
        || item.kind === 'train-window-flow'
      ));

      expect(trainEffects.filter((item) => item.kind === 'travel-marker')).toHaveLength(markerCount);
      expect(trainEffects.filter((item) => item.kind === 'train-wake')).toHaveLength(wakeCount);
      expect(trainEffects).toHaveLength(expectedCount);
      expect(trainEffects.length).toBeLessThanOrEqual(cap);
    },
  );

  it('frames captain titles with two hand-drawn strokes and a knot', () => {
    const commands = renderCommands({
      effects: {
        particles: [], damageNumbers: [], rings: [],
        camera: { x: 0, y: 0, rotation: 0, amplitude: 0 },
        cinematic: {
          darken: 0,
          title: '船长：断潮来袭 · 顺流换道',
          slowMotion: 0,
        },
      },
    });

    expect(commands.filter((item) => item.kind === 'boss-callout-stroke')).toHaveLength(2);
    expect(commands.filter((item) => item.kind === 'boss-callout-knot')).toHaveLength(1);
  });

  it('does not frame unrelated cinematic titles as captain callouts', () => {
    const commands = renderCommands({
      effects: {
        particles: [], damageNumbers: [], rings: [],
        camera: { x: 0, y: 0, rotation: 0, amplitude: 0 },
        cinematic: { darken: 0, title: '深海回响正在靠近', slowMotion: 0 },
      },
    });

    expect(commands.some((item) => (
      item.kind === 'boss-callout-stroke' || item.kind === 'boss-callout-knot'
    ))).toBe(false);
  });
});
