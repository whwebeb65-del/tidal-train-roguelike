import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { BattleRenderer } from '../../web/battle/BattleRenderer';
import type {
  BattleDrawCommand,
  EllipseDrawCommand,
  LineDrawCommand,
} from '../../web/battle/BattleDrawTypes';
import type {
  EffectFrameView,
} from '../../web/battle/EffectSystem';
import type { EnemyState } from '../../web/battle/BattleTypes';
import { getSkillEvolutionVisualSignature } from '../../web/battle/SkillEvolutionVisualCatalog';
import type { SkillVariantId } from '../../src/domain/skill/SkillProgressionTypes';
import { createPresentationFixture } from '../web/battle/helpers/BattleFixtures';
import { createRecordingPainter } from '../web/battle/helpers/RecordingPainter';

const helperPath = '../../scripts/lib/battle-pixel-evidence.mjs';

async function loadHelpers(): Promise<Record<string, (...args: any[]) => any>> {
  return import(/* @vite-ignore */ helperPath).catch(() => ({}));
}

const feature = (
  color: readonly [number, number, number],
  shape: readonly number[],
) => ({ meanColor: color, shapeProfile: shape });

const background = feature([180, 150, 120], [0.7, 0.7, 0.7, 0.7]);
const target = feature([70, 110, 145], [0.2, 0.8, 0.3, 0.7]);
const cue = feature([49, 92, 112], [0.1, 0.9, 0.8, 0.15]);
const squashMid = feature([54, 96, 118], [0.12, 0.84, 0.7, 0.22]);
const squashLate = feature([61, 104, 124], [0.18, 0.72, 0.54, 0.36]);
const projectileSpeck = feature([68, 109, 144], [0.2, 0.8, 0.31, 0.7]);

function validDefeatEvidence() {
  return {
    killedEnemyId: 7,
    deadEnemy: { id: 7, alive: false, x: 92, y: 250 },
    targetAnchor: { x: 92, y: 250 },
    targetRegion: { x: 98.5, y: 260.5, width: 1, height: 1 },
    preTarget: target,
    preControl: background,
    frames: [0.2, 0.5, 0.8].map((progress, index) => ({
      target: [cue, squashMid, squashLate][index],
      control: background,
      defeatSquash: {
        id: 31,
        kind: 'defeat-squash',
        sourceEnemyId: 7,
        originX: 92,
        originY: 250,
        x: 92,
        y: 250,
        size: 24,
        rotation: 0,
        progress,
      },
      dynamicBounds: [],
    })),
  };
}

const LOGICAL_WIDTH = 390;
const LOGICAL_HEIGHT = 844;

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
  return Math.hypot(
    x - (start.x + dx * amount),
    y - (start.y + dy * amount),
  );
}

function commandPaintsPixel(
  command: LineDrawCommand | EllipseDrawCommand,
  x: number,
  y: number,
): boolean {
  if ('points' in command) {
    return command.points.slice(1).some((point, index) => (
      distanceToSegment(x, y, command.points[index]!, point)
        <= command.lineWidth / 2
    ));
  }
  const rotation = -(command.rotation ?? 0);
  const dx = x - command.x;
  const dy = y - command.y;
  const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
  const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
  const normalizedRadius = Math.sqrt(
    (localX / command.radiusX) ** 2 + (localY / command.radiusY) ** 2,
  );
  if (command.fill && normalizedRadius <= 1) return true;
  if (!command.stroke) return false;
  const strokeDistance = Math.abs(normalizedRadius - 1)
    * Math.min(command.radiusX, command.radiusY);
  return strokeDistance <= (command.lineWidth ?? 1) / 2;
}

