import { describe, expect, it } from 'vitest';
import { MockAds } from '../../src/platform/MockPlatform';

describe('MockPlatform', () => {
  it('returns completed for a configured mock rewarded ad', async () => {
    const ads = new MockAds('completed');
    await expect(ads.showRewardedAd('revive')).resolves.toBe('completed');
  });

  it('returns closed without calling a real platform', async () => {
    const ads = new MockAds('closed');
    await expect(ads.showRewardedAd('reroll')).resolves.toBe('closed');
  });
});
