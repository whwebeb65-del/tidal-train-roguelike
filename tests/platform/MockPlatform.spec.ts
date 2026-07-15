import { describe, expect, it } from 'vitest';
import { MockAds, MockShare, MockStore } from '../../src/platform/MockPlatform';

describe('MockPlatform', () => {
  it('returns completed for a configured mock rewarded ad', async () => {
    const ads = new MockAds('completed');
    await expect(ads.showRewardedAd('revive')).resolves.toBe('completed');
  });

  it('returns closed without calling a real platform', async () => {
    const ads = new MockAds('closed');
    await expect(ads.showRewardedAd('reroll')).resolves.toBe('closed');
  });

  it('records the rewarded placement without calling a real SDK', async () => {
    const ads = new MockAds('completed');
    await ads.showRewardedAd('skill-refresh');
    expect(ads.placements).toEqual(['skill-refresh']);
  });

  it('returns the configured share result and keeps the share card payload', async () => {
    const share = new MockShare('completed');
    const payload = {
      mapId: 'drift-suburb',
      depth: 3,
      passengers: ['doctor'],
      modules: ['sound-mirror'],
      failureReason: '潮兽压制',
      cta: '救回列车',
    };

    await expect(share.share(payload)).resolves.toBe('completed');
    expect(share.payloads).toEqual([payload]);
  });

  it('returns a structured verified purchase with a unique mock transaction', async () => {
    const store = new MockStore('verified');
    await expect(store.purchase('starter-star-ticket-pack')).resolves.toEqual({
      status: 'verified',
      transactionId: 'mock-starter-star-ticket-pack-1',
    });
    expect(store.purchases).toEqual(['starter-star-ticket-pack']);
  });

  it('does not record cancelled purchases', async () => {
    const store = new MockStore('cancelled');
    await expect(store.purchase('starter-star-ticket-pack')).resolves.toEqual({ status: 'cancelled' });
    expect(store.purchases).toEqual([]);
  });
});
