import { describe, expect, it } from 'vitest';
import { getMapCombatProfile } from '../../../web/battle/MapCombatProfiles';

describe('MapCombatProfiles', () => {
  it('keeps drift suburb neutral and gives every later route a combat identity', () => {
    expect(getMapCombatProfile('drift-suburb')).toMatchObject({
      enemySpeedMultiplier: 1,
      bossHpMultiplier: 1,
      weakPointRewardMultiplier: 1,
    });
    expect(getMapCombatProfile('old-port')).toMatchObject({
      enemySpeedMultiplier: 1.08,
      eliteExposureMultiplier: 1.2,
    });
    expect(getMapCombatProfile('glass-city')).toMatchObject({
      weakPointRewardMultiplier: 1.2,
    });
    expect(getMapCombatProfile('deep-tunnel')).toMatchObject({
      bossHpMultiplier: 1.18,
      tideWarningMultiplier: 0.8,
    });
  });

  it('returns frozen profiles with distinct deterministic compositions', () => {
    const profiles = [
      getMapCombatProfile('drift-suburb'),
      getMapCombatProfile('old-port'),
      getMapCombatProfile('glass-city'),
      getMapCombatProfile('deep-tunnel'),
    ];

    expect(profiles.every(Object.isFrozen)).toBe(true);
    expect(new Set(profiles.map((profile) => (
      JSON.stringify(profile.compositionScale)
    ))).size).toBe(4);
  });
});

