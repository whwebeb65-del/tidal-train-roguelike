export interface FirstClearState {
  readonly claimedMapIds: readonly string[];
}

export interface FirstClearReward {
  readonly mapId: string;
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
  readonly collectionId: string;
}

function validateReward(reward: FirstClearReward): void {
  if (reward.mapId.trim().length === 0) {
    throw new Error('Map id is required');
  }
  if (![reward.gears, reward.routeMarks, reward.starTickets].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error('First clear rewards must be finite non-negative numbers');
  }
}

function emptyReward(reward: FirstClearReward): FirstClearReward {
  return {
    mapId: reward.mapId,
    gears: 0,
    routeMarks: 0,
    starTickets: 0,
    collectionId: '',
  };
}

export function claimFirstClear(
  state: FirstClearState,
  reward: FirstClearReward,
): { state: FirstClearState; granted: boolean; reward: FirstClearReward } {
  validateReward(reward);
  if (state.claimedMapIds.includes(reward.mapId)) {
    return {
      state: { claimedMapIds: [...state.claimedMapIds] },
      granted: false,
      reward: emptyReward(reward),
    };
  }

  return {
    state: { claimedMapIds: [...state.claimedMapIds, reward.mapId] },
    granted: true,
    reward: { ...reward },
  };
}
