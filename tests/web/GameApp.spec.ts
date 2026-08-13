// @vitest-environment jsdom
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { appSceneForAction } from '../../web/app/GameApp';
import { createLegacyGameRuntime, progressionTelemetryForUpgrade } from '../../web/LegacyGameRuntime';
import type { LegacyRuntimeTestSnapshot } from '../../web/LegacyGameRuntime';
import { APP_STORAGE_KEYS } from '../../web/app/AppStateRepository';
import { defaultSave } from '../../src/save/SaveRepository';
import { TIDE_BEAST_ARCHIVE_IDS } from '../../src/domain/collection/TidalArchiveSystem';
import { SKILL_VARIANT_IDS } from '../../src/domain/skill/SkillProgressionTypes';
import { getBattleUpgradeDefinition } from '../../web/battle/BattleUpgradeCatalog';
import type { BattleEngine } from '../../web/battle/BattleEngine';
import { createWaveSchedule } from '../../web/battle/WaveScheduler';
import { getTidalArchiveEnemyDiscovery } from '../../web/battle/TidalArchiveDiscoveryPresentation';
import { BattleScene } from '../../web/scenes/BattleScene';
import { MockAds } from '../../src/platform/MockPlatform';
import type { BattleEvent } from '../../web/battle/BattleTypes';

