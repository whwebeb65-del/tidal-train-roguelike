export type StationRunSoundCue =
  | 'ticket-stamp'
  | 'train-charge'
  | 'train-depart';

export interface StationRunCoordinatorDependencies {
  unlockAudio(): Promise<boolean>;
  playSound(cue: StationRunSoundCue): void;
  showLoadingNotice(audioReady: boolean): void;
  pauseAmbient(): void;
  setChargeMotion(): void;
  setDepartureMotion(): void;
  setIdleMotion(): void;
  isVisibleStation(): boolean;
  resumeAmbient(): void;
  reportFailure(error: unknown): void;
}

export interface StationRunTask<TAssets> {
  beginCharging(): boolean;
  loadAssets(): Promise<TAssets>;
  playDeparture(): Promise<boolean>;
  cancelDeparture(): void;
}

export type StationRunResult<TAssets> =
  | { readonly status: 'ready'; readonly assets: TAssets }
  | { readonly status: 'local-abort' }
  | { readonly status: 'stale-cancel' }
  | { readonly status: 'failure'; readonly error: unknown }
  | { readonly status: 'busy' };

interface ActiveStationRun<TAssets> {
  readonly token: symbol;
  readonly task: StationRunTask<TAssets>;
  restored: boolean;
}

export class StationRunCoordinator<TAssets> {
  private activeRun: ActiveStationRun<TAssets> | null = null;

  public constructor(
    private readonly dependencies: StationRunCoordinatorDependencies,
  ) {}

  public async prepare(
    task: StationRunTask<TAssets>,
  ): Promise<StationRunResult<TAssets>> {
    if (this.activeRun) return { status: 'busy' };

    const run: ActiveStationRun<TAssets> = {
      token: Symbol('station-run'),
      task,
      restored: false,
    };
    this.activeRun = run;

    try {
      const audioReady = await this.dependencies.unlockAudio();
      if (!this.isCurrent(run)) return { status: 'stale-cancel' };

      if (audioReady) this.dependencies.playSound('ticket-stamp');
      this.dependencies.showLoadingNotice(audioReady);
      if (!task.beginCharging()) {
        this.abort(run);
        return { status: 'local-abort' };
      }

      this.dependencies.pauseAmbient();
      this.dependencies.setChargeMotion();
      this.dependencies.playSound('train-charge');
      const assets = await task.loadAssets();
      if (!this.isCurrent(run)) return { status: 'stale-cancel' };

      this.dependencies.setDepartureMotion();
      this.dependencies.playSound('train-depart');
      const departed = await task.playDeparture();
      if (!this.isCurrent(run)) return { status: 'stale-cancel' };
      if (!departed) {
        this.abort(run);
        return { status: 'local-abort' };
      }

      return { status: 'ready', assets };
    } catch (error) {
      if (!this.isCurrent(run)) return { status: 'stale-cancel' };
      this.abort(run);
      this.dependencies.reportFailure(error);
      return { status: 'failure', error };
    } finally {
      if (this.isCurrent(run)) this.activeRun = null;
    }
  }

  public cancel(): boolean {
    const run = this.activeRun;
    if (!run) return false;
    this.activeRun = null;
    run.task.cancelDeparture();
    this.restore(run);
    return true;
  }

  private abort(run: ActiveStationRun<TAssets>): void {
    run.task.cancelDeparture();
    this.restore(run);
  }

  private restore(run: ActiveStationRun<TAssets>): void {
    if (run.restored) return;
    run.restored = true;
    this.dependencies.setIdleMotion();
    if (this.dependencies.isVisibleStation()) {
      this.dependencies.resumeAmbient();
    }
  }

  private isCurrent(run: ActiveStationRun<TAssets>): boolean {
    return this.activeRun?.token === run.token;
  }
}
