import { describe, expect, it, vi } from 'vitest';
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
  setOutcome(next: BattleEnginePort['outcome']): void;
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
  };
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

function createHost(): {
  readonly host: HTMLElement;
  readonly canvas: HTMLCanvasElement;
} {
  const context = {} as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  const canvasHost = {
    getBoundingClientRect: () => ({
      width: 390,
      height: 844,
    }),
  } as unknown as HTMLElement;
  const hudHost = {
    innerHTML: '',
  } as unknown as HTMLElement;
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
  return { host, canvas };
}

describe('BattleScene', () => {
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
    const effects = {
      view: EMPTY_EFFECT_FRAME_VIEW,
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