function installCanvas2DStub(): () => void {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    contextId: string,
  ): RenderingContext | null {
    if (contextId !== '2d') return null;
    const gradient = { addColorStop: vi.fn() };
    const target = { canvas: this } as unknown as CanvasRenderingContext2D;
    return new Proxy(target, {
      get(current, property) {
        if (property === 'measureText') return () => ({ width: 80 });
        if (
          property === 'createLinearGradient'
          || property === 'createRadialGradient'
        ) {
          return () => gradient;
        }
        const value = Reflect.get(current, property);
        return value ?? (() => undefined);
      },
      set(current, property, value) {
        return Reflect.set(current, property, value);
      },
    }) as CanvasRenderingContext2D;
  } as typeof HTMLCanvasElement.prototype.getContext;
  return () => {
    HTMLCanvasElement.prototype.getContext = original;
  };
}

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
  async function setupRepeatVictoryWithDiscovery() {
    const restoreCanvas = installCanvas2DStub();
    window.history.replaceState({}, '', '/?e2e=1&e2eSeed=17');
    const app = document.createElement('div');
    document.body.append(app);
    const storage = window.localStorage;
    storage.clear();
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify({
      ...defaultSave(),
      stamina: 20,
      gears: 1_000,
      routeMarks: 100,
      firstClearMapIds: ['drift-suburb'],
      selectedCaptainId: 'captain-tide-female',
    }));
    storage.setItem(APP_STORAGE_KEYS.firstRunBattleTutorial, JSON.stringify({
      version: 1,
      completedStepIds: ['aim', 'skill', 'upgrade'],
      skipped: false,
    }));
    const snapshots: LegacyRuntimeTestSnapshot[] = [];
    let battleScene: BattleScene | null = null;
    let battleEngine: BattleEngine | null = null;
    const originalMount = BattleScene.prototype.mount;
    const mountSpy = vi.spyOn(BattleScene.prototype, 'mount')
      .mockImplementation(function captureScene(this: BattleScene, host: HTMLElement) {
        battleScene = this;
        return originalMount.call(this, host);
      });
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const runtime = createLegacyGameRuntime(app, storage, true, audio, {
      getSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
      updateSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
    }, {
      prepareStationRun: async () => ({ status: 'ready', assets: { failedIds: [], get: () => null } }),
      onTestSnapshot: (snapshot) => snapshots.push(snapshot),
      onBattleEngineCreated: (engine) => {
        battleEngine = engine;
      },
    });
    onTestFinished(() => {
      runtime.destroy();
      mountSpy.mockRestore();
      app.remove();
      restoreCanvas();
    });

    await runtime.start();
    await runtime.e2eStartNormalBattle();
    if (!battleScene || !battleEngine) {
      throw new Error('Expected mounted repeat-victory battle');
    }
    const sceneInternals = battleScene as unknown as {
      dependencies: {
        onBattleEvents(events: readonly BattleEvent[]): unknown;
      };
      updateBattle(stepMs: number): void;
    };
    sceneInternals.dependencies.onBattleEvents([Object.freeze({
      type: 'enemy-spawned',
      enemyId: 1,
      kind: 'bubble-fin',
    })]);
    (battleEngine as unknown as { finish(victory: boolean): void }).finish(true);
    sceneInternals.updateBattle(17);
    (battleScene as BattleScene).advanceForE2E(0);
    await vi.waitFor(() => {
      expect(snapshots.at(-1)?.activeBattleSettlement).not.toBeNull();
    });
    return { app, runtime, snapshots, storage };
  }

  it('drops a completed settlement double after its battle exits', async () => {
    let resolveAd = (_result: 'completed'): void => undefined;
    const adPromise = new Promise<'completed'>((resolve) => {
      resolveAd = resolve;
    });
    const showRewardedAd = vi.spyOn(MockAds.prototype, 'showRewardedAd')
      .mockImplementation(() => adPromise);
    onTestFinished(() => showRewardedAd.mockRestore());
    const { app, runtime, snapshots, storage } =
      await setupRepeatVictoryWithDiscovery();
    const savedBeforeDouble = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.player) ?? '{}',
    );

    app.querySelector<HTMLButtonElement>(
      '[data-battle-action="double-settlement"]',
    )?.click();
    expect(showRewardedAd).toHaveBeenCalledWith('double-settlement');
    await runtime.e2eReturnToStation();
    resolveAd('completed');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.player) ?? '{}',
    )).toEqual(savedBeforeDouble);
    expect(snapshots.at(-1)?.phase).toBe('station');
    expect(snapshots.at(-1)?.activeBattleSettlement).toBeNull();
  });

  it('freezes a valid doubled settlement and preserves its discovery array identity', async () => {
    let resolveAd = (_result: 'completed'): void => undefined;
    const adPromise = new Promise<'completed'>((resolve) => {
      resolveAd = resolve;
    });
    const showRewardedAd = vi.spyOn(MockAds.prototype, 'showRewardedAd')
      .mockImplementation(() => adPromise);
    onTestFinished(() => showRewardedAd.mockRestore());
    const { app, snapshots, storage } = await setupRepeatVictoryWithDiscovery();
    const capturedSettlement = snapshots.at(-1)?.activeBattleSettlement;
    const capturedDiscoveries = capturedSettlement?.archiveDiscoveries;
    const savedBeforeDouble = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.player) ?? '{}',
    );
    expect(capturedDiscoveries?.map((entry) => entry.key))
      .toEqual(['enemy:bubble-fin']);

    app.querySelector<HTMLButtonElement>(
      '[data-battle-action="double-settlement"]',
    )?.click();
    expect(showRewardedAd).toHaveBeenCalledWith('double-settlement');
    resolveAd('completed');
    await vi.waitFor(() => {
      expect(snapshots.at(-1)?.activeBattleSettlement?.doubled).toBe(true);
    });

    const doubledSettlement = snapshots.at(-1)?.activeBattleSettlement;
    const savedAfterDouble = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.player) ?? '{}',
    );
    expect(doubledSettlement).not.toBe(capturedSettlement);
    expect(Object.isFrozen(doubledSettlement)).toBe(true);
    expect(Object.isFrozen(doubledSettlement?.archiveDiscoveries)).toBe(true);
    expect(doubledSettlement?.archiveDiscoveries).toBe(capturedDiscoveries);
    expect(doubledSettlement?.archiveDiscoveries.map((entry) => entry.key))
      .toEqual(['enemy:bubble-fin']);
    expect(savedAfterDouble.gears).toBe(savedBeforeDouble.gears + 80);
    expect(savedAfterDouble.routeMarks).toBe(savedBeforeDouble.routeMarks + 2);
  });

  it('keeps the battle-engine inspection seam behind the exact e2e=1 gate', async () => {
    window.history.replaceState({}, '', '/');
    expect(window.__TIDAL_TRAIN_E2E__).toBeUndefined();
    const app = document.createElement('div');
    const storage = window.localStorage;
    storage.clear();
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify({
      ...defaultSave(),
      selectedCaptainId: 'captain-tide-female',
    }));
    const onBattleEngineCreated = vi.fn();
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const runtime = createLegacyGameRuntime(app, storage, true, audio, {
      getSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
      updateSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
    }, {
      prepareStationRun: async () => ({ status: 'ready', assets: { failedIds: [], get: () => null } }),
      prepareBattleScene: () => ({
        id: 'battle',
        mount: async () => undefined,
        unmount: () => undefined,
      } as never),
      onBattleEngineCreated,
    });
    onTestFinished(() => runtime.destroy());

    await runtime.start();
    const start = document.createElement('button');
    start.dataset.action = 'start-run';
    app.append(start);
    start.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onBattleEngineCreated).not.toHaveBeenCalled();
    expect(window.__TIDAL_TRAIN_E2E__).toBeUndefined();
  });

  it('keeps a frame-zero discovery through animation, settlement, and a failed next mount', async () => {
    const restoreCanvas = installCanvas2DStub();
    window.history.replaceState({}, '', '/');
    const app = document.createElement('div');
    document.body.append(app);
    const storage = window.localStorage;
    const nowMs = Date.now();
    storage.clear();
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify({
      ...defaultSave(),
      stamina: 10,
      staminaUpdatedAtMs: nowMs,
      selectedCaptainId: 'captain-tide-female',
    }));
    storage.setItem(APP_STORAGE_KEYS.firstRunBattleTutorial, JSON.stringify({
      version: 1,
      completedStepIds: ['aim', 'skill', 'upgrade'],
      skipped: false,
    }));
    const snapshots: LegacyRuntimeTestSnapshot[] = [];
    let battleScene: BattleScene | null = null;
    let battleMounts = 0;
    const originalMount = BattleScene.prototype.mount;
    const mountSpy = vi.spyOn(BattleScene.prototype, 'mount')
      .mockImplementation(function captureRealBattleScene(
        this: BattleScene,
        host: HTMLElement,
      ) {
        battleMounts += 1;
        if (battleMounts === 2) throw new Error('next battle mount failed');
        battleScene = this;
        return originalMount.call(this, host);
      });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const runtime = createLegacyGameRuntime(app, storage, false, audio, {
      getSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: false, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
      updateSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: false, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
    }, {
      prepareStationRun: async () => ({ status: 'ready', assets: { failedIds: [], get: () => null } }),
      nowMs: () => nowMs,
      onTestSnapshot: (snapshot) => snapshots.push(snapshot),
    });
    onTestFinished(() => {
      runtime.destroy();
      mountSpy.mockRestore();
      consoleError.mockRestore();
      app.remove();
      restoreCanvas();
    });

    await runtime.start();
    app.querySelector<HTMLButtonElement>('[data-action="start-run"]')?.click();
    await vi.waitFor(() => {
      const archive = JSON.parse(
        storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
      );
      expect(archive.unreadEntryKeys).toHaveLength(1);
    });
    const discoveredKey = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
    ).unreadEntryKeys[0] as string;
    expect(snapshots.at(-1)?.phase).toBe('station');
    await vi.waitFor(() => {
      expect(snapshots.at(-1)?.phase).toBe('combat');
    });
    expect(battleScene).not.toBeNull();

    const engine = (battleScene as unknown as {
      dependencies: { engine: { finish(victory: boolean): void } };
    }).dependencies.engine;
    engine.finish(true);
    await vi.waitFor(() => {
      expect(snapshots.at(-1)?.activeBattleSettlement).not.toBeNull();
    });
    expect(
      snapshots.at(-1)?.activeBattleSettlement?.archiveDiscoveries
        .map((entry) => entry.key),
    ).toContain(discoveredKey);

    app.querySelector<HTMLButtonElement>(
      '[data-battle-action="return-station"]',
    )?.click();
    await vi.waitFor(() => {
      expect(snapshots.at(-1)?.phase).toBe('station');
    });
    const snapshotsBeforeFailedDeparture = snapshots.length;
    app.querySelector<HTMLButtonElement>('[data-action="start-run"]')?.click();
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(expect.any(Error));
      expect(snapshots.length).toBeGreaterThan(snapshotsBeforeFailedDeparture);
    });
    expect(snapshots.at(-1)?.phase).toBe('station');
    expect(
      snapshots.at(-1)?.activeRunArchiveDiscoveries.map((entry) => entry.key),
    ).toContain(discoveredKey);
  }, 10_000);

  it('starts a new archive visit when unread entries arrive while the archive panel is remembered', async () => {
    const restoreCanvas = installCanvas2DStub();
    window.history.replaceState({}, '', '/?e2e=1&e2eSeed=17');
    const app = document.createElement('div');
    document.body.append(app);
    const storage = window.localStorage;
    storage.clear();
    const firstScheduledEnemyKind = createWaveSchedule(
      17,
      'drift-suburb',
    )[0]?.kind;
    expect(firstScheduledEnemyKind).toBeTruthy();
    if (!firstScheduledEnemyKind) throw new Error('Normal schedule has no enemy');
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify({
      ...defaultSave(),
      stamina: 10,
      selectedCaptainId: 'captain-tide-female',
    }));
    storage.setItem(APP_STORAGE_KEYS.tidalArchive, JSON.stringify({
      version: 2,
      discoveredEnemyKinds: TIDE_BEAST_ARCHIVE_IDS.filter(
        (kind) => kind !== firstScheduledEnemyKind,
      ),
      discoveredSkillVariantIds: [...SKILL_VARIANT_IDS],
      unreadEntryKeys: ['skill-variant:undertow-eye'],
    }));
    storage.setItem(APP_STORAGE_KEYS.firstRunBattleTutorial, JSON.stringify({
      version: 1,
      completedStepIds: ['aim', 'skill', 'upgrade'],
      skipped: false,
    }));
    const telemetryEvents: Array<{
      readonly name: string;
      readonly payload: Readonly<Record<string, string | number | boolean>>;
    }> = [];
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const runtime = createLegacyGameRuntime(app, storage, true, audio, {
      getSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
      updateSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
    }, {
      prepareStationRun: async () => ({ status: 'ready', assets: { failedIds: [], get: () => null } }),
      onTelemetryEvent: (event) => telemetryEvents.push(event),
    });
    onTestFinished(() => {
      runtime.destroy();
      app.remove();
      restoreCanvas();
    });

    await runtime.start();
    await runtime.e2eNavigate('equipment');
    app.querySelector<HTMLButtonElement>(
      '[data-action="show-tidal-archive"]',
    )?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.querySelector(
      '[data-archive-variant="undertow-eye"].is-new',
    )).not.toBeNull();
    expect(telemetryEvents.filter(
      (event) => event.name === 'tidal_archive_entries_read',
    )).toHaveLength(1);

    await runtime.e2eNavigate('station');
    await runtime.e2eNavigate('equipment');
    expect(app.querySelector(
      '[data-archive-variant="undertow-eye"].is-new',
    )).toBeNull();
    await runtime.e2eNavigate('station');
    await runtime.e2eStartNormalBattle();
    for (let index = 0; index < 20; index += 1) {
      if ((runtime.e2eSnapshot().battle?.enemies.length ?? 0) > 0) break;
      runtime.e2eAdvanceBattle(250);
    }
    expect(JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
    ).unreadEntryKeys).toEqual([`enemy:${firstScheduledEnemyKind}`]);

    await runtime.e2eReturnToStation();
    await runtime.e2eNavigate('equipment');
    expect(app.querySelector(
      `[data-archive-enemy="${firstScheduledEnemyKind}"].is-new`,
    )).toBeNull();
    const archiveTab = app.querySelector<HTMLButtonElement>(
      '[data-action="show-tidal-archive"]',
    );
    expect(archiveTab?.getAttribute('aria-pressed')).toBe('true');
    expect(archiveTab?.textContent).toContain('NEW 1');
    app.querySelector<HTMLButtonElement>(
      '[data-action="show-tidal-archive"]',
    )?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
    ).unreadEntryKeys).toEqual([]);
    const readEvents = telemetryEvents.filter(
      (event) => event.name === 'tidal_archive_entries_read',
    );
    expect(readEvents).toHaveLength(2);
    expect(readEvents[1]?.payload).toEqual({ count: 1 });
    expect(app.querySelector(
      `[data-archive-enemy="${firstScheduledEnemyKind}"].is-new`,
    )).not.toBeNull();

    app.querySelector<HTMLButtonElement>(
      '[data-action="show-tidal-archive"]',
    )?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.querySelector(
      `[data-archive-enemy="${firstScheduledEnemyKind}"].is-new`,
    )).not.toBeNull();
    expect(telemetryEvents.filter(
      (event) => event.name === 'tidal_archive_entries_read',
    )).toHaveLength(2);

    app.querySelector<HTMLButtonElement>(
      '[data-action="show-equipment-workshop"]',
    )?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    app.querySelector<HTMLButtonElement>(
      '[data-action="show-tidal-archive"]',
    )?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.querySelectorAll('.archive-card.is-new')).toHaveLength(0);
    expect(telemetryEvents.filter(
      (event) => event.name === 'tidal_archive_entries_read',
    )).toHaveLength(2);
  });

  it('records authoritative archive discoveries once and opens the archive without changing player assets', async () => {
    const restoreCanvas = installCanvas2DStub();
    window.history.replaceState({}, '', '/?e2e=1&e2eSeed=17');
    const app = document.createElement('div');
    document.body.append(app);
    const storage = window.localStorage;
    storage.clear();
    const firstScheduledEnemyKind = createWaveSchedule(
      17,
      'drift-suburb',
    )[0]?.kind;
    expect(firstScheduledEnemyKind).toBeTruthy();
    if (!firstScheduledEnemyKind) throw new Error('Normal schedule has no enemy');
    const expectedNewVariantId = 'undertow-eye' as const;
    const seededSave = {
      ...defaultSave(),
      gears: 321,
      routeMarks: 45,
      starTickets: 6,
      selectedCaptainId: 'captain-tide-female' as const,
    };
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify(seededSave));
    storage.setItem(APP_STORAGE_KEYS.tidalArchive, JSON.stringify({
      version: 2,
      discoveredEnemyKinds: TIDE_BEAST_ARCHIVE_IDS.filter(
        (kind) => kind !== firstScheduledEnemyKind,
      ),
      discoveredSkillVariantIds: SKILL_VARIANT_IDS.filter(
        (variantId) => variantId !== expectedNewVariantId,
      ),
      unreadEntryKeys: [],
    }));
    storage.setItem(APP_STORAGE_KEYS.firstRunBattleTutorial, JSON.stringify({
      version: 1,
      completedStepIds: ['aim', 'skill', 'upgrade'],
      skipped: false,
    }));
    const telemetryEvents: Array<{
      readonly name: string;
      readonly payload: Readonly<Record<string, string | number | boolean>>;
    }> = [];
    let getBattleInput: () => ReturnType<BattleEngine['inputForTest']> | undefined = (
      () => undefined
    );
    const runtimeSnapshots: LegacyRuntimeTestSnapshot[] = [];
    let battleEngineCreatedCount = 0;
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const runtime = createLegacyGameRuntime(app, storage, true, audio, {
      getSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
      updateSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
    }, {
      prepareStationRun: async () => ({ status: 'ready', assets: { failedIds: [], get: () => null } }),
      onTelemetryEvent: (event) => telemetryEvents.push(event),
      onTestSnapshot: (snapshot) => runtimeSnapshots.push(snapshot),
      onBattleEngineCreated: (engine) => {
        battleEngineCreatedCount += 1;
        getBattleInput = () => engine.inputForTest();
      },
    });

    onTestFinished(() => {
      runtime.destroy();
      app.remove();
      restoreCanvas();
    });
    await runtime.start();
    expect(JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
    ).unreadEntryKeys).toEqual([]);
    await runtime.e2eStartNormalBattle();
    const startingBattle = runtime.e2eSnapshot().battle;
    expect(startingBattle).not.toBeNull();
    expect(battleEngineCreatedCount).toBe(1);
    const startingBattleInput = structuredClone(
      getBattleInput(),
    );
    expect(startingBattleInput).toBeTruthy();
    const playerAfterBattleStart = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.player) ?? '{}',
    );
    const discoveryTicket = app.querySelector<HTMLElement>(
      '[data-archive-discovery]',
    );
    expect(discoveryTicket).not.toBeNull();
    expect(discoveryTicket?.hidden).toBe(true);
    expect(runtimeSnapshots.at(-1)?.activeRunArchiveDiscoveries).toEqual([]);

    for (let index = 0; index < 20; index += 1) {
      if ((runtime.e2eSnapshot().battle?.enemies.length ?? 0) > 0) break;
      expect(JSON.parse(
        storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
      ).unreadEntryKeys).toEqual([]);
      runtime.e2eAdvanceBattle(250);
    }
    const firstEnemyFrame = runtime.e2eSnapshot().battle;
    const firstEnemyKind = firstEnemyFrame?.enemies[0]?.kind;
    expect(firstEnemyKind).toBeTruthy();
    expect(firstEnemyKind).toBe(firstScheduledEnemyKind);
    expect(firstEnemyFrame).toMatchObject({
      maxTrainHp: startingBattle?.maxTrainHp,
      runLevel: startingBattle?.runLevel,
      skillRanks: startingBattle?.skillRanks,
      skillVariants: startingBattle?.skillVariants,
    });
    expect(structuredClone(getBattleInput())).toEqual(
      startingBattleInput,
    );
    const archiveAfterFirstSpawn = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
    );
    expect(archiveAfterFirstSpawn.unreadEntryKeys).toEqual([
      `enemy:${firstEnemyKind}`,
    ]);
    expect(discoveryTicket?.hidden).toBe(false);
    expect(discoveryTicket?.querySelector(
      '[data-archive-discovery-name]',
    )?.textContent).toBe(
      getTidalArchiveEnemyDiscovery(firstScheduledEnemyKind).name,
    );

    let selectedVariantId: string | null = null;
    for (let index = 0; index < 300; index += 1) {
      const battle = runtime.e2eSnapshot().battle;
      expect(battle?.status).not.toBe('defeat');
      expect(battle?.status).not.toBe('victory');
      if (battle?.status === 'upgrade') {
        if (battle.runLevel < 5) {
          const nonVariant = battle.offeredUpgradeIds.find((upgradeId) => (
            getBattleUpgradeDefinition(upgradeId).kind !== 'skill-variant'
          ));
          expect(nonVariant).toBeTruthy();
          app.querySelector<HTMLButtonElement>(
            `[data-upgrade-id="${nonVariant}"]`,
          )?.click();
          await runtime.e2eRequestResume();
          runtime.e2eAdvanceBattle(17);
          continue;
        }
        expect(battle.runLevel).toBe(5);
        const offeredVariant = battle.offeredUpgradeIds.find((upgradeId) => (
          getBattleUpgradeDefinition(upgradeId).kind === 'skill-variant'
        ));
        expect(offeredVariant).toBeTruthy();
        expect(offeredVariant).toBe(expectedNewVariantId);
        expect(JSON.parse(
          storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
        ).discoveredSkillVariantIds).not.toContain(offeredVariant);
        expect(JSON.parse(
          storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
        ).unreadEntryKeys).toEqual([`enemy:${firstEnemyKind}`]);
        expect(telemetryEvents.filter((event) => (
          event.name === 'tidal_archive_entry_discovered'
          && event.payload.entryType === 'skill-variant'
        ))).toHaveLength(0);
        if (offeredVariant) {
          selectedVariantId = offeredVariant;
          const variantButton = app.querySelector<HTMLButtonElement>(
            `[data-upgrade-id="${offeredVariant}"]`,
          );
          expect(variantButton).not.toBeNull();
          variantButton?.click();
          await runtime.e2eRequestResume();
          runtime.e2eAdvanceBattle(17);
          break;
        }
        expect(runtime.e2eChooseFirstUpgrade()).toBe(true);
        await runtime.e2eRequestResume();
        runtime.e2eAdvanceBattle(17);
        continue;
      }
      runtime.e2eAdvanceBattle(1_000);
    }
    expect(selectedVariantId).not.toBeNull();
    const storedArchive = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
    );
    expect(storedArchive.discoveredSkillVariantIds).toContain(selectedVariantId);
    expect(storedArchive.unreadEntryKeys).toEqual([
      `enemy:${firstEnemyKind}`,
      `skill-variant:${selectedVariantId}`,
    ]);
    expect(storedArchive.discoveredEnemyKinds.filter(
      (kind: string) => kind === firstEnemyKind,
    )).toHaveLength(1);
    expect(structuredClone(getBattleInput())).toEqual(
      startingBattleInput,
    );

    const savedAfterDiscoveries = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.player) ?? '{}',
    );
    expect(savedAfterDiscoveries).toEqual(playerAfterBattleStart);

    const discoveryKeys = telemetryEvents
      .filter((event) => event.name === 'tidal_archive_entry_discovered')
      .map((event) => `${event.payload.entryType}:${event.payload.entryId}`);
    expect(new Set(discoveryKeys).size).toBe(discoveryKeys.length);
    expect(discoveryKeys.filter((key) => key === `enemy:${firstEnemyKind}`)).toHaveLength(1);
    expect(discoveryKeys.filter((key) => key === `skill-variant:${selectedVariantId}`)).toHaveLength(1);

    for (let index = 0; index < 700; index += 1) {
      const battle = runtime.e2eSnapshot().battle;
      if (battle?.status === 'defeat' || battle?.status === 'victory') break;
      if (battle?.status === 'upgrade') {
        expect(runtime.e2eChooseFirstUpgrade()).toBe(true);
        await runtime.e2eRequestResume();
        continue;
      }
      runtime.e2eAdvanceBattle(1_000);
    }
    const terminalBattle = runtime.e2eSnapshot().battle;
    expect(['defeat', 'victory']).toContain(terminalBattle?.status);
    if (terminalBattle?.status === 'defeat') {
      const giveUp = app.querySelector<HTMLButtonElement>(
        '[data-battle-action="give-up"]',
      );
      expect(giveUp).not.toBeNull();
      giveUp?.click();
    }
    await vi.waitFor(() => {
      expect(
        runtimeSnapshots.at(-1)?.activeBattleSettlement?.archiveDiscoveries
          .map((entry) => entry.key),
      ).toEqual([
        `enemy:${firstEnemyKind}`,
        `skill-variant:${selectedVariantId}`,
      ]);
    });
    const settlementDiscoveries = runtimeSnapshots.at(-1)
      ?.activeBattleSettlement?.archiveDiscoveries;
    expect(Object.isFrozen(settlementDiscoveries)).toBe(true);
    expect(Object.isFrozen(runtimeSnapshots.at(-1)?.activeBattleSettlement)).toBe(true);

    await runtime.e2eReturnToStation();
    await runtime.e2eNavigate('equipment');
    const archiveTab = app.querySelector<HTMLButtonElement>(
      '[data-action="show-tidal-archive"]',
    );
    expect(archiveTab).not.toBeNull();
    expect(archiveTab?.textContent).toContain('NEW 2');
    const economyEventsBeforeArchiveVisit = telemetryEvents.filter(
      (event) => event.name === 'economy_reward_granted',
    ).length;
    archiveTab?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
    ).unreadEntryKeys).toEqual([]);
    const readEvents = telemetryEvents.filter(
      (event) => event.name === 'tidal_archive_entries_read',
    );
    expect(readEvents).toHaveLength(1);
    expect(readEvents[0]?.payload).toEqual({ count: 2 });
    expect(telemetryEvents.filter(
      (event) => event.name === 'economy_reward_granted',
    )).toHaveLength(economyEventsBeforeArchiveVisit);
    expect(app.querySelector('.tidal-archive-carriage')).not.toBeNull();
    expect(app.querySelector(
      '[data-action="show-tidal-archive"]',
    )?.getAttribute('aria-pressed')).toBe('true');
    expect(app.querySelector(
      `[data-archive-enemy="${firstEnemyKind}"].is-discovered.is-new`,
    )).not.toBeNull();
    expect(app.querySelector(
      `[data-archive-variant="${selectedVariantId}"].is-discovered.is-new`,
    )).not.toBeNull();

    app.querySelector<HTMLButtonElement>(
      '[data-action="show-tidal-archive"]',
    )?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.querySelector(
      `[data-archive-enemy="${firstEnemyKind}"].is-new`,
    )).not.toBeNull();
    expect(app.querySelector(
      `[data-archive-variant="${selectedVariantId}"].is-new`,
    )).not.toBeNull();
    expect(telemetryEvents.filter(
      (event) => event.name === 'tidal_archive_entries_read',
    )).toHaveLength(1);

    app.querySelector<HTMLButtonElement>(
      '[data-action="show-equipment-workshop"]',
    )?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    app.querySelector<HTMLButtonElement>(
      '[data-nav-scene="station"]',
    )?.click();
    await runtime.e2eNavigate('station');
    await runtime.e2eNavigate('equipment');
    expect(app.querySelector(
      '[data-action="show-tidal-archive"]',
    )?.textContent).not.toContain('NEW');
    app.querySelector<HTMLButtonElement>(
      '[data-action="show-tidal-archive"]',
    )?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.querySelectorAll('.archive-card.is-new')).toHaveLength(0);
    expect(telemetryEvents.filter(
      (event) => event.name === 'tidal_archive_entries_read',
    )).toHaveLength(1);
    const viewedEvents = telemetryEvents.filter(
      (event) => event.name === 'tidal_archive_viewed',
    );
    expect(viewedEvents).toHaveLength(1);
    expect(viewedEvents[0].payload).toEqual({
      enemyCount: 8,
      skillVariantCount: 12,
      equipmentCount: 4,
    });
    const discoveryKeysAfterRerender = telemetryEvents
      .filter((event) => event.name === 'tidal_archive_entry_discovered')
      .map((event) => `${event.payload.entryType}:${event.payload.entryId}`);
    expect(discoveryKeysAfterRerender).toEqual(discoveryKeys);

  }, 15_000);

  it('records idempotent enemy discoveries from a real daily-trial departure without changing player assets', async () => {
    const restoreCanvas = installCanvas2DStub();
    window.history.replaceState({}, '', '/?e2e=1&e2eSeed=17');
    const app = document.createElement('div');
    document.body.append(app);
    const storage = window.localStorage;
    storage.clear();
    const seededSave = {
      ...defaultSave(),
      stationLevel: 2,
      gears: 432,
      routeMarks: 54,
      starTickets: 7,
      selectedCaptainId: 'captain-tide-female' as const,
    };
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify(seededSave));
    const telemetryEvents: Array<{
      readonly name: string;
      readonly payload: Readonly<Record<string, string | number | boolean>>;
    }> = [];
    let getBattleInput: () => ReturnType<BattleEngine['inputForTest']> | undefined = (
      () => undefined
    );
    const runtimeSnapshots: LegacyRuntimeTestSnapshot[] = [];
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const runtime = createLegacyGameRuntime(app, storage, true, audio, {
      getSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
      updateSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
    }, {
      prepareStationRun: async () => ({ status: 'ready', assets: { failedIds: [], get: () => null } }),
      onTelemetryEvent: (event) => telemetryEvents.push(event),
      onTestSnapshot: (snapshot) => runtimeSnapshots.push(snapshot),
      onBattleEngineCreated: (engine) => {
        getBattleInput = () => engine.inputForTest();
      },
    });
    onTestFinished(() => {
      runtime.destroy();
      app.remove();
      restoreCanvas();
    });

    await runtime.start();
    const dailyTrialButton = app.querySelector<HTMLButtonElement>(
      '[data-action="start-daily-trial"]',
    );
    expect(dailyTrialButton).not.toBeNull();
    dailyTrialButton?.click();
    await vi.waitFor(() => {
      expect(runtime.e2eSnapshot().sceneId).toBe('battle');
    });

    const startingBattleInput = structuredClone(getBattleInput());
    expect(startingBattleInput).toBeTruthy();
    if (!startingBattleInput) throw new Error('Daily-trial battle input missing');
    expect(runtime.e2eSnapshot().battle).toMatchObject({
      mode: 'daily-trial',
      enemies: [],
    });
    expect(storage.getItem(APP_STORAGE_KEYS.tidalArchive)).toBeNull();
    expect(app.querySelector<HTMLElement>(
      '[data-archive-discovery]',
    )?.hidden).toBe(true);
    const playerAfterBattleStart = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.player) ?? '{}',
    );

    runtime.e2eAdvanceBattle(17);
    const firstEnemyKind = runtime.e2eSnapshot().battle?.enemies[0]?.kind;
    expect(firstEnemyKind).toBeTruthy();
    const archiveAfterFirstSpawn = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
    );
    expect(archiveAfterFirstSpawn.discoveredEnemyKinds).toEqual([firstEnemyKind]);
    expect(archiveAfterFirstSpawn.unreadEntryKeys).toEqual([
      `enemy:${firstEnemyKind}`,
    ]);
    expect(app.querySelector<HTMLElement>(
      '[data-archive-discovery]',
    )?.hidden).toBe(false);
    if (!firstEnemyKind) throw new Error('Daily-trial first enemy missing');
    expect(app.querySelector(
      '[data-archive-discovery-name]',
    )?.textContent).toBe(getTidalArchiveEnemyDiscovery(firstEnemyKind).name);
    const discoveryEventsForFirstKind = () => telemetryEvents.filter((event) => (
      event.name === 'tidal_archive_entry_discovered'
      && event.payload.entryType === 'enemy'
      && event.payload.entryId === firstEnemyKind
    ));
    expect(discoveryEventsForFirstKind()).toHaveLength(1);

    const duplicateSpawnAtMs = createWaveSchedule(
      startingBattleInput.seed,
      startingBattleInput.mapId,
    ).filter((spawn) => spawn.kind === firstEnemyKind)[1]?.spawnAtMs;
    expect(duplicateSpawnAtMs).toBeTypeOf('number');
    if (duplicateSpawnAtMs === undefined) {
      throw new Error('Daily-trial schedule lacks a duplicate first enemy');
    }
    for (let index = 0; index < 400; index += 1) {
      const battle = runtime.e2eSnapshot().battle;
      expect(battle?.status).not.toBe('defeat');
      expect(battle?.status).not.toBe('victory');
      if ((battle?.elapsedMs ?? 0) > duplicateSpawnAtMs) break;
      if (battle?.status === 'upgrade') {
        expect(runtime.e2eChooseFirstUpgrade()).toBe(true);
        await runtime.e2eRequestResume();
        continue;
      }
      runtime.e2eAdvanceBattle(250);
    }
    expect(runtime.e2eSnapshot().battle?.elapsedMs).toBeGreaterThan(
      duplicateSpawnAtMs,
    );
    expect(discoveryEventsForFirstKind()).toHaveLength(1);
    const archiveAfterDuplicateSpawn = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}',
    );
    expect(archiveAfterDuplicateSpawn.discoveredEnemyKinds.filter(
      (kind: string) => kind === firstEnemyKind,
    )).toHaveLength(1);
    expect(archiveAfterDuplicateSpawn.unreadEntryKeys.filter(
      (key: string) => key === `enemy:${firstEnemyKind}`,
    )).toHaveLength(1);
    expect(structuredClone(getBattleInput())).toEqual(startingBattleInput);

    const savedAfterDiscoveries = JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.player) ?? '{}',
    );
    expect(savedAfterDiscoveries).toEqual(playerAfterBattleStart);
    await runtime.e2eReturnToStation();
    expect(runtimeSnapshots.at(-1)?.activeRunArchiveDiscoveries.filter(
      (entry) => entry.key === `enemy:${firstEnemyKind}`,
    )).toHaveLength(1);
  });

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

  it('exposes frozen current effect kinds after a real deterministic evolution choice and skill click', async () => {
    const restoreCanvas = installCanvas2DStub();
    window.history.replaceState({}, '', '/?e2e=1&e2eSeed=17');
    const app = document.createElement('div');
    document.body.append(app);
    const storage = window.localStorage;
    storage.clear();
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify({
      ...defaultSave(),
      stamina: 20,
      selectedCaptainId: 'captain-tide-female',
      skillMasteryXp: {
        'tidal-volley': 92,
        'bubble-barrier': 92,
        'extreme-tide': 92,
      },
    }));
    storage.setItem(APP_STORAGE_KEYS.firstRunBattleTutorial, JSON.stringify({
      version: 1,
      completedStepIds: ['aim', 'skill', 'upgrade'],
      skipped: false,
    }));
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const runtime = createLegacyGameRuntime(app, storage, false, audio, {
      getSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: false, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
      updateSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: false, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
    }, {
      prepareStationRun: async () => ({ status: 'ready', assets: { failedIds: [], get: () => null } }),
    });
    onTestFinished(() => {
      runtime.destroy();
      app.remove();
      restoreCanvas();
    });

    await runtime.start();
    await runtime.e2eStartNormalBattle();
    let selected = false;
    for (let index = 0; index < 1_200; index += 1) {
      const battle = runtime.e2eSnapshot().battle;
      expect(battle?.status).not.toBe('defeat');
      expect(battle?.status).not.toBe('victory');
      if (battle?.status === 'upgrade') {
        const expected = battle.offeredUpgradeIds.find(
          (upgradeId) => upgradeId === 'split-tide-arrow',
        );
        if (expected) {
          const choice = app.querySelector<HTMLButtonElement>(
            '[data-upgrade-id="split-tide-arrow"]',
          );
          expect(choice).not.toBeNull();
          choice?.click();
          await runtime.e2eRequestResume();
          selected = true;
          break;
        }
        expect(runtime.e2eChooseFirstUpgrade()).toBe(true);
        await runtime.e2eRequestResume();
        continue;
      }
      runtime.e2eAdvanceBattle(250);
    }
    expect(selected).toBe(true);
    expect(runtime.e2eSnapshot().progression.variants['tidal-volley'])
      .toContain('split-tide-arrow');
    runtime.e2eAdvanceBattle(0);

    const realSkill = app.querySelector<HTMLButtonElement>(
      '[data-battle-skill="tidal-volley"]',
    );
    expect(realSkill).not.toBeNull();
    expect(realSkill?.disabled).toBe(false);
    expect(runtime.e2eSnapshot().battle?.cooldowns['tidal-volley']).toBe(0);
    realSkill?.click();
    expect(runtime.e2eSnapshot().battle?.cooldowns['tidal-volley'])
      .toBeGreaterThan(0);
    runtime.e2eAdvanceBattle(17);
    const signatureSnapshot = runtime.e2eSnapshot();
    const effectKinds = signatureSnapshot.verification.effectKinds;
    expect(effectKinds).toContain('split-chevron');
    expect(effectKinds).toEqual([...new Set(effectKinds)]);
    expect(Object.isFrozen(effectKinds)).toBe(true);
    expect(signatureSnapshot.effects?.camera).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
      rotation: expect.any(Number),
      amplitude: expect.any(Number),
    });
    const signatureParticle = signatureSnapshot.effects?.particles.find(
      (particle) => particle.kind === 'split-chevron',
    );
    expect(signatureParticle).toMatchObject({
      kind: 'split-chevron',
      layer: 'front-effects',
      color: '#59e9ff',
      alpha: expect.any(Number),
    });
    expect(Object.isFrozen(signatureSnapshot.effects)).toBe(true);
    expect(Object.isFrozen(signatureSnapshot.effects?.camera)).toBe(true);
    expect(Object.isFrozen(signatureSnapshot.effects?.particles)).toBe(true);
    expect(Object.isFrozen(signatureParticle)).toBe(true);
  }, 15_000);

  it('persists the three real first-run battle actions and emits each tutorial event once', async () => {
    const restoreCanvas = installCanvas2DStub();
    window.history.replaceState({}, '', '/?e2e=1&e2eSeed=17');
    const app = document.createElement('div');
    document.body.append(app);
    const storage = window.localStorage;
    storage.clear();
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify({
      ...defaultSave(),
      selectedCaptainId: 'captain-tide-female',
    }));
    const telemetryEvents: Array<{
      readonly name: string;
      readonly payload: Readonly<Record<string, string | number | boolean>>;
    }> = [];
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const runtime = createLegacyGameRuntime(app, storage, true, audio, {
      getSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
      updateSettings: () => ({ version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto', preferredBattleSpeed: 1 }),
    }, {
      prepareStationRun: async () => ({ status: 'ready', assets: { failedIds: [], get: () => null } }),
      onTelemetryEvent: (event) => telemetryEvents.push(event),
    });
    await runtime.start();
    await runtime.e2eStartNormalBattle();

    expect(runtime.e2eSnapshot().verification.firstRunTutorialStep).toBe('aim');
    const firstTicket = app.querySelector<HTMLElement>(
      '[data-battle-tutorial="battle"]',
    );
    expect(firstTicket).not.toBeNull();
    if (!firstTicket) return;
    expect(firstTicket.hidden).toBe(false);

    expect(runtime.e2eSetMainCannonAim(195, 320)).toBe(true);
    expect(runtime.e2eSnapshot().verification.firstRunTutorialStep).toBe('skill');
    runtime.e2eAdvanceBattle(1_000);
    expect(runtime.e2eUseSkill('tidal-volley')).toBe(true);
    runtime.e2eAdvanceBattle(17);
    expect(runtime.e2eSnapshot().verification.firstRunTutorialStep).toBe('upgrade');

    for (let index = 0; index < 80; index += 1) {
      if (runtime.e2eSnapshot().battle?.status === 'upgrade') break;
      runtime.e2eAdvanceBattle(1_000);
    }
    expect(runtime.e2eSnapshot().battle?.status).toBe('upgrade');
    expect(runtime.e2eChooseFirstUpgrade()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 450));
    runtime.e2eAdvanceBattle(17);

    expect(runtime.e2eSnapshot().verification.firstRunTutorialStep).toBeNull();
    expect(JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.firstRunBattleTutorial) ?? '{}',
    )).toEqual({
      version: 1,
      completedStepIds: ['aim', 'skill', 'upgrade'],
      skipped: false,
    });
    expect(telemetryEvents.filter((event) => (
      event.name === 'first_run_tutorial_step_completed'
    )).map((event) => event.payload.stepId)).toEqual([
      'aim',
      'skill',
      'upgrade',
    ]);
    expect(telemetryEvents.filter((event) => (
      event.name === 'first_run_tutorial_completed'
    ))).toHaveLength(1);

    await runtime.e2eReturnToStation();
    await runtime.e2eStartNormalBattle();
    expect(runtime.e2eSnapshot().verification.firstRunTutorialStep).toBeNull();
    expect(app.querySelectorAll(
      '[data-battle-tutorial]:not([hidden])',
    )).toHaveLength(0);
    runtime.destroy();
    app.remove();
    restoreCanvas();
  });

  it('persists skip immediately and keeps incomplete direction out of daily trials', async () => {
    const restoreCanvas = installCanvas2DStub();
    window.history.replaceState({}, '', '/?e2e=1&e2eSeed=17');
    const storage = window.localStorage;
    storage.clear();
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify({
      ...defaultSave(),
      selectedCaptainId: 'captain-tide-female',
    }));
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const settings = {
      getSettings: () => ({ version: 2 as const, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto' as const, preferredBattleSpeed: 1 as const }),
      updateSettings: () => ({ version: 2 as const, musicEnabled: false, sfxEnabled: false, reducedMotion: true, qualityPreference: 'auto' as const, preferredBattleSpeed: 1 as const }),
    };
    const dependencies = {
      prepareStationRun: async () => ({ status: 'ready' as const, assets: { failedIds: [], get: () => null } }),
    };

    const app = document.createElement('div');
    document.body.append(app);
    const runtime = createLegacyGameRuntime(
      app,
      storage,
      true,
      audio,
      settings,
      dependencies,
    );
    await runtime.start();
    await runtime.e2eStartNormalBattle();
    app.querySelector<HTMLButtonElement>(
      '[data-battle-tutorial="battle"] [data-battle-action="skip-tutorial"]',
    )?.click();
    expect(runtime.e2eSnapshot().verification.firstRunTutorialStep).toBeNull();
    expect(JSON.parse(
      storage.getItem(APP_STORAGE_KEYS.firstRunBattleTutorial) ?? '{}',
    )).toEqual({ version: 1, completedStepIds: [], skipped: true });
    runtime.destroy();
    app.remove();

    storage.clear();
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify({
      ...defaultSave(),
      stationLevel: 2,
      selectedCaptainId: 'captain-tide-female',
    }));
    const trialApp = document.createElement('div');
    document.body.append(trialApp);
    const trialRuntime = createLegacyGameRuntime(
      trialApp,
      storage,
      true,
      audio,
      settings,
      dependencies,
    );
    await trialRuntime.start();
    await trialRuntime.e2eStartDailyTrial();
    expect(trialRuntime.e2eSnapshot().verification.firstRunTutorialStep).toBeNull();
    expect(trialApp.querySelectorAll(
      '[data-battle-tutorial]:not([hidden])',
    )).toHaveLength(0);
    expect(trialRuntime.e2eSetMainCannonAim(195, 320)).toBe(true);
    trialRuntime.e2eAdvanceBattle(1_000);
    expect(trialRuntime.e2eUseSkill('tidal-volley')).toBe(true);
    trialRuntime.e2eAdvanceBattle(17);
    expect(
      storage.getItem(APP_STORAGE_KEYS.firstRunBattleTutorial),
    ).toBeNull();
    trialRuntime.destroy();
    trialApp.remove();
    restoreCanvas();
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
