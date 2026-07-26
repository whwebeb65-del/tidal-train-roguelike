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
  function setup(options: {
    stamina?: number;
    staminaUpdatedAtMs?: number;
    stationLevel?: number;
    accountLevel?: number;
    preferredBattleSpeed?: 1 | 1.5 | 2 | 3;
    preparation?: 'ready' | 'local-abort' | 'failure';
    scene?: () => never;
    nowMs?: number;
  } = {}) {
    const app = document.createElement('div');
    const storage = window.localStorage;
    storage.clear();
    const save = {
      ...defaultSave(),
      selectedCaptainId: 'captain-tide-female' as const,
      stamina: options.stamina ?? 10,
      staminaUpdatedAtMs: options.staminaUpdatedAtMs ?? 0,
      stationLevel: options.stationLevel ?? 1,
      accountLevel: options.accountLevel ?? 1,
    };
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify(save));
    const snapshots: Array<{ phase: string; stamina: number; staminaUpdatedAtMs: number; accountXp: number; activeRunStaminaSpent: number }> = [];
    const speedUpdates: number[] = [];
    const speedResolutions: Array<{ initial: number; available: readonly number[] }> = [];
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const runtime = createLegacyGameRuntime(app, storage, true, audio, {
      getSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: options.preferredBattleSpeed ?? 1 }),
      updateSettings: (patch) => { if (patch.preferredBattleSpeed) speedUpdates.push(patch.preferredBattleSpeed); return { version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: patch.preferredBattleSpeed ?? 1 }; },
    }, {
      prepareStationRun: async () => options.preparation === 'local-abort'
        ? { status: 'local-abort' }
        : options.preparation === 'failure'
          ? { status: 'failure', error: new Error('asset') }
          : { status: 'ready', assets: { failedIds: [], get: () => null } },
      prepareBattleScene: options.scene ?? (() => ({ id: 'battle', mount: async () => undefined, unmount: () => undefined } as never)),
      nowMs: () => options.nowMs ?? 0,
      onTestSnapshot: (snapshot) => snapshots.push(snapshot),
      onBattleSpeedResolved: (initial, available) => speedResolutions.push({ initial, available }),
    });
    return { app, storage, runtime, snapshots, speedUpdates, speedResolutions };
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
    const { app, storage, runtime } = setup({ scene: () => { throw new Error('scene failed'); } });
    await runtime.start();
    const button = document.createElement('button'); button.dataset.action = 'start-run'; app.append(button); button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = JSON.parse(storage.getItem(APP_STORAGE_KEYS.player) ?? '{}');
    expect(saved.stamina).toBe(10);
    expect(saved.accountXp).toBe(0);
  });

  it('keeps the save at station when preparation aborts or stamina is insufficient', async () => {
    for (const options of [{ preparation: 'local-abort' as const }, { stamina: 4 }]) {
      const { app, storage, runtime, snapshots } = setup(options);
      await runtime.start();
      const button = document.createElement('button'); button.dataset.action = 'start-run'; app.append(button); button.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const saved = JSON.parse(storage.getItem(APP_STORAGE_KEYS.player) ?? '{}');
      expect(saved.stamina).toBe(options.stamina ?? 10);
      expect(snapshots.at(-1)?.phase).toBe('station');
    }
  });

  it('does not charge a daily trial and resolves locked and unlocked speeds', async () => {
    const daily = setup({ stationLevel: 2, preferredBattleSpeed: 3 });
    await daily.runtime.start();
    const dailyButton = document.createElement('button'); dailyButton.dataset.action = 'start-daily-trial'; daily.app.append(dailyButton); dailyButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(daily.storage.getItem(APP_STORAGE_KEYS.player) ?? '{}').stamina).toBe(10);
    expect(daily.speedUpdates).toContain(1);

    const fast = setup({ accountLevel: 20, preferredBattleSpeed: 2 });
    await fast.runtime.start();
    const button = document.createElement('button'); button.dataset.action = 'start-run'; fast.app.append(button); button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fast.speedResolutions.at(-1)).toEqual({ initial: 2, available: [1, 1.5, 2] });
  });

  it('recovers stamina using completed intervals while preserving the partial baseline', async () => {
    const { runtime, snapshots } = setup({
      stamina: 20,
      staminaUpdatedAtMs: 1_000,
      nowMs: 1_201_001,
    });
    await runtime.start();
    expect(snapshots.at(-1)).toMatchObject({
      stamina: 22,
      staminaUpdatedAtMs: 1_201_000,
    });
  });

  it('clears a failed prepared scene and creates a fresh scene for one successful retry', async () => {
    let creates = 0;
    const scene = () => {
      creates += 1;
      return {
        id: 'battle',
        mount: async () => { if (creates === 1) throw new Error('mount failed'); },
        unmount: () => undefined,
      } as never;
    };
    const { app, storage, runtime } = setup({ scene });
    await runtime.start();
    const button = document.createElement('button'); button.dataset.action = 'start-run'; app.append(button);
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(storage.getItem(APP_STORAGE_KEYS.player) ?? '{}').stamina).toBe(10);
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = JSON.parse(storage.getItem(APP_STORAGE_KEYS.player) ?? '{}');
    expect(creates).toBe(2);
    expect(saved.stamina).toBe(5);
    expect(saved.accountXp).toBe(50);
  });
});
