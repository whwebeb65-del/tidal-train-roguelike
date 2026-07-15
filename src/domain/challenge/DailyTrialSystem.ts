export type DailyTrialRuleId = 'armored-current' | 'glass-express' | 'rescue-window';
export type DailyTrialMilestoneId = 'participation' | 'mastery';
export type DailyTrialOutcome = 'victory' | 'extract' | 'defeat';

export interface DailyTrialReward {
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
}

export interface DailyTrialRule {
  readonly id: DailyTrialRuleId;
  readonly name: string;
  readonly description: string;
  readonly enemyHpBonus: number;
  readonly maxPlayerHpDelta: number;
  readonly initialMomentumBonus: number;
  readonly damageBonus: number;
}

export interface DailyTrialDefinition {
  readonly dayId: string;
  readonly seed: number;
  readonly rule: DailyTrialRule;
}

export interface DailyTrialMilestone {
  readonly id: DailyTrialMilestoneId;
  readonly label: string;
  readonly threshold: number;
  readonly reward: DailyTrialReward;
}

export interface DailyTrialState {
  readonly version: 1;
  readonly dayId: string;
  readonly attempts: number;
  readonly bestScore: number;
  readonly submittedRunIds: readonly string[];
  readonly claimedMilestoneIds: readonly DailyTrialMilestoneId[];
}

export interface DailyTrialSubmissionInput {
  readonly runId: string;
  readonly outcome: DailyTrialOutcome;
  readonly completedNodes: number;
  readonly remainingHp: number;
  readonly assisted: boolean;
}

export interface DailyTrialSubmissionResult {
  readonly accepted: boolean;
  readonly reason?: 'run-already-submitted';
  readonly score: number;
  readonly improved: boolean;
  readonly assisted: boolean;
  readonly state: DailyTrialState;
}

export interface DailyTrialClaimResult {
  readonly accepted: boolean;
  readonly reason?: 'threshold-not-reached' | 'already-claimed' | 'unknown-milestone';
  readonly reward: DailyTrialReward;
  readonly state: DailyTrialState;
}

export const DAILY_TRIAL_RULES: readonly DailyTrialRule[] = [
  {
    id: 'armored-current',
    name: '装甲逆潮',
    description: '潮兽护甲增加 20，列车开场额外获得 20 动能',
    enemyHpBonus: 20,
    maxPlayerHpDelta: 0,
    initialMomentumBonus: 20,
    damageBonus: 0,
  },
  {
    id: 'glass-express',
    name: '薄壳快线',
    description: '潮兽护甲增加 10，列车最大生命减少 20，行动伤害增加 5',
    enemyHpBonus: 10,
    maxPlayerHpDelta: -20,
    initialMomentumBonus: 0,
    damageBonus: 5,
  },
  {
    id: 'rescue-window',
    name: '救援窗口',
    description: '潮兽护甲增加 10，列车开场额外获得 30 动能',
    enemyHpBonus: 10,
    maxPlayerHpDelta: 0,
    initialMomentumBonus: 30,
    damageBonus: 0,
  },
];

export const DAILY_TRIAL_MILESTONES: readonly DailyTrialMilestone[] = [
  {
    id: 'participation',
    label: '今日出发',
    threshold: 20,
    reward: { gears: 30, routeMarks: 0, starTickets: 0 },
  },
  {
    id: 'mastery',
    label: '无损航标',
    threshold: 180,
    reward: { gears: 0, routeMarks: 2, starTickets: 0 },
  },
];

const ZERO_REWARD: DailyTrialReward = { gears: 0, routeMarks: 0, starTickets: 0 };
const DAY_ID_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILESTONE_IDS = new Set<DailyTrialMilestoneId>(DAILY_TRIAL_MILESTONES.map((milestone) => milestone.id));
const OUTCOMES = new Set<DailyTrialOutcome>(['victory', 'extract', 'defeat']);

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null;
}

function validateDayId(dayId: string): void {
  if (!DAY_ID_PATTERN.test(dayId)) throw new Error('Invalid daily trial day id');
  const [year, month, day] = dayId.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== dayId) throw new Error('Invalid daily trial day id');
}

