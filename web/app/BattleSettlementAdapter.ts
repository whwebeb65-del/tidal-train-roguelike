import type { BattleOutcome } from '../battle/BattleTypes';

export interface SettlementAdapterResult<T> {
  readonly accepted: boolean;
  readonly state: T;
}

export class BattleSettlementAdapter<T> {
  private readonly settledBattleIds = new Set<string>();

  public settle(
    state: T,
    outcome: BattleOutcome,
    settleOnce: (state: T, outcome: BattleOutcome) => T,
  ): SettlementAdapterResult<T> {
    if (this.settledBattleIds.has(outcome.battleId)) {
      return { accepted: false, state };
    }
    const next = settleOnce(state, outcome);
    this.settledBattleIds.add(outcome.battleId);
    return { accepted: true, state: next };
  }

  public hasSettled(battleId: string): boolean {
    return this.settledBattleIds.has(battleId);
  }
}
