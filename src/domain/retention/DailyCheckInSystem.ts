export interface DailyCheckInReward {
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
}

export interface DailyCheckInState {
  readonly version: 1;
  readonly cycleNumber: number;
  readonly cycleClaimCount: number;
  readonly totalClaims: number;
  readonly lastClaimDayId: string | null;
}

export type DailyCheckInFailureReason = 'already-claimed' | 'day-not-after-last-claim';

export interface DailyCheckInPreview {
  readonly canClaim: boolean;
  readonly reason?: DailyCheckInFailureReason;
  readonly displayCycleNumber: number;
  readonly displayClaimCount: number;
  readonly rewardDay: number;
  readonly reward: DailyCheckInReward;
}

export interface DailyCheckInClaimResult {
  readonly accepted: boolean;
  readonly reason?: DailyCheckInFailureReason;
  readonly rewardDay: number;
  readonly completedCycle: boolean;
  readonly reward: DailyCheckInReward;
  readonly state: DailyCheckInState;
}

export const DAILY_CHECK_IN_REWARDS: readonly DailyCheckInReward[] = [
  { gears: 20, routeMarks: 0, starTickets: 0 },
  { gears: 0, routeMarks: 1, starTickets: 0 },
  { gears: 30, routeMarks: 0, starTickets: 0 },
  { gears: 0, routeMarks: 0, starTickets: 1 },
  { gears: 40, routeMarks: 0, starTickets: 0 },
  { gears: 0, routeMarks: 2, starTickets: 0 },
  { gears: 60, routeMarks: 0, starTickets: 1 },
];

const ZERO_REWARD: DailyCheckInReward = { gears: 0, routeMarks: 0, starTickets: 0 };
const DAY_ID_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_PER_CYCLE = DAILY_CHECK_IN_REWARDS.length;

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null;
}

function isIntegerInRange(candidate: unknown, minimum: number, maximum: number): candidate is number {
  return Number.isInteger(candidate) && Number(candidate) >= minimum && Number(candidate) <= maximum;
}

function validateDayId(dayId: string): void {
  if (!DAY_ID_PATTERN.test(dayId)) throw new Error('Invalid daily check-in day id');
  const [year, month, day] = dayId.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== dayId) throw new Error('Invalid daily check-in day id');
}

function isValidDayId(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string') return false;
  try {
    validateDayId(candidate);
    return true;
  } catch {
    return false;
  }
}

function cloneReward(reward: DailyCheckInReward): DailyCheckInReward {
  return {
    gears: reward.gears,
    routeMarks: reward.routeMarks,
    starTickets: reward.starTickets,
  };
}

function cloneState(state: DailyCheckInState): DailyCheckInState {
  return {
    version: 1,
    cycleNumber: state.cycleNumber,
    cycleClaimCount: state.cycleClaimCount,
    totalClaims: state.totalClaims,
    lastClaimDayId: state.lastClaimDayId,
  };
}

function rewardForDay(rewardDay: number): DailyCheckInReward {
  const reward = DAILY_CHECK_IN_REWARDS[rewardDay - 1];
  if (!reward) throw new Error('Invalid daily check-in reward day');
  return cloneReward(reward);
}

function getPendingRewardDay(cycleClaimCount: number): number {
  return cycleClaimCount >= DAYS_PER_CYCLE ? 1 : cycleClaimCount + 1;
}

export function createDailyCheckInState(): DailyCheckInState {
  return {
    version: 1,
    cycleNumber: 1,
    cycleClaimCount: 0,
    totalClaims: 0,
    lastClaimDayId: null,
  };
}

export function normalizeDailyCheckInState(candidate: unknown): DailyCheckInState {
  if (!isRecord(candidate) || candidate.version !== 1) return createDailyCheckInState();
  if (!isIntegerInRange(candidate.cycleNumber, 1, Number.MAX_SAFE_INTEGER)) return createDailyCheckInState();
  if (!isIntegerInRange(candidate.cycleClaimCount, 0, DAYS_PER_CYCLE)) return createDailyCheckInState();
  if (!isIntegerInRange(candidate.totalClaims, 0, Number.MAX_SAFE_INTEGER)) return createDailyCheckInState();

  const expectedTotalClaims = (candidate.cycleNumber - 1) * DAYS_PER_CYCLE + candidate.cycleClaimCount;
  if (!Number.isSafeInteger(expectedTotalClaims) || candidate.totalClaims !== expectedTotalClaims) {
    return createDailyCheckInState();
  }

  if (candidate.totalClaims === 0 && candidate.lastClaimDayId !== null) return createDailyCheckInState();
  if (candidate.totalClaims > 0 && !isValidDayId(candidate.lastClaimDayId)) return createDailyCheckInState();

  return {
    version: 1,
    cycleNumber: candidate.cycleNumber,
    cycleClaimCount: candidate.cycleClaimCount,
    totalClaims: candidate.totalClaims,
    lastClaimDayId: candidate.lastClaimDayId as string | null,
  };
}

export function getDailyCheckInPreview(
  state: DailyCheckInState,
  currentDayId: string,
): DailyCheckInPreview {
  validateDayId(currentDayId);
  const normalized = normalizeDailyCheckInState(state);
  const rewardDay = getPendingRewardDay(normalized.cycleClaimCount);

  if (normalized.lastClaimDayId !== null && currentDayId <= normalized.lastClaimDayId) {
    return {
      canClaim: false,
      reason: currentDayId === normalized.lastClaimDayId ? 'already-claimed' : 'day-not-after-last-claim',
      displayCycleNumber: normalized.cycleNumber,
      displayClaimCount: normalized.cycleClaimCount,
      rewardDay,
      reward: rewardForDay(rewardDay),
    };
  }

  const startsNextCycle = normalized.cycleClaimCount === DAYS_PER_CYCLE;
  return {
    canClaim: true,
    displayCycleNumber: normalized.cycleNumber + (startsNextCycle ? 1 : 0),
    displayClaimCount: startsNextCycle ? 0 : normalized.cycleClaimCount,
    rewardDay,
    reward: rewardForDay(rewardDay),
  };
}

export function claimDailyCheckIn(
  state: DailyCheckInState,
  currentDayId: string,
): DailyCheckInClaimResult {
  const normalized = normalizeDailyCheckInState(state);
  const preview = getDailyCheckInPreview(normalized, currentDayId);

  if (!preview.canClaim) {
    return {
      accepted: false,
      reason: preview.reason,
      rewardDay: preview.rewardDay,
      completedCycle: false,
      reward: cloneReward(ZERO_REWARD),
      state: cloneState(normalized),
    };
  }

  const nextClaimCount = preview.displayClaimCount + 1;
  const nextState: DailyCheckInState = {
    version: 1,
    cycleNumber: preview.displayCycleNumber,
    cycleClaimCount: nextClaimCount,
    totalClaims: normalized.totalClaims + 1,
    lastClaimDayId: currentDayId,
  };

  return {
    accepted: true,
    rewardDay: preview.rewardDay,
    completedCycle: nextClaimCount === DAYS_PER_CYCLE,
    reward: cloneReward(preview.reward),
    state: nextState,
  };
}
