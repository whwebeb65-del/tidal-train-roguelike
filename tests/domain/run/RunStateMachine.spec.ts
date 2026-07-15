import { describe, expect, it } from 'vitest';
import { createRun, transition } from '../../../src/domain/run/RunStateMachine';

describe('RunStateMachine', () => {
  it('moves through a complete run path', () => {
    let run = createRun(7);
    run = transition(run, { type: 'START_RUN' });
    run = transition(run, { type: 'CHOOSE_ROUTE' });
    run = transition(run, { type: 'ENTER_COMBAT' });
    run = transition(run, { type: 'COMBAT_WON' });
    expect(run.phase).toBe('RewardChoice');
  });

  it('rejects events that do not belong to the current phase', () => {
    const run = createRun(7);
    expect(() => transition(run, { type: 'BOSS_WON' })).toThrow('Invalid run transition');
  });

  it('marks a run settled after victory and reaches station on return', () => {
    let run = createRun(7);
    run = transition(run, { type: 'START_RUN' });
    run = transition(run, { type: 'CHOOSE_ROUTE' });
    run = transition(run, { type: 'ENTER_BOSS' });
    run = transition(run, { type: 'BOSS_WON' });
    expect(run.phase).toBe('Settlement');
    expect(run.settled).toBe(true);
    run = transition(run, { type: 'RETURN_TO_STATION' });
    expect(run.phase).toBe('Station');
    expect(run.settled).toBe(true);
  });

  it('does not mutate the previous session', () => {
    const initial = createRun(9);
    const next = transition(initial, { type: 'START_RUN' });
    expect(initial.phase).toBe('Lobby');
    expect(next.phase).toBe('RunStart');
  });
});
