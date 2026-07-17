import { describe, expect, it, vi } from 'vitest';
import {
  installBattleE2EHooks,
  removeBattleE2EHooks,
  type BattleE2EController,
  type BattleE2ESnapshot,
  type TidalTrainE2EHooks,
} from '../../../web/battle/BattleE2EHooks';

function createController(): BattleE2EController {
  return {
    e2eSnapshot: vi.fn((): BattleE2ESnapshot => ({
      sceneId: 'station',
      battle: null,
      trainMotion: null,
      diagnostics: {
        activeFrameLoops: 0,
        activeListeners: 0,
        activeAudioSchedulers: 1,
        enemies: 0,
        projectiles: 0,
        loot: 0,
        effects: 0,
        pooledInUse: 0,
        settledBattleCount: 0,
        qualityLevel: 'high',
        lastUncaughtError: null,
      },
      settlementCount: 0,
    })),
    e2eNavigate: vi.fn(async () => undefined),
    e2eStartNormalBattle: vi.fn(async () => undefined),
    e2eStartDailyTrial: vi.fn(async () => undefined),
    e2eAdvanceBattle: vi.fn(),
    e2eChooseFirstUpgrade: vi.fn(() => true),
    e2eUseSkill: vi.fn(() => true),
    e2eRequestPause: vi.fn(),
    e2eRequestResume: vi.fn(async () => undefined),
    e2eReturnToStation: vi.fn(async () => undefined),
  };
}

describe('BattleE2EHooks', () => {
  it('does not expose hooks on ordinary URLs', () => {
    const target = {
      location: { search: '' },
      __TIDAL_TRAIN_E2E__: undefined as TidalTrainE2EHooks | undefined,
    };

    expect(installBattleE2EHooks(target, createController())).toBe(false);
    expect(target.__TIDAL_TRAIN_E2E__).toBeUndefined();
  });

  it('installs bounded controls only for e2e=1 and removes them cleanly', async () => {
    const controller = createController();
    const target = {
      location: { search: '?e2e=1' },
      __TIDAL_TRAIN_E2E__: undefined as TidalTrainE2EHooks | undefined,
    };

    expect(installBattleE2EHooks(target, controller)).toBe(true);
    target.__TIDAL_TRAIN_E2E__?.advanceBattle(2000);
    await target.__TIDAL_TRAIN_E2E__?.navigate('captain');

    expect(controller.e2eAdvanceBattle).toHaveBeenCalledWith(2000);
    expect(controller.e2eNavigate).toHaveBeenCalledWith('captain');
    expect(target.__TIDAL_TRAIN_E2E__?.snapshot().trainMotion).toBeNull();
    removeBattleE2EHooks(target);
    expect(target.__TIDAL_TRAIN_E2E__).toBeUndefined();
  });
});
