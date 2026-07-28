import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../../../web/battle/FixedStepLoop';

describe('FixedStepLoop', () => {
  it('keeps a one-second hitch queued while performing at most five updates per frame', () => {
    const updates: number[] = [];
    const renders: number[] = [];
    const loop = new FixedStepLoop({
      stepMs: 1000 / 60,
      maxFrameDeltaMs: 100,
      maxStepsPerFrame: 5,
      update: (step) => updates.push(step),
      render: (alpha) => renders.push(alpha),
    });

    loop.frame(0);
    loop.frame(1000);

    expect(updates).toHaveLength(5);
    expect(renders).toHaveLength(2);
    expect(renders[1]).toBeGreaterThanOrEqual(0);
    expect(renders[1]).toBeLessThan(1);

    for (let frame = 0; frame < 19; frame += 1) {
      const before = updates.length;
      loop.frame(1000);
      expect(updates.length - before).toBeLessThanOrEqual(5);
    }

    expect(updates).toHaveLength(60);
  });

  it('stops and restarts without carrying stale wall-clock time', () => {
    const updates: number[] = [];
    const loop = new FixedStepLoop({
      stepMs: 10,
      maxFrameDeltaMs: 100,
      maxStepsPerFrame: 5,
      update: (step) => updates.push(step),
      render: () => undefined,
    });

    loop.frame(0);
    loop.stop();
    loop.frame(100);
    loop.start();
    loop.frame(1000);
    loop.frame(1010);

    expect(updates).toEqual([10]);
  });

  it('clears queued hitch time on stop so restart cannot explode world time', () => {
    const updates: number[] = [];
    const loop = new FixedStepLoop({
      stepMs: 10,
      maxFrameDeltaMs: 100,
      maxStepsPerFrame: 5,
      update: (step) => updates.push(step),
      render: () => undefined,
    });

    loop.frame(0);
    loop.frame(1000);
    expect(updates).toHaveLength(5);

    loop.stop();
    loop.start();
    loop.frame(10_000);
    loop.frame(10_010);

    expect(updates).toHaveLength(6);
  });
});
