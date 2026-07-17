import type { BattleArtId } from '../assets/BattleArtCatalog';
import type { BattleAssetSet } from '../battle/AssetLoader';
import { FIXED_STEP_MS, MAX_CATCH_UP_STEPS } from '../battle/BattleConfig';
import type {
  BattleHudCallbacks,
} from '../battle/BattleHUD';
import {
  createBattleHudModel,
  type BattleHudModel,
  type BattleSettlementPresentation,
} from '../battle/BattleHUD';
import type { BattleRenderInput } from '../battle/BattleRenderer';
import {
  computeCanvasViewport,
  resizeCanvas,
  type CanvasViewport,
} from '../battle/CanvasViewport';
import type {
  EffectFrameView,
} from '../battle/EffectSystem';
import { FixedStepLoop } from '../battle/FixedStepLoop';
import {
  SILENT_BATTLE_SOUND,
  type BattleSoundPort,
} from '../battle/BattleSoundPort';
import type {
  BattleEvent,
  BattleFrameView,
  BattleOutcome,
  BattleSkillId,
  BattleUpgradeId,
  PauseReason,
} from '../battle/BattleTypes';
import { requireElement } from '../app/dom';
import type {
  QualityPreference,
} from '../app/SettingsRepository';
import {
  getRenderBudget,
  QualityMonitor,
  type QualityChange,
  type QualityLevel,
  type RenderBudget,
} from '../battle/QualityMonitor';
import {
  type BattleDiagnostics,
} from '../battle/BattleDiagnostics';
import type {
  BattleEntityPoolStats,
} from '../battle/BattleEngine';
import type { EffectPoolStats } from '../battle/EffectSystem';
import type { GameScene } from './Scene';

export interface FrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
}

