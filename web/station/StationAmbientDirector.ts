export type StationAmbientEventId =
  | 'mechanic-check'
  | 'station-call'
  | 'mail-drop'
  | 'distant-train'
  | 'captain-idle'
  | 'captain-greeting';

export type StationAmbientCue =
  | 'station-tool'
  | 'station-chime'
  | 'station-mail'
  | 'station-whistle';

export interface StationAmbientTimer {
  set(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clear(id: ReturnType<typeof setTimeout>): void;
}

export interface StationAmbientController {
  start(): void;
  pause(): void;
  resume(): void;
  setReducedMotion(reducedMotion: boolean): void;
  setLowPerformance(lowPerformance: boolean): void;
  requestCaptainGreeting(): boolean;
  dispose(): void;
}

export interface StationAmbientDirectorOptions {
  readonly reducedMotion: boolean;
  readonly lowPerformance?: boolean;
  readonly timer?: StationAmbientTimer;
  readonly random?: () => number;
  readonly playSound?: (cue: StationAmbientCue) => void;
  readonly announce?: (message: string) => void;
  readonly onEvent?: (eventId: StationAmbientEventId) => void;
}

interface StationAmbientDefinition {
  readonly id: Exclude<StationAmbientEventId, 'captain-greeting'>;
  readonly durationMs: number;
  readonly cue?: StationAmbientCue;
}

const EVENTS: readonly StationAmbientDefinition[] = [
  { id: 'mechanic-check', durationMs: 1800, cue: 'station-tool' },
  { id: 'station-call', durationMs: 1600, cue: 'station-chime' },
  { id: 'mail-drop', durationMs: 1700, cue: 'station-mail' },
  { id: 'distant-train', durationMs: 2200, cue: 'station-whistle' },
  { id: 'captain-idle', durationMs: 1400 },
] as const;

const firstDelay = (random: () => number): number => 2000 + random() * 2000;
const nextDelay = (random: () => number): number => 5000 + random() * 3000;

const defaultTimer: StationAmbientTimer = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (id) => clearTimeout(id),
};

export class StationAmbientDirector implements StationAmbientController {
  private readonly timer: StationAmbientTimer;
  private readonly random: () => number;
  private readonly playSound?: (cue: StationAmbientCue) => void;
  private readonly announce?: (message: string) => void;
  private readonly onEvent?: (eventId: StationAmbientEventId) => void;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private activeTimerId: ReturnType<typeof setTimeout> | null = null;
  private activeEventId: StationAmbientEventId | null = null;
  private lastAutomaticId: StationAmbientDefinition['id'] | null = null;
  private started = false;
  private paused = false;
  private disposed = false;
  private reducedMotion: boolean;
  private lowPerformance: boolean;

  public constructor(
    private readonly root: HTMLElement,
    options: StationAmbientDirectorOptions,
  ) {
    this.reducedMotion = options.reducedMotion;
    this.lowPerformance = options.lowPerformance ?? false;
    this.root.dataset.lowPerformance = String(this.lowPerformance);
    this.timer = options.timer ?? defaultTimer;
    this.random = options.random ?? Math.random;
    this.playSound = options.playSound;
    this.announce = options.announce;
    this.onEvent = options.onEvent;
  }

