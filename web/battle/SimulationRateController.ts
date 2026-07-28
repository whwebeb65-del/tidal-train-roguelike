import type { BattleSpeed } from '../../src/domain/progression/AccountProgressionSystem';

export class SimulationRateController {
  private remainderMs = 0;

  public constructor(
    private readonly fixedStepMs: number,
    private speed: BattleSpeed = 1,
    private readonly maxCatchUpSteps = 5,
  ) {}

  public setSpeed(speed: BattleSpeed): void {
    this.speed = speed;
  }

  public consume(
    realStepMs: number,
    updateWorld: (stepMs: number) => void,
  ): void {
    this.remainderMs += realStepMs * this.speed;
    let steps = 0;
    while (
      this.remainderMs + this.fixedStepMs * 1e-9 >= this.fixedStepMs
      && steps < this.maxCatchUpSteps
    ) {
      updateWorld(this.fixedStepMs);
      this.remainderMs -= this.fixedStepMs;
      if (Math.abs(this.remainderMs) < this.fixedStepMs * 1e-9) {
        this.remainderMs = 0;
      }
      steps += 1;
    }
  }
}
