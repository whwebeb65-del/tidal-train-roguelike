import type { AdResult, IAds, RewardedPlacement } from './PlatformContracts';

export class MockAds implements IAds {
  public constructor(private readonly result: AdResult) {}

  public showRewardedAd(_placement: RewardedPlacement): Promise<AdResult> {
    return Promise.resolve(this.result);
  }
}
