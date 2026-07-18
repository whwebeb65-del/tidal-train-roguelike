import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCaptainScene } from '../../web/scenes/CaptainScene';
import { createEquipmentScene } from '../../web/scenes/EquipmentScene';
import { createLegionScene } from '../../web/scenes/LegionScene';
import type { FeatureSceneContext } from '../../web/scenes/Scene';
import { createStationScene } from '../../web/scenes/StationScene';
import { createStoreScene } from '../../web/scenes/StoreScene';
import type { StationAmbientController } from '../../web/station/StationAmbientDirector';

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
    requestCaptainGreeting: () => {
      calls.push('greeting');
      return true;
    },
    dispose: () => calls.push('dispose'),
  };
}

function createContext(
  createStationAmbient: (host: HTMLElement) => StationAmbientController,
): FeatureSceneContext {
  return {
    renderStation: () => '<div class="station-hero">station-only</div>',
    renderCaptain: () => '<div>captain-only</div>',
    renderEquipment: () => '<div>equipment-only</div>',
    renderLegion: () => '<div>legion-only</div>',
    renderStore: () => '<div>store-only</div>',
    createStationAmbient,
    dispatch: () => undefined,
  };
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
    const hero = { dataset: {} } as HTMLElement;
    const listeners = new Set<EventListener>();
    const host = {
      innerHTML: '',
      querySelector: (selector: string) => selector === '.station-hero' ? hero : null,
      addEventListener: (_type: string, listener: EventListener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: EventListener) => listeners.delete(listener),
    } as unknown as HTMLElement;
    const scene = createStationScene(context);

    scene.mount(host);
    scene.pauseForVisibility();
    scene.resumeForVisibility();
    scene.setReducedMotion(true);
    expect(scene.requestCaptainGreeting()).toBe(true);
    scene.pauseAmbient();
    scene.unmount();

    expect(calls).toEqual([
      'start',
      'pause',
      'resume',
      'motion:true',
      'greeting',
      'pause',
      'dispose',
    ]);
    expect(listeners.size).toBe(0);
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

  it('wires station ambient to runtime visibility, settings and captain greeting', () => {
    expect(runtimeSource).toContain("import { StationAmbientDirector }");
    expect(runtimeSource).toContain('let activeStationScene: StationScene | null = null;');
    expect(runtimeSource).toMatch(/createStationAmbient:\s*\(host\)\s*=>\s*new StationAmbientDirector\(host,/);
    expect(runtimeSource).toMatch(/function handlePageHidden\(\): void \{[\s\S]*activeStationScene\?\.pauseForVisibility\(\);[\s\S]*audio\.pause\(\);/);
    expect(runtimeSource).toMatch(/function handlePageVisible\(\): void \{[\s\S]*audio\.resume\(\)[\s\S]*activeStationScene\?\.resumeForVisibility\(\)/);
    expect(runtimeSource).toMatch(/function applyRuntimeSettings[\s\S]*activeStationScene\?\.setReducedMotion\(nextReducedMotion\)/);
    expect(runtimeSource).toMatch(/action === 'captain-greeting'[\s\S]*activeStationScene\?\.requestCaptainGreeting\(\);[\s\S]*return;/);
  });
});
