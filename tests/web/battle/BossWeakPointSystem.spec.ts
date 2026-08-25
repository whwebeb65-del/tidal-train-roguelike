import { describe, expect, it } from 'vitest';
import {
  getBossWeakPoint,
  segmentHitsCircle,
} from '../../../web/battle/BossWeakPointSystem';
import type { EnemyState } from '../../../web/battle/BattleTypes';

function boss(weakPointOpen: boolean): EnemyState {
  return {
    id: 7,
    kind: 'deep-echo-boss',
    lane: 1,
    x: 195,
    y: 320,
    hp: 4200,
    maxHp: 4200,
    shield: 0,
    speedPerSecond: 0,
    defenceBroken: false,
    attackCooldownMs: 1000,
    ageMs: 0,
    alive: true,
    behaviour: {
      phase: 'boss-enraged',
      phaseRemainingMs: 900,
      phaseDurationMs: 1800,
      cycle: 1,
      targetLane: 1,
      safeLane: 0,
      invulnerable: false,
      damageTakenMultiplier: 1,
      weakPointOpen,
    },
  };
}

describe('BossWeakPointSystem', () => {
  it('exposes one circle only while the living boss weak point is open', () => {
    expect(getBossWeakPoint(boss(true))).toEqual({
      x: 195,
      y: 328.9,
      radius: 20,
    });
    expect(getBossWeakPoint(boss(false))).toBeNull();
    expect(getBossWeakPoint({ ...boss(true), alive: false })).toBeNull();
  });

  it('accepts a crossing manual trajectory and rejects a body-only path', () => {
    const circle = getBossWeakPoint(boss(true))!;

    expect(segmentHitsCircle(
      { x: 195, y: 690 },
      { x: 195, y: 100 },
      circle,
    )).toBe(true);
    expect(segmentHitsCircle(
      { x: 145, y: 690 },
      { x: 145, y: 100 },
      circle,
    )).toBe(false);
  });
});
