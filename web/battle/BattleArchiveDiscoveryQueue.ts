import type { TidalArchiveDiscoveryPresentation } from '../app/AppTypes';

export class BattleArchiveDiscoveryQueue {
  private readonly queued: TidalArchiveDiscoveryPresentation[] = [];
  private readonly keys = new Set<TidalArchiveDiscoveryPresentation['key']>();
  private active: TidalArchiveDiscoveryPresentation | null = null;
  private remainingMs = 0;
  private lastTimestampMs: number | null = null;

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
    const elapsedMs = this.lastTimestampMs === null
      ? 0
      : Math.max(0, nowMs - this.lastTimestampMs);
    this.lastTimestampMs = nowMs;

    if (eligible && this.active) this.consume(elapsedMs);
    if (eligible && !this.active) this.activateNext();
    return this.active;
  }

  public reset(): void {
    this.queued.length = 0;
    this.keys.clear();
    this.active = null;
    this.remainingMs = 0;
    this.lastTimestampMs = null;
  }

  private consume(elapsedMs: number): void {
    let remainingElapsedMs = elapsedMs;
    while (this.active && remainingElapsedMs >= this.remainingMs) {
      remainingElapsedMs -= this.remainingMs;
      this.keys.delete(this.active.key);
      this.active = null;
      this.remainingMs = 0;
      this.activateNext();
    }
    if (this.active) this.remainingMs -= remainingElapsedMs;
  }

  private activateNext(): void {
    const next = this.queued.shift();
    if (!next) return;
    this.active = next;
    this.remainingMs = this.displayDurationMs;
  }
}
