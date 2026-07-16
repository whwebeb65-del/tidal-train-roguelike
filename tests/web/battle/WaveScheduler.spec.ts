import { describe, expect, it } from 'vitest';
import {
  createWaveSchedule,
  getWaveAtTime,
} from '../../../web/battle/WaveScheduler';

describe('WaveScheduler', () => {
  it('creates the exact four-wave composition with stable lanes', () => {
    const first = createWaveSchedule(99);
    const second = createWaveSchedule(99);

    expect(first).toEqual(second);
    expect(first.filter((item) => item.kind === 'bubble-fin')).toHaveLength(60);
    expect(first.filter((item) => item.kind === 'needle-jelly')).toHaveLength(28);
    expect(first.filter((item) => item.kind === 'reef-crab')).toHaveLength(12);
    expect(
      first.every(
        (item) => item.spawnAtMs >= 0 && item.spawnAtMs <= 127_000,
      ),
    ).toBe(true);
    expect(getWaveAtTime(0)).toBe(1);
    expect(getWaveAtTime(31_000)).toBe(2);
    expect(getWaveAtTime(96_000)).toBe(4);
    expect(getWaveAtTime(131_000)).toBe(5);
  });
});
