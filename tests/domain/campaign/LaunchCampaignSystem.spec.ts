import { describe, expect, it } from 'vitest';
import {
  applyForBeta,
  claimBetaGift,
  claimLaunchGift,
  createLaunchCampaignState,
  normalizeLaunchCampaignState,
  redeemGiftCode,
  type GiftCodeDefinition,
} from '../../../src/domain/campaign/LaunchCampaignSystem';

const NOW = Date.UTC(2026, 6, 16);
const ZERO_REWARD = { gears: 0, routeMarks: 0, starTickets: 0 };

describe('LaunchCampaignSystem', () => {
  it('creates a clean launch campaign state', () => {
    expect(createLaunchCampaignState()).toEqual({
      version: 1,
      campaignId: 'launch-2026',
      betaQualified: false,
      betaGiftClaimed: false,
      launchGiftClaimed: false,
      redeemedCodeIds: [],
      cosmeticBadgeIds: [],
    });
  });

  it('qualifies one account once without granting currency', () => {
    const first = applyForBeta(createLaunchCampaignState());
    const repeat = applyForBeta(first.state);

    expect(first.accepted).toBe(true);
    expect(first.reward).toEqual(ZERO_REWARD);
    expect(first.state.betaQualified).toBe(true);
    expect(repeat).toMatchObject({
      accepted: false,
      reason: 'already-qualified',
      reward: ZERO_REWARD,
    });
  });

  it('gates and grants the beta gift exactly once', () => {
    const denied = claimBetaGift(createLaunchCampaignState());
    const qualified = applyForBeta(createLaunchCampaignState()).state;
    const first = claimBetaGift(qualified);
    const repeat = claimBetaGift(first.state);

    expect(denied).toMatchObject({ reason: 'beta-required', reward: ZERO_REWARD });
    expect(first.reward).toEqual({
      gears: 60,
      routeMarks: 2,
      starTickets: 1,
      badgeId: 'beta-pioneer',
    });
    expect(first.state.cosmeticBadgeIds).toEqual(['beta-pioneer']);
    expect(repeat).toMatchObject({ reason: 'already-claimed', reward: ZERO_REWARD });
  });

  it('grants the launch gift once and records its cosmetic badge', () => {
    const first = claimLaunchGift(createLaunchCampaignState());
    const repeat = claimLaunchGift(first.state);

    expect(first.reward).toEqual({
      gears: 188,
      routeMarks: 6,
      starTickets: 3,
      badgeId: 'launch-conductor',
    });
    expect(first.state.cosmeticBadgeIds).toEqual(['launch-conductor']);
    expect(repeat).toMatchObject({ reason: 'already-claimed', reward: ZERO_REWARD });
  });

  it('normalizes whitespace and case before redeeming a code', () => {
    const tide = redeemGiftCode(createLaunchCampaignState(), '  tide2026 ', NOW);
    const firstTrain = redeemGiftCode(tide.state, 'firsttrain', NOW);

    expect(tide).toMatchObject({
      accepted: true,
      codeId: 'tide-voyage',
      reward: { gears: 66, routeMarks: 2, starTickets: 0 },
    });
    expect(firstTrain).toMatchObject({
      accepted: true,
      codeId: 'first-train',
      reward: { gears: 88, routeMarks: 0, starTickets: 1 },
    });
    expect(firstTrain.state.redeemedCodeIds).toEqual(['tide-voyage', 'first-train']);
  });

  it('distinguishes empty, unknown, duplicate, future, and expired codes', () => {
    const catalog: readonly GiftCodeDefinition[] = [
      {
        id: 'future',
        code: 'FUTURE',
        label: '未来活动',
        startsAtMs: NOW + 1,
        expiresAtMs: NOW + 100,
        reward: { gears: 1, routeMarks: 0, starTickets: 0 },
      },
      {
        id: 'expired',
        code: 'EXPIRED',
        label: '过期活动',
        startsAtMs: NOW - 100,
        expiresAtMs: NOW - 1,
        reward: { gears: 1, routeMarks: 0, starTickets: 0 },
      },
    ];

    expect(redeemGiftCode(createLaunchCampaignState(), ' ', NOW)).toMatchObject({ reason: 'empty-code', reward: ZERO_REWARD });
    expect(redeemGiftCode(createLaunchCampaignState(), 'NOPE', NOW)).toMatchObject({ reason: 'unknown-code', reward: ZERO_REWARD });
    expect(redeemGiftCode(createLaunchCampaignState(), 'FUTURE', NOW, catalog)).toMatchObject({ reason: 'not-started', codeId: 'future', reward: ZERO_REWARD });
    expect(redeemGiftCode(createLaunchCampaignState(), 'EXPIRED', NOW, catalog)).toMatchObject({ reason: 'expired', codeId: 'expired', reward: ZERO_REWARD });

    const first = redeemGiftCode(createLaunchCampaignState(), 'TIDE2026', NOW);
    expect(redeemGiftCode(first.state, 'TIDE2026', NOW)).toMatchObject({
      reason: 'already-redeemed',
      codeId: 'tide-voyage',
      reward: ZERO_REWARD,
    });
  });

  it('rejects invalid catalog timing and rewards', () => {
    const invalid: readonly GiftCodeDefinition[] = [{
      id: 'broken',
      code: 'BROKEN',
      label: '错误配置',
      startsAtMs: NOW + 10,
      expiresAtMs: NOW,
      reward: { gears: -1, routeMarks: 0, starTickets: 0 },
    }];

    expect(() => redeemGiftCode(createLaunchCampaignState(), 'BROKEN', NOW, invalid)).toThrow('Invalid gift code definition');
  });

  it('sanitizes malformed persisted state and preserves no foreign references', () => {
    const candidate = {
      version: 1,
      campaignId: 'launch-2026',
      betaQualified: true,
      betaGiftClaimed: true,
      launchGiftClaimed: false,
      redeemedCodeIds: ['tide-voyage', 'fake', 'tide-voyage'],
      cosmeticBadgeIds: ['beta-pioneer', 'damage-hack', 'beta-pioneer'],
    };

    expect(normalizeLaunchCampaignState(candidate)).toEqual({
      version: 1,
      campaignId: 'launch-2026',
      betaQualified: true,
      betaGiftClaimed: true,
      launchGiftClaimed: false,
      redeemedCodeIds: ['tide-voyage'],
      cosmeticBadgeIds: ['beta-pioneer'],
    });
    expect(normalizeLaunchCampaignState({ version: 99 })).toEqual(createLaunchCampaignState());
  });
});
