import type { QualityLevel } from './QualityMonitor';

export interface BattleEntityDiagnostics {
  readonly enemies: number;
  readonly projectiles: number;
  readonly loot: number;
  readonly effects: number;
  readonly pooledInUse: number;
}

export interface BattleDiagnosticsSnapshot
  extends BattleEntityDiagnostics {
  readonly activeFrameLoops: number;
  readonly activeListeners: number;
  readonly activeAudioSchedulers: number;
  readonly settledBattleCount: number;
  readonly qualityLevel: QualityLevel;
  readonly lastUncaughtError: string | null;
}

export class BattleDiagnostics {
  private activeFrameLoops = 0;
  private activeListeners = 0;
  private activeAudioSchedulers = 0;
  private enemies = 0;
  private projectiles = 0;
  private loot = 0;
  private effects = 0;
  private pooledInUse = 0;
  private settledBattleCount = 0;
  private qualityLevel: QualityLevel = 'high';
  private lastUncaughtError: string | null = null;

  public frameLoopStarted(): void {
    this.activeFrameLoops += 1;
  }

  public frameLoopStopped(): void {
    this.activeFrameLoops = Math.max(0, this.activeFrameLoops - 1);
  }

  public listenerAdded(count = 1): void {
    this.activeListeners += normalizeCount(count);
  }

  public listenerRemoved(count = 1): void {
    this.activeListeners = Math.max(
      0,
      this.activeListeners - normalizeCount(count),
    );
  }

  public audioSchedulerStarted(): void {
    this.activeAudioSchedulers += 1;
  }

  public audioSchedulerStopped(): void {
    this.activeAudioSchedulers = Math.max(
      0,
      this.activeAudioSchedulers - 1,
    );
  }

  public updateEntities(values: BattleEntityDiagnostics): void {
    this.enemies = normalizeCount(values.enemies);
    this.projectiles = normalizeCount(values.projectiles);
    this.loot = normalizeCount(values.loot);
    this.effects = normalizeCount(values.effects);
    this.pooledInUse = normalizeCount(values.pooledInUse);
  }

  public battleSettled(): void {
    this.settledBattleCount += 1;
  }

  public setQualityLevel(level: QualityLevel): void {
    this.qualityLevel = level;
  }

  public captureUncaughtError(error: unknown): void {
    const message = error instanceof Error
      ? error.message
      : String(error);
    this.lastUncaughtError = message
      .replace(/https?:\/\/\S+/gi, '[url]')
      .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
      .slice(0, 240);
  }

  public snapshot(): BattleDiagnosticsSnapshot {
    return {
      activeFrameLoops: this.activeFrameLoops,
      activeListeners: this.activeListeners,
      activeAudioSchedulers: this.activeAudioSchedulers,
      enemies: this.enemies,
      projectiles: this.projectiles,
      loot: this.loot,
      effects: this.effects,
      pooledInUse: this.pooledInUse,
      settledBattleCount: this.settledBattleCount,
      qualityLevel: this.qualityLevel,
      lastUncaughtError: this.lastUncaughtError,
    };
  }
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}
