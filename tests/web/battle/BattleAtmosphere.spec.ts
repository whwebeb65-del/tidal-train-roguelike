import { describe, expect, it } from 'vitest';
import { getBattleAtmosphere } from '../../../web/battle/BattleAtmosphere';
import { createFrameFixture } from './helpers/BattleFixtures';

describe('BattleAtmosphere', () => {
  it('keeps routine combat calm and raises danger only when the train is threatened', () => {
    expect(getBattleAtmosphere(createFrameFixture())).toMatchObject({
      danger: 0,
      boss: 0,
    });

    const threatened = getBattleAtmosphere(createFrameFixture({ trainHp: 24 }));
    expect(threatened.danger).toBeGreaterThan(0.45);
    expect(threatened.wash).not.toBe('#0d7f88');
  });

  it('uses the maximum boss atmosphere for the intro and a living boss', () => {
    expect(getBattleAtmosphere(createFrameFixture({ status: 'boss-intro' })).boss).toBe(1);

    const base = createFrameFixture().enemies[0]!;
    const atmosphere = getBattleAtmosphere(createFrameFixture({
      enemies: [{ ...base, kind: 'deep-echo-boss', alive: true }],
    }));
    expect(atmosphere).toMatchObject({ boss: 1, horizonGlow: '#ff7b72' });
    expect(atmosphere.danger).toBeGreaterThanOrEqual(0.72);
  });
});