export interface TimerScheduler {
  set(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clear(id: ReturnType<typeof setTimeout>): void;
}

export interface BattleEnginePort {
  readonly frame: BattleFrameView;
  readonly outcome: BattleOutcome | null;
  readonly poolStats?: BattleEntityPoolStats;
  update(stepMs: number): void;
  drainEvents(): readonly BattleEvent[];
  useSkill(skillId: BattleSkillId): boolean;
  chooseUpgrade(upgradeId: BattleUpgradeId): boolean;
  rerollUpgradeOffer(): boolean;
  refreshActiveSkillCooldowns(): boolean;
  revive(hpRestored: number, protectionMs: number): boolean;
  pause(reason: PauseReason): void;
  resume(): void;
}

export interface BattleEffectPort {
  readonly view: EffectFrameView;
  consume(events: readonly BattleEvent[], frame: BattleFrameView): void;
  update(deltaMs: number): void;
  reset(): void;
  readonly poolStats?: EffectPoolStats;
  setReducedMotion?(reducedMotion: boolean): void;
  setRenderBudget?(budget: RenderBudget): void;
}

export interface BattleRendererPort {
  render(input: BattleRenderInput): void;
}

export interface BattleHudPort {
  mount(host: HTMLElement): void;
  update(model: BattleHudModel): void;
  dispose(): void;
}

export interface BattleSceneCallbacks {
  onOutcome(outcome: BattleOutcome): BattleSettlementPresentation;
  onRequestRevive(): Promise<{
    readonly accepted: boolean;
    readonly hpRestored: number;
  }>;
  onRequestUpgradeReroll(): Promise<boolean>;
  onRequestSkillRefresh(): Promise<boolean>;
  onClaimInteraction(actionId: string, attempt: number): boolean;
  onRequestDoubleSettlement(
    outcome: BattleOutcome,
  ): Promise<BattleSettlementPresentation | null>;
  onGiveUp(outcome: BattleOutcome): BattleSettlementPresentation;
  onExit(): void;
  onQualityChanged?(change: QualityChange): void;
}

export interface BattleSceneDependencies {
  readonly engine: BattleEnginePort;
  readonly effects: BattleEffectPort;
  readonly assets: BattleAssetSet<BattleArtId>;
  readonly callbacks: BattleSceneCallbacks;
  readonly createRenderer: (
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
  ) => BattleRendererPort;
  readonly createHud: (callbacks: BattleHudCallbacks) => BattleHudPort;
  readonly captainArtId: BattleArtId;
  readonly reducedMotion: boolean;
  readonly qualityPreference?: QualityPreference;
  readonly diagnostics?: BattleDiagnostics;
  readonly manualStepMode?: boolean;
  readonly sound?: BattleSoundPort;
  readonly scheduler?: FrameScheduler;
  readonly timerScheduler?: TimerScheduler;
  readonly eventTarget?: EventTarget | null;
  readonly getDevicePixelRatio?: () => number;
  readonly maxDevicePixelRatio?: number;
}

const BROWSER_FRAME_SCHEDULER: FrameScheduler = {
  request(callback) {
    return window.requestAnimationFrame(callback);
  },
  cancel(id) {
    window.cancelAnimationFrame(id);
  },
};

const BROWSER_TIMER_SCHEDULER: TimerScheduler = {
  set(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clear(id) {
    globalThis.clearTimeout(id);
  },
};

export class BattleScene implements GameScene {
  public readonly id = 'battle' as const;

  private readonly sound: BattleSoundPort;
  private readonly scheduler: FrameScheduler;
  private readonly timerScheduler: TimerScheduler;
  private readonly eventTarget: EventTarget | null;
  private readonly getDevicePixelRatio: () => number;
  private readonly maxDevicePixelRatio: number;
  private readonly pendingActions = new Set<string>();
  private readonly interactionClaims: Record<string, number> = {};
  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private canvasHost: HTMLElement | null = null;
  private renderer: BattleRendererPort | null = null;
  private hud: BattleHudPort | null = null;
  private viewport: CanvasViewport | null = null;
  private loop: FixedStepLoop | null = null;
  private frameRequestId: number | null = null;
  private frameLoopPaused = false;
  private upgradeTimerId: ReturnType<typeof setTimeout> | null = null;
  private lastFrameTimeMs = 0;
  private lastQualityFrameTimeMs: number | null = null;
  private lifecycleVersion = 0;
  private visibilityPaused = false;
  private queuedSkillRefresh = false;
  private outcomeHandled = false;
  private diagnosticsSettlementRecorded = false;
  private diagnosticsFrameLoopActive = false;
  private diagnosticsListenerActive = false;
  private exitRequested = false;
  private settlement: BattleSettlementPresentation | null = null;
  private interactionNotice = '';
  private reducedMotion: boolean;
  private readonly qualityMonitor: QualityMonitor;
  private renderBudget: RenderBudget;

  private readonly frameCallback: FrameRequestCallback = (timeMs): void => {
    if (!this.host || !this.loop) return;
    this.frameRequestId = null;
    const previousQualityFrameTimeMs = this.lastQualityFrameTimeMs;
    this.lastQualityFrameTimeMs = timeMs;
    if (previousQualityFrameTimeMs !== null) {
      const change = this.qualityMonitor.recordFrame(
        timeMs - previousQualityFrameTimeMs,
      );
      if (change) {
        this.applyRenderBudget(change.to);
        this.dependencies.callbacks.onQualityChanged?.(change);
      }
    }
    this.lastFrameTimeMs = timeMs;
    this.loop.frame(timeMs);
    if (this.host && !this.frameLoopPaused) {
      this.frameRequestId = this.scheduler.request(this.frameCallback);
    }
  };

  private readonly onResize = (): void => {
    this.viewport = null;
  };

  public constructor(
    private readonly dependencies: BattleSceneDependencies,
  ) {
    this.reducedMotion = dependencies.reducedMotion;
    this.qualityMonitor = new QualityMonitor(
      dependencies.qualityPreference ?? 'auto',
    );
    this.renderBudget = getRenderBudget(this.qualityMonitor.level);
    dependencies.effects.setRenderBudget?.(this.renderBudget);
    dependencies.diagnostics?.setQualityLevel(this.qualityMonitor.level);
    this.sound = dependencies.sound ?? SILENT_BATTLE_SOUND;
    this.scheduler = dependencies.scheduler ?? BROWSER_FRAME_SCHEDULER;
    this.timerScheduler =
      dependencies.timerScheduler ?? BROWSER_TIMER_SCHEDULER;
    this.eventTarget = dependencies.eventTarget
      ?? (typeof window === 'undefined' ? null : window);
    this.getDevicePixelRatio = dependencies.getDevicePixelRatio
      ?? (() => (
        typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
      ));
    this.maxDevicePixelRatio = dependencies.maxDevicePixelRatio ?? 2;
  }

  public mount(host: HTMLElement): void {
    if (this.host) this.unmount();
    this.lifecycleVersion += 1;
    this.host = host;
    this.pendingActions.clear();
    for (const actionId of Object.keys(this.interactionClaims)) {
      delete this.interactionClaims[actionId];
    }
    this.outcomeHandled = false;
    this.diagnosticsSettlementRecorded = false;
    this.settlement = null;
    this.interactionNotice = '';
    this.queuedSkillRefresh = false;
    this.visibilityPaused = false;
    this.frameLoopPaused = false;
    this.exitRequested = false;
    host.innerHTML = `<section class="game-scene game-scene--battle">
      <div class="battle-canvas-host">
        <canvas data-battle-canvas aria-label="潮汐列车战斗"></canvas>
      </div>
      <div class="battle-hud-host" data-battle-hud></div>
    </section>`;

    const canvas = requireElement<HTMLCanvasElement>(
      host,
      '[data-battle-canvas]',
    );
    const canvasHost = requireElement<HTMLElement>(
      host,
      '.battle-canvas-host',
    );
    this.canvas = canvas;
    this.canvasHost = canvasHost;
    const hudHost = requireElement<HTMLElement>(host, '[data-battle-hud]');
    const context = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });
    if (!context) throw new Error('Canvas 2D context is unavailable');

    this.renderer = this.dependencies.createRenderer(context, canvas);
    this.hud = this.dependencies.createHud(this.createHudCallbacks());
    this.hud.mount(hudHost);
    this.sound.setBattlePhase('battle');
    this.eventTarget?.addEventListener('resize', this.onResize);
    if (this.eventTarget) {
      this.dependencies.diagnostics?.listenerAdded();
      this.diagnosticsListenerActive = true;
    }

    this.loop = new FixedStepLoop({
      stepMs: FIXED_STEP_MS,
      maxFrameDeltaMs: 100,
      maxStepsPerFrame: MAX_CATCH_UP_STEPS,
      update: (stepMs) => this.updateBattle(stepMs),
      render: () => this.renderBattle(),
    });
    this.refreshViewport();
    this.renderBattle();
    if (this.dependencies.manualStepMode) {
      this.frameLoopPaused = true;
    } else {
      this.startAnimationLoop();
    }
  }

