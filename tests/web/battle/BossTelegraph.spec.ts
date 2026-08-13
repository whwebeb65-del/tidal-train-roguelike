import { describe, expect, it } from 'vitest';
import { createBossTelegraphView } from '../../../web/battle/BossTelegraph';
import type { EnemyState } from '../../../web/battle/BattleTypes';

function boss(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 77, kind: 'deep-echo-boss', alive: true,
    lane: 1, x: 195, y: 250, hp: 800, maxHp: 1000,
    shield: 0, speedPerSecond: 0, defenceBroken: false,
    attackCooldownMs: 1000, ageMs: 0,
    behaviour: {
      phase: 'boss-summon', phaseRemainingMs: 8000, cycle: 1,
      targetLane: 1, safeLane: 2, invulnerable: false,
      damageTakenMultiplier: 1, weakPointOpen: false,
    },
    ...overrides,
  };
}

describe('boss telegraph semantic model', () => {
  it('maps the three authoritative phases without inventing gameplay state', () => {
    const summon = createBossTelegraphView({ enemy: boss(), timeMs: 900, reducedMotion: false, backgroundLayers: 4 });
    const tide = createBossTelegraphView({
      enemy: boss({ behaviour: { ...boss().behaviour!, phase: 'boss-tide', phaseRemainingMs: 600 } }),
      timeMs: 900, reducedMotion: false, backgroundLayers: 3,
    });
    const enraged = createBossTelegraphView({
      enemy: boss({ behaviour: { ...boss().behaviour!, phase: 'boss-enraged', phaseRemainingMs: 700, weakPointOpen: true } }),
      timeMs: 900, reducedMotion: false, backgroundLayers: 2,
    });
    expect(summon).toMatchObject({ phase: 'summon', detail: 3, tideWarning: false, weakPointOpen: false });
    expect(tide).toMatchObject({ phase: 'tide', detail: 2, tideWarning: true, safeLane: 2 });
    expect(enraged).toMatchObject({ phase: 'enraged', detail: 1, weakPointOpen: true });
    expect(Object.isFrozen(summon)).toBe(true);
  });

  it('returns null for dead, non-boss, missing-behaviour, and non-boss phases', () => {
    expect(createBossTelegraphView({ enemy: boss({ alive: false }), timeMs: 0, reducedMotion: false, backgroundLayers: 4 })).toBeNull();
    expect(createBossTelegraphView({ enemy: boss({ kind: 'bubble-fin' }), timeMs: 0, reducedMotion: false, backgroundLayers: 4 })).toBeNull();
    expect(createBossTelegraphView({ enemy: boss({ behaviour: undefined }), timeMs: 0, reducedMotion: false, backgroundLayers: 4 })).toBeNull();
    expect(createBossTelegraphView({ enemy: boss({ behaviour: { ...boss().behaviour!, phase: 'advance' } }), timeMs: 0, reducedMotion: false, backgroundLayers: 4 })).toBeNull();
  });

  it('clamps progress and freezes motion for reduced motion', () => {
    const reduced = createBossTelegraphView({ enemy: boss({ behaviour: { ...boss().behaviour!, phaseRemainingMs: 4000 } }), timeMs: 5000, reducedMotion: true, backgroundLayers: 4 });
    const invalid = createBossTelegraphView({ enemy: boss({ behaviour: { ...boss().behaviour!, phaseRemainingMs: Number.NaN } }), timeMs: Number.NaN, reducedMotion: false, backgroundLayers: 4 });
    expect(reduced).toMatchObject({ progress: 0.5, motionPhase: 0 });
    expect(invalid).toMatchObject({ progress: 0, motionPhase: 0 });
    expect(invalid!.progress).toBeGreaterThanOrEqual(0);
    expect(invalid!.progress).toBeLessThanOrEqual(1);
  });
});
