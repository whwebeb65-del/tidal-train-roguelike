import type {
  AdResult,
  IAds,
  IAnalytics,
  IShare,
  IStore,
  PurchaseResult,
  RewardedPlacement,
  SharePayload,
  ShareResult,
} from './PlatformContracts';

export class MockAds implements IAds {
  public readonly placements: RewardedPlacement[] = [];

  public constructor(private readonly result: AdResult) {}

  public showRewardedAd(placement: RewardedPlacement): Promise<AdResult> {
    this.placements.push(placement);
    return Promise.resolve(this.result);
  }
}

export class MockStore implements IStore {
  public readonly purchases: string[] = [];

  public constructor(private readonly result: 'verified' | 'cancelled' | 'failed') {}

  public purchase(productId: string): Promise<PurchaseResult> {
    if (this.result === 'verified') {
      this.purchases.push(productId);
      return Promise.resolve({
        status: 'verified',
        transactionId: `mock-${productId}-${this.purchases.length}`,
      });
    }
    return Promise.resolve({ status: this.result });
  }
}

export interface MockAnalyticsEvent {
  readonly event: string;
  readonly payload: Record<string, string | number | boolean>;
}

export class MockAnalytics implements IAnalytics {
  public readonly events: MockAnalyticsEvent[] = [];

  public track(event: string, payload: Record<string, string | number | boolean>): void {
    this.events.push({ event, payload: { ...payload } });
  }
}

export class MockShare implements IShare {
  public readonly payloads: SharePayload[] = [];

  public constructor(private readonly result: ShareResult) {}

  public share(payload: SharePayload): Promise<ShareResult> {
    this.payloads.push({ ...payload, passengers: [...payload.passengers], modules: [...payload.modules] });
    return Promise.resolve(this.result);
  }
}
