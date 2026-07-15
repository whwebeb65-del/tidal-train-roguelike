export type SupportId = 'navigator' | 'gunner' | 'engineer';
export type ExpeditionOutcome = 'victory' | 'extract' | 'defeat';
export type ExpeditionMilestoneId = 'supply-20' | 'supply-50' | 'supply-100';

export interface SupportDefinition {
  readonly id: SupportId;
  readonly displayName: string;
  readonly role: string;
  readonly description: string;
}

export interface ExpeditionReward {
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
}

export interface ExpeditionMilestone {
  readonly id: ExpeditionMilestoneId;
  readonly threshold: number;
  readonly label: string;
  readonly reward: ExpeditionReward;
}

export interface SocialExpeditionState {
  readonly version: 1;
  readonly cycleId: string;
  readonly legionId: string | null;
  readonly squadMemberIds: readonly SupportId[];
  readonly contribution: number;
  readonly contributedRunIds: readonly string[];
  readonly claimedMilestoneIds: readonly ExpeditionMilestoneId[];
}

export interface SquadBonuses {
  readonly initialMomentum: number;
  readonly damageBonus: number;
  readonly maxPlayerHpBonus: number;
}

export interface SquadUpdateResult {
  readonly accepted: boolean;
  readonly reason?: 'legion-required' | 'squad-full';
  readonly state: SocialExpeditionState;
}

export interface ExpeditionContributionInput {
  readonly runId: string;
  readonly outcome: ExpeditionOutcome;
  readonly completedNodes: number;
}

export interface ExpeditionContributionResult {
  readonly accepted: boolean;
  readonly reason?: 'legion-required' | 'run-already-contributed';
  readonly pointsGranted: number;
  readonly state: SocialExpeditionState;
}

export interface ExpeditionClaimResult {
  readonly accepted: boolean;
  readonly reason?: 'legion-required' | 'threshold-not-reached' | 'already-claimed' | 'unknown-milestone';
  readonly reward: ExpeditionReward;
  readonly state: SocialExpeditionState;
}

export const SUPPORT_ROSTER: readonly SupportDefinition[] = [
  {
    id: 'navigator',
    displayName: '领航员·阿澜',
    role: '爆发支援',
    description: '每个战斗节点初始获得 20 潮汐动能',
  },
  {
    id: 'gunner',
    displayName: '炮术员·砾火',
    role: '火力支援',
    description: '所有伤害型行动额外造成 5 点伤害',
  },
  {
    id: 'engineer',
    displayName: '工程师·钟叔',
    role: '生存支援',
    description: '列车最大生命增加 20 点',
  },
];

export const EXPEDITION_MILESTONES: readonly ExpeditionMilestone[] = [
  {
    id: 'supply-20',
    threshold: 20,
    label: '前哨补给',
    reward: { gears: 30, routeMarks: 0, starTickets: 0 },
  },
  {
    id: 'supply-50',
    threshold: 50,
    label: '协同航标',
    reward: { gears: 0, routeMarks: 2, starTickets: 0 },
  },
  {
    id: 'supply-100',
    threshold: 100,
    label: '远征终点',
    reward: { gears: 0, routeMarks: 0, starTickets: 1 },
  },
];

const SUPPORT_IDS = new Set<SupportId>(SUPPORT_ROSTER.map((support) => support.id));
const MILESTONE_IDS = new Set<ExpeditionMilestoneId>(EXPEDITION_MILESTONES.map((milestone) => milestone.id));
const EMPTY_REWARD: ExpeditionReward = { gears: 0, routeMarks: 0, starTickets: 0 };

function cloneState(state: SocialExpeditionState): SocialExpeditionState {
  return {
    ...state,
    squadMemberIds: [...state.squadMemberIds],
    contributedRunIds: [...state.contributedRunIds],
    claimedMilestoneIds: [...state.claimedMilestoneIds],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))];
}

function validCycleId(cycleId: string): string {
  if (cycleId.trim().length === 0) {
    throw new Error('Cycle id is required');
  }
  return cycleId;
}

export function createSocialExpeditionState(cycleId: string): SocialExpeditionState {
  return {
    version: 1,
    cycleId: validCycleId(cycleId),
    legionId: null,
    squadMemberIds: [],
    contribution: 0,
    contributedRunIds: [],
    claimedMilestoneIds: [],
  };
}

