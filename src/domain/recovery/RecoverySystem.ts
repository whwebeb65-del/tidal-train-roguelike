export type RecoverySource = 'ad' | 'share';
export type EncounterKind = 'combat' | 'boss';
export type RecoveryResult = 'completed' | 'duplicate' | 'not-needed';

export interface RecoveryState {
  readonly adReviveUsed: boolean;
  readonly shareReviveUsed: boolean;
  readonly skillRefreshUsed: boolean;
  readonly skillCharges: number;
  readonly reviveProtectionUntilMs: number;
}

const REVIVE_HP: Record<RecoverySource, Record<EncounterKind, number>> = {
  ad: { combat: 60, boss: 50 },
  share: { combat: 50, boss: 40 },
};

const REVIVE_PROTECTION_MS = 3000;

export function createRecoveryState(): RecoveryState {
  return {
    adReviveUsed: false,
    shareReviveUsed: false,
    skillRefreshUsed: false,
    skillCharges: 1,
    reviveProtectionUntilMs: 0,
  };
}

export function startCombatNode(state: RecoveryState): RecoveryState {
  return {
    ...state,
    skillCharges: 1,
    reviveProtectionUntilMs: 0,
  };
}

export function canRevive(state: RecoveryState, source: RecoverySource): boolean {
  return source === 'ad' ? !state.adReviveUsed : !state.shareReviveUsed;
}

export function applyRevive(input: {
  state: RecoveryState;
  source: RecoverySource;
  encounter: EncounterKind;
  playerHp: number;
  maxPlayerHp: number;
  nowMs: number;
}): {
  result: RecoveryResult;
  state: RecoveryState;
  playerHp: number;
  hpRestored: number;
} {
  if (!Number.isFinite(input.playerHp) || !Number.isFinite(input.maxPlayerHp) || input.maxPlayerHp <= 0) {
    throw new Error('Recovery health values must be finite and maxPlayerHp must be positive');
  }
  if (!Number.isFinite(input.nowMs)) {
    throw new Error('Recovery timestamp must be finite');
  }

  if (!canRevive(input.state, input.source)) {
    return {
      result: 'duplicate',
      state: input.state,
      playerHp: input.playerHp,
      hpRestored: 0,
    };
  }

  const restoredHp = Math.min(input.maxPlayerHp, Math.max(0, input.playerHp) + REVIVE_HP[input.source][input.encounter]);
  const nextState: RecoveryState = {
    ...input.state,
    adReviveUsed: input.source === 'ad' ? true : input.state.adReviveUsed,
    shareReviveUsed: input.source === 'share' ? true : input.state.shareReviveUsed,
    reviveProtectionUntilMs: input.nowMs + REVIVE_PROTECTION_MS,
  };

  return {
    result: 'completed',
    state: nextState,
    playerHp: restoredHp,
    hpRestored: restoredHp - Math.max(0, input.playerHp),
  };
}

export function useSkill(state: RecoveryState): { accepted: boolean; state: RecoveryState } {
  if (state.skillCharges <= 0) {
    return { accepted: false, state };
  }
  return {
    accepted: true,
    state: { ...state, skillCharges: state.skillCharges - 1 },
  };
}

export function canRefreshSkill(state: RecoveryState): boolean {
  return state.skillCharges === 0 && !state.skillRefreshUsed;
}

export function applySkillRefresh(state: RecoveryState): {
  result: RecoveryResult;
  state: RecoveryState;
  chargesGranted: number;
} {
  if (state.skillRefreshUsed) {
    return { result: 'duplicate', state, chargesGranted: 0 };
  }
  if (state.skillCharges > 0) {
    return { result: 'not-needed', state, chargesGranted: 0 };
  }
  return {
    result: 'completed',
    state: { ...state, skillRefreshUsed: true, skillCharges: 1 },
    chargesGranted: 1,
  };
}
