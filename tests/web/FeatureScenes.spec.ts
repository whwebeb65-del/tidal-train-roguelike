import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCaptainScene } from '../../web/scenes/CaptainScene';
import { createEquipmentScene } from '../../web/scenes/EquipmentScene';
import { createLegionScene } from '../../web/scenes/LegionScene';
import type { FeatureSceneContext } from '../../web/scenes/Scene';
import { createStationScene } from '../../web/scenes/StationScene';
import { createStoreScene } from '../../web/scenes/StoreScene';
import {
  StationAmbientDirector,
  type StationAmbientController,
  type StationAmbientTimer,
} from '../../web/station/StationAmbientDirector';

const runtimeSource = readFileSync(
  new URL('../../web/LegacyGameRuntime.ts', import.meta.url),
  'utf8',
);

function createAmbient(calls: string[]): StationAmbientController {
  return {
    start: () => calls.push('start'),
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    setReducedMotion: (value) => calls.push(`motion:${value}`),
    setLowPerformance: (value) => calls.push(`low:${value}`),
    requestCaptainGreeting: () => {
      calls.push('greeting');
      return true;
    },
    dispose: () => calls.push('dispose'),
  };
}

interface SceneState {
  hidden: boolean;
  lowPerformance: boolean;
}

function createContext(
  createStationAmbient: (host: HTMLElement) => StationAmbientController,
  state: SceneState = { hidden: false, lowPerformance: false },
): FeatureSceneContext {
  return {
    renderStation: () => '<div class="station-hero">station-only</div>',
    renderCaptain: () => '<div>captain-only</div>',
    renderEquipment: () => '<div>equipment-only</div>',
    renderLegion: () => '<div>legion-only</div>',
    renderStore: () => '<div>store-only</div>',
    createStationAmbient,
    isPageHidden: () => state.hidden,
    isStationLowPerformance: () => state.lowPerformance,
    dispatch: () => undefined,
  };
}

class CountingTimer implements StationAmbientTimer {
  private nextId = 0;
  private readonly callbacks = new Map<
    ReturnType<typeof setTimeout>,
    () => void
  >();

  public get pendingCount(): number {
    return this.callbacks.size;
  }

  public set(
    callback: () => void,
    _delayMs: number,
  ): ReturnType<typeof setTimeout> {
    const id = ++this.nextId as unknown as ReturnType<typeof setTimeout>;
    this.callbacks.set(id, callback);
    return id;
  }

  public clear(id: ReturnType<typeof setTimeout>): void {
    this.callbacks.delete(id);
  }
}

function sourceSection(start: string, end: string): string {
  const startIndex = runtimeSource.indexOf(start);
  const endIndex = runtimeSource.indexOf(end, startIndex + start.length);
  expect(startIndex, start).toBeGreaterThanOrEqual(0);
  expect(endIndex, end).toBeGreaterThan(startIndex);
  return runtimeSource.slice(startIndex, endIndex);
}

