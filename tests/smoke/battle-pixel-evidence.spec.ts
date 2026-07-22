import { describe, expect, it } from 'vitest';

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

describe('battle pixel evidence helpers', () => {
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

  it('accepts only multi-frame evolution of the same identity-bound defeat squash', async () => {
    const helpers = await loadHelpers();
    expect(helpers.passesDefeatCueEvidence).toBeTypeOf('function');
    expect(helpers.passesDefeatCueEvidence({
      killedEnemyId: 7,
      deadEnemy: { id: 7, alive: false, x: 92, y: 250 },
      preTarget: target,
      preControl: background,
      targetRegion: { x: 76, y: 234, width: 32, height: 32 },
      frames: [
        {
          target: cue,
          control: background,
          defeatSquash: { id: 31, sourceEnemyId: 7, originX: 92, originY: 250, x: 92, y: 250, size: 24, progress: 0.1 },
          dynamicBounds: [],
        },
        {
          target: squashMid,
          control: background,
          defeatSquash: { id: 31, sourceEnemyId: 7, originX: 92, originY: 250, x: 92, y: 250.07, size: 24, progress: 0.42 },
          dynamicBounds: [],
        },
        {
          target: squashLate,
          control: background,
          defeatSquash: { id: 31, sourceEnemyId: 7, originX: 92, originY: 250, x: 92, y: 250.21, size: 24, progress: 0.78 },
          dynamicBounds: [],
        },
      ],
    })).toBe(true);
  });

  it('rejects a localized projectile-only change when the control stays unchanged', async () => {
    const helpers = await loadHelpers();
    expect(helpers.passesDefeatCueEvidence({
      killedEnemyId: 7,
      deadEnemy: { id: 7, alive: false, x: 92, y: 250 },
      preTarget: target,
      cueTarget: cue,
      followupTarget: background,
      preControl: background,
      cueControl: background,
      followupControl: background,
    })).toBe(false);
    expect(helpers.passesDefeatCueEvidence({
      killedEnemyId: 7,
      deadEnemy: { id: 7, alive: false, x: 92, y: 250 },
      preTarget: target,
      preControl: background,
      targetRegion: { x: 76, y: 234, width: 32, height: 32 },
      frames: [
        { target: cue, control: background, dynamicBounds: [] },
        { target: background, control: background, dynamicBounds: [] },
        { target: background, control: background, dynamicBounds: [] },
      ],
    })).toBe(false);
  });

  it.each([
    {
      name: 'no defeat cue',
      cueTarget: target,
      followupTarget: target,
      cueControl: background,
      followupControl: background,
    },
    {
      name: 'enemy disappearance only',
      cueTarget: background,
      followupTarget: background,
      cueControl: background,
      followupControl: background,
    },
    {
      name: 'projectile-only paired change',
      cueTarget: cue,
      followupTarget: background,
      cueControl: cue,
      followupControl: background,
    },
  ])('rejects $name as defeat evidence', async (scenario) => {
    const helpers = await loadHelpers();
    expect(helpers.passesDefeatCueEvidence).toBeTypeOf('function');
    expect(helpers.passesDefeatCueEvidence({
      killedEnemyId: 7,
      deadEnemy: { id: 7, alive: false, x: 92, y: 250 },
      preTarget: target,
      preControl: background,
      ...scenario,
    })).toBe(false);
  });

  it('rejects a cue whose dead record does not match the killed enemy', async () => {
    const helpers = await loadHelpers();
    expect(helpers.passesDefeatCueEvidence).toBeTypeOf('function');
    expect(helpers.passesDefeatCueEvidence({
      killedEnemyId: 7,
      deadEnemy: { id: 8, alive: false, x: 92, y: 250 },
      preTarget: target,
      cueTarget: cue,
      followupTarget: background,
      preControl: background,
      cueControl: background,
      followupControl: background,
    })).toBe(false);
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

  it('rejects defeat evidence when an exact non-defeat effect overlaps the target', async () => {
    const helpers = await loadHelpers();
    const overlap = {
      id: 'effect-ink-bubble-44',
      kind: 'effect',
      effectKind: 'ink-bubble',
      x: 88,
      y: 246,
      width: 8,
      height: 8,
    };
    expect(helpers.passesDefeatCueEvidence({
      killedEnemyId: 7,
      deadEnemy: { id: 7, alive: false, x: 92, y: 250 },
      preTarget: target,
      preControl: background,
      targetRegion: { x: 76, y: 234, width: 32, height: 32 },
      frames: [0.1, 0.42, 0.78].map((progress, index) => ({
        target: [cue, squashMid, squashLate][index],
        control: background,
        defeatSquash: {
          id: 31,
          sourceEnemyId: 7,
          originX: 92,
          originY: 250,
          x: 92,
          y: 250 + index * 0.07,
          size: 24,
          progress,
        },
        dynamicBounds: index === 1 ? [overlap] : [],
      })),
    })).toBe(false);
  });

  it('rejects squash metadata whose rendered geometry misses the target sample', async () => {
    const helpers = await loadHelpers();
    expect(helpers.passesDefeatCueEvidence({
      killedEnemyId: 7,
      deadEnemy: { id: 7, alive: false, x: 92, y: 250 },
      targetAnchor: { x: 92, y: 250 },
      targetRegion: { x: 122, y: 248, width: 4, height: 4 },
      preTarget: target,
      preControl: background,
      frames: [0.2, 0.5, 0.8].map((progress, index) => ({
        target: [cue, squashMid, squashLate][index],
        control: background,
        defeatSquash: {
          id: 31,
          sourceEnemyId: 7,
          originX: 92,
          originY: 250,
          x: 200,
          y: 250,
          size: 24,
          progress,
        },
        dynamicBounds: [],
      })),
    })).toBe(false);
  });

  it('accepts stable squash pixels when exact geometry evolves across frames', async () => {
    const helpers = await loadHelpers();
    expect(helpers.passesDefeatCueEvidence({
      killedEnemyId: 7,
      deadEnemy: { id: 7, alive: false, x: 92, y: 250 },
      targetRegion: { x: 76, y: 234, width: 32, height: 32 },
      preTarget: target,
      preControl: background,
      frames: [0.2, 0.5, 0.8].map((progress) => ({
        target: cue,
        control: background,
        defeatSquash: {
          id: 31,
          sourceEnemyId: 7,
          originX: 92,
          originY: 250,
          x: 92,
          y: 250,
          size: 24,
          progress,
        },
        dynamicBounds: [],
      })),
    })).toBe(true);
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
      && helpers.rectsIntersect(item, centralWindow)
    ))).toBe(false);
    expect(helpers.selectSafeControlRegion({
      target: centralWindow,
      candidates: [{ x: 126, y: 246, width: 12, height: 12 }],
      dynamicBounds: bounds,
    })).toBeNull();
  });
});
