import { describe, expect, it } from 'vitest';
import type { TidalArchiveDiscoveryPresentation } from '../../../web/app/AppTypes';
import { BattleArchiveDiscoveryQueue } from '../../../web/battle/BattleArchiveDiscoveryQueue';
import { getAvailableBattleInteractions } from '../../../web/battle/BattleInteractionSchedule';

const A: TidalArchiveDiscoveryPresentation = Object.freeze({
  key: 'enemy:bubble-fin',
  entryType: 'enemy',
  entryId: 'bubble-fin',
  name: '泡鳍怪',
  artUrl: '/archive/bubble-fin.webp',
});

const B: TidalArchiveDiscoveryPresentation = Object.freeze({
  key: 'enemy:needle-jelly',
  entryType: 'enemy',
  entryId: 'needle-jelly',
  name: '针刺水母',
  artUrl: '/archive/needle-jelly.webp',
});

describe('BattleArchiveDiscoveryQueue', () => {
  it('shows queued entries for exactly 2400ms of eligible time in FIFO order', () => {
    const queue = new BattleArchiveDiscoveryQueue(2400);
    queue.enqueue([A, B]);

    expect(queue.update(0, true)).toBe(A);
    expect(queue.update(2399, true)).toBe(A);
    expect(queue.update(2400, true)).toBe(B);
    expect(queue.update(4800, true)).toBeNull();
  });

  it('uses the first update only as a timestamp baseline', () => {
    const queue = new BattleArchiveDiscoveryQueue(2400);
    queue.enqueue([A]);

    expect(queue.update(10_000, true)).toBe(A);
    expect(queue.update(12_399, true)).toBe(A);
    expect(queue.update(12_400, true)).toBeNull();
  });

  it('does not activate or consume entries while ineligible', () => {
    const queue = new BattleArchiveDiscoveryQueue(2400);
    queue.enqueue([A]);

    expect(queue.update(0, false)).toBeNull();
    expect(queue.update(8_000, false)).toBeNull();
    expect(queue.update(9_000, true)).toBe(A);
    expect(queue.update(11_399, true)).toBe(A);
    expect(queue.update(11_400, true)).toBeNull();
  });

  it('pauses the active entry budget while ineligible', () => {
    const queue = new BattleArchiveDiscoveryQueue(2400);
    queue.enqueue([A]);

    expect(queue.update(0, true)).toBe(A);
    expect(queue.update(1_000, true)).toBe(A);
    expect(queue.update(1_000, false)).toBeNull();
    expect(queue.update(9_000, false)).toBeNull();
    expect(queue.update(9_000, true)).toBe(A);
    expect(queue.update(10_399, true)).toBe(A);
    expect(queue.update(10_400, true)).toBeNull();
  });

  it('attributes a transition interval to the previous eligibility state', () => {
    const queue = new BattleArchiveDiscoveryQueue(2400);
    queue.enqueue([A, B]);

    expect(queue.update(0, true)).toBe(A);
    expect(queue.update(1_000, false)).toBeNull();
    expect(queue.update(9_000, true)).toBe(A);
    expect(queue.update(10_399, true)).toBe(A);
    expect(queue.update(10_400, true)).toBe(B);
  });

  it('pauses visible budget for a real normal interaction and resumes after its final claim', () => {
    const queue = new BattleArchiveDiscoveryQueue(2400);
    const isEligible = (
      elapsedMs: number,
      salvageClaims = 0,
    ): boolean => getAvailableBattleInteractions(
      elapsedMs,
      { 'salvage-a': salvageClaims },
      'normal',
    ).length === 0;
    queue.enqueue([A]);

    expect(isEligible(17_999)).toBe(true);
    expect(queue.update(0, isEligible(17_999))).toBe(A);
    expect(getAvailableBattleInteractions(18_000, {}, 'normal')[0])
      .toMatchObject({ actionId: 'salvage-a', attempt: 0 });
    expect(queue.update(1_000, isEligible(18_000))).toBeNull();
    expect(queue.update(9_000, isEligible(18_000, 1))).toBeNull();
    expect(queue.update(9_000, isEligible(18_000, 2))).toBe(A);
    expect(queue.update(10_399, true)).toBe(A);
    expect(queue.update(10_400, true)).toBeNull();
  });

  it('does not carry long-frame overshoot into an entry that was not visible', () => {
    const queue = new BattleArchiveDiscoveryQueue(2400);
    queue.enqueue([A, B]);

    expect(queue.update(0, true)).toBe(A);
    expect(queue.update(5_000, true)).toBe(B);
    expect(queue.update(7_399, true)).toBe(B);
    expect(queue.update(7_400, true)).toBeNull();
  });

  it('rebases safely when the timestamp rolls backward', () => {
    const queue = new BattleArchiveDiscoveryQueue(2400);
    queue.enqueue([A]);

    expect(queue.update(10_000, true)).toBe(A);
    expect(queue.update(11_000, true)).toBe(A);
    expect(queue.update(500, true)).toBe(A);
    expect(queue.update(1_899, true)).toBe(A);
    expect(queue.update(1_900, true)).toBeNull();
  });

  it('suppresses duplicate active and queued keys but permits a later enqueue after expiry', () => {
    const queue = new BattleArchiveDiscoveryQueue(2400);
    queue.enqueue([A, A, B, B]);

    expect(queue.update(0, true)).toBe(A);
    queue.enqueue([A, B]);
    expect(queue.update(2400, true)).toBe(B);
    expect(queue.update(4800, true)).toBeNull();

    queue.enqueue([A]);
    expect(queue.update(4800, true)).toBe(A);
  });

  it('reset clears active, queued, key, and timestamp state', () => {
    const queue = new BattleArchiveDiscoveryQueue(2400);
    queue.enqueue([A, B]);
    expect(queue.update(4_000, true)).toBe(A);

    queue.reset();
    expect(queue.update(20_000, true)).toBeNull();

    queue.enqueue([A]);
    expect(queue.update(30_000, true)).toBe(A);
    expect(queue.update(32_399, true)).toBe(A);
    expect(queue.update(32_400, true)).toBeNull();
  });
});
