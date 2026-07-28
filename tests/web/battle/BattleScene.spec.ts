import { describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../../../web/audio/AudioManager';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';
import type {
  BattleEvent,
  BattleFrameView,
} from '../../../web/battle/BattleTypes';
import {
  BattleScene,
  type BattleEnginePort,
  type BattleSceneCallbacks,
  type FrameScheduler,
} from '../../../web/scenes/BattleScene';
import {
  EMPTY_EFFECT_FRAME_VIEW,
} from '../../../web/battle/EffectSystem';
import type {
  BattleHudCallbacks,
} from '../../../web/battle/BattleHUD';
import {
  createFrameFixture,
  createTrainMotionFixture,
} from './helpers/BattleFixtures';
import { RecordingAudioBackend } from '../audio/helpers/RecordingAudioBackend';

const TEST_BATTLE_SPEED_DEPENDENCIES = {
  initialBattleSpeed: 1 as const,
  availableBattleSpeeds: [1] as const,
  onBattleSpeedChanged: vi.fn(),
  onBattleEvents: vi.fn(),
};

class ManualFrameScheduler implements FrameScheduler {
  private nextId = 1;
  private readonly callbacks = new Map<number, FrameRequestCallback>();
  public readonly cancelled: number[] = [];

  public request(callback: FrameRequestCallback): number {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }

  public cancel(id: number): void {
    this.cancelled.push(id);
    this.callbacks.delete(id);
  }

  public get activeCount(): number {
    return this.callbacks.size;
  }

  public fire(timeMs: number): void {
    const entry = this.callbacks.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined;
    if (!entry) throw new Error('No scheduled frame');
    this.callbacks.delete(entry[0]);
    entry[1](timeMs);
  }
}

interface TestEngine extends BattleEnginePort {
  updateCalls: number;
  events: BattleEvent[];
  setMainCannonAim(aim: { readonly x: number; readonly y: number } | null): boolean;
  setOutcome(next: BattleEnginePort['outcome']): void;
  setFrame(next: BattleFrameView): void;
}

function createEngine(
  initialFrame: BattleFrameView = createFrameFixture(),
): TestEngine {
  let frame = initialFrame;
  let outcome: BattleEnginePort['outcome'] = null;
  return {
    updateCalls: 0,
    events: [],
    get frame() {
      return frame;
    },
    get outcome() {
      return outcome;
    },
    update() {
      this.updateCalls += 1;
    },
    drainEvents() {
      return this.events.splice(0);
    },
    useSkill: () => true,
    setMainCannonAim: () => true,
    chooseUpgrade: () => true,
    rerollUpgradeOffer: () => true,
    refreshActiveSkillCooldowns: () => true,
    revive: () => true,
    pause() {
      frame = { ...frame, status: 'paused' };
    },
    resume() {
      frame = { ...frame, status: 'running' };
    },
    setOutcome(next: BattleEnginePort['outcome']) {
      outcome = next;
    },
    setFrame(next: BattleFrameView) {
      frame = next;
    },
  };
}

function createRealEngine(): BattleEngine {
  return new BattleEngine({
    battleId: 'scene-upgrade-source',
    seed: 17,
    mode: 'normal',
    mapId: 'drift-suburb',
    maxTrainHp: 10_000,
    mainCannonDamage: 500,
    initialEnergy: 0,
    repairBonus: 0,
    enemyHpFlatBonus: 0,
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    skillMasteryPower: {
      'tidal-volley': 1,
      'bubble-barrier': 1,
      'extreme-tide': 1,
    },
    unlockedSkillVariants: [],
  });
}

function createMotion() {
  const view = { ...createTrainMotionFixture() };
  let frozen = false;
  return {
    view,
    reset: vi.fn((_frame: BattleFrameView) => undefined),
    update: vi.fn((
      stepMs: number,
      _frame: BattleFrameView,
      _events: readonly BattleEvent[],
    ) => {
      if (frozen) return;
      view.motionTimeMs += stepMs;
      view.laneOffset += stepMs;
    }),
    setPresentationFrozen: vi.fn((next: boolean) => {
      frozen = next;
    }),
    setReducedMotion: vi.fn((_reducedMotion: boolean) => undefined),
    setQualityLevel: vi.fn(),
  };
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolve = (_value: T): void => undefined;
  let reject = (_reason: unknown): void => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function mountReviveScene(
  onRequestRevive: BattleSceneCallbacks['onRequestRevive'],
) {
  const scheduler = new ManualFrameScheduler();
  const engine = createEngine(createFrameFixture({ status: 'defeat' }));
  const motion = createMotion();
  const hudCallbackRef: { current?: BattleHudCallbacks } = {};
  const { host } = createHost();
  const scene = new BattleScene({
    ...TEST_BATTLE_SPEED_DEPENDENCIES,
    engine,
    effects: {
      view: EMPTY_EFFECT_FRAME_VIEW,
      consume: vi.fn(),
      update: vi.fn(),
      reset: vi.fn(),
    },
    assets: { failedIds: [], get: () => null },
    callbacks: {
      ...createCallbacks(),
      onRequestRevive,
    },
    createRenderer: () => ({ render: vi.fn() }),
    createHud: (callbacks) => {
      hudCallbackRef.current = callbacks;
      return {
        mount: vi.fn(),
        update: vi.fn(),
        dispose: vi.fn(),
      };
    },
    motion,
    scheduler,
    captainArtId: 'captainFemaleBase',
    reducedMotion: false,
    eventTarget: new EventTarget(),
    getDevicePixelRatio: () => 1,
  });
  scene.mount(host);
  const hudCallbacks = hudCallbackRef.current;
  if (!hudCallbacks) throw new Error('HUD callbacks were not created');
  return { engine, host, hudCallbacks, motion, scene, scheduler };
}

function createCallbacks(): BattleSceneCallbacks {
  return {
    onOutcome: vi.fn(() => ({
      title: '胜利',
      description: '航线已清理',
      rewards: { gears: 80, routeMarks: 2, starTickets: 0 },
      expeditionPoints: 8,
      dailyTrialScore: null,
      doubleSettlementAvailable: true,
      doubled: false,
    })),
    onRequestRevive: vi.fn(async () => ({
      accepted: false,
      hpRestored: 0,
    })),
    onRequestUpgradeReroll: vi.fn(async () => false),
    onRequestSkillRefresh: vi.fn(async () => false),
    onClaimInteraction: vi.fn(() => true),
    onRequestDoubleSettlement: vi.fn(async () => null),
    onGiveUp: vi.fn(() => ({
      title: '本局结束',
      description: '列车返航',
      rewards: { gears: 0, routeMarks: 0, starTickets: 0 },
      expeditionPoints: 8,
      dailyTrialScore: null,
      doubleSettlementAvailable: false,
      doubled: false,
    })),
    onExit: vi.fn(),
  };
}

function createHost(bounds: Partial<DOMRect> = {}): {
  readonly host: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly hudHost: HTMLElement;
  readonly dispatchCanvasPointer: (type: string, event: {
    readonly pointerId: number;
    readonly clientX: number;
    readonly clientY: number;
  }) => void;
} {
  const context = {} as CanvasRenderingContext2D;
  const canvas = Object.assign(new EventTarget(), {
    width: 0,
    height: 0,
    style: {},
    getContext: () => context,
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
  }) as unknown as HTMLCanvasElement;
  const canvasHost = {
    getBoundingClientRect: () => ({
      width: 390,
      height: 844,
      left: 0,
      top: 0,
      ...bounds,
    }),
  } as unknown as HTMLElement;
  const hudHost = Object.assign(new EventTarget(), {
    innerHTML: '',
  }) as unknown as HTMLElement;
  let hostHtml = '';
  const host = {
    get innerHTML() {
      return hostHtml;
    },
    set innerHTML(value: string) {
      hostHtml = value;
    },
    querySelector(selector: string) {
      if (selector === '[data-battle-canvas]') return canvas;
      if (selector === '.battle-canvas-host') return canvasHost;
      if (selector === '[data-battle-hud]') return hudHost;
      return null;
    },
    replaceChildren() {
      hostHtml = '';
    },
  } as unknown as HTMLElement;
  return {
    host,
    canvas,
    hudHost,
    dispatchCanvasPointer(type, event) {
      const pointerEvent = new Event(type, { cancelable: true });
      Object.defineProperties(pointerEvent, {
        pointerId: { value: event.pointerId },
        clientX: { value: event.clientX },
        clientY: { value: event.clientY },
      });
      canvas.dispatchEvent(pointerEvent);
    },
  };
}

function createPointerScene(host: HTMLElement, engine: TestEngine): BattleScene {
  const scene = new BattleScene({
    ...TEST_BATTLE_SPEED_DEPENDENCIES,
    engine,
    effects: { view: EMPTY_EFFECT_FRAME_VIEW, consume: vi.fn(), update: vi.fn(), reset: vi.fn() },
    assets: { failedIds: [], get: () => null },
    callbacks: createCallbacks(),
    createRenderer: () => ({ render: vi.fn() }),
    createHud: () => ({ mount: vi.fn(), update: vi.fn(), dispose: vi.fn() }),
    captainArtId: 'captainFemaleBase',
    reducedMotion: false,
    manualStepMode: true,
    scheduler: new ManualFrameScheduler(),
    eventTarget: new EventTarget(),
    getDevicePixelRatio: () => 1,
  });
  scene.mount(host);
  return scene;
}

describe('BattleScene', () => {
  it('maps an active canvas pointer drag through the letterboxed viewport and keeps its final aim', () => {
    const engine = createEngine();
    engine.setMainCannonAim = vi.fn(() => true);
    const { host, canvas, dispatchCanvasPointer } = createHost({
      left: 30,
      top: 40,
      width: 390,
      height: 1000,
    });
    const scene = new BattleScene({
      ...TEST_BATTLE_SPEED_DEPENDENCIES,
      engine,
      effects: { view: EMPTY_EFFECT_FRAME_VIEW, consume: vi.fn(), update: vi.fn(), reset: vi.fn() },
      assets: { failedIds: [], get: () => null },
      callbacks: createCallbacks(),
      createRenderer: () => ({ render: vi.fn() }),
      createHud: () => ({ mount: vi.fn(), update: vi.fn(), dispose: vi.fn() }),
      captainArtId: 'captainFemaleBase',
      reducedMotion: false,
      manualStepMode: true,
      scheduler: new ManualFrameScheduler(),
      eventTarget: new EventTarget(),
      getDevicePixelRatio: () => 1,
    });
    scene.mount(host);

    dispatchCanvasPointer('pointerdown', { pointerId: 7, clientX: 225, clientY: 540 });
    dispatchCanvasPointer('pointermove', { pointerId: 8, clientX: 320, clientY: 740 });
    dispatchCanvasPointer('pointermove', { pointerId: 7, clientX: 225, clientY: 640 });
    dispatchCanvasPointer('pointerup', { pointerId: 7, clientX: 225, clientY: 640 });

    expect(canvas.setPointerCapture).toHaveBeenCalledWith(7);
    expect(engine.setMainCannonAim).toHaveBeenNthCalledWith(1, { x: 195, y: 422 });
    expect(engine.setMainCannonAim).toHaveBeenNthCalledWith(2, { x: 195, y: 522 });
    expect(engine.setMainCannonAim).toHaveBeenCalledTimes(2);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(7);
    scene.unmount();
    dispatchCanvasPointer('pointermove', { pointerId: 7, clientX: 225, clientY: 740 });
    expect(engine.setMainCannonAim).toHaveBeenCalledTimes(2);
  });

  it('does not let a second pointer steal the active manual aim', () => {
    const engine = createEngine();
    engine.setMainCannonAim = vi.fn(() => true);
    const { host, canvas, dispatchCanvasPointer } = createHost();
    const scene = createPointerScene(host, engine);
    dispatchCanvasPointer('pointerdown', { pointerId: 1, clientX: 150, clientY: 320 });
    dispatchCanvasPointer('pointerdown', { pointerId: 2, clientX: 250, clientY: 400 });
    dispatchCanvasPointer('pointerup', { pointerId: 1, clientX: 150, clientY: 320 });

    expect(canvas.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
    expect(engine.setMainCannonAim).toHaveBeenCalledTimes(1);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
    scene.unmount();
  });

  it.each(['boss-intro', 'upgrade', 'paused', 'victory', 'defeat'] as const)(
    'does not capture or aim when the battle status is %s',
    (status) => {
      const engine = createEngine(createFrameFixture({ status }));
      engine.setMainCannonAim = vi.fn(() => false);
      const { host, canvas, dispatchCanvasPointer } = createHost();
      const scene = createPointerScene(host, engine);
      dispatchCanvasPointer('pointerdown', { pointerId: 1, clientX: 150, clientY: 320 });
      expect(canvas.setPointerCapture).not.toHaveBeenCalled();
      expect(engine.setMainCannonAim).not.toHaveBeenCalled();
      scene.unmount();
    },
  );

  it('ends the active pointer on cancellation and leaves HUD sibling events outside aiming', () => {
    const engine = createEngine();
    engine.setMainCannonAim = vi.fn(() => true);
    const { host, canvas, hudHost, dispatchCanvasPointer } = createHost();
    const scene = createPointerScene(host, engine);
    hudHost.dispatchEvent(new Event('pointerdown'));
    dispatchCanvasPointer('pointerdown', { pointerId: 3, clientX: 150, clientY: 320 });
    dispatchCanvasPointer('pointercancel', { pointerId: 3, clientX: 150, clientY: 320 });
    dispatchCanvasPointer('pointermove', { pointerId: 3, clientX: 180, clientY: 260 });

    expect(engine.setMainCannonAim).toHaveBeenCalledTimes(1);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(3);
    scene.unmount();
  });

  it.each([
    ['manual', (scene: BattleScene): boolean => scene.chooseFirstUpgradeForE2E()],
    ['timeout', (_scene: BattleScene): boolean => {
      vi.advanceTimersByTime(6_000);
      return true;
    }],
  ] as const)(
    'emits a real engine upgrade-selected event with %s source',
    (source, choose) => {
      vi.useFakeTimers();
      try {
        const engine = createRealEngine();
        const { host } = createHost();
        const scene = new BattleScene({
          ...TEST_BATTLE_SPEED_DEPENDENCIES,
          engine,
          effects: {
            view: EMPTY_EFFECT_FRAME_VIEW,
            consume: vi.fn(), update: vi.fn(), reset: vi.fn(),
          },
          assets: { failedIds: [], get: () => null },
          callbacks: createCallbacks(),
          createRenderer: () => ({ render: vi.fn() }),
          createHud: () => ({ mount: vi.fn(), update: vi.fn(), dispose: vi.fn() }),
          captainArtId: 'captainFemaleBase',
          reducedMotion: false,
          manualStepMode: true,
          scheduler: new ManualFrameScheduler(),
          eventTarget: new EventTarget(),
          getDevicePixelRatio: () => 1,
        });
        scene.mount(host);
        scene.advanceForE2E(300_000);

        expect(engine.frame.status).toBe('upgrade');
        expect(choose(scene)).toBe(true);
        expect(engine.drainEvents()).toContainEqual(expect.objectContaining({
          type: 'upgrade-selected', source,
        }));
        scene.unmount();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('keeps the same engine frame and event trace at equal simulated horizons', () => {
    const run = (speed: 1 | 3, realSteps: number) => {
      const scheduler = new ManualFrameScheduler();
      const engine = createEngine(createFrameFixture({ status: 'running' }));
      const trace: string[] = [];
      let elapsedMs = 0;
      engine.update = vi.fn((stepMs: number) => {
        engine.updateCalls += 1;
        elapsedMs += stepMs;
        if (Math.round(elapsedMs / FIXED_STEP_MS) % 10 === 0) {
          trace.push(`weapon-fired:${elapsedMs}`);
          engine.events.push({
            type: 'weapon-fired', projectileId: trace.length, source: 'main',
          });
        }
        engine.setFrame(createFrameFixture({
          status: 'running', elapsedMs,
        }));
      });
      const { host } = createHost();
      const scene = new BattleScene({
        ...TEST_BATTLE_SPEED_DEPENDENCIES,
        engine,
        effects: {
          view: EMPTY_EFFECT_FRAME_VIEW,
          consume: vi.fn(), update: vi.fn(), reset: vi.fn(),
        },
        assets: { failedIds: [], get: () => null },
        callbacks: createCallbacks(),
        createRenderer: () => ({ render: vi.fn() }),
        createHud: () => ({ mount: vi.fn(), update: vi.fn(), dispose: vi.fn() }),
        captainArtId: 'captainFemaleBase',
        reducedMotion: false,
        manualStepMode: true,
        initialBattleSpeed: speed,
        availableBattleSpeeds: [1, 3],
        onBattleSpeedChanged: vi.fn(),
        scheduler,
        eventTarget: new EventTarget(),
        getDevicePixelRatio: () => 1,
      });
      scene.mount(host);
      scene.advanceForE2E(FIXED_STEP_MS * realSteps);
      const result = {
        elapsedMs: engine.frame.elapsedMs,
        updateCalls: engine.updateCalls,
        trace,
      };
      scene.unmount();
      return result;
    };

    expect(run(1, 120)).toEqual(run(3, 40));
  });

  it('routes E2E upgrade choice through the manual acceptance path', () => {
    const engine = createEngine(createFrameFixture({
      status: 'upgrade', offeredUpgradeIds: ['multi-barrel'],
    }));
    const chooseUpgrade = vi.fn(() => true);
    engine.chooseUpgrade = chooseUpgrade;
    const { host } = createHost();
    const scene = new BattleScene({
      ...TEST_BATTLE_SPEED_DEPENDENCIES,
      engine,
      effects: {
        view: EMPTY_EFFECT_FRAME_VIEW,
        consume: vi.fn(), update: vi.fn(), reset: vi.fn(),
      },
      assets: { failedIds: [], get: () => null },
      callbacks: createCallbacks(),
      createRenderer: () => ({ render: vi.fn() }),
      createHud: () => ({ mount: vi.fn(), update: vi.fn(), dispose: vi.fn() }),
      captainArtId: 'captainFemaleBase',
      reducedMotion: false,
      manualStepMode: true,
      scheduler: new ManualFrameScheduler(),
      eventTarget: new EventTarget(),
      getDevicePixelRatio: () => 1,
    });

    scene.mount(host);
    expect(scene.chooseFirstUpgradeForE2E()).toBe(true);
    expect(chooseUpgrade).toHaveBeenCalledWith('multi-barrel', 'manual');
    expect(engine.frame.status).toBe('paused');
    scene.unmount();
  });

  it('gives observers an immutable real engine upgrade event without sharing nested state', () => {
    const engine = createRealEngine();
    let captured: Extract<BattleEvent, { type: 'upgrade-selected' }> | undefined;
    const observed = vi.fn((events: readonly BattleEvent[]) => {
      const event = events[0] as Extract<BattleEvent, { type: 'upgrade-selected' }>;
      captured = event;
      expect(() => { (event.skillRanks as Record<string, number>)['tidal-volley'] = 99; }).toThrow();
      expect(() => { (event.skillVariants['tidal-volley'] as string[]).push('bad'); }).toThrow();
    });
    const { host } = createHost();
    const scene = new BattleScene({
      ...TEST_BATTLE_SPEED_DEPENDENCIES, onBattleEvents: observed, engine,
      effects: { view: EMPTY_EFFECT_FRAME_VIEW, consume: vi.fn(), update: vi.fn(), reset: vi.fn() },
      assets: { failedIds: [], get: () => null }, callbacks: createCallbacks(),
      createRenderer: () => ({ render: vi.fn() }), createHud: () => ({ mount: vi.fn(), update: vi.fn(), dispose: vi.fn() }),
      captainArtId: 'captainFemaleBase', reducedMotion: false, manualStepMode: true,
      scheduler: new ManualFrameScheduler(), eventTarget: new EventTarget(), getDevicePixelRatio: () => 1,
    });
    scene.mount(host);
    scene.advanceForE2E(300_000);
    expect(scene.chooseFirstUpgradeForE2E()).toBe(true);
    (scene as unknown as { updateBattle(stepMs: number): void }).updateBattle(FIXED_STEP_MS);
    expect(captured?.skillRanks['tidal-volley']).toBe(engine.frame.skillRanks['tidal-volley']);
    expect(captured?.skillVariants['tidal-volley']).toEqual(engine.frame.skillVariants['tidal-volley']);
    scene.unmount();
  });

  it('does not persist or emit telemetry for an unchanged battle speed', () => {
    const onBattleSpeedChanged = vi.fn();
    const { host } = createHost();
    const scene = new BattleScene({
      ...TEST_BATTLE_SPEED_DEPENDENCIES, onBattleSpeedChanged, engine: createEngine(),
      effects: { view: EMPTY_EFFECT_FRAME_VIEW, consume: vi.fn(), update: vi.fn(), reset: vi.fn() },
      assets: { failedIds: [], get: () => null }, callbacks: createCallbacks(),
      createRenderer: () => ({ render: vi.fn() }), createHud: () => ({ mount: vi.fn(), update: vi.fn(), dispose: vi.fn() }),
      captainArtId: 'captainFemaleBase', reducedMotion: false, manualStepMode: true,
      scheduler: new ManualFrameScheduler(), eventTarget: new EventTarget(), getDevicePixelRatio: () => 1,
    });
    scene.mount(host);
    expect(scene.setBattleSpeed(1)).toBe(false);
    expect(onBattleSpeedChanged).not.toHaveBeenCalled();
    scene.unmount();
  });

  it('resolves E2E resume requests at the formal 400ms upgrade boundary and on cancellation', async () => {
    vi.useFakeTimers();
    try {
      const engine = createEngine(createFrameFixture({ status: 'upgrade', offeredUpgradeIds: ['multi-barrel'] }));
      const { host } = createHost();
      const scene = new BattleScene({
        ...TEST_BATTLE_SPEED_DEPENDENCIES, engine,
        effects: { view: EMPTY_EFFECT_FRAME_VIEW, consume: vi.fn(), update: vi.fn(), reset: vi.fn() },
        assets: { failedIds: [], get: () => null }, callbacks: createCallbacks(),
        createRenderer: () => ({ render: vi.fn() }), createHud: () => ({ mount: vi.fn(), update: vi.fn(), dispose: vi.fn() }),
        captainArtId: 'captainFemaleBase', reducedMotion: false, manualStepMode: true,
        scheduler: new ManualFrameScheduler(), eventTarget: new EventTarget(), getDevicePixelRatio: () => 1,
      });
      scene.mount(host);
      expect(scene.chooseFirstUpgradeForE2E()).toBe(true);
      let resolved = false;
      const first = scene.requestResumeForE2E().then(() => { resolved = true; });
      const duplicate = scene.requestResumeForE2E();
      await Promise.resolve();
      expect(resolved).toBe(false);
      vi.advanceTimersByTime(399);
      await Promise.resolve();
      expect(resolved).toBe(false);
      vi.advanceTimersByTime(1);
      await Promise.all([first, duplicate]);
      expect(engine.frame.status).toBe('running');
      scene.unmount();
    } finally { vi.useRealTimers(); }
  });

  it('keeps hidden upgrade waiters pending, then resolves all on visibility recovery or unmount', async () => {
    vi.useFakeTimers();
    try {
      const engine = createEngine(createFrameFixture({ status: 'upgrade', offeredUpgradeIds: ['multi-barrel'] }));
      const { host } = createHost();
      const scene = new BattleScene({
        ...TEST_BATTLE_SPEED_DEPENDENCIES, engine,
        effects: { view: EMPTY_EFFECT_FRAME_VIEW, consume: vi.fn(), update: vi.fn(), reset: vi.fn() }, assets: { failedIds: [], get: () => null }, callbacks: createCallbacks(),
        createRenderer: () => ({ render: vi.fn() }), createHud: () => ({ mount: vi.fn(), update: vi.fn(), dispose: vi.fn() }), captainArtId: 'captainFemaleBase', reducedMotion: false, manualStepMode: true,
        scheduler: new ManualFrameScheduler(), eventTarget: new EventTarget(), getDevicePixelRatio: () => 1,
      });
      scene.mount(host);
      scene.chooseFirstUpgradeForE2E();
      let resolved = 0;
      const waiters = [scene.requestResumeForE2E(), scene.requestResumeForE2E()].map((promise) => promise.then(() => { resolved += 1; }));
      scene.pauseForVisibility();
      vi.advanceTimersByTime(400);
      await Promise.resolve();
      expect(resolved).toBe(0);
      await scene.resumeForVisibility();
      await Promise.all(waiters);
      expect(resolved).toBe(2);
      scene.chooseFirstUpgradeForE2E();
      const cancelled = scene.requestResumeForE2E();
      scene.unmount();
      await cancelled;
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('uses a six-second real-time deadline for upgrade auto-choice at 3x speed', () => {
    vi.useFakeTimers();
    try {
      const scheduler = new ManualFrameScheduler();
      const engine = createEngine(createFrameFixture({
        status: 'running',
        offeredUpgradeIds: ['multi-barrel'],
      }));
      const chooseUpgrade = vi.fn(() => true);
      const onBattleSpeedChanged = vi.fn();
      const originalUpdate = engine.update.bind(engine);
      engine.update = vi.fn(() => {
        originalUpdate(FIXED_STEP_MS);
        engine.setFrame(createFrameFixture({
          status: 'upgrade',
          offeredUpgradeIds: ['multi-barrel'],
        }));
        engine.events.push({
          type: 'upgrade-offered',
          upgradeIds: ['multi-barrel'],
        });
      });
      engine.chooseUpgrade = chooseUpgrade;
      const hudCallbacks: { current?: BattleHudCallbacks } = {};
      const { host } = createHost();
      const scene = new BattleScene({
        engine,
        effects: {
          view: EMPTY_EFFECT_FRAME_VIEW,
          consume: vi.fn(),
          update: vi.fn(),
          reset: vi.fn(),
        },
        assets: { failedIds: [], get: () => null },
        callbacks: createCallbacks(),
        createRenderer: () => ({ render: vi.fn() }),
        createHud: (callbacks) => {
          hudCallbacks.current = callbacks;
          return { mount: vi.fn(), update: vi.fn(), dispose: vi.fn() };
        },
        captainArtId: 'captainFemaleBase',
        reducedMotion: false,
        manualStepMode: true,
        initialBattleSpeed: 1,
        availableBattleSpeeds: [1, 1.5, 2, 3],
        onBattleSpeedChanged,
        onBattleEvents: vi.fn(),
        scheduler,
        eventTarget: new EventTarget(),
        getDevicePixelRatio: () => 1,
      });

      scene.mount(host);
      hudCallbacks.current?.onBattleSpeed?.(3);
      expect(onBattleSpeedChanged).toHaveBeenCalledWith(3);
      scene.advanceForE2E(FIXED_STEP_MS);
      expect(engine.update).toHaveBeenCalledTimes(3);
      vi.advanceTimersByTime(5_999);
      expect(chooseUpgrade).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(chooseUpgrade).toHaveBeenCalledTimes(1);
      expect(chooseUpgrade).toHaveBeenCalledWith('multi-barrel', 'timeout');
      scene.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('owns one frame loop and consumes each event batch once', () => {
    const scheduler = new ManualFrameScheduler();
    const engine = createEngine();
    const originalUpdate = engine.update.bind(engine);
    const engineUpdate = vi.fn((stepMs: number) => originalUpdate(stepMs));
    engine.update = engineUpdate;
    engine.events.push({
      type: 'weapon-fired',
      projectileId: 3,
      source: 'main',
    });
    const effectView = {
      ...EMPTY_EFFECT_FRAME_VIEW,
      particles: [{
        id: 81,
        kind: 'defeat-squash' as const,
        layer: 'front-effects' as const,
        x: 92,
        y: 250,
        size: 24,
        color: '#315c70',
        alpha: 0.8,
        rotation: 0.75,
        progress: 0.42,
      }],
    };
    const effects = {
      view: effectView,
      consume: vi.fn(),
      update: vi.fn(),
      reset: vi.fn(),
    };
    const renderer = { render: vi.fn() };
    const motion = createMotion();
    const hud = {
      mount: vi.fn(),
      update: vi.fn(),
      dispose: vi.fn(),
    };
    const sound = {
      update: vi.fn(),
      consume: vi.fn(),
      setTrainMotion: vi.fn(),
      setBattlePhase: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(async () => undefined),
      dispose: vi.fn(),
    };
    const { host } = createHost();
    const scene = new BattleScene({
      ...TEST_BATTLE_SPEED_DEPENDENCIES,
      engine,
      effects,
      assets: { failedIds: [], get: () => null },
      callbacks: createCallbacks(),
      createRenderer: () => renderer,
      createHud: () => hud,
      sound,
      motion,
      scheduler,
      captainArtId: 'captainFemaleBase',
      reducedMotion: false,
      eventTarget: new EventTarget(),
      getDevicePixelRatio: () => 2,
    });

    scene.mount(host);
    expect(sound.setTrainMotion).toHaveBeenLastCalledWith({
      active: true,
      speed: motion.view.speed,
      power: motion.view.engineGlow,
    });
    expect(sound.setTrainMotion.mock.invocationCallOrder[0]).toBeLessThan(
      sound.update.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(motion.reset).toHaveBeenCalledWith(engine.frame);
    expect(motion.update).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenLastCalledWith(
      expect.objectContaining({ trainMotion: motion.view }),
    );
    expect(scheduler.activeCount).toBe(1);
    scheduler.fire(0);
    scheduler.fire(17);

    expect(engine.updateCalls).toBe(1);
    expect(motion.update).toHaveBeenCalledWith(
      expect.any(Number),
      engine.frame,
      expect.any(Array),
    );
    const motionEvents = motion.update.mock.calls[0]?.[2];
    expect(effects.consume).toHaveBeenCalledWith(motionEvents, engine.frame);
    expect(engineUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      motion.update.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(motion.update.mock.invocationCallOrder[0]).toBeLessThan(
      effects.consume.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(motion.update.mock.invocationCallOrder[0]).toBeLessThan(
      effects.update.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(effects.consume).toHaveBeenCalledTimes(1);
    expect(sound.consume).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalled();
    expect(hud.update).toHaveBeenCalled();
    expect(scheduler.activeCount).toBe(1);

    scene.setReducedMotion(true);
    expect(motion.setReducedMotion).toHaveBeenCalledWith(true);
    const snapshot = scene.snapshotTrainMotion();
    expect(snapshot).toEqual(motion.view);
    expect(snapshot).not.toBe(motion.view);
    const effectSnapshot = scene.snapshotEffectGeometry();
    expect(effectSnapshot).toMatchObject({
      particles: [expect.objectContaining({
        id: 81,
        kind: 'defeat-squash',
        x: 92,
        y: 250,
        size: 24,
        rotation: 0.75,
        progress: 0.42,
      })],
      damageNumbers: [],
      rings: [],
    });
    expect(effectSnapshot).not.toBe(effectView);
    expect(effectSnapshot.particles).not.toBe(effectView.particles);
    expect(effectSnapshot.particles[0]).not.toHaveProperty('color');
    expect(effectSnapshot).not.toHaveProperty('camera');

    const updatesBeforePause = motion.update.mock.calls.length;
    const laneOffsetBeforePause = motion.view.laneOffset;
    scene.pauseForVisibility();
    expect(motion.update).toHaveBeenCalledTimes(updatesBeforePause);
    expect(motion.update).not.toHaveBeenCalledWith(
      1000,
      expect.anything(),
      expect.anything(),
    );
    expect(motion.view.laneOffset).toBe(laneOffsetBeforePause);

    scene.unmount();
    scene.unmount();
    expect(scheduler.activeCount).toBe(0);
    expect(effects.reset).toHaveBeenCalledTimes(1);
    expect(hud.dispose).toHaveBeenCalledTimes(1);
    expect(sound.dispose).toHaveBeenCalledTimes(1);
  });

  it('silences completed defeat propulsion while victory remains active', () => {
    const terminalCases = [
      {
        phase: 'defeat' as const,
        speed: 0,
        engineGlow: 0,
        expected: { active: false, speed: 0, power: 0 },
      },
      {
        phase: 'victory' as const,
        speed: 0.25,
        engineGlow: 0.62,
        expected: { active: true, speed: 0.25, power: 0.62 },
      },
    ];

    for (const terminal of terminalCases) {
      const scheduler = new ManualFrameScheduler();
      const engine = createEngine(createFrameFixture({
        status: terminal.phase,
      }));
      const motion = createMotion();
      motion.view.phase = terminal.phase;
      motion.view.speed = terminal.speed;
      motion.view.engineGlow = terminal.engineGlow;
      const setTrainMotion = vi.fn();
      const sound = {
        update: vi.fn(),
        consume: vi.fn(),
        setTrainMotion,
        setBattlePhase: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(async () => undefined),
        dispose: vi.fn(),
      };
      const { host } = createHost();
      const scene = new BattleScene({
        ...TEST_BATTLE_SPEED_DEPENDENCIES,
        engine,
        effects: {
          view: EMPTY_EFFECT_FRAME_VIEW,
          consume: vi.fn(),
          update: vi.fn(),
          reset: vi.fn(),
        },
        assets: { failedIds: [], get: () => null },
        callbacks: createCallbacks(),
        createRenderer: () => ({ render: vi.fn() }),
        createHud: () => ({
          mount: vi.fn(), update: vi.fn(), dispose: vi.fn(),
        }),
        sound,
        motion,
        scheduler,
        captainArtId: 'captainFemaleBase',
        reducedMotion: false,
        eventTarget: new EventTarget(),
        getDevicePixelRatio: () => 1,
      });

      scene.mount(host);

      expect(setTrainMotion).toHaveBeenLastCalledWith(terminal.expected);
      scene.unmount();
    }
  });

  it('stops real propulsion at the exact 900 ms defeat endpoint', () => {
    const scheduler = new ManualFrameScheduler();
    const engine = createEngine();
    const backend = new RecordingAudioBackend();
    const sound = new AudioManager(backend);
    let defeatStarted = false;
    engine.update = () => {
      engine.updateCalls += 1;
      if (defeatStarted) return;
      defeatStarted = true;
      engine.setFrame(createFrameFixture({ status: 'defeat' }));
    };
    const { host } = createHost();
    const scene = new BattleScene({
      ...TEST_BATTLE_SPEED_DEPENDENCIES,
      engine,
      effects: {
        view: EMPTY_EFFECT_FRAME_VIEW,
        consume: vi.fn(),
        update: vi.fn(),
        reset: vi.fn(),
      },
      assets: { failedIds: [], get: () => null },
      callbacks: createCallbacks(),
      createRenderer: () => ({ render: vi.fn() }),
      createHud: () => ({
        mount: vi.fn(), update: vi.fn(), dispose: vi.fn(),
      }),
      sound,
      scheduler,
      captainArtId: 'captainFemaleBase',
      reducedMotion: false,
      eventTarget: new EventTarget(),
      getDevicePixelRatio: () => 1,
    });

    scene.mount(host);
    scheduler.fire(0);
    for (let frame = 1; frame <= 54; frame += 1) {
      scheduler.fire(frame * FIXED_STEP_MS + 0.000001);
    }

    const terminalMotion = scene.snapshotTrainMotion();
    expect(terminalMotion).toMatchObject({
      phase: 'defeat',
      speed: 0,
      engineGlow: 0,
    });
    expect(terminalMotion.motionTimeMs).toBeCloseTo(900, 8);
    expect(backend.continuousToneState('train-engine')).toEqual({
      active: false,
      gain: 0,
    });
    scene.unmount();
  });

  it('settles a victory event only once', () => {
    const scheduler = new ManualFrameScheduler();
    const engine = createEngine();
    const callbacks = createCallbacks();
    const victory = {
      battleId: 'presentation-1',
      victory: true,
      elapsedMs: 180_000,
      completedWaves: 6,
      remainingHp: 50,
      kills: 80,
      adReviveUsed: false,
    };
    let emitted = false;
    engine.update = () => {
      engine.updateCalls += 1;
      if (emitted) return;
      emitted = true;
      engine.setOutcome(victory);
      engine.events.push({ type: 'battle-won' });
    };
    const { host } = createHost();
    const scene = new BattleScene({
      ...TEST_BATTLE_SPEED_DEPENDENCIES,
      engine,
      effects: {
        view: EMPTY_EFFECT_FRAME_VIEW,
        consume: vi.fn(),
        update: vi.fn(),
        reset: vi.fn(),
      },
      assets: { failedIds: [], get: () => null },
      callbacks,
      createRenderer: () => ({ render: vi.fn() }),
      createHud: () => ({
        mount: vi.fn(),
        update: vi.fn(),
        dispose: vi.fn(),
      }),
      scheduler,
      captainArtId: 'captainFemaleBase',
      reducedMotion: true,
      eventTarget: new EventTarget(),
      getDevicePixelRatio: () => 1,
    });

    scene.mount(host);
    scheduler.fire(0);
    scheduler.fire(17);
    scheduler.fire(34);

    expect(callbacks.onOutcome).toHaveBeenCalledTimes(1);
    scene.unmount();
  });

  it('locks rewarded skill refresh and applies it on the next step', async () => {
    const scheduler = new ManualFrameScheduler();
    const engine = createEngine();
    const refresh = vi.fn(() => true);
    engine.refreshActiveSkillCooldowns = refresh;
    let release = (_accepted: boolean): void => undefined;
    const refreshResult = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const callbacks = {
      ...createCallbacks(),
      onRequestSkillRefresh: vi.fn(() => refreshResult),
    };
    const hudCallbackRef: { current?: BattleHudCallbacks } = {};
    const { host } = createHost();
    const scene = new BattleScene({
      ...TEST_BATTLE_SPEED_DEPENDENCIES,
      engine,
      effects: {
        view: EMPTY_EFFECT_FRAME_VIEW,
        consume: vi.fn(),
        update: vi.fn(),
        reset: vi.fn(),
      },
      assets: { failedIds: [], get: () => null },
      callbacks,
      createRenderer: () => ({ render: vi.fn() }),
      createHud: (nextCallbacks) => {
        hudCallbackRef.current = nextCallbacks;
        return {
          mount: vi.fn(),
          update: vi.fn(),
          dispose: vi.fn(),
        };
      },
      scheduler,
      captainArtId: 'captainFemaleBase',
      reducedMotion: true,
      eventTarget: new EventTarget(),
      getDevicePixelRatio: () => 1,
    });

    scene.mount(host);
    const hudCallbacks = hudCallbackRef.current;
    if (!hudCallbacks) throw new Error('HUD callbacks were not created');
    hudCallbacks.onRequestSkillRefresh();
    hudCallbacks.onRequestSkillRefresh();
    expect(callbacks.onRequestSkillRefresh).toHaveBeenCalledTimes(1);

    release(true);
    await Promise.resolve();
    await Promise.resolve();
    scheduler.fire(0);
    scheduler.fire(17);

    expect(refresh).toHaveBeenCalledTimes(1);
    scene.unmount();
  });

  it('stops hidden battles and resumes audio before a fresh frame loop', async () => {
    const scheduler = new ManualFrameScheduler();
    const engine = createEngine();
    const callOrder: string[] = [];
    const originalResume = engine.resume;
    engine.resume = () => {
      callOrder.push('engine-resume');
      originalResume.call(engine);
    };
    const sound = {
      update: vi.fn(),
      consume: vi.fn(),
      setTrainMotion: vi.fn(),
      setBattlePhase: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(async () => {
        callOrder.push('sound-resume');
      }),
      dispose: vi.fn(),
    };
    const hudCallbackRef: { current?: BattleHudCallbacks } = {};
    const hud = {
      mount: vi.fn(),
      update: vi.fn(),
      dispose: vi.fn(),
    };
    const { host } = createHost();
    const scene = new BattleScene({
      ...TEST_BATTLE_SPEED_DEPENDENCIES,
      engine,
      effects: {
        view: EMPTY_EFFECT_FRAME_VIEW,
        consume: vi.fn(),
        update: vi.fn(),
        reset: vi.fn(),
      },
      assets: { failedIds: [], get: () => null },
      callbacks: createCallbacks(),
      createRenderer: () => ({ render: vi.fn() }),
      createHud: (callbacks) => {
        hudCallbackRef.current = callbacks;
        return hud;
      },
      sound,
      scheduler,
      captainArtId: 'captainFemaleBase',
      reducedMotion: true,
      eventTarget: new EventTarget(),
      getDevicePixelRatio: () => 1,
    });

    scene.mount(host);
    scheduler.fire(0);
    scheduler.fire(17);
    expect(engine.updateCalls).toBe(1);

    scene.pauseForVisibility();
    expect(engine.frame.status).toBe('paused');
    expect(scheduler.activeCount).toBe(0);
    expect(sound.pause).toHaveBeenCalledTimes(1);
    const pausedModel = hud.update.mock.calls.at(-1)?.[0];
    expect(pausedModel?.pauseOverlayVisible).toBe(true);

    const hudCallbacks = hudCallbackRef.current;
    if (!hudCallbacks) throw new Error('HUD callbacks were not created');
    hudCallbacks.onResume();
    await Promise.resolve();
    await Promise.resolve();

    expect(callOrder).toEqual(['sound-resume', 'engine-resume']);
    expect(engine.frame.status).toBe('running');
    expect(scheduler.activeCount).toBe(1);

    scheduler.fire(10_000);
    expect(engine.updateCalls).toBe(1);
    scheduler.fire(10_017);
    expect(engine.updateCalls).toBe(2);
    scene.unmount();
  });

  it('applies an adaptive visual budget without changing battle commands', () => {
    const scheduler = new ManualFrameScheduler();
    const engine = createEngine();
    const qualityChanges = vi.fn();
    const effects = {
      view: EMPTY_EFFECT_FRAME_VIEW,
      consume: vi.fn(),
      update: vi.fn(),
      reset: vi.fn(),
      setRenderBudget: vi.fn(),
    };
    const renderer = { render: vi.fn() };
    const motion = createMotion();
    const { host } = createHost();
    const scene = new BattleScene({
      ...TEST_BATTLE_SPEED_DEPENDENCIES,
      engine,
      effects,
      assets: { failedIds: [], get: () => null },
      callbacks: {
        ...createCallbacks(),
        onQualityChanged: qualityChanges,
      },
      createRenderer: () => renderer,
      createHud: () => ({
        mount: vi.fn(),
        update: vi.fn(),
        dispose: vi.fn(),
      }),
      motion,
      scheduler,
      captainArtId: 'captainFemaleBase',
      reducedMotion: true,
      qualityPreference: 'auto',
      eventTarget: new EventTarget(),
      getDevicePixelRatio: () => 3,
    });

    scene.mount(host);
    scheduler.fire(0);
    for (let frame = 1; frame <= 240; frame += 1) {
      scheduler.fire(frame * 24);
    }

    expect(qualityChanges).toHaveBeenCalledTimes(1);
    expect(qualityChanges).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'high', to: 'medium' }),
    );
    expect(effects.setRenderBudget).toHaveBeenLastCalledWith(
      expect.objectContaining({ particles: 130, dprCap: 1.75 }),
    );
    expect(motion.setQualityLevel).toHaveBeenCalledWith('medium');
    expect(renderer.render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        renderBudget: expect.objectContaining({ dprCap: 1.75 }),
        viewport: expect.objectContaining({ pixelRatio: 1.75 }),
      }),
    );
    expect(engine.frame.status).toBe('running');
    scene.unmount();
  });

  it.each([
    ['accepted', { accepted: true, hpRestored: 40 }],
    ['rejected', { accepted: false, hpRestored: 0 }],
  ] as const)(
    'freezes presentation only while a revive request is %s',
    async (_label, result) => {
      const deferred = createDeferred<{
        readonly accepted: boolean;
        readonly hpRestored: number;
      }>();
      const harness = mountReviveScene(() => deferred.promise);
      const before = { ...harness.motion.view };

      expect(harness.motion.setPresentationFrozen).not.toHaveBeenCalled();
      harness.hudCallbacks.onRequestRevive();
      expect(harness.motion.setPresentationFrozen).toHaveBeenCalledTimes(1);
      expect(harness.motion.setPresentationFrozen).toHaveBeenLastCalledWith(true);

      harness.scheduler.fire(0);
      harness.scheduler.fire(17);
      expect(harness.motion.update).toHaveBeenCalled();
      expect(harness.motion.view.motionTimeMs).toBe(before.motionTimeMs);
      expect(harness.motion.view.laneOffset).toBe(before.laneOffset);

      deferred.resolve(result);
      await flushMicrotasks();

      expect(harness.motion.setPresentationFrozen.mock.calls).toEqual([
        [true],
        [false],
      ]);
      harness.scene.unmount();
    },
  );

  it('unfreezes presentation when the revive callback throws', async () => {
    const harness = mountReviveScene(async () => {
      throw new Error('platform callback failed');
    });

    harness.hudCallbacks.onRequestRevive();
    await flushMicrotasks();

    expect(harness.motion.setPresentationFrozen.mock.calls).toEqual([
      [true],
      [false],
    ]);
    harness.scene.unmount();
  });

  it('unfreezes an unresolved revive request during teardown', async () => {
    const deferred = createDeferred<{
      readonly accepted: boolean;
      readonly hpRestored: number;
    }>();
    const harness = mountReviveScene(() => deferred.promise);

    harness.hudCallbacks.onRequestRevive();
    expect(harness.motion.setPresentationFrozen).toHaveBeenLastCalledWith(true);
    harness.scene.unmount();
    expect(harness.motion.setPresentationFrozen.mock.calls).toEqual([
      [true],
      [false],
    ]);

    deferred.resolve({ accepted: true, hpRestored: 40 });
    await flushMicrotasks();
    expect(harness.motion.setPresentationFrozen.mock.calls).toEqual([
      [true],
      [false],
    ]);
  });

  it('ignores an old revive result after teardown and remount', async () => {
    const deferred = createDeferred<{
      readonly accepted: boolean;
      readonly hpRestored: number;
    }>();
    const harness = mountReviveScene(() => deferred.promise);
    const revive = vi.fn(() => true);
    harness.engine.revive = revive;

    harness.hudCallbacks.onRequestRevive();
    harness.scene.unmount();
    harness.scene.mount(harness.host);
    deferred.resolve({ accepted: true, hpRestored: 40 });
    await flushMicrotasks();

    expect(revive).not.toHaveBeenCalled();
    expect(harness.motion.setPresentationFrozen.mock.calls).toEqual([
      [true],
      [false],
    ]);
    harness.scene.unmount();
  });
});
