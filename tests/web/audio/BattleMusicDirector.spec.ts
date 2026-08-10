import { describe, expect, it } from 'vitest';
import { selectBattleMusicIntensity } from '../../../web/audio/BattleMusicDirector';
import { createFrameFixture } from '../battle/helpers/BattleFixtures';

describe('BattleMusicDirector', () => {
  it('raises intensity for later waves, dangerous enemies and a wounded train', () => {
    const calm = createFrameFixture({ wave: 1, enemies: [] });
    expect(selectBattleMusicIntensity(calm)).toBe(0);

    const pressure = createFrameFixture({ wave: 4 });
    expect(selectBattleMusicIntensity(pressure)).toBeGreaterThanOrEqual(1);

    const elite = createFrameFixture({
      wave: 6,
      trainHp: 24,
      enemies: [{
        ...createFrameFixture().enemies[0]!,
        kind: 'storm-ray-elite',
      }],
    });
    expect(selectBattleMusicIntensity(elite)).toBe(3);
  });

  it('always gives a living boss the maximum arrangement', () => {
    const frame = createFrameFixture({
      enemies: [{
        ...createFrameFixture().enemies[0]!,
        kind: 'deep-echo-boss',
      }],
    });
    expect(selectBattleMusicIntensity(frame)).toBe(3);
  });
});
