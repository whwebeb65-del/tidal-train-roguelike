export type CampaignBadgeId = 'beta-pioneer' | 'launch-conductor';

export interface CampaignReward {
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
  readonly badgeId?: CampaignBadgeId;
}

export interface LaunchCampaignState {
  readonly version: 1;
  readonly campaignId: 'launch-2026';
  readonly betaQualified: boolean;
  readonly betaGiftClaimed: boolean;
  readonly launchGiftClaimed: boolean;
  readonly redeemedCodeIds: readonly string[];
  readonly cosmeticBadgeIds: readonly CampaignBadgeId[];
}

export interface GiftCodeDefinition {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly startsAtMs: number;
  readonly expiresAtMs: number;
  readonly reward: CampaignReward;
}

export type CampaignFailureReason =
  | 'already-qualified'
  | 'beta-required'
  | 'already-claimed'
  | 'empty-code'
  | 'unknown-code'
  | 'not-started'
  | 'expired'
  | 'already-redeemed';

export interface CampaignActionResult {
  readonly accepted: boolean;
  readonly reason?: CampaignFailureReason;
  readonly reward: CampaignReward;
  readonly state: LaunchCampaignState;
  readonly codeId?: string;
}

const ZERO_REWARD: CampaignReward = {
  gears: 0,
  routeMarks: 0,
  starTickets: 0,
};

const BETA_REWARD: CampaignReward = {
  gears: 60,
  routeMarks: 2,
  starTickets: 1,
  badgeId: 'beta-pioneer',
};

const LAUNCH_REWARD: CampaignReward = {
  gears: 188,
  routeMarks: 6,
  starTickets: 3,
  badgeId: 'launch-conductor',
};

export const GIFT_CODE_CATALOG = [
  {
    id: 'tide-voyage',
    code: 'TIDE2026',
    label: '潮汐启航',
    startsAtMs: 0,
    expiresAtMs: Date.UTC(2100, 0, 1),
    reward: { gears: 66, routeMarks: 2, starTickets: 0 },
  },
  {
    id: 'first-train',
    code: 'FIRSTTRAIN',
    label: '首班列车',
    startsAtMs: 0,
    expiresAtMs: Date.UTC(2100, 0, 1),
    reward: { gears: 88, routeMarks: 0, starTickets: 1 },
  },
] as const satisfies readonly GiftCodeDefinition[];

const VALID_CODE_IDS = new Set<string>(GIFT_CODE_CATALOG.map((definition) => definition.id));
const VALID_BADGE_IDS = new Set<CampaignBadgeId>(['beta-pioneer', 'launch-conductor']);

function cloneReward(reward: CampaignReward): CampaignReward {
  return reward.badgeId
    ? { gears: reward.gears, routeMarks: reward.routeMarks, starTickets: reward.starTickets, badgeId: reward.badgeId }
    : { gears: reward.gears, routeMarks: reward.routeMarks, starTickets: reward.starTickets };
}

function cloneState(state: LaunchCampaignState): LaunchCampaignState {
  return {
    version: 1,
    campaignId: 'launch-2026',
    betaQualified: state.betaQualified,
    betaGiftClaimed: state.betaGiftClaimed,
    launchGiftClaimed: state.launchGiftClaimed,
    redeemedCodeIds: [...state.redeemedCodeIds],
    cosmeticBadgeIds: [...state.cosmeticBadgeIds],
  };
}

function addUnique<T>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value) ? [...values] : [...values, value];
}

function failure(
  state: LaunchCampaignState,
  reason: CampaignFailureReason,
  codeId?: string,
): CampaignActionResult {
  return {
    accepted: false,
    reason,
    reward: cloneReward(ZERO_REWARD),
    state: cloneState(state),
    ...(codeId ? { codeId } : {}),
  };
}

function success(
  state: LaunchCampaignState,
  reward: CampaignReward = ZERO_REWARD,
  codeId?: string,
): CampaignActionResult {
  return {
    accepted: true,
    reward: cloneReward(reward),
    state: cloneState(state),
    ...(codeId ? { codeId } : {}),
  };
}

function normalizeCode(rawCode: string): string {
  return rawCode.trim().toUpperCase();
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null;
}

function uniqueAllowedStrings(
  candidate: unknown,
  allowed: ReadonlySet<string>,
): readonly string[] {
  if (!Array.isArray(candidate)) return [];
  return [...new Set(candidate.filter((value): value is string => typeof value === 'string' && allowed.has(value)))];
}

function validateReward(reward: CampaignReward): void {
  const currencies = [reward.gears, reward.routeMarks, reward.starTickets];
  if (!currencies.every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error('Invalid gift code definition');
  }
  if (reward.badgeId && !VALID_BADGE_IDS.has(reward.badgeId)) {
    throw new Error('Invalid gift code definition');
  }
}

