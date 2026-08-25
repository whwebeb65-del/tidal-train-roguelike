import { describe, expect, it } from 'vitest';
import {
  advanceEnemyBehaviour,
  createEnemyBehaviour,
} from '../../../web/battle/EnemyBehaviourSystem';

describe('EnemyBehaviourSystem', () => {
  it('moves hatchlings between adjacent lanes on deterministic cycles', () => {
    const initial = createEnemyBehaviour('tide-shell-hatchling', 7, 1);
    const first = advanceEnemyBehaviour({
      kind: 'tide-shell-hatchling',
      enemyId: 7,
      lane: 1,
      hpRatio: 1,
      stepMs: 2000,
      state: initial,
    });
    const repeated = advanceEnemyBehaviour({
      kind: 'tide-shell-hatchling',
      enemyId: 7,
      lane: 1,
      hpRatio: 1,
      stepMs: 2000,
      state: initial,
    });

    expect(first).toEqual(repeated);
    expect(first.intent.targetLane).toBe(0);
    expect(first.state.cycle).toBe(1);
  });

  it('charges lantern shots before firing and pulses snail shields without stacking time', () => {
    const lantern = createEnemyBehaviour('lantern-ray', 4, 1);
    const warning = advanceEnemyBehaviour({
      kind: 'lantern-ray', enemyId: 4, lane: 1, hpRatio: 1,
      stepMs: 1700, state: lantern,
    });
    expect(warning.state.phase).toBe('lantern-charge');
    expect(warning.intent.rangedWarning).toBe(true);

    const fired = advanceEnemyBehaviour({
      kind: 'lantern-ray', enemyId: 4, lane: 1, hpRatio: 1,
      stepMs: 800, state: warning.state,
    });
    expect(fired.intent.rangedFire).toBe(true);
    expect(fired.state.phase).toBe('advance');

    const snail = advanceEnemyBehaviour({
      kind: 'tide-parasite-snail', enemyId: 5, lane: 2, hpRatio: 1,
      stepMs: 2000,
      state: createEnemyBehaviour('tide-parasite-snail', 5, 2),
    });
    expect(snail.intent.supportPulse).toBe(true);
    expect(snail.state.cycle).toBe(1);
  });

  it('orders elite telegraph, invulnerable charge and exposed recovery', () => {
    const initial = createEnemyBehaviour('storm-ray-elite', 9, 1);
    const warning = advanceEnemyBehaviour({
      kind: 'storm-ray-elite', enemyId: 9, lane: 1, hpRatio: 1,
      stepMs: 4000, state: initial,
    });
    expect(warning.state.phase).toBe('elite-telegraph');
    expect(warning.intent.eliteWarning).toBe(true);

    const charging = advanceEnemyBehaviour({
      kind: 'storm-ray-elite', enemyId: 9, lane: 1, hpRatio: 1,
      stepMs: 800, state: warning.state,
    });
    expect(charging.state.phase).toBe('elite-charge');
    expect(charging.state.invulnerable).toBe(true);

    const exposed = advanceEnemyBehaviour({
      kind: 'storm-ray-elite', enemyId: 9, lane: 1, hpRatio: 1,
      stepMs: 450, state: charging.state,
    });
    expect(exposed.state.phase).toBe('elite-exposed');
    expect(exposed.state.damageTakenMultiplier).toBe(1.25);
    expect(exposed.intent.eliteExposed).toBe(true);
  });

  it('moves the boss monotonically through summon, tide and enraged phases', () => {
    const initial = createEnemyBehaviour('deep-echo-boss', 20, 1);
    const tide = advanceEnemyBehaviour({
      kind: 'deep-echo-boss', enemyId: 20, lane: 1, hpRatio: 0.6,
      stepMs: 1000, state: initial,
    });
    expect(tide.state.phase).toBe('boss-tide');
    expect([0, 1, 2]).toContain(tide.state.safeLane);
    expect(tide.intent.bossPhaseChanged).toBe('boss-tide');

    const enraged = advanceEnemyBehaviour({
      kind: 'deep-echo-boss', enemyId: 20, lane: 1, hpRatio: 0.34,
      stepMs: 1000, state: tide.state,
    });
    expect(enraged.state.phase).toBe('boss-enraged');
    expect(enraged.state.weakPointOpen).toBe(true);

    const cannotRegress = advanceEnemyBehaviour({
      kind: 'deep-echo-boss', enemyId: 20, lane: 1, hpRatio: 0.9,
      stepMs: 1000, state: enraged.state,
    });
    expect(cannotRegress.state.phase).toBe('boss-enraged');
  });

  it('records the authoritative duration for every boss timing window', () => {
    const initial = createEnemyBehaviour('deep-echo-boss', 20, 1);
    expect(initial).toMatchObject({
      phase: 'boss-summon',
      phaseRemainingMs: 8000,
      phaseDurationMs: 8000,
    });

    const tide = advanceEnemyBehaviour({
      kind: 'deep-echo-boss', enemyId: 20, lane: 1, hpRatio: 0.6,
      stepMs: 0, state: initial,
    });
    expect(tide.state).toMatchObject({
      phase: 'boss-tide', phaseRemainingMs: 3600, phaseDurationMs: 3600,
    });

    const warning = advanceEnemyBehaviour({
      kind: 'deep-echo-boss', enemyId: 20, lane: 1, hpRatio: 0.6,
      stepMs: 3600, state: tide.state,
    });
    expect(warning.intent.tideWarning).toBe(true);
    expect(warning.state).toMatchObject({
      phase: 'boss-tide', phaseRemainingMs: 1200, phaseDurationMs: 1200,
    });

    const firstOpen = advanceEnemyBehaviour({
      kind: 'deep-echo-boss', enemyId: 20, lane: 1, hpRatio: 0.34,
      stepMs: 0, state: warning.state,
    });
    expect(firstOpen.state).toMatchObject({
      phase: 'boss-enraged', weakPointOpen: true,
      phaseRemainingMs: 1800, phaseDurationMs: 1800,
    });

    const closed = advanceEnemyBehaviour({
      kind: 'deep-echo-boss', enemyId: 20, lane: 1, hpRatio: 0.34,
      stepMs: 1800, state: firstOpen.state,
    });
    expect(closed.state).toMatchObject({
      weakPointOpen: false, phaseRemainingMs: 1800, phaseDurationMs: 1800,
    });

    const nextOpen = advanceEnemyBehaviour({
      kind: 'deep-echo-boss', enemyId: 20, lane: 1, hpRatio: 0.34,
      stepMs: 1800, state: closed.state,
    });
    expect(nextOpen.state).toMatchObject({
      weakPointOpen: true, phaseRemainingMs: 1400, phaseDurationMs: 1400,
    });
  });

  it('rejects invalid time steps', () => {
    expect(() => advanceEnemyBehaviour({
      kind: 'bubble-fin', enemyId: 1, lane: 0, hpRatio: 1,
      stepMs: Number.NaN,
      state: createEnemyBehaviour('bubble-fin', 1, 0),
    })).toThrow('finite and non-negative');
  });
});
