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

describe('createBattleHudModel archive discovery', () => {
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
