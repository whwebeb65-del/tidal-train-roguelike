export type RewardedPlacement = 'revive' | 'double-settlement' | 'reroll';
export type AdResult = 'completed' | 'closed' | 'failed';

export interface IPlatformLogin {
  getUserId(): Promise<string>;
}

export interface IAds {
  showRewardedAd(placement: RewardedPlacement): Promise<AdResult>;
}

export interface IStore {
  purchase(productId: string): Promise<'success' | 'cancelled' | 'failed'>;
}

export interface IAnalytics {
  track(event: string, payload: Record<string, string | number | boolean>): void;
}

export interface IShare {
  share(): Promise<boolean>;
}
