import { describe, expect, it } from 'vitest';
import {
  createCombatLoopState,
  receiveDamage,
  resolveCombatAction,
} from '../../../src/domain/combat/CombatLoopSystem';

describe('CombatLoopSystem', () => {
  it('builds attack momentum and combo damage', () => {
    const result = resolveCombatAction(createCombatLoopState({ enemyHp: 200 }), 'attack', { skillAvailable: true });

    expect(result.accepted).toBe(true);
    expect(result.damageDealt).toBe(25);
    expect(result.state.enemyHp).toBe(175);
    expect(result.state.momentum).toBe(25);
    expect(result.state.combo).toBe(1);
  });

  it('requires an available skill charge and uses the echo modifier', () => {
    const state = createCombatLoopState({ enemyHp: 200, modifier: 'echo-fog' });
    const blocked = resolveCombatAction(state, 'skill', { skillAvailable: false });
    const result = resolveCombatAction(state, 'skill', { skillAvailable: true });

    expect(blocked.accepted).toBe(false);
    expect(blocked.reason).toBe('skill-unavailable');
    expect(result.accepted).toBe(true);
    expect(result.damageDealt).toBe(60);
    expect(result.state.momentum).toBe(40);
    expect(result.state.combo).toBe(2);
  });

  it('allows one capped repair per node and resets combo', () => {
    const start = createCombatLoopState({ enemyHp: 200, playerHp: 50, initialMomentum: 40, initialCombo: 3 });
    const repaired = resolveCombatAction(start, 'repair', { skillAvailable: true });
    const repeated = resolveCombatAction(repaired.state, 'repair', { skillAvailable: true });

    expect(repaired.accepted).toBe(true);
    expect(repaired.hpRestored).toBe(24);
    expect(repaired.state.playerHp).toBe(74);
    expect(repaired.state.momentum).toBe(25);
    expect(repaired.state.combo).toBe(0);
    expect(repeated.accepted).toBe(false);
    expect(repeated.reason).toBe('repair-used');
  });

  it('unlocks one tidal burst at full momentum', () => {
    let state = createCombatLoopState({ enemyHp: 500 });
    const notReady = resolveCombatAction(state, 'burst', { skillAvailable: true });
    expect(notReady.reason).toBe('momentum-not-ready');

    for (let index = 0; index < 4; index += 1) {
      state = resolveCombatAction(state, 'attack', { skillAvailable: true }).state;
    }

    const burst = resolveCombatAction(state, 'burst', { skillAvailable: true });
    const repeated = resolveCombatAction(burst.state, 'burst', { skillAvailable: true });
    expect(burst.accepted).toBe(true);
    expect(burst.damageDealt).toBe(60);
    expect(burst.state.momentum).toBe(0);
    expect(burst.state.burstUsed).toBe(true);
    expect(repeated.reason).toBe('burst-used');
  });

  it('changes attack tuning for surge current', () => {
    const result = resolveCombatAction(
      createCombatLoopState({ enemyHp: 200, modifier: 'surge-current' }),
      'attack',
      { skillAvailable: true },
    );

    expect(result.damageDealt).toBe(30);
  });

  it('rejects actions after the enemy is defeated and clamps incoming damage', () => {
    const defeated = resolveCombatAction(createCombatLoopState({ enemyHp: 1 }), 'attack', { skillAvailable: true });
    const rejected = resolveCombatAction(defeated.state, 'attack', { skillAvailable: true });
    const damaged = receiveDamage(defeated.state, 999);

    expect(defeated.defeated).toBe(true);
    expect(rejected.accepted).toBe(false);
    expect(rejected.reason).toBe('enemy-defeated');
    expect(damaged.playerHp).toBe(0);
  });
});