function rasterizeMotif(
  commands: readonly BattleDrawCommand[],
  kind: string,
  expectedColor: string,
): Float32Array {
  const pixels = new Float32Array(LOGICAL_WIDTH * LOGICAL_HEIGHT);
  const motif = commands.filter((command): command is LineDrawCommand | EllipseDrawCommand => (
    command.kind === kind
      && (
        ('points' in command && command.stroke === expectedColor)
        || (
          'radiusX' in command
            && (command.stroke === expectedColor || command.fill === expectedColor)
        )
      )
  ));
  for (const command of motif) {
    const sourceAlpha = Math.min(1, Math.max(0, command.alpha ?? 1));
    if (sourceAlpha <= 0) continue;
    for (let y = 0; y < LOGICAL_HEIGHT; y += 1) {
      for (let x = 0; x < LOGICAL_WIDTH; x += 1) {
        if (!commandPaintsPixel(command, x + 0.5, y + 0.5)) continue;
        const pixelIndex = y * LOGICAL_WIDTH + x;
        const destinationAlpha = pixels[pixelIndex] ?? 0;
        pixels[pixelIndex] = sourceAlpha
          + destinationAlpha * (1 - sourceAlpha);
      }
    }
  }
  return pixels;
}

function coloredPixelCount(
  pixels: ArrayLike<number>,
  region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): number {
  let count = 0;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      count += pixels[y * LOGICAL_WIDTH + x] ?? 0;
    }
  }
  return count;
}

function largestFilledRectangle(pixels: ArrayLike<number>): number {
  const heights = new Uint16Array(LOGICAL_WIDTH);
  let largest = 0;
  for (let y = 0; y < LOGICAL_HEIGHT; y += 1) {
    for (let x = 0; x < LOGICAL_WIDTH; x += 1) {
      heights[x] = pixels[y * LOGICAL_WIDTH + x] ? heights[x]! + 1 : 0;
    }
    const stack: number[] = [];
    for (let x = 0; x <= LOGICAL_WIDTH; x += 1) {
      const height = x === LOGICAL_WIDTH ? 0 : heights[x]!;
      while (stack.length > 0 && heights[stack.at(-1)!]! > height) {
        const top = stack.pop()!;
        const width = stack.length === 0 ? x : x - stack.at(-1)! - 1;
        largest = Math.max(largest, heights[top]! * width);
      }
      stack.push(x);
    }
  }
  return largest;
}

function renderEvolutionMotif(
  variantId: SkillVariantId,
  alpha = 1,
  size = 12,
): {
  readonly commands: readonly BattleDrawCommand[];
  readonly primary: string;
  readonly secondary: string;
  readonly particleKind: string;
} {
  const signature = getSkillEvolutionVisualSignature(variantId);
  const effects: EffectFrameView = {
    particles: [{
      id: 501,
      kind: signature.particleKind,
      layer: 'front-effects',
      x: 195,
      y: 430,
      size,
      color: signature.primary,
      secondaryColor: signature.secondary,
      alpha,
      rotation: 0,
      progress: 0.4,
    }],
    damageNumbers: [], rings: [],
    camera: { x: 0, y: 0, rotation: 0, amplitude: 0 },
    cinematic: { darken: 0, title: null, slowMotion: 0 },
  };
  const painter = createRecordingPainter();
  new BattleRenderer(painter).render(createPresentationFixture({ effects }));
  return {
    commands: painter.commands,
    primary: signature.primary,
    secondary: signature.secondary,
    particleKind: signature.particleKind,
  };
}

function passesMotifPixelEvidence(
  commands: readonly BattleDrawCommand[],
  drawKind: string,
  expectedColor: string,
  expectedRegion: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): boolean {
  const pixels = rasterizeMotif(commands, drawKind, expectedColor);
  return coloredPixelCount(pixels, expectedRegion) > 0
    && largestFilledRectangle(pixels) < LOGICAL_WIDTH * LOGICAL_HEIGHT * 0.35;
}

type BossPixelState = 'boss-summon' | 'boss-tide' | 'boss-enraged-open' | 'boss-enraged-closed';

