import type { MapId } from '../../src/domain/station/MapProgression';
import type { EnemyKind } from './BattleTypes';

export type ScheduledEnemyKind = Exclude<
  EnemyKind,
  'storm-ray-elite' | 'deep-echo-boss'
>;

export interface MapCombatProfile {
  readonly enemySpeedMultiplier: number;
  readonly enemyDamageMultiplier: number;
  readonly bossHpMultiplier: number;
  readonly weakPointRewardMultiplier: number;
  readonly eliteExposureMultiplier: number;
  readonly tideWarningMultiplier: number;
  readonly compositionScale: Readonly<Record<ScheduledEnemyKind, number>>;
}

function profile(input: MapCombatProfile): MapCombatProfile {
  return Object.freeze({
    ...input,
    compositionScale: Object.freeze({ ...input.compositionScale }),
  });
}

const profiles: Readonly<Record<MapId, MapCombatProfile>> = {
  'drift-suburb': profile({
    enemySpeedMultiplier: 1,
    enemyDamageMultiplier: 1,
    bossHpMultiplier: 1,
    weakPointRewardMultiplier: 1,
    eliteExposureMultiplier: 1,
    tideWarningMultiplier: 1,
    compositionScale: {
      'bubble-fin': 1,
      'needle-jelly': 1,
      'reef-crab': 1,
      'tide-shell-hatchling': 1,
      'lantern-ray': 1,
      'tide-parasite-snail': 1,
    },
  }),
  'old-port': profile({
    enemySpeedMultiplier: 1.08,
    enemyDamageMultiplier: 1,
    bossHpMultiplier: 1.05,
    weakPointRewardMultiplier: 1,
    eliteExposureMultiplier: 1.2,
    tideWarningMultiplier: 1,
    compositionScale: {
      'bubble-fin': 1.12,
      'needle-jelly': 0.9,
      'reef-crab': 1.08,
      'tide-shell-hatchling': 1.3,
      'lantern-ray': 0.75,
      'tide-parasite-snail': 0.8,
    },
  }),
  'glass-city': profile({
    enemySpeedMultiplier: 1.03,
    enemyDamageMultiplier: 1,
    bossHpMultiplier: 1.1,
    weakPointRewardMultiplier: 1.2,
    eliteExposureMultiplier: 1,
    tideWarningMultiplier: 1,
    compositionScale: {
      'bubble-fin': 0.85,
      'needle-jelly': 1.18,
      'reef-crab': 0.85,
      'tide-shell-hatchling': 0.8,
      'lantern-ray': 1.4,
      'tide-parasite-snail': 0.9,
    },
  }),
  'deep-tunnel': profile({
    enemySpeedMultiplier: 1.06,
    enemyDamageMultiplier: 1.05,
    bossHpMultiplier: 1.18,
    weakPointRewardMultiplier: 1.1,
    eliteExposureMultiplier: 0.9,
    tideWarningMultiplier: 0.8,
    compositionScale: {
      'bubble-fin': 0.72,
      'needle-jelly': 0.9,
      'reef-crab': 1.25,
      'tide-shell-hatchling': 0.8,
      'lantern-ray': 1.05,
      'tide-parasite-snail': 1.6,
    },
  }),
};

export function getMapCombatProfile(mapId: MapId): MapCombatProfile {
  return profiles[mapId];
}

