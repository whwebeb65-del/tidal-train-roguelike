export interface FixedStepLoopOptions {
  readonly stepMs: number;
  readonly maxFrameDeltaMs: number;
  readonly maxStepsPerFrame: number;
  readonly update: (stepMs: number) => void;
  readonly render: (alpha: number) => void;
}

export class FixedStepLoop {
  private running = true;
  private previousTimeMs: number | null = null;
  private accumulatorMs = 0;

  public constructor(private readonly options: FixedStepLoopOptions) {
    assertPositive(options.stepMs, 'Fixed step');
    assertPositive(options.maxFrameDeltaMs, 'Maximum frame delta');
    if (
      !Number.isInteger(options.maxStepsPerFrame)
      || options.maxStepsPerFrame <= 0
    ) {
      throw new Error('Maximum steps per frame must be a positive integer');
    }
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.previousTimeMs = null;
    this.accumulatorMs = 0;
  }

  public stop(): void {
    this.running = false;
    this.previousTimeMs = null;
    this.accumulatorMs = 0;
  }

  public frame(nowMs: number): void {
    if (!this.running) return;
    if (!Number.isFinite(nowMs)) {
      throw new Error('Frame time must be finite');
    }
    if (this.previousTimeMs === null) {
      this.previousTimeMs = nowMs;
      this.options.render(0);
      return;
    }

    const frameDeltaMs = Math.min(
      this.options.maxFrameDeltaMs,
      Math.max(0, nowMs - this.previousTimeMs),
    );
    this.previousTimeMs = nowMs;
    this.accumulatorMs += frameDeltaMs;

    let steps = 0;
    while (
      this.accumulatorMs >= this.options.stepMs
      && steps < this.options.maxStepsPerFrame
    ) {
      this.options.update(this.options.stepMs);
      this.accumulatorMs -= this.options.stepMs;
      steps += 1;
    }
    if (
      steps === this.options.maxStepsPerFrame
      && this.accumulatorMs >= this.options.stepMs
    ) {
      this.accumulatorMs %= this.options.stepMs;
    }
    this.options.render(
      Math.min(0.999999, this.accumulatorMs / this.options.stepMs),
    );
  }
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive`);
  }
}