function renderBossPixelState(
  state: BossPixelState,
  options: { readonly reducedMotion?: boolean; readonly timeMs?: number } = {},
): readonly BattleDrawCommand[] {
  const phase = state === 'boss-summon' || state === 'boss-tide'
    ? state
    : 'boss-enraged';
  const weakPointOpen = state === 'boss-enraged-open';
  const enemy: EnemyState = {
    id: 91, kind: 'deep-echo-boss', lane: 1, x: 195, y: 250,
    hp: 800, maxHp: 1000, shield: 0, speedPerSecond: 0,
    defenceBroken: false, attackCooldownMs: 1000, ageMs: 0, alive: true,
    behaviour: {
      phase, phaseRemainingMs: phase === 'boss-summon' ? 4000 : 600,
      cycle: 3, targetLane: 1, safeLane: 1, invulnerable: false,
      damageTakenMultiplier: phase === 'boss-enraged' ? 1.1 : 1,
      weakPointOpen,
    },
  };
  const input = createPresentationFixture({
    frame: { projectiles: [], loot: [], enemies: [enemy] },
    reducedMotion: options.reducedMotion ?? false,
    timeMs: options.timeMs ?? 900,
  });
  const painter = createRecordingPainter();
  new BattleRenderer(painter).render(input);
  return painter.commands;
}

function onlyBossTelegraphCommands(commands: readonly BattleDrawCommand[]): readonly BattleDrawCommand[] {
  return commands.filter((command) => command.kind.startsWith('boss-') && command.layer === 'front-effects');
}