export function normalizeSocialExpeditionState(
  candidate: unknown,
  cycleId: string,
): SocialExpeditionState {
  const fallback = createSocialExpeditionState(cycleId);
  if (!isRecord(candidate) || candidate.version !== 1) return fallback;

  const legionId = typeof candidate.legionId === 'string' && candidate.legionId.trim().length > 0
    ? candidate.legionId
    : null;
  const squadMemberIds = uniqueStrings(candidate.squadMemberIds)
    .filter((id): id is SupportId => SUPPORT_IDS.has(id as SupportId))
    .slice(0, 2);
  const persistent = { legionId, squadMemberIds };

  if (candidate.cycleId !== cycleId) {
    return { ...fallback, ...persistent };
  }

  const contribution = typeof candidate.contribution === 'number' && Number.isFinite(candidate.contribution)
    ? Math.max(0, Math.floor(candidate.contribution))
    : 0;
  const contributedRunIds = uniqueStrings(candidate.contributedRunIds);
  const claimedMilestoneIds = uniqueStrings(candidate.claimedMilestoneIds)
    .filter((id): id is ExpeditionMilestoneId => MILESTONE_IDS.has(id as ExpeditionMilestoneId));

  return {
    version: 1,
    cycleId,
    ...persistent,
    contribution,
    contributedRunIds,
    claimedMilestoneIds,
  };
}

export function joinLegion(
  state: SocialExpeditionState,
  legionId: string,
): SocialExpeditionState {
  if (legionId.trim().length === 0) {
    throw new Error('Legion id is required');
  }
  return { ...cloneState(state), legionId };
}

export function toggleSquadMember(
  state: SocialExpeditionState,
  supportId: SupportId,
): SquadUpdateResult {
  if (!state.legionId) {
    return { accepted: false, reason: 'legion-required', state: cloneState(state) };
  }
  if (state.squadMemberIds.includes(supportId)) {
    return {
      accepted: true,
      state: {
        ...cloneState(state),
        squadMemberIds: state.squadMemberIds.filter((id) => id !== supportId),
      },
    };
  }
  if (state.squadMemberIds.length >= 2) {
    return { accepted: false, reason: 'squad-full', state: cloneState(state) };
  }
  return {
    accepted: true,
    state: {
      ...cloneState(state),
      squadMemberIds: [...state.squadMemberIds, supportId],
    },
  };
}

export function getSquadBonuses(state: SocialExpeditionState): SquadBonuses {
  return state.squadMemberIds.reduce<SquadBonuses>((bonuses, supportId) => {
    if (supportId === 'navigator') {
      return { ...bonuses, initialMomentum: bonuses.initialMomentum + 20 };
    }
    if (supportId === 'gunner') {
      return { ...bonuses, damageBonus: bonuses.damageBonus + 5 };
    }
    return { ...bonuses, maxPlayerHpBonus: bonuses.maxPlayerHpBonus + 20 };
  }, { initialMomentum: 0, damageBonus: 0, maxPlayerHpBonus: 0 });
}

export function contributeToExpedition(
  state: SocialExpeditionState,
  input: ExpeditionContributionInput,
): ExpeditionContributionResult {
  if (input.runId.trim().length === 0) {
    throw new Error('Run id is required');
  }
  if (!Number.isFinite(input.completedNodes) || input.completedNodes < 0) {
    throw new Error('Completed nodes must be a finite non-negative number');
  }
  if (!state.legionId) {
    return { accepted: false, reason: 'legion-required', pointsGranted: 0, state: cloneState(state) };
  }
  if (state.contributedRunIds.includes(input.runId)) {
    return { accepted: false, reason: 'run-already-contributed', pointsGranted: 0, state: cloneState(state) };
  }

  const basePoints: Record<ExpeditionOutcome, number> = { victory: 30, extract: 15, defeat: 8 };
  const nodePoints = Math.min(12, Math.floor(input.completedNodes) * 2);
  const pointsGranted = basePoints[input.outcome] + nodePoints;
  return {
    accepted: true,
    pointsGranted,
    state: {
      ...cloneState(state),
      contribution: state.contribution + pointsGranted,
      contributedRunIds: [...state.contributedRunIds, input.runId],
    },
  };
}

export function claimExpeditionMilestone(
  state: SocialExpeditionState,
  milestoneId: ExpeditionMilestoneId,
): ExpeditionClaimResult {
  if (!state.legionId) {
    return { accepted: false, reason: 'legion-required', reward: { ...EMPTY_REWARD }, state: cloneState(state) };
  }
  const milestone = EXPEDITION_MILESTONES.find((item) => item.id === milestoneId);
  if (!milestone) {
    return { accepted: false, reason: 'unknown-milestone', reward: { ...EMPTY_REWARD }, state: cloneState(state) };
  }
  if (state.claimedMilestoneIds.includes(milestoneId)) {
    return { accepted: false, reason: 'already-claimed', reward: { ...EMPTY_REWARD }, state: cloneState(state) };
  }
  if (state.contribution < milestone.threshold) {
    return { accepted: false, reason: 'threshold-not-reached', reward: { ...EMPTY_REWARD }, state: cloneState(state) };
  }
  return {
    accepted: true,
    reward: { ...milestone.reward },
    state: {
      ...cloneState(state),
      claimedMilestoneIds: [...state.claimedMilestoneIds, milestoneId],
    },
  };
}

export function getIsoWeekCycleId(input: Date): string {
  if (Number.isNaN(input.getTime())) {
    throw new Error('A valid date is required');
  }
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const dayNumber = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
