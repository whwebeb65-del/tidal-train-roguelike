export type RewardCurrency = 'gears' | 'routeMarks' | 'starTickets';

export interface InteractionRewardDefinition {
  readonly actionId: string;
  readonly currency: RewardCurrency;
  readonly amount: number;
  readonly maxClaims: number;
}

export interface InteractionState {
  readonly claimedClaimIds: readonly string[];
}

export interface InteractionClaimInput {
  readonly runId: string;
  readonly actionId: string;
  readonly attempt: number;
  readonly definition: InteractionRewardDefinition;
}

export interface InteractionClaimResult {
  readonly state: InteractionState;
  readonly accepted: boolean;
  readonly alreadyClaimed: boolean;
  readonly claimId: string;
  readonly currency: RewardCurrency;
  readonly amount: number;
}

function validateInput(input: InteractionClaimInput): void {
  if (input.runId.trim().length === 0 || input.actionId.trim().length === 0) {
    throw new Error('Run id and action id are required');
  }
  if (input.definition.actionId !== input.actionId) {
    throw new Error('Interaction action id mismatch');
  }
  if (!Number.isInteger(input.attempt) || input.attempt < 0) {
    throw new Error('Interaction attempt must be a non-negative integer');
  }
  if (!Number.isInteger(input.definition.maxClaims) || input.definition.maxClaims <= 0) {
    throw new Error('Interaction max claims must be a positive integer');
  }
  if (!Number.isFinite(input.definition.amount) || input.definition.amount < 0) {
    throw new Error('Interaction amount must be a finite non-negative number');
  }
}

export function createInteractionState(): InteractionState {
  return { claimedClaimIds: [] };
}

export function claimInteractionReward(
  state: InteractionState,
  input: InteractionClaimInput,
): InteractionClaimResult {
  validateInput(input);
  const claimId = `${input.runId}:${input.actionId}:${input.attempt}`;
  const alreadyClaimed = state.claimedClaimIds.includes(claimId);

  if (alreadyClaimed) {
    return {
      state: { claimedClaimIds: [...state.claimedClaimIds] },
      accepted: false,
      alreadyClaimed: true,
      claimId,
      currency: input.definition.currency,
      amount: 0,
    };
  }

  if (input.attempt >= input.definition.maxClaims) {
    return {
      state: { claimedClaimIds: [...state.claimedClaimIds] },
      accepted: false,
      alreadyClaimed: false,
      claimId,
      currency: input.definition.currency,
      amount: 0,
    };
  }

  return {
    state: { claimedClaimIds: [...state.claimedClaimIds, claimId] },
    accepted: true,
    alreadyClaimed: false,
    claimId,
    currency: input.definition.currency,
    amount: input.definition.amount,
  };
}
