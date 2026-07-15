import { _decorator, Component, EventTarget } from 'cc';
import type { DailyTrialMilestoneId } from '../../../src/domain/challenge/DailyTrialSystem';

const { ccclass } = _decorator;

export interface DailyTrialPorts {
  onDailyTrialStartRequested(): void;
  onDailyTrialSubmitRequested(runId: string): void;
  onDailyTrialRewardClaimRequested(milestoneId: DailyTrialMilestoneId): void;
  onDailyTrialShareRequested(): void;
}

@ccclass('DailyTrialController')
export class DailyTrialController extends Component implements DailyTrialPorts {
  public readonly events = new EventTarget();

  public onDailyTrialStartRequested(): void {
    this.events.emit('daily-trial-start-requested');
  }

  public onDailyTrialSubmitRequested(runId: string): void {
    this.events.emit('daily-trial-submit-requested', runId);
  }

  public onDailyTrialRewardClaimRequested(milestoneId: DailyTrialMilestoneId): void {
    this.events.emit('daily-trial-reward-claim-requested', milestoneId);
  }

  public onDailyTrialShareRequested(): void {
    this.events.emit('daily-trial-share-requested');
  }
}