const bossPixelCases = [
  ['summon beacon', 'boss-summon', 'boss-summon-beacon', '#8a7dff', { x: 54, y: 220, width: 282, height: 150 }],
  ['safe tide current', 'boss-tide', 'boss-safe-lane', '#6fffd4', { x: 120, y: 150, width: 150, height: 460 }],
  ['danger tide current', 'boss-tide', 'boss-danger-lane', '#ff6f67', { x: 30, y: 150, width: 330, height: 460 }],
  ['open tide eye', 'boss-enraged-open', 'boss-weakpoint-petal', '#fff2a2', { x: 140, y: 180, width: 110, height: 150 }],
  ['closed tide eye', 'boss-enraged-closed', 'boss-weakpoint-petal', '#786ee8', { x: 140, y: 180, width: 110, height: 150 }],
] as const satisfies readonly (readonly [
  string,
  BossPixelState,
  string,
  string,
  { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
])[];

describe('battle pixel evidence helpers', () => {
  it.each([
    ['split chevrons', 'split-tide-arrow', 'split-chevron', 'effect-split-chevron', { x: 176, y: 414, width: 8, height: 8 }],
    ['returning arc', 'returning-volley', 'returning-arc', 'effect-returning-arc', { x: 163, y: 426, width: 8, height: 8 }],
    ['rainstorm fan', 'rainstorm-school', 'rainstorm-fin', 'effect-rainstorm-fin', { x: 214, y: 411, width: 9, height: 9 }],
    ['bubble fracture', 'bursting-bubble', 'bubble-fracture', 'effect-bubble-fracture', { x: 220, y: 426, width: 9, height: 9 }],
    ['overflow double membrane', 'overflow-membrane', 'overflow-droplet', 'effect-overflow-droplet', { x: 213, y: 425, width: 9, height: 10 }],
    ['emergency beacon', 'emergency-trigger', 'emergency-beacon', 'effect-emergency-beacon', { x: 191, y: 401, width: 9, height: 9 }],
    ['undertow eye', 'undertow-eye', 'undertow-eye', 'effect-undertow-eye', { x: 220, y: 425, width: 10, height: 10 }],
    ['double crest', 'double-crest', 'second-crest', 'effect-second-crest', { x: 159, y: 436, width: 9, height: 10 }],
  ] as const)(
    'captures the catalog color for the %s without a battle-sized filled rectangle',
    (_name, variantId, particleKind, drawKind, expectedRegion) => {
      const signature = getSkillEvolutionVisualSignature(variantId);
      const rendered = renderEvolutionMotif(variantId);
      const { commands } = rendered;
      expect(rendered).toMatchObject({
        primary: signature.primary,
        secondary: signature.secondary,
        particleKind,
      });
      const motifCommands = commands.filter((command) => command.kind === drawKind);
      expect(motifCommands.length).toBeGreaterThan(0);
      expect(motifCommands.every((command) => (
        (command.alpha ?? 1) > 0
        && (
          ('points' in command && (
            command.stroke === signature.primary
              || command.stroke === signature.secondary
          ))
          || (
            'radiusX' in command
              && (
                command.stroke === signature.primary
                  || command.fill === signature.primary
                  || command.stroke === signature.secondary
                  || command.fill === signature.secondary
              )
          )
        )
      ))).toBe(true);
      const pixels = rasterizeMotif(commands, drawKind, signature.primary);
      const secondaryPixels = rasterizeMotif(
        commands,
        drawKind,
        signature.secondary,
      );
      expect(coloredPixelCount(pixels, expectedRegion)).toBeGreaterThan(0);
      expect(coloredPixelCount(secondaryPixels, {
        x: 145,
        y: 385,
        width: 100,
        height: 90,
      })).toBeGreaterThan(0);
      expect(largestFilledRectangle(pixels)).toBeLessThan(
        LOGICAL_WIDTH * LOGICAL_HEIGHT * 0.35,
      );
      expect(passesMotifPixelEvidence(
        commands,
        drawKind,
        signature.primary,
        expectedRegion,
      )).toBe(true);
    },
  );

  it('keeps both undertow-eye colors visible at the rank-one particle size', () => {
    const rendered = renderEvolutionMotif('undertow-eye', 0.65, 3.85);
    const motifRegion = { x: 184, y: 418, width: 23, height: 24 };
    const primaryPixels = rasterizeMotif(
      rendered.commands,
      'effect-undertow-eye',
      rendered.primary,
    );
    const secondaryPixels = rasterizeMotif(
      rendered.commands,
      'effect-undertow-eye',
      rendered.secondary,
    );

    expect(coloredPixelCount(primaryPixels, motifRegion)).toBeGreaterThan(35);
    expect(coloredPixelCount(secondaryPixels, motifRegion)).toBeGreaterThan(35);
  });

  it('rejects same-color motif geometry when its final alpha is zero', () => {
    const expectedRegion = { x: 176, y: 414, width: 8, height: 8 };
    const signature = getSkillEvolutionVisualSignature('split-tide-arrow');
    const visible = renderEvolutionMotif('split-tide-arrow', 1);
    const transparent = renderEvolutionMotif('split-tide-arrow', 0);
    const motifGeometry = (commands: readonly BattleDrawCommand[]) => commands
      .filter((command) => command.kind === 'effect-split-chevron')
      .map(({ alpha: _alpha, ...command }) => command);
    expect(motifGeometry(transparent.commands)).toEqual(
      motifGeometry(visible.commands),
    );
    const visiblePixels = rasterizeMotif(
      visible.commands,
      'effect-split-chevron',
      signature.primary,
    );
    const transparentPixels = rasterizeMotif(
      transparent.commands,
      'effect-split-chevron',
      signature.primary,
    );
    const visibleSecondaryPixels = rasterizeMotif(
      visible.commands,
      'effect-split-chevron',
      signature.secondary,
    );
    const transparentSecondaryPixels = rasterizeMotif(
      transparent.commands,
      'effect-split-chevron',
      signature.secondary,
    );

    expect(coloredPixelCount(visiblePixels, expectedRegion)).toBeGreaterThan(0);
    expect(coloredPixelCount(transparentPixels, expectedRegion)).toBe(0);
    const motifRegion = { x: 145, y: 385, width: 100, height: 90 };
    expect(coloredPixelCount(visibleSecondaryPixels, motifRegion)).toBeGreaterThan(0);
    expect(coloredPixelCount(transparentSecondaryPixels, motifRegion)).toBe(0);
    expect(passesMotifPixelEvidence(
      transparent.commands,
      'effect-split-chevron',
      signature.primary,
      expectedRegion,
    )).toBe(false);
    expect(passesMotifPixelEvidence(
      transparent.commands,
      'effect-split-chevron',
      signature.secondary,
      motifRegion,
    )).toBe(false);
  });

  it('detects a single filled rectangular component above 35% of the logical battle area', () => {
    const pixels = new Uint8Array(LOGICAL_WIDTH * LOGICAL_HEIGHT);
    for (let y = 0; y < 300; y += 1) {
      pixels.fill(1, y * LOGICAL_WIDTH, (y + 1) * LOGICAL_WIDTH);
    }
    expect(largestFilledRectangle(pixels)).toBeGreaterThan(
      LOGICAL_WIDTH * LOGICAL_HEIGHT * 0.35,
    );
  });

  it('keeps the battle HUD as a compact hand-drawn tide log with accessible rank states', async () => {
    const css = await readFile(new URL('../../web/styles/battle-hud.css', import.meta.url), 'utf8');

    expect(css).toContain('.battle-hud__tide-log');
    expect(css).toContain('max-height: 108px');
    expect(css).toContain('.battle-skill[data-rank="3"]');
    expect(css).toContain('.battle-skill[data-rank="5"]');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).not.toContain('backdrop-filter');
  });

  it('maps logical bounds with production uniform scale, DPR and letterbox offsets', async () => {
    const helpers = await loadHelpers();
    expect(helpers.createEvidenceViewport).toBeTypeOf('function');
    expect(helpers.logicalRectToPixelRect).toBeTypeOf('function');

    const viewport = helpers.createEvidenceViewport({
      cssWidth: 430,
      cssHeight: 932,
      devicePixelRatio: 3,
      maxDevicePixelRatio: 2,
    });
    const scale = Math.min(430 / 390, 932 / 844);
    expect(viewport).toMatchObject({
      logicalWidth: 390,
      logicalHeight: 844,
      scale,
      offsetX: Math.max(0, (430 - 390 * scale) / 2),
      offsetY: Math.max(0, (932 - 844 * scale) / 2),
      pixelRatio: 2,
      pixelWidth: 860,
      pixelHeight: 1864,
    });
    expect(helpers.logicalRectToPixelRect(
      { x: 100, y: 200, width: 20, height: 30 },
      viewport,
    )).toEqual({
      x: Math.floor((viewport.offsetX + 100 * scale) * 2),
      y: Math.floor((viewport.offsetY + 200 * scale) * 2),
      width: Math.ceil(20 * scale * 2),
      height: Math.ceil(30 * scale * 2),
    });
  });

  it('predicts the next enemy sample at exactly one production fixed step', async () => {
    const helpers = await loadHelpers();
    expect(helpers.predictNextEnemyRegion).toBeTypeOf('function');
    const region = helpers.predictNextEnemyRegion({
      id: 7,
      x: 92,
      y: 138.733333333333,
      speedPerSecond: 52,
    });
    expect(region).toMatchObject({
      id: 7,
      name: 'enemy-7-predicted-death',
      x: 76,
      width: 32,
      height: 32,
    });
    expect(region.y + 16).toBeCloseTo(138.733333333333 + 52 / 60, 12);
  });

  it('places defeat samples inside the stable painted squash lobes', async () => {
    const helpers = await loadHelpers();
    expect(helpers.predictDefeatSampleRegions).toBeTypeOf('function');
    const regions = helpers.predictDefeatSampleRegions({
      id: 7,
      x: 92,
      y: 249.133333333333,
      speedPerSecond: 52,
    });
    expect(regions).toMatchObject([
      {
        enemyId: 7,
        deathX: 92,
        x: 112,
        width: 2,
        height: 2,
      },
      {
        enemyId: 7,
        deathX: 92,
        x: 70,
        width: 2,
        height: 2,
      },
    ]);
    for (const region of regions) {
      expect(region.deathY).toBeCloseTo(250, 12);
      expect(region.y).toBeCloseTo(252, 12);
    }
  });

  it('fails object evidence when the target is removed but background remains', async () => {
    const helpers = await loadHelpers();
    expect(helpers.passesObjectEvidence).toBeTypeOf('function');
    expect(helpers.passesObjectEvidence({
      target: background,
      backgroundBaseline: background,
    })).toBe(false);
    expect(helpers.passesObjectEvidence({
      target,
      backgroundBaseline: background,
    })).toBe(true);
  });

  it.each([
    {
      name: 'train',
      retainedBackground: feature(
        [38, 91, 125],
        [0.18, 0.27, 0.42, 0.55, 0.38, 0.24, 0.16, 0.31, 0.47],
      ),
      distantControl: feature(
        [151, 122, 102],
        [0.64, 0.58, 0.52, 0.41, 0.39, 0.46, 0.57, 0.63, 0.68],
      ),
    },
    {
      name: 'enemy',
      retainedBackground: feature(
        [27, 74, 116],
        [0.12, 0.2, 0.34, 0.47, 0.52, 0.4, 0.25, 0.16, 0.29],
      ),
      distantControl: feature(
        [116, 151, 139],
        [0.57, 0.65, 0.61, 0.48, 0.44, 0.5, 0.62, 0.7, 0.66],
      ),
    },
  ])('rejects a removed $name over a retained heterogeneous background', async ({
    retainedBackground,
    distantControl,
  }) => {
    const helpers = await loadHelpers();
    expect(helpers.passesObjectEvidence({
      target: retainedBackground,
      control: distantControl,
      backgroundBaseline: retainedBackground,
    })).toBe(false);
  });

  it('requires the train cannon signature when no same-location baseline exists', async () => {
    const helpers = await loadHelpers();
    const trainCannon = {
      ...feature([112, 171, 185], [0.2, 0.31, 0.22, 0.28, 0.78, 0.32, 0.2, 0.29, 0.23]),
      brightCyanFraction: 0.16,
      centerBrightFraction: 0.52,
    };
    const retainedBackground = {
      ...feature([38, 91, 125], [0.18, 0.27, 0.42, 0.55, 0.38, 0.24, 0.16, 0.31, 0.47]),
      brightCyanFraction: 0.01,
      centerBrightFraction: 0.03,
    };
    expect(helpers.passesObjectEvidence({
      target: trainCannon,
      signature: 'train-cannon',
    })).toBe(true);
    expect(helpers.passesObjectEvidence({
      target: retainedBackground,
      signature: 'train-cannon',
    })).toBe(false);
  });

  it('rejects a control intersecting an adjacent-lane dynamic object', async () => {
    const helpers = await loadHelpers();
    expect(helpers.selectSafeControlRegion).toBeTypeOf('function');
    expect(() => helpers.selectSafeControlRegion({
      target: { x: 45, y: 220, width: 32, height: 32 },
      candidates: [
        { x: 92, y: 220, width: 32, height: 32 },
        { x: 300, y: 220, width: 32, height: 32 },
      ],
      dynamicBounds: [
        { id: 'adjacent-enemy', x: 90, y: 215, width: 40, height: 45 },
      ],
    })).not.toThrow();
    expect(helpers.selectSafeControlRegion({
      target: { x: 45, y: 220, width: 32, height: 32 },
      candidates: [{ x: 92, y: 220, width: 32, height: 32 }],
      dynamicBounds: [
        { id: 'adjacent-enemy', x: 90, y: 215, width: 40, height: 45 },
      ],
    })).toBeNull();
  });

  it('rejects logically separate bounds that overlap after pixel rounding', async () => {
    const helpers = await loadHelpers();
    const viewport = helpers.createEvidenceViewport({
      cssWidth: 390,
      cssHeight: 844,
      devicePixelRatio: 1,
      maxDevicePixelRatio: 1,
    });
    expect(helpers.selectSafeControlRegion({
      target: { x: 100, y: 100, width: 10, height: 10 },
      candidates: [{ x: 20, y: 20, width: 0.1, height: 0.1 }],
      dynamicBounds: [
        { id: 'projectile', x: 20.11, y: 20, width: 0.1, height: 0.1 },
      ],
      viewport,
    })).toBeNull();
  });

  it('accepts the shared valid three-frame identity-bound defeat fixture', async () => {
    const helpers = await loadHelpers();
    expect(helpers.passesDefeatCueEvidence).toBeTypeOf('function');
    expect(helpers.passesDefeatCueEvidence(validDefeatEvidence())).toBe(true);
  });

  it('rejects valid squash geometry when target and control pixels stay at baseline', async () => {
    const helpers = await loadHelpers();
    const input = structuredClone(validDefeatEvidence());
    for (const frame of input.frames) frame.target = input.preTarget;
    expect(helpers.passesDefeatCueEvidence(input)).toBe(false);
  });

  it('rejects stable enemy-free background after a one-time disappearance', async () => {
    const helpers = await loadHelpers();
    const input = structuredClone(validDefeatEvidence());
    for (const frame of input.frames) frame.target = input.preControl;
    expect(helpers.compareRegionAppearance(
      input.preTarget,
      input.frames[0].target,
    ).colorDifference).toBeGreaterThan(4);
    expect(helpers.passesDefeatCueEvidence(input)).toBe(false);
  });

  it('rejects a target-only projectile speck without a true squash pixel pattern', async () => {
    const helpers = await loadHelpers();
    const input = structuredClone(validDefeatEvidence());
    input.frames[0].target = projectileSpeck;
    input.frames[1].target = input.preTarget;
    input.frames[2].target = input.preTarget;
    expect(helpers.compareRegionAppearance(
      input.preTarget,
      input.frames[0].target,
    ).colorDifference).toBeGreaterThan(0);
    expect(helpers.passesDefeatCueEvidence(input)).toBe(false);
  });

  it.each([
    {
      name: 'no cue in one required frame',
      mutate(input: any) {
        input.frames[0].defeatSquash = undefined;
      },
    },
    {
      name: 'enemy disappearance without a defeat cue',
      mutate(input: any) {
        for (const frame of input.frames) frame.defeatSquash = undefined;
      },
    },
    {
      name: 'projectile-only geometry',
      mutate(input: any) {
        for (const frame of input.frames) frame.defeatSquash.kind = 'projectile';
      },
    },
    {
      name: 'wrong dead-enemy identity',
      mutate(input: any) {
        input.deadEnemy.id = 8;
      },
    },
    {
      name: 'one overlapping non-defeat effect',
      mutate(input: any) {
        input.frames[1].dynamicBounds = [{
          id: 'effect-ink-bubble-44',
          kind: 'effect',
          effectKind: 'ink-bubble',
          x: 98.5,
          y: 260.5,
          width: 1,
          height: 1,
        }];
      },
    },
  ])('rejects $name by changing one dimension of the shared fixture', async ({ mutate }) => {
    const helpers = await loadHelpers();
    const input = structuredClone(validDefeatEvidence());
    mutate(input);
    expect(helpers.passesDefeatCueEvidence(input)).toBe(false);
  });

  it('consumes exact effect geometry and rejects an overlapping control', async () => {
    const helpers = await loadHelpers();
    expect(helpers.buildBattleDynamicBounds).toBeTypeOf('function');
    const bounds = helpers.buildBattleDynamicBounds({
      enemies: [],
      projectiles: [],
      loot: [],
      effects: {
        particles: [{
          id: 81,
          kind: 'ink-bubble',
          x: 124,
          y: 236,
          size: 8,
          progress: 0.2,
        }],
        damageNumbers: [],
        rings: [],
      },
    }, null);
    expect(bounds).toContainEqual(expect.objectContaining({
      id: 'effect-ink-bubble-81',
      x: 116,
      y: 228,
      width: 16,
      height: 16,
    }));
    expect(helpers.selectSafeControlRegion({
      target: { x: 70, y: 220, width: 32, height: 32 },
      candidates: [{ x: 108, y: 220, width: 32, height: 32 }],
      dynamicBounds: bounds,
    })).toBeNull();
  });

  it.each(['brush-smear', 'armour-shard', 'defeat-shard'])(
    'rejects a rotated %s whose rendered pixels overlap the target',
    async (kind) => {
    const helpers = await loadHelpers();
    const input = structuredClone(validDefeatEvidence());
    input.frames[1].dynamicBounds = helpers.buildBattleDynamicBounds({
      enemies: [], projectiles: [], loot: [],
      effects: {
        particles: [{
          id: 82,
          kind,
          x: 95,
          y: 252,
          size: 8,
          rotation: Math.PI / 4,
          progress: 0.4,
        }],
        damageNumbers: [], rings: [],
      },
    }, null).filter((item: any) => item.id !== 'train');
    expect(helpers.passesDefeatCueEvidence(input)).toBe(false);
    },
  );

  it('rejects a diagonal impact-ring arc overlapping the target', async () => {
    const helpers = await loadHelpers();
    const input = structuredClone(validDefeatEvidence());
    input.frames[1].dynamicBounds = helpers.buildBattleDynamicBounds({
      enemies: [], projectiles: [], loot: [],
      effects: {
        particles: [], damageNumbers: [],
        rings: [{ id: 61, x: 92, y: 250, radius: 20 }],
      },
    }, null).filter((item: any) => item.id !== 'train');
    expect(helpers.passesDefeatCueEvidence(input)).toBe(false);
  });

  it('rejects squash metadata whose rendered geometry misses the target sample', async () => {
    const helpers = await loadHelpers();
    const input = structuredClone(validDefeatEvidence());
    for (const frame of input.frames) frame.defeatSquash.x = 200;
    expect(helpers.passesDefeatCueEvidence(input)).toBe(false);
  });

  it('accepts multi-frame squash pixel evolution with stable paired controls', async () => {
    const helpers = await loadHelpers();
    const input = structuredClone(validDefeatEvidence());
    for (let index = 1; index < input.frames.length; index += 1) {
      const prior = input.frames[index - 1];
      const frame = input.frames[index];
      expect(helpers.compareRegionAppearance(
        prior.target,
        frame.target,
      ).colorDifference).toBeGreaterThan(helpers.compareRegionAppearance(
        prior.control,
        frame.control,
      ).colorDifference);
    }
    expect(helpers.passesDefeatCueEvidence(input)).toBe(true);
  });

  it('models an impact ring as a hollow stroke instead of a solid box', async () => {
    const helpers = await loadHelpers();
    const bounds = helpers.buildBattleDynamicBounds({
      enemies: [],
      projectiles: [],
      loot: [],
      effects: {
        particles: [],
        damageNumbers: [],
        rings: [{ id: 61, x: 92, y: 250, radius: 40 }],
      },
    }, null);
    const centralWindow = { x: 76, y: 234, width: 32, height: 32 };
    expect(bounds.some((item: any) => (
      item.id.startsWith('ring-61')
      && helpers.boundsIntersectRect(item, centralWindow)
    ))).toBe(false);
    expect(helpers.selectSafeControlRegion({
      target: centralWindow,
      candidates: [{ x: 126, y: 246, width: 12, height: 12 }],
      dynamicBounds: bounds,
    })).toBeNull();
  });
});

