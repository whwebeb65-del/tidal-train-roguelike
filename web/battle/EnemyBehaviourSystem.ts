import type {
  EnemyBehaviourPhase,
  EnemyBehaviourState,
  EnemyKind,
} from './BattleTypes';

export interface EnemyBehaviourInput {
  readonly kind: EnemyKind;
  readonly enemyId: number;
  readonly lane: 0 | 1 | 2;
  readonly hpRatio: number;
  readonly stepMs: number;
  readonly state: EnemyBehaviourState;
}

export interface EnemyBehaviourIntent {
  readonly targetLane?: 0 | 1 | 2;
  readonly rangedWarning?: boolean;
  readonly rangedFire?: boolean;
  readonly supportPulse?: boolean;
  readonly eliteWarning?: boolean;
  readonly eliteCharge?: boolean;
  readonly eliteExposed?: boolean;
  readonly bossPhaseChanged?: Extract<
    EnemyBehaviourPhase,
    'boss-summon' | 'boss-tide' | 'boss-enraged'
  >;
  readonly bossSummon?: boolean;
  readonly tideWarning?: boolean;
  readonly tideImpact?: boolean;
}

export interface EnemyBehaviourResult {
  readonly state: EnemyBehaviourState;
  readonly intent: EnemyBehaviourIntent;
}

export function createEnemyBehaviour(
  kind: EnemyKind,
  enemyId: number,
  lane: 0 | 1 | 2,
): EnemyBehaviourState {
  const phase = kind === 'deep-echo-boss' ? 'boss-summon' : 'advance';
  return makeState({
    phase,
    phaseRemainingMs: initialDuration(kind),
    cycle: 0,
    targetLane: lane,
    safeLane: deterministicLane(enemyId, 0),
    invulnerable: false,
    damageTakenMultiplier: 1,
    weakPointOpen: false,
  });
}

export function advanceEnemyBehaviour(
  input: EnemyBehaviourInput,
): EnemyBehaviourResult {
  if (!Number.isFinite(input.stepMs) || input.stepMs < 0) {
    throw new Error('Enemy behaviour step must be finite and non-negative');
  }
  const hpRatio = clamp(input.hpRatio, 0, 1);
  const bossTransition = transitionBossByHealth(input, hpRatio);
  if (bossTransition) return bossTransition;
  if (input.stepMs === 0) return { state: input.state, intent: {} };

  const remaining = input.state.phaseRemainingMs - input.stepMs;
  if (remaining > 0) {
    return {
      state: makeState({ ...input.state, phaseRemainingMs: remaining }),
      intent: {},
    };
  }
  return transitionExpired(input);
}

function transitionExpired(input: EnemyBehaviourInput): EnemyBehaviourResult {
  const { kind, state } = input;
  if (kind === 'tide-shell-hatchling') {
    const cycle = state.cycle + 1;
    const targetLane = adjacentLane(input.lane, input.enemyId, cycle);
    return {
      state: makeState({ ...state, cycle, targetLane, phaseRemainingMs: 2000 }),
      intent: { targetLane },
    };
  }
  if (kind === 'lantern-ray') {
    if (state.phase === 'lantern-charge') {
      return {
        state: makeState({ ...state, phase: 'advance', phaseRemainingMs: 2500 }),
        intent: { rangedFire: true },
      };
    }
    return {
      state: makeState({ ...state, phase: 'lantern-charge', phaseRemainingMs: 800 }),
      intent: { rangedWarning: true },
    };
  }
  if (kind === 'tide-parasite-snail') {
    return {
      state: makeState({ ...state, cycle: state.cycle + 1, phaseRemainingMs: 2000 }),
      intent: { supportPulse: true },
    };
  }
  if (kind === 'storm-ray-elite') return transitionElite(input);
  if (kind === 'deep-echo-boss') return transitionBossTimer(input);
  return {
    state: makeState({ ...state, phaseRemainingMs: Number.MAX_SAFE_INTEGER }),
    intent: {},
  };
}

