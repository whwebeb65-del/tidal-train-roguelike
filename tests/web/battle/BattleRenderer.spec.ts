import { describe, expect, it } from 'vitest';
import { BattleRenderer } from '../../../web/battle/BattleRenderer';
import type { EffectFrameView } from '../../../web/battle/EffectSystem';
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

describe('BattleRenderer', () => {
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
});