  public start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    this.schedule(firstDelay);
  }

  public pause(): void {
    if (this.disposed) return;
    this.paused = true;
    this.clearTimersAndPresentation();
  }

  public resume(): void {
    if (this.disposed || !this.paused) return;
    this.paused = false;
    if (this.started) this.schedule(firstDelay);
  }

  public setReducedMotion(reducedMotion: boolean): void {
    if (this.disposed || this.reducedMotion === reducedMotion) return;
    this.reducedMotion = reducedMotion;

    if (reducedMotion) {
      this.clearScheduledTimer();
      if (this.activeEventId !== 'captain-greeting') {
        this.clearActivePresentation();
      }
      return;
    }

    if (this.started && !this.paused) {
      this.schedule(firstDelay);
    }
  }

  public setLowPerformance(lowPerformance: boolean): void {
    if (this.disposed || this.lowPerformance === lowPerformance) return;
    this.lowPerformance = lowPerformance;
    this.root.dataset.lowPerformance = String(lowPerformance);

    if (lowPerformance && this.activeEventId === 'distant-train') {
      this.clearActivePresentation();
      if (this.started && !this.paused && !this.reducedMotion) {
        this.schedule(nextDelay);
      }
    }
  }

  public requestCaptainGreeting(): boolean {
    if (this.disposed || this.activeEventId === 'captain-greeting') return false;

    this.clearScheduledTimer();
    this.clearActivePresentation();
    this.startEvent('captain-greeting', 1200);
    this.safelyAnnounce('末班车还没开走，准备好就一起出发。');
    return true;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimersAndPresentation();
  }

  private schedule(delay: (random: () => number) => number): void {
    if (
      this.disposed ||
      this.paused ||
      this.reducedMotion ||
      this.timerId !== null
    ) {
      return;
    }

    const delayMs = delay(this.random);
    let timerId!: ReturnType<typeof setTimeout>;
    timerId = this.timer.set(() => {
      if (this.timerId !== timerId) return;
      this.timerId = null;
      this.playAutomaticEvent();
    }, delayMs);
    this.timerId = timerId;
  }

  private chooseEvent(): typeof EVENTS[number] {
    const candidates = EVENTS.filter((event) => (
      event.id !== this.lastAutomaticId
      && (!this.lowPerformance || event.id !== 'distant-train')
    ));
    const index = Math.min(
      candidates.length - 1,
      Math.floor(this.random() * candidates.length),
    );
    return candidates[index] ?? EVENTS[0];
  }

  private playAutomaticEvent(): void {
    if (this.disposed || this.paused || this.reducedMotion || this.activeEventId) {
      return;
    }

    const event = this.chooseEvent();
    this.lastAutomaticId = event.id;
    this.startEvent(event.id, event.durationMs, event.cue);
  }

  private startEvent(
    eventId: StationAmbientEventId,
    durationMs: number,
    cue?: StationAmbientCue,
  ): void {
    this.activeEventId = eventId;
    this.root.dataset.ambientEvent = eventId;
    this.safelyNotifyEvent(eventId);
    if (cue) this.safelyPlaySound(cue);

    if (this.disposed || this.activeEventId !== eventId) return;
    this.armCompletion(eventId, durationMs);
  }

  private armCompletion(eventId: StationAmbientEventId, durationMs: number): void {
    let timerId!: ReturnType<typeof setTimeout>;
    timerId = this.timer.set(() => {
      if (this.activeTimerId !== timerId || this.activeEventId !== eventId) return;
      this.activeTimerId = null;
      this.activeEventId = null;
      delete this.root.dataset.ambientEvent;
      this.schedule(nextDelay);
    }, durationMs);
    this.activeTimerId = timerId;
  }

  private clearScheduledTimer(): void {
    if (this.timerId === null) return;
    this.timer.clear(this.timerId);
    this.timerId = null;
  }

  private clearActivePresentation(): void {
    if (this.activeTimerId !== null) {
      this.timer.clear(this.activeTimerId);
      this.activeTimerId = null;
    }
    this.activeEventId = null;
    delete this.root.dataset.ambientEvent;
  }

  private clearTimersAndPresentation(): void {
    this.clearScheduledTimer();
    this.clearActivePresentation();
  }

  private safelyNotifyEvent(eventId: StationAmbientEventId): void {
    try {
      this.onEvent?.(eventId);
    } catch {
      // Presentation callbacks must not interrupt the scheduling lifecycle.
    }
  }

  private safelyPlaySound(cue: StationAmbientCue): void {
    try {
      this.playSound?.(cue);
    } catch {
      // Presentation callbacks must not interrupt the scheduling lifecycle.
    }
  }

  private safelyAnnounce(message: string): void {
    try {
      this.announce?.(message);
    } catch {
      // Presentation callbacks must not interrupt the scheduling lifecycle.
    }
  }
}
