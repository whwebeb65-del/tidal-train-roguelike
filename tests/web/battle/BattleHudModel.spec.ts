import { describe, expect, it } from 'vitest';
import type {
  BattleSettlementPresentation,
  TidalArchiveDiscoveryPresentation,
} from '../../../web/app/AppTypes';
import { createBattleHudModel } from '../../../web/battle/BattleHudModel';
import { getAvailableBattleInteractions } from '../../../web/battle/BattleInteractionSchedule';
import {
  createFrameFixture,
  createHudModelOptionsFixture,
} from './helpers/BattleFixtures';

const DISCOVERY: TidalArchiveDiscoveryPresentation = Object.freeze({
  key: 'enemy:bubble-fin',
  entryType: 'enemy',
  entryId: 'bubble-fin',
  name: '泡鳍怪',
  artUrl: '/archive/bubble-fin.webp',
});

const SETTLEMENT: BattleSettlementPresentation = Object.freeze({
  title: '本局结束',
  description: '列车返航',
  rewards: { gears: 0, routeMarks: 0, starTickets: 0 },
  expeditionPoints: 0,
  dailyTrialScore: null,
  archiveDiscoveries: [],
  doubleSettlementAvailable: false,
  doubled: false,
});

describe('createBattleHudModel skill recharge', () => {
  it('uses the original cast duration even after the current build changes', () => {
    const frame = createFrameFixture({
      cooldowns: { 'tidal-volley': 6_912, 'bubble-barrier': 9_000, 'extreme-tide': 0 },
      cooldownDurations: { 'tidal-volley': 13_824, 'bubble-barrier': 18_000, 'extreme-tide': 0 },
      skillRanks: { 'tidal-volley': 5, 'bubble-barrier': 3, 'extreme-tide': 1 },
    });
    const model = createBattleHudModel(frame, createHudModelOptionsFixture());
    expect(model.skills[0]).toMatchObject({ rechargePercent: 50, cooldownLabel: '6.9s', ready: false });
    expect(model.skills[1]).toMatchObject({ rechargePercent: 50, cooldownLabel: '9.0s', ready: false });
  });

  it.each([0, 43, 99, 100])('uses energy rather than zero cooldown for extreme tide at %s energy', (energy) => {
    const model = createBattleHudModel(createFrameFixture({ energy }), createHudModelOptionsFixture());
    expect(model.skills[2]).toMatchObject({
      rechargePercent: energy,
      cooldownLabel: energy === 100 ? '就绪' : `${energy}%`,
      ready: energy === 100,
    });
  });

  it('shows ready skills as full and never divides by a zero cast duration', () => {
    const model = createBattleHudModel(createFrameFixture({
      cooldownDurations: { 'tidal-volley': 0, 'bubble-barrier': 0, 'extreme-tide': 0 },
    }), createHudModelOptionsFixture());
    expect(model.skills[0]).toMatchObject({ rechargePercent: 0, ready: false });
    expect(model.skills[1]).toMatchObject({ rechargePercent: 100, ready: true });
  });
});

describe('createBattleHudModel archive discovery', () => {
  it('only reports build connections to upgrades actually acquired in this run', () => {
    const frame = createFrameFixture({ offeredUpgradeIds: ['coral-warhead', 'multi-barrel', 'undertow-eye'] });
    const before = createBattleHudModel(frame, createHudModelOptionsFixture());
    expect(before.upgradeCards.every((card) => card.connection === null)).toBe(true);

    const after = createBattleHudModel({
      ...frame,
      upgradeLevels: { ...frame.upgradeLevels, 'multi-barrel': 1 },
    }, createHudModelOptionsFixture());
    expect(after.upgradeCards[0]?.connection).toContain('多管潮炮');
    expect(after.upgradeCards[2]?.connection).toBeNull();
  });

  it('keeps all acquired upgrades in the pause review and distinguishes evolution from ranks', () => {
    const frame = createFrameFixture();
    const model = createBattleHudModel({
      ...frame,
      upgradeLevels: {
        ...frame.upgradeLevels,
        'multi-barrel': 2, 'coral-warhead': 1, 'echo-chain': 1,
        'precision-lens': 1, 'bubble-capacitor': 1, 'overload-core': 1,
        'rank-tidal-volley': 2, 'split-tide-arrow': 1,
      },
    }, createHudModelOptionsFixture());
    expect(model.acquiredUpgrades).toHaveLength(9);
    expect(model.acquiredUpgrades).toContain('浪箭鱼群 · 潮阶 3');
    expect(model.acquiredUpgrades).toContain('分汐浪箭 · 进化');
    expect(model.buildSummary).toBe('已装 11 项强化');
  });

  it('exposes a discovery while the battle is eligible', () => {
    const model = createBattleHudModel(
      createFrameFixture({ status: 'running', elapsedMs: 0 }),
      {
        ...createHudModelOptionsFixture(),
        archiveDiscovery: DISCOVERY,
      },
    );

    expect(model.archiveDiscovery).toBe(DISCOVERY);
  });

  it.each(['upgrade', 'paused', 'defeat', 'victory'] as const)(
    'hides a discovery while battle status is %s',
    (status) => {
      const model = createBattleHudModel(createFrameFixture({ status }), {
        ...createHudModelOptionsFixture(),
        archiveDiscovery: DISCOVERY,
      });

      expect(model.archiveDiscovery).toBeNull();
    },
  );

  it('hides a discovery behind visibility, settlement, and first-run tutorial overlays', () => {
    const baseOptions = {
      ...createHudModelOptionsFixture(),
      archiveDiscovery: DISCOVERY,
    };

    expect(createBattleHudModel(createFrameFixture(), {
      ...baseOptions,
      visibilityResumeRequired: true,
    }).archiveDiscovery).toBeNull();
    expect(createBattleHudModel(createFrameFixture(), {
      ...baseOptions,
      settlement: SETTLEMENT,
    }).archiveDiscovery).toBeNull();
    expect(createBattleHudModel(createFrameFixture(), {
      ...baseOptions,
      firstRunTutorialPrompt: {
        stepId: 'aim',
        stepNumber: 1,
        totalSteps: 3,
        placement: 'battle',
        title: '先盯住一只潮兽',
        body: '点一下战场。',
      },
    }).archiveDiscovery).toBeNull();
  });

  it('hides a discovery behind the same real normal interaction exposed by the HUD', () => {
    const frame = createFrameFixture({ status: 'running', elapsedMs: 18_000 });
    const interaction = getAvailableBattleInteractions(
      frame.elapsedMs,
      {},
      'normal',
    )[0];
    expect(interaction).toMatchObject({
      actionId: 'salvage-a',
      attempt: 0,
    });

    const blocked = createBattleHudModel(frame, {
      ...createHudModelOptionsFixture(),
      interactionClaims: {},
      archiveDiscovery: DISCOVERY,
    });
    expect(blocked.interaction).toEqual(interaction);
    expect(blocked.archiveDiscovery).toBeNull();

    const resumed = createBattleHudModel(frame, {
      ...createHudModelOptionsFixture(),
      interactionClaims: { 'salvage-a': 2 },
      archiveDiscovery: DISCOVERY,
    });
    expect(resumed.interaction).toBeNull();
    expect(resumed.archiveDiscovery).toBe(DISCOVERY);
  });
});
