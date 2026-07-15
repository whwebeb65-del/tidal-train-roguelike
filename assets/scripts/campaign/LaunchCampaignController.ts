import { _decorator, Component, EventTarget } from 'cc';

const { ccclass } = _decorator;

export interface LaunchCampaignPorts {
  onBetaApplicationRequested(): void;
  onBetaGiftClaimRequested(): void;
  onLaunchGiftClaimRequested(): void;
  onGiftCodeRedeemRequested(rawCode: string): void;
}

@ccclass('LaunchCampaignController')
export class LaunchCampaignController extends Component implements LaunchCampaignPorts {
  public readonly events = new EventTarget();

  public onBetaApplicationRequested(): void {
    this.events.emit('beta-application-requested');
  }

  public onBetaGiftClaimRequested(): void {
    this.events.emit('beta-gift-claim-requested');
  }

  public onLaunchGiftClaimRequested(): void {
    this.events.emit('launch-gift-claim-requested');
  }

  public onGiftCodeRedeemRequested(rawCode: string): void {
    this.events.emit('gift-code-redeem-requested', { rawCode });
  }
}
