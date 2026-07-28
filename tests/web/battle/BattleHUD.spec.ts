// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BattleHUD,
  createBattleHudModel,
  renderBattleHudShell,
  type BattleHudCallbacks,
} from '../../../web/battle/BattleHUD';
import {
  createFrameFixture,
  createHudModelOptionsFixture,
} from './helpers/BattleFixtures';

const battleHudCss = readFileSync(
  resolve(process.cwd(), 'web/styles/battle-hud.css'),
  'utf8',
);

describe('BattleHUD', () => {
  function createCallbacks(
    overrides: Partial<BattleHudCallbacks> = {},
  ): BattleHudCallbacks {
    return {
      onSkill: vi.fn(),
      onChooseUpgrade: vi.fn(),
      onClaimInteraction: vi.fn(),
      onRequestUpgradeReroll: vi.fn(),
      onRequestSkillRefresh: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onRequestRevive: vi.fn(),
      onRequestDoubleSettlement: vi.fn(),
      onGiveUp: vi.fn(),
      onReturnStation: vi.fn(),
      ...overrides,
    };
  }

  it('renders skills, pause, upgrade, failure and settlement hooks', () => {
    const html = renderBattleHudShell();

    expect(html.match(/data-battle-skill=/g)).toHaveLength(3);
    expect(html).toContain('data-battle-action="pause"');
    expect(html).toContain('data-upgrade-options');
    expect(html).toContain('data-failure-overlay');
    expect(html).toContain('data-settlement-overlay');
    expect(html).toContain('data-hud-run-level');
    expect(html).toContain('data-battle-action="speed"');
    expect(html).toContain('data-skill-rank');
    expect(html).toContain('data-skill-variants');
    expect(html.match(/data-skill-icon/g)).toHaveLength(3);
    expect(html.match(/data-skill-variant\b/g)).toHaveLength(6);
    expect(html).not.toContain('≈');
    expect(html).not.toContain('◌');
    expect(html).not.toContain('✦');
    expect(html).not.toContain('data-boss-bar');
    expect(html).not.toContain('data-boss-label');
  });

  it('renders account and used-skill mastery settlement rows beneath currencies without another modal', () => {
    const hud = new BattleHUD(createCallbacks(), window);
    const host = document.createElement('div');
    document.body.append(host);
    hud.mount(host);
    hud.update(createBattleHudModel(createFrameFixture({ status: 'victory' }), {
      ...createHudModelOptionsFixture(),
      settlement: {
        title: '潮汐航线通关',
        description: '奖励已到账。',
        rewards: { gears: 80, routeMarks: 2, starTickets: 0 },
        expeditionPoints: 0,
        dailyTrialScore: null,
        doubleSettlementAvailable: false,
        doubled: false,
        accountProgression: {
          gainedXp: 74,
          staminaSpendXp: 50,
          level: 12,
          xp: 340,
          levelsGained: 1,
        },
        skillMastery: {
          'tidal-volley': { gainedXp: 6, level: 3 },
        },
      },
    }));

    expect(host.querySelectorAll('[data-settlement-overlay]')).toHaveLength(1);
    expect(host.querySelector('[data-settlement-account]')?.textContent)
      .toContain('账号 XP +74（含开局体力 +50）· Lv.12 · 340 XP · 升级 +1');
    expect(host.querySelector('[data-settlement-mastery]')?.textContent)
      .toContain('潮汐齐射 熟练度 +6 · Lv.3');

    hud.dispose();
    host.remove();
  });

  it('uses compact paper settlement progression rows that wrap safely at 360px', () => {
    expect(battleHudCss).toMatch(
      /\.battle-settlement-progression\s*\{[^}]*display:\s*grid;[^}]*gap:\s*4px;[^}]*margin-top:\s*8px;/s,
    );
    expect(battleHudCss).toMatch(
      /\.battle-settlement-progression\s+p\s*\{[^}]*margin:\s*0;[^}]*line-height:\s*1\.3;[^}]*overflow-wrap:\s*anywhere;/s,
    );
    expect(battleHudCss).toMatch(
      /@media \(max-width: 370px\)[\s\S]*\.battle-dialog--settlement\s*\{[^}]*padding:\s*14px;/s,
    );
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

  it('updates mounted badges and cycles an enabled speed control', () => {
    const onBattleSpeed = vi.fn();
    const hud = new BattleHUD(createCallbacks({ onBattleSpeed }), window);
    const host = document.createElement('div');
    document.body.append(host);
    hud.mount(host);
    hud.update(createBattleHudModel(createFrameFixture({
      skillRanks: {
        'tidal-volley': 1,
        'bubble-barrier': 1,
        'extreme-tide': 5,
      },
      skillVariants: {
        'tidal-volley': [],
        'bubble-barrier': [],
        'extreme-tide': ['undertow-eye', 'double-crest'],
      },
    }), {
      ...createHudModelOptionsFixture(),
      battleSpeed: 1.5,
      availableBattleSpeeds: [1, 1.5],
    }));

    const tideLog = host.querySelector('.battle-hud__tide-log');
    const speed = host.querySelector<HTMLButtonElement>(
      '[data-battle-action="speed"]',
    );
    const pause = host.querySelector('[data-battle-action="pause"]');
    const extremeTide = host.querySelector<HTMLButtonElement>(
      '[data-battle-skill="extreme-tide"]',
    );
    if (!tideLog || !speed || !pause || !extremeTide) {
      throw new Error('Expected mounted tide-log controls');
    }

    expect(speed.parentElement).toBe(tideLog);
    expect(pause.parentElement).toBe(tideLog);
    expect(extremeTide.dataset.rank).toBe('5');
    expect(extremeTide.querySelectorAll(
      '[data-skill-variant]:not([hidden])',
    )).toHaveLength(2);
    expect(extremeTide.getAttribute('aria-label')).toMatch(/\S/);
    expect(speed.textContent).toBe('1.5×');
    expect(speed.disabled).toBe(false);

    speed.click();
    expect(onBattleSpeed).toHaveBeenCalledWith(1);

    hud.dispose();
    host.remove();
  });

  it('disables the speed control when the callback is unavailable', () => {
    const hud = new BattleHUD(createCallbacks(), window);
    const host = document.createElement('div');
    document.body.append(host);
    hud.mount(host);
    hud.update(createBattleHudModel(createFrameFixture(), {
      ...createHudModelOptionsFixture(),
      battleSpeed: 1.5,
      availableBattleSpeeds: [1, 1.5],
    }));
    const speed = host.querySelector<HTMLButtonElement>(
      '[data-battle-action="speed"]',
    );
    if (!speed) throw new Error('Expected mounted speed control');

    expect(speed.disabled).toBe(true);
    expect(speed.getAttribute('aria-disabled')).toBe('true');

    hud.dispose();
    host.remove();
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