  public setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    this.dependencies.effects.setReducedMotion?.(reducedMotion);
  }

  public setQualityPreference(preference: QualityPreference): void {
    const level = this.qualityMonitor.setPreference(preference);
    this.applyRenderBudget(level);
    this.dependencies.diagnostics?.setQualityLevel(level);
    this.renderBattle();
  }

  public pauseForVisibility(): void {
    if (!this.host || this.visibilityPaused) return;
    this.visibilityPaused = true;
    const status = this.dependencies.engine.frame.status;
    if (status === 'running' || status === 'boss-intro') {
      this.dependencies.engine.pause('visibility');
    }
    this.sound.pause();
    this.stopAnimationLoop();
    this.renderBattle();
  }

  public advanceForE2E(durationMs: number): void {
    if (!this.dependencies.manualStepMode) {
      throw new Error('Direct battle advancement is only available in E2E');
    }
    if (
      !Number.isFinite(durationMs)
      || durationMs < 0
      || durationMs > 300_000
    ) {
      throw new Error('E2E battle advancement must be within 0..300000 ms');
    }
    const steps = Math.floor(durationMs / FIXED_STEP_MS);
    for (let index = 0; index < steps; index += 1) {
      const status = this.dependencies.engine.frame.status;
      if (status !== 'running' && status !== 'boss-intro') break;
      this.updateBattle(FIXED_STEP_MS);
      const nextStatus = this.dependencies.engine.frame.status;
      if (
        nextStatus === 'upgrade'
        || nextStatus === 'victory'
        || nextStatus === 'defeat'
      ) {
        break;
      }
    }
    this.renderBattle();
  }

  public chooseFirstUpgradeForE2E(): boolean {
    if (!this.dependencies.manualStepMode) return false;
    const first = this.dependencies.engine.frame.offeredUpgradeIds[0];
    if (!first) return false;
    const accepted = this.dependencies.engine.chooseUpgrade(first);
    this.renderBattle();
    return accepted;
  }

  public useSkillForE2E(skillId: BattleSkillId): boolean {
    if (!this.dependencies.manualStepMode) return false;
    const accepted = this.dependencies.engine.useSkill(skillId);
    this.renderBattle();
    return accepted;
  }

  public requestPauseForE2E(): void {
    if (!this.dependencies.manualStepMode) return;
    this.dependencies.engine.pause('manual');
    this.sound.pause();
    this.renderBattle();
  }

  public async requestResumeForE2E(): Promise<void> {
    if (!this.dependencies.manualStepMode) return;
    await this.sound.resume();
    if (!this.host) return;
    this.dependencies.engine.resume();
    this.renderBattle();
  }

  public unmount(): void {
    if (!this.host) return;
    this.lifecycleVersion += 1;
    this.stopAnimationLoop();
    if (this.upgradeTimerId !== null) {
      this.timerScheduler.clear(this.upgradeTimerId);
      this.upgradeTimerId = null;
    }
    this.eventTarget?.removeEventListener('resize', this.onResize);
    if (this.diagnosticsListenerActive) {
      this.dependencies.diagnostics?.listenerRemoved();
      this.diagnosticsListenerActive = false;
    }
    this.hud?.dispose();
    this.dependencies.effects.reset();
    this.sound.dispose();
    this.host.replaceChildren();
    this.pendingActions.clear();
    this.host = null;
    this.canvas = null;
    this.canvasHost = null;
    this.renderer = null;
    this.hud = null;
    this.viewport = null;
    this.loop = null;
    this.settlement = null;
    this.interactionNotice = '';
    this.queuedSkillRefresh = false;
    this.visibilityPaused = false;
    this.frameLoopPaused = false;
    this.diagnosticsSettlementRecorded = false;
    this.updateDiagnostics(true);
  }

  private updateBattle(stepMs: number): void {
    if (this.queuedSkillRefresh) {
      this.queuedSkillRefresh = false;
      this.dependencies.engine.refreshActiveSkillCooldowns();
    }
    this.dependencies.engine.update(stepMs);
    const events = this.dependencies.engine.drainEvents();
    if (events.length > 0) {
      this.dependencies.effects.consume(
        events,
        this.dependencies.engine.frame,
      );
      this.sound.consume(events, this.dependencies.engine.frame);
      this.handleEvents(events);
    }
    this.dependencies.effects.update(stepMs);
  }

  private handleEvents(events: readonly BattleEvent[]): void {
    for (const event of events) {
      if (event.type === 'boss-intro-started') {
        this.sound.setBattlePhase('boss');
      }
      if (event.type === 'battle-lost') {
        this.sound.setBattlePhase('defeat');
      }
      if (event.type === 'battle-won') {
        this.sound.setBattlePhase('victory');
        const outcome = this.dependencies.engine.outcome;
        if (outcome?.victory === true && !this.outcomeHandled) {
          this.outcomeHandled = true;
          this.settlement = this.dependencies.callbacks.onOutcome(outcome);
          this.recordSettlement();
        }
      }
    }
  }

  private renderBattle(): void {
    if (!this.host || !this.canvas || !this.renderer || !this.hud) return;
    this.sound.update?.(this.lastFrameTimeMs);
    this.refreshViewport();
    const viewport = this.viewport;
    if (!viewport) return;
    this.renderer.render({
      frame: this.dependencies.engine.frame,
      effects: this.dependencies.effects.view,
      assets: this.dependencies.assets,
      viewport,
      captainArtId: this.dependencies.captainArtId,
      timeMs: this.lastFrameTimeMs,
      reducedMotion: this.reducedMotion,
      renderBudget: this.renderBudget,
    });
    this.hud.update(createBattleHudModel(
      this.dependencies.engine.frame,
      {
        mode: this.dependencies.engine.frame.mode,
        upgradeRerollAvailable:
          !this.dependencies.engine.frame.upgradeRerollUsed,
        skillRefreshAvailable:
          !this.dependencies.engine.frame.skillRefreshUsed,
        interactionClaims: this.interactionClaims,
        interactionNotice: this.interactionNotice,
        reviveAvailable: !this.dependencies.engine.frame.adReviveUsed,
        settlement: this.settlement,
        pendingActions: this.pendingActions,
        visibilityResumeRequired: this.visibilityPaused,
      },
    ));
    this.updateDiagnostics(false);
  }

  private startAnimationLoop(): void {
    if (
      this.dependencies.manualStepMode
      ||
      !this.host
      || !this.loop
      || this.frameRequestId !== null
    ) {
      return;
    }
    this.frameLoopPaused = false;
    this.loop.start();
    this.lastFrameTimeMs = 0;
    this.lastQualityFrameTimeMs = null;
    this.frameRequestId = this.scheduler.request(this.frameCallback);
    if (!this.diagnosticsFrameLoopActive) {
      this.dependencies.diagnostics?.frameLoopStarted();
      this.diagnosticsFrameLoopActive = true;
    }
  }

  private stopAnimationLoop(): void {
    this.frameLoopPaused = true;
    if (this.frameRequestId !== null) {
      this.scheduler.cancel(this.frameRequestId);
      this.frameRequestId = null;
    }
    this.loop?.stop();
    this.lastQualityFrameTimeMs = null;
    if (this.diagnosticsFrameLoopActive) {
      this.dependencies.diagnostics?.frameLoopStopped();
      this.diagnosticsFrameLoopActive = false;
    }
  }

  private applyRenderBudget(level: QualityLevel): void {
    const next = getRenderBudget(level);
    if (next === this.renderBudget) return;
    this.renderBudget = next;
    this.dependencies.effects.setRenderBudget?.(next);
    this.dependencies.diagnostics?.setQualityLevel(level);
    this.viewport = null;
  }

  private recordSettlement(): void {
    if (this.diagnosticsSettlementRecorded) return;
    this.diagnosticsSettlementRecorded = true;
    this.dependencies.diagnostics?.battleSettled();
  }

  private updateDiagnostics(cleared: boolean): void {
    const diagnostics = this.dependencies.diagnostics;
    if (!diagnostics) return;
    if (cleared) {
      diagnostics.updateEntities({
        enemies: 0,
        projectiles: 0,
        loot: 0,
        effects: 0,
        pooledInUse: 0,
      });
      return;
    }
    const frame = this.dependencies.engine.frame;
    const effectView = this.dependencies.effects.view;
    const enginePools = this.dependencies.engine.poolStats;
    const effectPools = this.dependencies.effects.poolStats;
    diagnostics.updateEntities({
      enemies: frame.enemies.filter((enemy) => enemy.alive).length,
      projectiles: frame.projectiles.length,
      loot: frame.loot.length,
      effects:
        effectView.particles.length
        + effectView.damageNumbers.length
        + effectView.rings.length,
      pooledInUse:
        (enginePools?.projectiles.inUse ?? 0)
        + (enginePools?.loot.inUse ?? 0)
        + (effectPools?.particles.inUse ?? 0)
        + (effectPools?.damageNumbers.inUse ?? 0)
        + (effectPools?.rings.inUse ?? 0),
    });
  }

  private refreshViewport(): void {
    if (this.viewport || !this.canvas || !this.canvasHost) return;
    const rect = this.canvasHost.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || 390);
    const cssHeight = Math.max(1, rect.height || 844);
    this.viewport = computeCanvasViewport({
      cssWidth,
      cssHeight,
      devicePixelRatio: Math.max(1, this.getDevicePixelRatio()),
      maxDevicePixelRatio: Math.min(
        this.maxDevicePixelRatio,
        this.renderBudget.dprCap,
      ),
    });
    resizeCanvas(this.canvas, this.viewport);
  }

  private createHudCallbacks(): BattleHudCallbacks {
    return {
      onSkill: (skillId) => {
        if (this.dependencies.engine.frame.status !== 'running') return;
        this.dependencies.engine.useSkill(skillId);
      },
      onChooseUpgrade: (upgradeId) => {
        if (
          this.pendingActions.has('upgrade-choice')
          || !this.dependencies.engine.chooseUpgrade(upgradeId)
        ) {
          return;
        }
        this.pendingActions.add('upgrade-choice');
        this.pendingActions.add('upgrade-resume');
        this.dependencies.engine.pause('upgrade');
        this.sound.pause();
        this.upgradeTimerId = this.timerScheduler.set(() => {
          this.upgradeTimerId = null;
          if (!this.host) return;
          this.pendingActions.delete('upgrade-choice');
          this.pendingActions.delete('upgrade-resume');
          if (this.visibilityPaused) {
            this.renderBattle();
            return;
          }
          this.dependencies.engine.resume();
          void this.sound.resume();
        }, 400);
      },
      onClaimInteraction: (actionId, attempt) => {
        if (this.pendingActions.has('interaction')) return;
        const currentAttempt = this.interactionClaims[actionId] ?? 0;
        if (attempt !== currentAttempt) return;
        this.pendingActions.add('interaction');
        try {
          const accepted = this.dependencies.callbacks.onClaimInteraction(
            actionId,
            attempt,
          );
          if (!accepted) {
            this.interactionNotice = '领取未完成，请稍后重试';
            return;
          }
          this.interactionClaims[actionId] = attempt + 1;
          this.interactionNotice = actionId === 'salvage-a'
            ? `本局已打捞 ${attempt + 1}/2`
            : '互动奖励已到账';
        } finally {
          this.pendingActions.delete('interaction');
        }
      },
      onRequestUpgradeReroll: () => {
        void this.runPending('upgrade-reroll', async () => {
          const accepted =
            await this.dependencies.callbacks.onRequestUpgradeReroll();
          if (accepted && this.host) {
            this.dependencies.engine.rerollUpgradeOffer();
          }
        });
      },
      onRequestSkillRefresh: () => {
        void this.runPending('skill-refresh', async () => {
          if (this.dependencies.engine.frame.status !== 'running') return;
          this.dependencies.engine.pause('rewarded-ad');
          this.sound.pause();
          let accepted = false;
          try {
            accepted =
              await this.dependencies.callbacks.onRequestSkillRefresh();
          } finally {
            if (this.host && !this.visibilityPaused) {
              this.dependencies.engine.resume();
              await this.sound.resume();
            }
          }
          if (accepted && this.host) this.queuedSkillRefresh = true;
        });
      },
      onPause: () => {
        if (this.dependencies.engine.frame.status !== 'running') return;
        this.dependencies.engine.pause('manual');
        this.sound.pause();
        this.stopAnimationLoop();
        this.renderBattle();
      },
      onResume: () => {
        if (this.visibilityPaused) {
          void this.runPending('visibility-resume', async () => {
            await this.sound.resume();
            if (!this.host) return;
            this.visibilityPaused = false;
            if (
              this.dependencies.engine.frame.status === 'paused'
              && !this.pendingActions.has('upgrade-resume')
            ) {
              this.dependencies.engine.resume();
            }
            this.startAnimationLoop();
            this.renderBattle();
          });
          return;
        }
        if (
          this.dependencies.engine.frame.status !== 'paused'
          || this.pendingActions.has('upgrade-resume')
        ) {
          return;
        }
        void this.runPending('manual-resume', async () => {
          await this.sound.resume();
          if (
            !this.host
            || this.dependencies.engine.frame.status !== 'paused'
          ) {
            return;
          }
          this.dependencies.engine.resume();
          this.startAnimationLoop();
          this.renderBattle();
        });
      },
      onRequestRevive: () => {
        void this.runPending('revive', async () => {
          if (this.dependencies.engine.frame.status !== 'defeat') return;
          const result = await this.dependencies.callbacks.onRequestRevive();
          if (
            !this.host
            || !result.accepted
            || result.hpRestored <= 0
          ) {
            return;
          }
          if (this.dependencies.engine.revive(result.hpRestored, 3000)) {
            this.sound.setBattlePhase('battle');
            if (!this.visibilityPaused) await this.sound.resume();
          }
        });
      },
      onRequestDoubleSettlement: () => {
        void this.runPending('double-settlement', async () => {
          const outcome = this.dependencies.engine.outcome;
          if (!outcome || !this.settlement) return;
          const updated =
            await this.dependencies.callbacks.onRequestDoubleSettlement(
              outcome,
            );
          if (updated && this.host) this.settlement = updated;
        });
      },
      onGiveUp: () => {
        const outcome = this.dependencies.engine.outcome;
        if (
          outcome?.victory !== false
          || this.settlement
        ) {
          return;
        }
        this.settlement = this.dependencies.callbacks.onGiveUp(outcome);
        this.recordSettlement();
      },
      onReturnStation: () => {
        if (this.exitRequested) return;
        this.exitRequested = true;
        this.dependencies.callbacks.onExit();
      },
    };
  }

  private async runPending(
    key: string,
    action: () => Promise<void>,
  ): Promise<void> {
    if (this.pendingActions.has(key) || !this.host) return;
    const version = this.lifecycleVersion;
    this.pendingActions.add(key);
    try {
      await action();
    } catch {
      if (version === this.lifecycleVersion) {
        this.interactionNotice = '平台操作未完成，请稍后重试';
      }
    } finally {
      if (version === this.lifecycleVersion) {
        this.pendingActions.delete(key);
      }
    }
  }
}
