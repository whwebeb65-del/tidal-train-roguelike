export interface PageVisibilitySource {
  readonly hidden: boolean;
  addEventListener(
    type: 'visibilitychange',
    listener: () => void,
  ): void;
  removeEventListener(
    type: 'visibilitychange',
    listener: () => void,
  ): void;
}

export interface PageLifecycleCallbacks {
  onHidden(): void;
  onVisible(): void;
}

export class PageLifecycleController {
  private started = false;

  private readonly onVisibilityChange = (): void => {
    if (this.source.hidden) {
      this.callbacks.onHidden();
      return;
    }
    this.callbacks.onVisible();
  };

  public constructor(
    private readonly source: PageVisibilitySource,
    private readonly callbacks: PageLifecycleCallbacks,
  ) {}

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.source.addEventListener(
      'visibilitychange',
      this.onVisibilityChange,
    );
    if (this.source.hidden) this.callbacks.onHidden();
  }

  public dispose(): void {
    if (!this.started) return;
    this.started = false;
    this.source.removeEventListener(
      'visibilitychange',
      this.onVisibilityChange,
    );
  }
}
