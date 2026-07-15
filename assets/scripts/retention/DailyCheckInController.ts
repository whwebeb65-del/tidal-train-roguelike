import { _decorator, Component, EventTarget } from 'cc';

const { ccclass } = _decorator;

export interface DailyCheckInPorts {
  onDailyCheckInClaimRequested(): void;
}

@ccclass('DailyCheckInController')
export class DailyCheckInController extends Component implements DailyCheckInPorts {
  public readonly events = new EventTarget();

  public onDailyCheckInClaimRequested(): void {
    this.events.emit('daily-check-in-claim-requested');
  }
}
