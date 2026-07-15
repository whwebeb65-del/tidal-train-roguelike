export type RunPhase =
  | 'Lobby'
  | 'RunStart'
  | 'RouteChoice'
  | 'Combat'
  | 'RewardChoice'
  | 'Boss'
  | 'Settlement'
  | 'Station';

export type RunEvent =
  | { type: 'START_RUN' }
  | { type: 'CHOOSE_ROUTE' }
  | { type: 'ENTER_COMBAT' }
  | { type: 'COMBAT_WON' }
  | { type: 'CHOOSE_REWARD' }
  | { type: 'ENTER_BOSS' }
  | { type: 'BOSS_WON' }
  | { type: 'RUN_FAILED' }
  | { type: 'EXTRACT' }
  | { type: 'RETURN_TO_STATION' };

export interface RunSession {
  readonly seed: number;
  readonly phase: RunPhase;
  readonly nodeIndex: number;
  readonly settled: boolean;
}
