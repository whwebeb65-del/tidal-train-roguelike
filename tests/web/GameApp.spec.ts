// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { appSceneForAction } from '../../web/app/GameApp';
import { createLegacyGameRuntime } from '../../web/LegacyGameRuntime';
import { APP_STORAGE_KEYS } from '../../web/app/AppStateRepository';
import { defaultSave } from '../../src/save/SaveRepository';

describe('GameApp navigation', () => {
  it('maps every bottom action to a real scene and reserves battle for departure', () => {
    expect(appSceneForAction('station')).toBe('station');
    expect(appSceneForAction('captain')).toBe('captain');
    expect(appSceneForAction('equipment')).toBe('equipment');
    expect(appSceneForAction('legion')).toBe('legion');
    expect(appSceneForAction('store')).toBe('store');
    expect(appSceneForAction('start-run')).toBe('battle');
    expect(appSceneForAction('start-daily-trial')).toBe('battle');
    expect(appSceneForAction('combat-action')).toBeNull();
    expect(appSceneForAction('damage')).toBeNull();
    expect(appSceneForAction('unknown')).toBeNull();
  });
});

describe('LegacyGameRuntime departure transaction', () => {
  function setup(prepareBattleScene?: () => never) {
    const app = document.createElement('div');
    const storage = window.localStorage;
    storage.clear();
    const save = {
      ...defaultSave(),
      selectedCaptainId: 'captain-tide-female' as const,
      stamina: 10,
      staminaUpdatedAtMs: 0,
    };
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify(save));
    const snapshots: Array<{ stamina: number; accountXp: number; activeRunStaminaSpent: number }> = [];
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const runtime = createLegacyGameRuntime(app, storage, true, audio, {
      getSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
      updateSettings: (patch) => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: patch.preferredBattleSpeed ?? 1 }),
    }, {
      prepareStationRun: async () => ({ status: 'ready', assets: { failedIds: [], get: () => null } }),
      prepareBattleScene: prepareBattleScene ?? (() => ({ id: 'battle', mount: async () => undefined, unmount: () => undefined } as never)),
      nowMs: () => 0,
      onTestSnapshot: (snapshot) => snapshots.push(snapshot),
    });
    return { app, storage, runtime, snapshots };
  }

  it('commits normal stamina and start XP only after the prepared scene mounts', async () => {
    const { app, storage, runtime, snapshots } = setup();
    await runtime.start();
    app.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const button = document.createElement('button'); button.dataset.action = 'start-run'; app.append(button); button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = JSON.parse(storage.getItem(APP_STORAGE_KEYS.player) ?? '{}');
    expect(saved.stamina).toBe(5);
    expect(saved.accountXp).toBe(50);
    expect(snapshots.at(-1)?.activeRunStaminaSpent).toBe(5);
  });

  it('does not commit when battle scene preparation throws', async () => {
    const { app, storage, runtime } = setup(() => { throw new Error('scene failed'); });
    await runtime.start();
    const button = document.createElement('button'); button.dataset.action = 'start-run'; app.append(button); button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = JSON.parse(storage.getItem(APP_STORAGE_KEYS.player) ?? '{}');
    expect(saved.stamina).toBe(10);
    expect(saved.accountXp).toBe(0);
  });
});