describe('boss cinematic pixel evidence', () => {
  it.each(bossPixelCases)(
    'captures %s from real renderer commands without a battle-sized filled rectangle',
    (_name, state, kind, color, region) => {
      const visible = renderBossPixelState(state);
      const visiblePixels = rasterizeMotif(visible, kind, color);
      const transparent = visible.map((command) => (
        command.kind === kind ? { ...command, alpha: 0 } : command
      ));

      expect(coloredPixelCount(visiblePixels, region)).toBeGreaterThan(0);
      expect(largestFilledRectangle(visiblePixels)).toBeLessThan(
        LOGICAL_WIDTH * LOGICAL_HEIGHT * 0.35,
      );
      expect(passesMotifPixelEvidence(visible, kind, color, region)).toBe(true);
      expect(coloredPixelCount(rasterizeMotif(transparent, kind, color), region)).toBe(0);
      expect(passesMotifPixelEvidence(transparent, kind, color, region)).toBe(false);
      expect(coloredPixelCount(rasterizeMotif(visible, kind, '#000001'), region)).toBe(0);
      expect(passesMotifPixelEvidence(visible, kind, '#000001', region)).toBe(false);
    },
  );

  it('freezes the real tide telegraph pixels for reduced motion', () => {
    const atStart = onlyBossTelegraphCommands(renderBossPixelState('boss-tide', {
      reducedMotion: true,
      timeMs: 0,
    }));
    const later = onlyBossTelegraphCommands(renderBossPixelState('boss-tide', {
      reducedMotion: true,
      timeMs: 5000,
    }));

    expect(later).toEqual(atStart);
    expect(rasterizeMotif(later, 'boss-safe-lane', '#6fffd4')).toEqual(
      rasterizeMotif(atStart, 'boss-safe-lane', '#6fffd4'),
    );
    expect(rasterizeMotif(later, 'boss-danger-lane', '#ff6f67')).toEqual(
      rasterizeMotif(atStart, 'boss-danger-lane', '#ff6f67'),
    );
  });
});