function transitionElite(input: EnemyBehaviourInput): EnemyBehaviourResult {
  const state = input.state;
  if (state.phase === 'elite-telegraph') {
    return {
      state: makeState({
        ...state,
        phase: 'elite-charge',
        phaseRemainingMs: 450,
        invulnerable: true,
      }),
      intent: { eliteCharge: true, targetLane: state.targetLane },
    };
  }
  if (state.phase === 'elite-charge') {
    return {
      state: makeState({
        ...state,
        phase: 'elite-exposed',
        phaseRemainingMs: 1200,
        invulnerable: false,
        damageTakenMultiplier: 1.25,
      }),
      intent: { eliteExposed: true },
    };
  }
  if (state.phase === 'elite-exposed') {
    return {
      state: makeState({
        ...state,
        phase: 'advance',
        phaseRemainingMs: 3000,
        damageTakenMultiplier: 1,
      }),
      intent: {},
    };
  }
  const cycle = state.cycle + 1;
  const targetLane = deterministicLane(input.enemyId, cycle);
  return {
    state: makeState({
      ...state,
      phase: 'elite-telegraph',
      phaseRemainingMs: 800,
      cycle,
      targetLane,
    }),
    intent: { eliteWarning: true, targetLane },
  };
}

function transitionBossByHealth(
  input: EnemyBehaviourInput,
  hpRatio: number,
): EnemyBehaviourResult | null {
  if (input.kind !== 'deep-echo-boss') return null;
  const currentRank = bossPhaseRank(input.state.phase);
  const desired = hpRatio <= 0.35
    ? 'boss-enraged'
    : hpRatio <= 0.65
      ? 'boss-tide'
      : 'boss-summon';
  if (bossPhaseRank(desired) <= currentRank) return null;
  const cycle = input.state.cycle + 1;
  const safeLane = deterministicLane(input.enemyId, cycle);
  return {
    state: makeState({
      ...input.state,
      phase: desired,
      phaseRemainingMs: desired === 'boss-tide' ? 3600 : 1800,
      cycle,
      safeLane,
      weakPointOpen: desired === 'boss-enraged',
      damageTakenMultiplier: desired === 'boss-enraged' ? 1.1 : 1,
    }),
    intent: { bossPhaseChanged: desired },
  };
}

function transitionBossTimer(input: EnemyBehaviourInput): EnemyBehaviourResult {
  const state = input.state;
  if (state.phase === 'boss-summon') {
    return {
      state: makeState({ ...state, cycle: state.cycle + 1, phaseRemainingMs: 8000 }),
      intent: { bossSummon: true },
    };
  }
  if (state.phase === 'boss-tide') {
    const warning = state.cycle % 2 === 1;
    const cycle = state.cycle + 1;
    return {
      state: makeState({
        ...state,
        cycle,
        safeLane: warning ? deterministicLane(input.enemyId, cycle) : state.safeLane,
        phaseRemainingMs: warning ? 1200 : 3600,
      }),
      intent: warning ? { tideWarning: true } : { tideImpact: true },
    };
  }
  const cycle = state.cycle + 1;
  return {
    state: makeState({
      ...state,
      cycle,
      weakPointOpen: !state.weakPointOpen,
      phaseRemainingMs: state.weakPointOpen ? 1800 : 1400,
    }),
    intent: {},
  };
}

function initialDuration(kind: EnemyKind): number {
  if (kind === 'tide-shell-hatchling') return 2000;
  if (kind === 'lantern-ray') return 1700;
  if (kind === 'tide-parasite-snail') return 2000;
  if (kind === 'storm-ray-elite') return 4000;
  if (kind === 'deep-echo-boss') return 8000;
  return Number.MAX_SAFE_INTEGER;
}

function adjacentLane(
  lane: 0 | 1 | 2,
  enemyId: number,
  cycle: number,
): 0 | 1 | 2 {
  if (lane === 0) return 1;
  if (lane === 2) return 1;
  return (enemyId + cycle) % 2 === 0 ? 0 : 2;
}

function deterministicLane(enemyId: number, cycle: number): 0 | 1 | 2 {
  return Math.abs(enemyId * 17 + cycle * 7) % 3 as 0 | 1 | 2;
}

function bossPhaseRank(phase: EnemyBehaviourPhase): number {
  if (phase === 'boss-enraged') return 3;
  if (phase === 'boss-tide') return 2;
  if (phase === 'boss-summon') return 1;
  return 0;
}

function makeState(state: EnemyBehaviourState): EnemyBehaviourState {
  return Object.freeze({ ...state });
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
