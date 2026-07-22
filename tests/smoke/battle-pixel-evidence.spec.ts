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

  it('fails object evidence when the target is removed but background remains', async () => {
    const helpers = await loadHelpers();
    expect(helpers.passesObjectEvidence).toBeTypeOf('function');
    expect(helpers.passesObjectEvidence({
      target: background,
      control: background,
    })).toBe(false);
    expect(helpers.passesObjectEvidence({ target, control: background })).toBe(true);
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

  it('accepts only an identity-bound localized defeat cue', async () => {
    const helpers = await loadHelpers();
    expect(helpers.passesDefeatCueEvidence).toBeTypeOf('function');
    expect(helpers.passesDefeatCueEvidence({
      killedEnemyId: 7,
      deadEnemy: { id: 7, alive: false, x: 92, y: 250 },
      preTarget: target,
      cueTarget: cue,
      followupTarget: background,
      preControl: background,
      cueControl: background,
      followupControl: background,
    })).toBe(true);
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
});
