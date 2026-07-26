export const MAX_STAMINA = 30;
export const NORMAL_RUN_STAMINA_COST = 5;
export const STAMINA_REGEN_MS = 10 * 60 * 1000;

export interface StaminaState {
  readonly stamina: number;
  readonly staminaUpdatedAtMs: number;
}

export function recoverStamina(
  state: StaminaState,
  nowMs: number,
): StaminaState {
  const now = Math.max(0, Math.floor(nowMs));
  const current = Math.max(0, Math.min(MAX_STAMINA, Math.floor(state.stamina)));
  if (now <= state.staminaUpdatedAtMs || current >= MAX_STAMINA) {
    return { stamina: current, staminaUpdatedAtMs: now };
  }

  const recovered = Math.floor((now - state.staminaUpdatedAtMs) / STAMINA_REGEN_MS);
  const stamina = Math.min(MAX_STAMINA, current + recovered);

  return {
    stamina,
    staminaUpdatedAtMs: stamina >= MAX_STAMINA
      ? now
      : state.staminaUpdatedAtMs + recovered * STAMINA_REGEN_MS,
  };
}

export function spendNormalRunStamina(state: StaminaState): {
  readonly accepted: boolean;
  readonly spent: number;
  readonly state: StaminaState;
} {
  if (state.stamina < NORMAL_RUN_STAMINA_COST) {
    return { accepted: false, spent: 0, state: { ...state } };
  }

  return {
    accepted: true,
    spent: NORMAL_RUN_STAMINA_COST,
    state: {
      stamina: state.stamina - NORMAL_RUN_STAMINA_COST,
      staminaUpdatedAtMs: state.staminaUpdatedAtMs,
    },
  };
}
