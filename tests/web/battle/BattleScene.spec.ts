import { describe, expect, it, vi } from 'vitest';
import type { BattleEvent } from '../../../web/battle/BattleTypes';
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
import { createFrameFixture } from './helpers/BattleFixtures';

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

function createEngine(): TestEngine {
  let frame = createFrameFixture();
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
    const hud = {
      mount: vi.fn(),
      update: vi.fn(),
      dispose: vi.fn(),
    };
    const sound = {
      consume: vi.fn(),
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
      scheduler,
      captainArtId: 'captainFemaleBase',
      reducedMotion: true,
      eventTarget: new EventTarget(),
      visibilityTarget: Object.assign(new EventTarget(), {
        hidden: false,
      }),
      getDevicePixelRatio: () => 2,
    });

    scene.mount(host);
    expect(scheduler.activeCount).toBe(1);
    scheduler.fire(0);
    scheduler.fire(17);

    expect(engine.updateCalls).toBe(1);
    expect(effects.consume).toHaveBeenCalledTimes(1);
    expect(sound.consume).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalled();
    expect(hud.update).toHaveBeenCalled();
    expect(scheduler.activeCount).toBe(1);

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
      visibilityTarget: Object.assign(new EventTarget(), {
        hidden: false,
      }),
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
      visibilityTarget: Object.assign(new EventTarget(), {
        hidden: false,
      }),
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
});
