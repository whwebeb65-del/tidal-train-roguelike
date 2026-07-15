import type { RunEvent, RunPhase, RunSession } from './RunTypes';

const transitions: Partial<Record<RunPhase, Partial<Record<RunEvent['type'], RunPhase>>>> = {
  Lobby: { START_RUN: 'RunStart' },
  RunStart: { CHOOSE_ROUTE: 'RouteChoice' },
  RouteChoice: { ENTER_COMBAT: 'Combat', ENTER_BOSS: 'Boss' },
  Combat: { COMBAT_WON: 'RewardChoice', RUN_FAILED: 'Settlement' },
  RewardChoice: { CHOOSE_REWARD: 'RouteChoice' },
  Boss: { BOSS_WON: 'Settlement', RUN_FAILED: 'Settlement', EXTRACT: 'Settlement' },
  Settlement: { RETURN_TO_STATION: 'Station' },
};

export function createRun(seed: number): RunSession {
  if (!Number.isFinite(seed)) {
    throw new Error('Run seed must be finite');
  }

  return {
    seed,
    phase: 'Lobby',
    nodeIndex: 0,
    settled: false,
  };
}

export function transition(session: RunSession, event: RunEvent): RunSession {
  const nextPhase = transitions[session.phase]?.[event.type];
  if (!nextPhase) {
    throw new Error(`Invalid run transition: ${session.phase}/${event.type}`);
  }

  const nodeIndex = event.type === 'CHOOSE_ROUTE' || event.type === 'CHOOSE_REWARD'
    ? session.nodeIndex + 1
    : session.nodeIndex;

  return {
    ...session,
    phase: nextPhase,
    nodeIndex,
    settled: nextPhase === 'Settlement' || session.settled,
  };
}
