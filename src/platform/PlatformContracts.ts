export type RewardedPlacement = 'revive' | 'double-settlement' | 'reroll' | 'skill-refresh';
export type AdResult = 'completed' | 'closed' | 'failed';
export type ShareResult = 'completed' | 'cancelled' | 'failed';

export interface SharePayload {
  readonly shareType?: 'recovery' | 'squad-invite';
  readonly mapId: string;
  readonly depth: number;
  readonly passengers: readonly string[];
  readonly modules: readonly string[];
  readonly failureReason: string;
  readonly cta: string;
}

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
  share(payload: SharePayload): Promise<ShareResult>;
}
