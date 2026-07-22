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

  it('accepts stable squash pixels when exact geometry evolves across frames', async () => {
    const helpers = await loadHelpers();
    const input = structuredClone(validDefeatEvidence());
    for (const frame of input.frames) frame.target = cue;
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
