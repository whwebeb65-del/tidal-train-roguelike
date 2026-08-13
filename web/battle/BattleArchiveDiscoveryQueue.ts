import type { TidalArchiveDiscoveryPresentation } from '../app/AppTypes';

export class BattleArchiveDiscoveryQueue {
  private readonly queued: TidalArchiveDiscoveryPresentation[] = [];
  private readonly keys = new Set<TidalArchiveDiscoveryPresentation['key']>();
  private active: TidalArchiveDiscoveryPresentation | null = null;
  private remainingMs = 0;
  private lastTimestampMs: number | null = null;
  private priorEligible: boolean | null = null;

  public constructor(private readonly displayDurationMs: number) {}

  public enqueue(
    entries: readonly TidalArchiveDiscoveryPresentation[],
  ): void {
    for (const entry of entries) {
      if (this.keys.has(entry.key)) continue;
      this.keys.add(entry.key);
      this.queued.push(entry);
    }
  }

  public update(
    nowMs: number,
    eligible: boolean,
  ): TidalArchiveDiscoveryPresentation | null {
    let elapsedMs = 0;
    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = nowMs;
    } else if (nowMs < this.lastTimestampMs) {
      this.lastTimestampMs = null;
    } else {
      elapsedMs = nowMs - this.lastTimestampMs;
      this.lastTimestampMs = nowMs;
    }

    if (this.priorEligible === true && this.active) this.consume(elapsedMs);
    if (eligible && !this.active) this.activateNext();
    this.priorEligible = eligible;
    return this.active;
  }

  public reset(): void {
    this.queued.length = 0;
    this.keys.clear();
    this.active = null;
    this.remainingMs = 0;
    this.lastTimestampMs = null;
    this.priorEligible = null;
  }

  private consume(elapsedMs: number): void {
    if (!this.active) return;
    if (elapsedMs < this.remainingMs) {
      this.remainingMs -= elapsedMs;
      return;
    }
    this.keys.delete(this.active.key);
    this.active = null;
    this.remainingMs = 0;
  }

  private activateNext(): void {
    const next = this.queued.shift();
    if (!next) return;
    this.active = next;
    this.remainingMs = this.displayDurationMs;
  }
}
