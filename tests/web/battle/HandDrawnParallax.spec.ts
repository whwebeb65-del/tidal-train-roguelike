import { describe, expect, it } from 'vitest';
import {
  createHandDrawnParallax,
  type HandDrawnParallaxPose,
} from '../../../web/battle/HandDrawnParallax';

function byId(
  poses: readonly HandDrawnParallaxPose[],
  id: HandDrawnParallaxPose['id'],
): HandDrawnParallaxPose {
  const pose = poses.find((item) => item.id === id);
  expect(pose).toBeDefined();
  return pose!;
}

describe('createHandDrawnParallax', () => {
  it('uses four ordered layers and the exact normal-motion formulas', () => {
    const poses = createHandDrawnParallax({
      timeMs: 1000,
      laneOffset: 240,
      backgroundLayers: 4,
      reducedMotion: false,
    });

    expect(poses.map((pose) => pose.id)).toEqual([
      'sky',
      'horizon',
      'track',
      'foreground',
    ]);
    expect(poses.map((pose) => pose.artId)).toEqual([
      'backgroundSky',
      'backgroundHorizon',
      'backgroundTrack',
      'backgroundForeground',
    ]);
    expect(byId(poses, 'sky')).toMatchObject({
      offsetX: Math.sin(1000 / 5000) * 3,
      offsetY: 0,
      repeatY: false,
    });
    expect(byId(poses, 'horizon')).toMatchObject({
      offsetX: 0,
      offsetY: -240 * 0.08,
      repeatY: false,
    });
    expect(byId(poses, 'track')).toMatchObject({
      offsetX: 0,
      offsetY: 240,
      repeatY: true,
    });
    expect(byId(poses, 'foreground')).toMatchObject({
      offsetX: 0,
      offsetY: 240 * 1.42,
      repeatY: true,
    });
  });

  it('selects sky, horizon and track at medium quality', () => {
    const poses = createHandDrawnParallax({
      timeMs: 1000,
      laneOffset: 240,
      backgroundLayers: 3,
      reducedMotion: false,
    });

    expect(poses.map((pose) => pose.id)).toEqual([
      'sky',
      'horizon',
      'track',
    ]);
  });

  it('keeps sky and track only at low quality', () => {
    const poses = createHandDrawnParallax({
      timeMs: 1000,
      laneOffset: 240,
      backgroundLayers: 2,
      reducedMotion: false,
    });

    expect(poses.map((pose) => pose.id)).toEqual(['sky', 'track']);
  });

  it('wraps negative and large repeating offsets into 0 through 844', () => {
    const negative = createHandDrawnParallax({
      timeMs: 0,
      laneOffset: -1,
      backgroundLayers: 4,
      reducedMotion: false,
    });
    const large = createHandDrawnParallax({
      timeMs: 0,
      laneOffset: 844 * 3 + 17,
      backgroundLayers: 4,
      reducedMotion: false,
    });
    const boundary = createHandDrawnParallax({
      timeMs: 0,
      laneOffset: 844,
      backgroundLayers: 4,
      reducedMotion: false,
    });

    expect(byId(negative, 'track').offsetY).toBe(843);
    expect(byId(negative, 'foreground').offsetY).toBeCloseTo(842.58, 10);
    expect(byId(large, 'track').offsetY).toBe(17);
    expect(byId(large, 'foreground').offsetY).toBeCloseTo(243.58, 10);
    expect(byId(boundary, 'track').offsetY).toBe(0);
    for (const poses of [negative, large, boundary]) {
      for (const pose of poses.filter((item) => item.repeatY)) {
        expect(pose.offsetY).toBeGreaterThanOrEqual(0);
        expect(pose.offsetY).toBeLessThan(844);
      }
    }
  });

  it('sanitizes non-finite motion inputs instead of emitting invalid poses', () => {
    const poses = createHandDrawnParallax({
      timeMs: Number.NaN,
      laneOffset: Number.POSITIVE_INFINITY,
      backgroundLayers: 4,
      reducedMotion: false,
    });

    expect(poses).toEqual(createHandDrawnParallax({
      timeMs: 0,
      laneOffset: 0,
      backgroundLayers: 4,
      reducedMotion: false,
    }));
    expect(poses.every((pose) => (
      Number.isFinite(pose.offsetX) && Number.isFinite(pose.offsetY)
    ))).toBe(true);

    const negativeInfinity = createHandDrawnParallax({
      timeMs: Number.NEGATIVE_INFINITY,
      laneOffset: Number.NEGATIVE_INFINITY,
      backgroundLayers: 2,
      reducedMotion: false,
    });
    expect(negativeInfinity.every((pose) => (
      Number.isFinite(pose.offsetX) && Number.isFinite(pose.offsetY)
    ))).toBe(true);
  });

  it('freezes decorative drift and uses one fixed 6 px track offset', () => {
    const first = createHandDrawnParallax({
      timeMs: 1000,
      laneOffset: 240,
      backgroundLayers: 4,
      reducedMotion: true,
    });
    const second = createHandDrawnParallax({
      timeMs: 9000,
      laneOffset: 999,
      backgroundLayers: 4,
      reducedMotion: true,
    });

    expect(second).toEqual(first);
    expect(first.map(({ id, offsetX, offsetY }) => ({
      id,
      offsetX,
      offsetY,
    }))).toEqual([
      { id: 'sky', offsetX: 0, offsetY: 0 },
      { id: 'horizon', offsetX: 0, offsetY: 0 },
      { id: 'track', offsetX: 0, offsetY: 6 },
      { id: 'foreground', offsetX: 0, offsetY: 0 },
    ]);
  });
});
