export interface DepartureTimerScheduler {
  set(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setTimeout>;
  clear(id: ReturnType<typeof setTimeout>): void;
}

const browserTimer: DepartureTimerScheduler = {
  set(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clear(id) {
    globalThis.clearTimeout(id);
  },
};

const DEPARTURE_BUTTON_SELECTOR = [
  '[data-action="start-run"]',
  '[data-action="start-daily-trial"]',
].join(', ');

export class StationDepartureController {
  private readonly hero: HTMLElement | null;
  private readonly buttons: readonly HTMLButtonElement[];
  private readonly buttonStates = new Map<HTMLButtonElement, boolean>();
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private completionResolver: ((completed: boolean) => void) | null = null;
  private completionPromise: Promise<boolean> | null = null;
  private token = 0;
  private charging = false;
  private disposed = false;

  public constructor(
    host: ParentNode,
    private readonly reducedMotion: boolean,
    private readonly timer: DepartureTimerScheduler = browserTimer,
  ) {
    this.hero = host.querySelector<HTMLElement>('.station-hero');
    this.buttons = [...host.querySelectorAll<HTMLButtonElement>(
      DEPARTURE_BUTTON_SELECTOR,
    )];
  }

  public beginCharging(): boolean {
    if (this.disposed || !this.hero) return false;
    this.cancel();
    this.charging = true;
    this.hero.dataset.departureState = 'charging';
    this.hero.setAttribute('aria-busy', 'true');
    for (const button of this.buttons) {
      this.buttonStates.set(button, button.disabled);
      button.disabled = true;
    }
    return true;
  }

  public playDeparture(): Promise<boolean> {
    if (this.disposed || !this.hero || !this.charging) {
      return Promise.resolve(false);
    }
    if (this.completionPromise) return this.completionPromise;

    this.hero.dataset.departureState = 'departing';
    const token = ++this.token;
    const durationMs = this.reducedMotion ? 80 : 700;
    const completion = new Promise<boolean>((resolve) => {
      this.completionResolver = resolve;
      this.timerId = this.timer.set(() => {
        if (token !== this.token) return;
        this.timerId = null;
        this.completionResolver = null;
        this.completionPromise = null;
        this.charging = false;
        resolve(true);
      }, durationMs);
    });
    this.completionPromise = completion;
    return completion;
  }

  public cancel(): void {
    this.token += 1;
    const resolve = this.completionResolver;
    if (resolve) resolve(false);
    this.completionResolver = null;
    this.completionPromise = null;
    if (this.timerId !== null) {
      this.timer.clear(this.timerId);
      this.timerId = null;
    }
    this.charging = false;
    this.resetPresentation();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
  }

  private resetPresentation(): void {
    if (this.hero) {
      delete this.hero.dataset.departureState;
      this.hero.removeAttribute('aria-busy');
    }
    for (const [button, disabled] of this.buttonStates) {
      button.disabled = disabled;
    }
    this.buttonStates.clear();
  }
}
