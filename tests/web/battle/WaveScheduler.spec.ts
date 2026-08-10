import { describe, expect, it } from 'vitest';
import {
  createWaveSchedule,
  getWaveAtTime,
} from '../../../web/battle/WaveScheduler';
import { ENEMY_CONFIG } from '../../../web/battle/BattleConfig';

describe('WaveScheduler', () => {
  it('creates a seven-beat composition with two real breathing windows', () => {
    const first = createWaveSchedule(99, 'drift-suburb');
    const second = createWaveSchedule(99, 'drift-suburb');

    expect(first).toEqual(second);
    expect(new Set(first.map((item) => item.segment)).size).toBe(7);
    const gaps = first.slice(1).map((item, index) => (
      item.spawnAtMs - first[index]!.spawnAtMs
    ));
    expect(gaps.filter((gap) => gap >= 4500)).toHaveLength(2);
    expect(first.filter((item) => item.kind === 'bubble-fin')).toHaveLength(110);
    expect(first.filter((item) => item.kind === 'needle-jelly')).toHaveLength(79);
    expect(first.filter((item) => item.kind === 'reef-crab')).toHaveLength(49);
    expect(first.filter((item) => item.kind === 'tide-shell-hatchling')).toHaveLength(47);
    expect(first.filter((item) => item.kind === 'lantern-ray')).toHaveLength(24);
    expect(first.filter((item) => item.kind === 'tide-parasite-snail')).toHaveLength(10);
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
    const normalPlayExperience = first.reduce(
      (total, item) => total + ENEMY_CONFIG[item.kind].experience,
      0,
    ) * 0.85 * 0.9 + ENEMY_CONFIG['storm-ray-elite'].experience;
    expect(normalPlayExperience).toBeGreaterThanOrEqual(3120);
    expect(first.filter((item) => item.kind === 'tide-shell-hatchling')
      .every((item) => item.spawnAtMs < 345_000)).toBe(true);
    expect(first.filter((item) => item.kind === 'lantern-ray')
      .every((item) => item.spawnAtMs >= 116_000)).toBe(true);
    expect(first.filter((item) => item.kind === 'tide-parasite-snail')
      .every((item) => item.spawnAtMs >= 232_000)).toBe(true);
    expect(getWaveAtTime(0)).toBe(1);
    expect(getWaveAtTime(61_000)).toBe(2);
    expect(getWaveAtTime(181_000)).toBe(4);
    expect(getWaveAtTime(346_000)).toBe(7);
  });

  it('uses the map profile to create distinct but repeatable route compositions', () => {
    const oldPort = createWaveSchedule(41, 'old-port');
    const glassCity = createWaveSchedule(41, 'glass-city');
    const deepTunnel = createWaveSchedule(41, 'deep-tunnel');

    expect(createWaveSchedule(41, 'glass-city')).toEqual(glassCity);
    expect(oldPort.filter((item) => item.kind === 'tide-shell-hatchling').length)
      .toBeGreaterThan(glassCity.filter((item) => item.kind === 'tide-shell-hatchling').length);
    expect(glassCity.filter((item) => item.kind === 'lantern-ray').length)
      .toBeGreaterThan(oldPort.filter((item) => item.kind === 'lantern-ray').length);
    expect(deepTunnel.filter((item) => item.kind === 'tide-parasite-snail').length)
      .toBeGreaterThan(glassCity.filter((item) => item.kind === 'tide-parasite-snail').length);
  });
});
