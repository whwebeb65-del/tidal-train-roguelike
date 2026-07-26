import { describe, expect, it } from 'vitest';
import {
  createWaveSchedule,
  getWaveAtTime,
} from '../../../web/battle/WaveScheduler';
import { ENEMY_CONFIG } from '../../../web/battle/BattleConfig';

describe('WaveScheduler', () => {
  it('creates the six-wave eight-minute composition with stable lanes', () => {
    const first = createWaveSchedule(99);
    const second = createWaveSchedule(99);

    expect(first).toEqual(second);
    expect(first.filter((item) => item.kind === 'bubble-fin')).toHaveLength(152);
    expect(first.filter((item) => item.kind === 'needle-jelly')).toHaveLength(103);
    expect(first.filter((item) => item.kind === 'reef-crab')).toHaveLength(63);
    expect(
      first.every(
        (item) => item.spawnAtMs >= 0 && item.spawnAtMs < 345_000,
      ),
    ).toBe(true);
    const scheduledExperience = first.reduce(
      (total, item) => total + ENEMY_CONFIG[item.kind].experience,
      ENEMY_CONFIG['storm-ray-elite'].experience,
    );
    expect(scheduledExperience).toBeGreaterThanOrEqual(3370);
    expect(getWaveAtTime(0)).toBe(1);
    expect(getWaveAtTime(61_000)).toBe(2);
    expect(getWaveAtTime(181_000)).toBe(4);
    expect(getWaveAtTime(346_000)).toBe(7);
  });
});