function hashDayId(dayId: string): number {
  let hash = 2166136261;
  for (const character of `tidal-trial:${dayId}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return hash;
}

function cloneReward(reward: DailyTrialReward): DailyTrialReward {
  return { gears: reward.gears, routeMarks: reward.routeMarks, starTickets: reward.starTickets };
}

function cloneState(state: DailyTrialState): DailyTrialState {
  return {
    version: 1,
    dayId: state.dayId,
    attempts: state.attempts,
    bestScore: state.bestScore,
    submittedRunIds: [...state.submittedRunIds],
    claimedMilestoneIds: [...state.claimedMilestoneIds],
  };
}

function uniqueStrings(candidate: unknown): readonly string[] {
  if (!Array.isArray(candidate)) return [];
  return [...new Set(candidate.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
}

function calculateScore(input: DailyTrialSubmissionInput): number {
  const base = { victory: 120, extract: 70, defeat: 20 }[input.outcome];
  const raw = base + input.completedNodes * 20 + Math.floor(Math.min(input.remainingHp, 100) / 2);
  return Math.max(20, raw - (input.assisted ? 25 : 0));
}

function validateSubmission(input: DailyTrialSubmissionInput): void {
  if (input.runId.trim().length === 0) throw new Error('Daily trial run id is required');
  if (!OUTCOMES.has(input.outcome)) throw new Error('Invalid daily trial outcome');
  if (!Number.isInteger(input.completedNodes) || input.completedNodes < 0 || input.completedNodes > 10) {
    throw new Error('Daily trial completed nodes must be an integer from 0 to 10');
  }
  if (!Number.isFinite(input.remainingHp) || input.remainingHp < 0) {
    throw new Error('Daily trial remaining hp must be finite and non-negative');
  }
  if (typeof input.assisted !== 'boolean') throw new Error('Daily trial assisted flag must be boolean');
}

export function getChinaDayId(timestampMs: number): string {
  if (!Number.isFinite(timestampMs)) throw new Error('Daily trial timestamp must be finite');
  const shifted = new Date(timestampMs + 8 * 60 * 60 * 1000);
  if (!Number.isFinite(shifted.getTime())) throw new Error('Daily trial timestamp must be finite');
  return shifted.toISOString().slice(0, 10);
}

export function getDailyTrialDefinition(dayId: string): DailyTrialDefinition {
  validateDayId(dayId);
  const hash = hashDayId(dayId);
  const rule = DAILY_TRIAL_RULES[hash % DAILY_TRIAL_RULES.length];
  return {
    dayId,
    seed: (hash % 999999) + 1,
    rule: { ...rule },
  };
}

export function createDailyTrialState(dayId: string): DailyTrialState {
  validateDayId(dayId);
  return {
    version: 1,
    dayId,
    attempts: 0,
    bestScore: 0,
    submittedRunIds: [],
    claimedMilestoneIds: [],
  };
}

export function normalizeDailyTrialState(candidate: unknown, currentDayId: string): DailyTrialState {
  validateDayId(currentDayId);
  if (!isRecord(candidate) || candidate.version !== 1 || candidate.dayId !== currentDayId) {
    return createDailyTrialState(currentDayId);
  }

  const submittedRunIds = uniqueStrings(candidate.submittedRunIds);
  const attempts = Number.isInteger(candidate.attempts) && Number(candidate.attempts) >= 0
    ? Math.max(Number(candidate.attempts), submittedRunIds.length)
    : submittedRunIds.length;
  const bestScore = Number.isFinite(candidate.bestScore) && Number(candidate.bestScore) >= 0
    ? Math.floor(Number(candidate.bestScore))
    : 0;
  const rawMilestones = Array.isArray(candidate.claimedMilestoneIds)
    ? candidate.claimedMilestoneIds
    : [];
  const claimedMilestoneIds = [...new Set(rawMilestones.filter((value): value is DailyTrialMilestoneId => {
    if (typeof value !== 'string' || !MILESTONE_IDS.has(value as DailyTrialMilestoneId)) return false;
    const milestone = DAILY_TRIAL_MILESTONES.find((item) => item.id === value);
    return Boolean(milestone && bestScore >= milestone.threshold);
  }))];

  return {
    version: 1,
    dayId: currentDayId,
    attempts,
    bestScore,
    submittedRunIds,
    claimedMilestoneIds,
  };
}

export function submitDailyTrial(
  state: DailyTrialState,
  input: DailyTrialSubmissionInput,
): DailyTrialSubmissionResult {
  validateSubmission(input);
  if (state.submittedRunIds.includes(input.runId)) {
    return {
      accepted: false,
      reason: 'run-already-submitted',
      score: 0,
      improved: false,
      assisted: input.assisted,
      state: cloneState(state),
    };
  }

  const score = calculateScore(input);
  const improved = score > state.bestScore;
  return {
    accepted: true,
    score,
    improved,
    assisted: input.assisted,
    state: {
      ...cloneState(state),
      attempts: state.attempts + 1,
      bestScore: improved ? score : state.bestScore,
      submittedRunIds: [...state.submittedRunIds, input.runId],
    },
  };
}

export function claimDailyTrialMilestone(
  state: DailyTrialState,
  milestoneId: DailyTrialMilestoneId,
): DailyTrialClaimResult {
  const milestone = DAILY_TRIAL_MILESTONES.find((item) => item.id === milestoneId);
  if (!milestone) {
    return { accepted: false, reason: 'unknown-milestone', reward: cloneReward(ZERO_REWARD), state: cloneState(state) };
  }
  if (state.claimedMilestoneIds.includes(milestoneId)) {
    return { accepted: false, reason: 'already-claimed', reward: cloneReward(ZERO_REWARD), state: cloneState(state) };
  }
  if (state.bestScore < milestone.threshold) {
    return { accepted: false, reason: 'threshold-not-reached', reward: cloneReward(ZERO_REWARD), state: cloneState(state) };
  }
  return {
    accepted: true,
    reward: cloneReward(milestone.reward),
    state: {
      ...cloneState(state),
      claimedMilestoneIds: [...state.claimedMilestoneIds, milestoneId],
    },
  };
}