function validateCatalog(catalog: readonly GiftCodeDefinition[]): void {
  const ids = new Set<string>();
  const codes = new Set<string>();
  for (const definition of catalog) {
    const normalizedCode = normalizeCode(definition.code);
    if (
      definition.id.trim().length === 0
      || normalizedCode.length === 0
      || definition.label.trim().length === 0
      || !Number.isFinite(definition.startsAtMs)
      || !Number.isFinite(definition.expiresAtMs)
      || definition.startsAtMs >= definition.expiresAtMs
      || ids.has(definition.id)
      || codes.has(normalizedCode)
    ) {
      throw new Error('Invalid gift code definition');
    }
    validateReward(definition.reward);
    ids.add(definition.id);
    codes.add(normalizedCode);
  }
}

export function createLaunchCampaignState(): LaunchCampaignState {
  return {
    version: 1,
    campaignId: 'launch-2026',
    betaQualified: false,
    betaGiftClaimed: false,
    launchGiftClaimed: false,
    redeemedCodeIds: [],
    cosmeticBadgeIds: [],
  };
}

export function normalizeLaunchCampaignState(candidate: unknown): LaunchCampaignState {
  if (!isRecord(candidate) || candidate.version !== 1 || candidate.campaignId !== 'launch-2026') {
    return createLaunchCampaignState();
  }

  const betaQualified = candidate.betaQualified === true;
  const betaGiftClaimed = betaQualified && candidate.betaGiftClaimed === true;
  const launchGiftClaimed = candidate.launchGiftClaimed === true;
  let cosmeticBadgeIds = uniqueAllowedStrings(candidate.cosmeticBadgeIds, VALID_BADGE_IDS) as readonly CampaignBadgeId[];
  if (betaGiftClaimed) cosmeticBadgeIds = addUnique(cosmeticBadgeIds, 'beta-pioneer');
  if (launchGiftClaimed) cosmeticBadgeIds = addUnique(cosmeticBadgeIds, 'launch-conductor');

  return {
    version: 1,
    campaignId: 'launch-2026',
    betaQualified,
    betaGiftClaimed,
    launchGiftClaimed,
    redeemedCodeIds: uniqueAllowedStrings(candidate.redeemedCodeIds, VALID_CODE_IDS),
    cosmeticBadgeIds,
  };
}

export function applyForBeta(state: LaunchCampaignState): CampaignActionResult {
  if (state.betaQualified) return failure(state, 'already-qualified');
  return success({ ...cloneState(state), betaQualified: true });
}

export function claimBetaGift(state: LaunchCampaignState): CampaignActionResult {
  if (!state.betaQualified) return failure(state, 'beta-required');
  if (state.betaGiftClaimed) return failure(state, 'already-claimed');
  return success({
    ...cloneState(state),
    betaGiftClaimed: true,
    cosmeticBadgeIds: addUnique(state.cosmeticBadgeIds, 'beta-pioneer'),
  }, BETA_REWARD);
}

export function claimLaunchGift(state: LaunchCampaignState): CampaignActionResult {
  if (state.launchGiftClaimed) return failure(state, 'already-claimed');
  return success({
    ...cloneState(state),
    launchGiftClaimed: true,
    cosmeticBadgeIds: addUnique(state.cosmeticBadgeIds, 'launch-conductor'),
  }, LAUNCH_REWARD);
}

export function redeemGiftCode(
  state: LaunchCampaignState,
  rawCode: string,
  nowMs: number,
  catalog: readonly GiftCodeDefinition[] = GIFT_CODE_CATALOG,
): CampaignActionResult {
  if (!Number.isFinite(nowMs)) throw new Error('Invalid redemption time');
  validateCatalog(catalog);

  const normalizedCode = normalizeCode(rawCode);
  if (!normalizedCode) return failure(state, 'empty-code');

  const definition = catalog.find((item) => normalizeCode(item.code) === normalizedCode);
  if (!definition) return failure(state, 'unknown-code');
  if (state.redeemedCodeIds.includes(definition.id)) return failure(state, 'already-redeemed', definition.id);
  if (nowMs < definition.startsAtMs) return failure(state, 'not-started', definition.id);
  if (nowMs > definition.expiresAtMs) return failure(state, 'expired', definition.id);

  const nextBadges = definition.reward.badgeId
    ? addUnique(state.cosmeticBadgeIds, definition.reward.badgeId)
    : [...state.cosmeticBadgeIds];
  return success({
    ...cloneState(state),
    redeemedCodeIds: addUnique(state.redeemedCodeIds, definition.id),
    cosmeticBadgeIds: nextBadges,
  }, definition.reward, definition.id);
}
