import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../../../web/battle/FixedStepLoop';

describe('FixedStepLoop', () => {
  it('caps backlog and performs at most five updates per frame', () => {
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
});
