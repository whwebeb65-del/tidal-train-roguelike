// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { appSceneForAction } from '../../web/app/GameApp';
import { createLegacyGameRuntime, progressionTelemetryForUpgrade } from '../../web/LegacyGameRuntime';
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

describe('LegacyGameRuntime E2E snapshots', () => {
  it('deep-copies progression variant arrays so mutations cannot affect the engine or later snapshots', async () => {
    window.history.replaceState({}, '', '/?e2e=1&e2eSeed=17');
    const app = document.createElement('div');
    const storage = window.localStorage;
    storage.clear();
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const runtime = createLegacyGameRuntime(app, storage, true, audio, {
      getSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
      updateSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
    }, {
      prepareStationRun: async () => ({ status: 'ready', assets: { failedIds: [], get: () => null } }),
    });
    await runtime.start();
    await runtime.e2eStartNormalBattle();
    const first = runtime.e2eSnapshot();
    (first.progression.variants['tidal-volley'] as string[]).push('corrupt');
    (first.battle?.skillVariants['tidal-volley'] as string[]).push('corrupt-battle');
    const second = runtime.e2eSnapshot();
    expect(second.progression.variants['tidal-volley']).not.toContain('corrupt');
    expect(second.battle?.skillVariants['tidal-volley']).not.toContain('corrupt');
    expect(second.battle?.skillVariants['tidal-volley']).not.toContain('corrupt-battle');
    runtime.destroy();
  });
});

describe('progression telemetry selection', () => {
  it('emits rank changes only for the skill whose rank actually changed', () => {
    const baseline = {
      ranks: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 1 },
      variants: { 'tidal-volley': ['split-tide-arrow'], 'bubble-barrier': [], 'extreme-tide': [] },
    } as const;
    const generic = progressionTelemetryForUpgrade({
      skillRanks: baseline.ranks,
      skillVariants: baseline.variants,
    }, baseline);
    expect(generic.events.filter((event) => event.name === 'skill_rank_changed')).toEqual([]);
    expect(generic.events.filter((event) => event.name === 'skill_variant_acquired')).toEqual([]);
    const ranked = progressionTelemetryForUpgrade({
      skillRanks: { ...baseline.ranks, 'tidal-volley': 2 },
      skillVariants: baseline.variants,
    }, baseline);
    expect(ranked.events.filter((event) => event.name === 'skill_rank_changed')).toEqual([
      { name: 'skill_rank_changed', payload: { skillId: 'tidal-volley', rank: 2 } },
    ]);
    expect(ranked.events.filter((event) => event.name === 'skill_variant_acquired')).toEqual([]);
  });
});

describe('LegacyGameRuntime departure transaction', () => {
  function setup(options: {
    stamina?: number;
    staminaUpdatedAtMs?: number;
    stationLevel?: number;
    accountLevel?: number;
    firstClearMapIds?: string[];
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
      firstClearMapIds: options.firstClearMapIds ?? [],
    };
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify(save));
    const snapshots: Array<{ phase: string; stamina: number; staminaUpdatedAtMs: number; accountXp: number; activeRunStaminaSpent: number }> = [];
    const speedUpdates: number[] = [];
    const speedResolutions: Array<{ initial: number; available: readonly number[] }> = [];
    let sceneCreates = 0;
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
      prepareBattleScene: (...args) => {
        sceneCreates += 1;
        return options.scene?.()
          ?? ({ id: 'battle', mount: async () => undefined, unmount: () => undefined } as never);
      },
      nowMs: () => options.nowMs ?? 0,
      onTestSnapshot: (snapshot) => snapshots.push(snapshot),
      onBattleSpeedResolved: (initial, available) => speedResolutions.push({ initial, available }),
    });
    return { app, storage, runtime, snapshots, speedUpdates, speedResolutions, getSceneCreates: () => sceneCreates };
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

  it('keeps save and active run state unchanged when asset preparation fails before scene creation', async () => {
    const { app, storage, runtime, snapshots, getSceneCreates } = setup({ preparation: 'failure' });
    await runtime.start();
    const button = document.createElement('button'); button.dataset.action = 'start-run'; app.append(button); button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = JSON.parse(storage.getItem(APP_STORAGE_KEYS.player) ?? '{}');
    expect(saved.stamina).toBe(10);
    expect(saved.accountXp).toBe(0);
    expect(snapshots.at(-1)).toMatchObject({ phase: 'station', activeRunStaminaSpent: 0 });
    expect(getSceneCreates()).toBe(0);
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

  it('renders and claims the current guidebook objective exactly once', async () => {
    const { app, storage, runtime } = setup({
      firstClearMapIds: ['drift-suburb'],
    });
    await runtime.start();
    const claim = app.querySelector<HTMLButtonElement>(
      '[data-action="claim-guidebook"][data-guidebook-objective="first-clear"]',
    );
    expect(claim).not.toBeNull();

    claim?.click();
    const firstSave = JSON.parse(storage.getItem(APP_STORAGE_KEYS.player) ?? '{}');
    const firstGuidebook = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.guidebook) ?? '{}',
    );
    expect(firstSave.gears).toBe(60);
    expect(firstGuidebook.claimedObjectiveIds).toEqual(['first-clear']);

    const forgedRepeat = document.createElement('button');
    forgedRepeat.dataset.action = 'claim-guidebook';
    forgedRepeat.dataset.guidebookObjective = 'first-clear';
    app.append(forgedRepeat);
    forgedRepeat.click();
    expect(JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.player) ?? '{}',
    ).gears).toBe(60);
    runtime.destroy();
  });
});
