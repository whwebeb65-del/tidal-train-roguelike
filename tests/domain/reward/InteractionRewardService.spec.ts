import { describe, expect, it } from 'vitest';
import {
  claimInteractionReward,
  createInteractionState,
} from '../../../src/domain/reward/InteractionRewardService';

describe('InteractionRewardService', () => {
  it('allows different interaction points to reward within one run', () => {
    const state = createInteractionState();
    const first = claimInteractionReward(state, {
      runId: 'run-1',
      actionId: 'salvage-a',
      attempt: 0,
      definition: { actionId: 'salvage-a', currency: 'gears', amount: 5, maxClaims: 2 },
    });
    const second = claimInteractionReward(first.state, {
      runId: 'run-1',
      actionId: 'aid-b',
      attempt: 0,
      definition: { actionId: 'aid-b', currency: 'routeMarks', amount: 1, maxClaims: 1 },
    });
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
  });

  it('allows a second distinct attempt for the same interaction point', () => {
    const definition = { actionId: 'salvage-a', currency: 'gears' as const, amount: 5, maxClaims: 2 };
    const first = claimInteractionReward(createInteractionState(), {
      runId: 'run-1', actionId: 'salvage-a', attempt: 0, definition,
    });
    const second = claimInteractionReward(first.state, {
      runId: 'run-1', actionId: 'salvage-a', attempt: 1, definition,
    });
    expect(second.accepted).toBe(true);
    expect(second.amount).toBe(5);
  });

  it('does not pay twice for the same click claim', () => {
    const input = {
      runId: 'run-1', actionId: 'salvage-a', attempt: 0,
      definition: { actionId: 'salvage-a', currency: 'gears' as const, amount: 5, maxClaims: 2 },
    };
    const first = claimInteractionReward(createInteractionState(), input);
    const retry = claimInteractionReward(first.state, input);
    expect(retry.alreadyClaimed).toBe(true);
    expect(retry.amount).toBe(0);
  });

  it('rejects attempts beyond the interaction limit', () => {
    const result = claimInteractionReward(createInteractionState(), {
      runId: 'run-1', actionId: 'salvage-a', attempt: 2,
      definition: { actionId: 'salvage-a', currency: 'gears', amount: 5, maxClaims: 2 },
    });
    expect(result.accepted).toBe(false);
    expect(result.amount).toBe(0);
  });
});
