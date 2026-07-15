import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

export type CommerceAdPlacement = 'revive' | 'skill-refresh' | 'reroll' | 'double-settlement';

@ccclass('CommerceController')
export class CommerceController extends Component {
  public requestPurchase(productId: string): void {
    if (!productId.trim()) return;
    this.node.emit('commerce-purchase-requested', productId);
  }

  public requestRewardedAd(placement: CommerceAdPlacement): void {
    this.node.emit('rewarded-ad-requested', placement);
  }
}