describe('feature scenes', () => {
  it('mounts one independent scene body for every bottom navigation item', () => {
    const context = createContext(() => createAmbient([]));
    const hero = { dataset: {} } as HTMLElement;
    const host = {
      innerHTML: '',
      querySelector: (selector: string) => selector === '.station-hero' ? hero : null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as HTMLElement;
    const scenes = [
      createStationScene(context),
      createCaptainScene(context),
      createEquipmentScene(context),
      createLegionScene(context),
      createStoreScene(context),
    ];

    expect(scenes.map((scene) => scene.id)).toEqual([
      'station',
      'captain',
      'equipment',
      'legion',
      'store',
    ]);
    for (const scene of scenes) {
      scene.mount(host);
      expect(host.innerHTML).toContain(`game-scene--${scene.id}`);
      scene.unmount();
    }
  });

  it('owns ambient visibility, settings and greeting lifecycle', () => {
    const calls: string[] = [];
    const ambient = createAmbient(calls);
    const context = createContext(() => ambient);
    const hero = {
      dataset: { reducedMotion: 'false' },
    } as unknown as HTMLElement;
    const listeners = new Set<EventListener>();
    const host = {
      innerHTML: '',
      querySelector: (selector: string) => selector === '.station-hero' ? hero : null,
      addEventListener: (_type: string, listener: EventListener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: EventListener) => listeners.delete(listener),
    } as unknown as HTMLElement;
    const scene = createStationScene(context);

    scene.mount(host);
    expect(hero.dataset.lowPerformance).toBe('false');
    scene.pauseForVisibility();
    scene.resumeForVisibility();
    scene.setReducedMotion(true);
    expect(hero.dataset.reducedMotion).toBe('true');
    scene.setReducedMotion(false);
    expect(hero.dataset.reducedMotion).toBe('false');
    expect(scene.setLowPerformance).toBeTypeOf('function');
    scene.setLowPerformance(true);
    expect(hero.dataset.lowPerformance).toBe('true');
    scene.setLowPerformance(false);
    expect(hero.dataset.lowPerformance).toBe('false');
    expect(scene.requestCaptainGreeting()).toBe(true);
    scene.pauseAmbient();
    scene.unmount();

    expect(calls).toEqual([
      'start',
      'pause',
      'resume',
      'motion:true',
      'motion:false',
      'low:true',
      'low:false',
      'greeting',
      'pause',
      'dispose',
    ]);
    expect(listeners.size).toBe(0);
  });

  it('pauses a real director before start on hidden initial mount and refresh', () => {
    const state: SceneState = { hidden: true, lowPerformance: false };
    const timer = new CountingTimer();
    const randomCalls: number[] = [];
    const heroes = [
      { dataset: { reducedMotion: 'false' } },
      { dataset: { reducedMotion: 'false' } },
    ] as unknown as HTMLElement[];
    let heroIndex = 0;
    const host = {
      innerHTML: '',
      querySelector: (selector: string) => selector === '.station-hero'
        ? heroes[heroIndex]
        : null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as HTMLElement;
    const context = createContext((hero) => new StationAmbientDirector(hero, {
      reducedMotion: false,
      lowPerformance: false,
      timer,
      random: () => {
        randomCalls.push(0.5);
        return 0.5;
      },
    }), state);
    const scene = createStationScene(context);

    scene.mount(host);
    expect(timer.pendingCount).toBe(0);
    expect(randomCalls).toHaveLength(0);

    heroIndex = 1;
    scene.mount(host);
    expect(timer.pendingCount).toBe(0);
    expect(randomCalls).toHaveLength(0);

    scene.resumeForVisibility();
    expect(timer.pendingCount).toBe(0);
    expect(randomCalls).toHaveLength(0);

    state.hidden = false;
    scene.resumeForVisibility();
    expect(timer.pendingCount).toBe(1);
    expect(randomCalls).toHaveLength(1);
  });

  it('uses one capture error listener, marks failed station art and cleans up reentrant mounts', () => {
    const calls: string[] = [];
    const heroes = [{ dataset: {} }, { dataset: {} }] as HTMLElement[];
    const createdHosts: HTMLElement[] = [];
    const registrations: Array<{ listener: EventListener; capture?: boolean }> = [];
    const removals: Array<{ listener: EventListener; capture?: boolean }> = [];
    let heroIndex = 0;
    const host = {
      innerHTML: '',
      querySelector: (selector: string) => selector === '.station-hero' ? heroes[heroIndex] : null,
      addEventListener: (_type: string, listener: EventListener, capture?: boolean) => {
        registrations.push({ listener, capture });
      },
      removeEventListener: (_type: string, listener: EventListener, capture?: boolean) => {
        removals.push({ listener, capture });
      },
    } as unknown as HTMLElement;
    const context = createContext((hero) => {
      createdHosts.push(hero);
      return createAmbient(calls);
    });
    const scene = createStationScene(context);

    scene.mount(host);
    const failedImage = {
      matches: (selector: string) => selector === 'img[data-station-art]',
      classList: { add: (className: string) => calls.push(`class:${className}`) },
    };
    registrations[0]!.listener({ target: failedImage } as unknown as Event);
    heroIndex = 1;
    scene.mount(host);
    scene.unmount();

    expect(createdHosts).toEqual(heroes);
    expect(registrations).toHaveLength(2);
    expect(registrations.every(({ capture }) => capture === true)).toBe(true);
    expect(removals).toEqual([
      { listener: registrations[0]!.listener, capture: true },
      { listener: registrations[1]!.listener, capture: true },
    ]);
    expect(calls).toEqual([
      'start',
      'class:is-missing',
      'dispose',
      'start',
      'dispose',
    ]);
  });

  it('wires bounded station runtime ownership, visibility and settings sections', () => {
    expect(runtimeSource).toContain("import { StationAmbientDirector }");
    expect(runtimeSource).toContain('let activeStationScene: StationScene | null = null;');

    const contextSection = sourceSection(
      'const featureContext: FeatureSceneContext = {',
      'const sceneFactory: SceneFactory =',
    );
    expect(contextSection).toContain('isPageHidden: () => pageHidden');
    expect(contextSection).toContain("isStationLowPerformance: () => qualityPreference === 'low'");
    expect(contextSection).toContain("lowPerformance: qualityPreference === 'low'");

    const factorySection = sourceSection(
      'const sceneFactory: SceneFactory =',
      'const router = new SceneRouter',
    );
    const stationOwnerIndex = factorySection.indexOf('activeStationScene = scene;');
    const clearOwnerIndex = factorySection.indexOf('activeStationScene = null;');
    const captainFactoryIndex = factorySection.indexOf("if (sceneId === 'captain')");
    expect(stationOwnerIndex).toBeGreaterThanOrEqual(0);
    expect(clearOwnerIndex).toBeGreaterThan(stationOwnerIndex);
    expect(clearOwnerIndex).toBeLessThan(captainFactoryIndex);

    const hiddenSection = sourceSection(
      'function handlePageHidden(): void {',
      'function handlePageVisible(): void {',
    );
    expect(hiddenSection.indexOf('activeStationScene?.pauseForVisibility();')).toBeLessThan(
      hiddenSection.indexOf('audio.pause();'),
    );

    const visibleSection = sourceSection(
      'function handlePageVisible(): void {',
      'function openSettingsPanel(): void {',
    );
    expect(visibleSection).toContain('activeStationScene?.resumeForVisibility();');

    const settingsSection = sourceSection(
      'function applyRuntimeSettings(',
      'function commit(next: PlayerSave): void {',
    );
    expect(settingsSection).toContain('activeStationScene?.setReducedMotion(nextReducedMotion);');
    expect(settingsSection).toContain(
      "activeStationScene?.setLowPerformance(qualityPreference === 'low');",
    );

    const greetingSection = sourceSection(
      "if (action === 'captain-greeting') {",
      "if (action === 'select-captain'",
    );
    expect(greetingSection).toContain('activeStationScene?.requestCaptainGreeting();');
    expect(greetingSection).toContain('return;');
  });
});
