import { describe, expect, it } from 'vitest';
import {
  createBattleHudModel,
  renderBattleHudShell,
} from '../../../web/battle/BattleHUD';
import {
  createFrameFixture,
  createHudModelOptionsFixture,
} from './helpers/BattleFixtures';

describe('BattleHUD', () => {
  it('renders skills, pause, upgrade, failure and settlement hooks', () => {
    const html = renderBattleHudShell();

    expect(html.match(/data-battle-skill=/g)).toHaveLength(3);
    expect(html).toContain('data-battle-action="pause"');
    expect(html).toContain('data-upgrade-options');
    expect(html).toContain('data-failure-overlay');
    expect(html).toContain('data-settlement-overlay');
    expect(html).not.toContain('data-boss-bar');
    expect(html).not.toContain('data-boss-label');
  });

  it('keeps elite and Boss health out of the DOM HUD model', () => {
    const model = createBattleHudModel(createFrameFixture({
      enemies: [{
        ...createFrameFixture().enemies[0]!,
        kind: 'deep-echo-boss',
        hp: 2100,
        maxHp: 4200,
        shield: 420,
      }],
    }), {
      mode: 'normal',
      upgradeRerollAvailable: false,
      skillRefreshAvailable: false,
    });

    expect(model).not.toHaveProperty('bossBar');
    expect(model.hpLabel).toBe('88 / 100');
  });

  it('shows cooldown, shield, energy and upgrade information', () => {
    const model = createBattleHudModel(createFrameFixture({
      status: 'upgrade',
      shield: 25,
      shieldRemainingMs: 3500,
      energy: 72,
      offeredUpgradeIds: [
        'rapid-reload',
        'coral-warhead',
        'bubble-capacitor',
      ],
    }), {
      mode: 'normal',
      upgradeRerollAvailable: true,
      skillRefreshAvailable: false,
    });

    expect(model.energyLabel).toBe('72 / 100');
    expect(model.shieldLabel).toContain('3.5');
    expect(model.upgradeCards).toHaveLength(3);
    expect(model.upgradeRerollVisible).toBe(true);
  });

  it('uses catalog metadata for the fourth skill-rank level', () => {
    const model = createBattleHudModel(createFrameFixture({
      status: 'upgrade',
      offeredUpgradeIds: ['rank-tidal-volley'],
      upgradeLevels: {
        ...createFrameFixture().upgradeLevels,
        'rank-tidal-volley': 3,
      },
    }), {
      mode: 'normal',
      upgradeRerollAvailable: false,
      skillRefreshAvailable: false,
    });

    expect(model.upgradeCards[0]).toMatchObject({
      id: 'rank-tidal-volley',
      currentLevel: 3,
      nextLevel: 4,
    });
  });

  it('exposes run rank, acquired variants, catalog art, and the next speed unlock', () => {
    const frame = createFrameFixture({
      runLevel: 7,
      skillRanks: {
        'tidal-volley': 3,
        'bubble-barrier': 2,
        'extreme-tide': 5,
      },
      skillVariants: {
        'tidal-volley': ['split-tide-arrow'],
        'bubble-barrier': [],
        'extreme-tide': ['undertow-eye', 'double-crest'],
      },
    });
    const availableBattleSpeeds = [1, 1.5] as const;
    const model = createBattleHudModel(frame, {
      ...createHudModelOptionsFixture(),
      battleSpeed: 1.5,
      availableBattleSpeeds,
      nextSpeedUnlockLevel: 20,
    });

    expect(model.runLevelLabel).toBe('Lv.7');
    expect(model.skills).toMatchObject([
      {
        rank: 3,
        variantIds: ['split-tide-arrow'],
        iconUrl: expect.stringContaining('tidal-volley-badge'),
      },
      { rank: 2, variantIds: [] },
      { rank: 5, variantIds: ['undertow-eye', 'double-crest'] },
    ]);
    expect(model.speed).toEqual({
      current: 1.5,
      available: [1, 1.5],
      nextUnlockLevel: 20,
    });
    expect(model.skills[0]?.variantIds).not.toBe(frame.skillVariants['tidal-volley']);
    expect(model.speed.available).not.toBe(availableBattleSpeeds);
  });

  it.each([
    { available: [1] as const, nextUnlockLevel: 10 },
    { available: [1, 1.5] as const, nextUnlockLevel: 20 },
    { available: [1, 1.5, 2] as const, nextUnlockLevel: 30 },
    { available: [1, 1.5, 2, 3] as const, nextUnlockLevel: null },
  ])('reports the next speed unlock for $available', ({ available, nextUnlockLevel }) => {
    const model = createBattleHudModel(createFrameFixture(), {
      ...createHudModelOptionsFixture(),
      battleSpeed: available.at(-1) ?? 1,
      availableBattleSpeeds: available,
    });

    expect(model.speed.nextUnlockLevel).toBe(nextUnlockLevel);
  });

  it('places an explicit resume overlay above paused battle outcomes', () => {
    const settlement = {
      title: 'Run complete',
      description: 'Rewards secured',
      rewards: { gears: 80, routeMarks: 2, starTickets: 0 },
      expeditionPoints: 8,
      dailyTrialScore: null,
      doubleSettlementAvailable: true,
      doubled: false,
    };
    const model = createBattleHudModel(createFrameFixture({
      status: 'upgrade',
      offeredUpgradeIds: [
        'rapid-reload',
        'coral-warhead',
        'bubble-capacitor',
      ],
    }), {
      mode: 'normal',
      upgradeRerollAvailable: true,
      skillRefreshAvailable: true,
      settlement,
      visibilityResumeRequired: true,
    });

    expect(model.pauseOverlayVisible).toBe(true);
    expect(model.upgradeVisible).toBe(false);
    expect(model.upgradeRerollVisible).toBe(false);
    expect(model.skillRefreshVisible).toBe(false);
    expect(model.failureVisible).toBe(false);
    expect(model.settlementVisible).toBe(false);
    expect(model.doubleSettlementVisible).toBe(false);
  });
});
