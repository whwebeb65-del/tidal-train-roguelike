import type { PlayerSave } from '../../save/SaveRepository';

export type CaptainGuidebookObjectiveId =
  | 'first-clear'
  | 'station-level-2'
  | 'equipment-level-2'
  | 'skill-mastery-level-5'
  | 'join-legion'
  | 'account-level-10';

export type CaptainGuidebookDestination =
  | 'battle'
  | 'station'
  | 'equipment'
  | 'captain'
  | 'legion';

export interface CaptainGuidebookState {
  readonly version: 1;
  readonly claimedObjectiveIds: readonly CaptainGuidebookObjectiveId[];
}

export interface CaptainGuidebookProgressSource {
  readonly firstClearCount: number;
  readonly stationLevel: number;
  readonly highestEquipmentLevel: number;
  readonly highestSkillMasteryLevel: number;
  readonly legionId: string | null;
  readonly accountLevel: number;
}

export interface CaptainGuidebookReward {
  readonly gears: number;
  readonly routeMarks: number;
}

export interface CaptainGuidebookObjectiveDefinition {
  readonly id: CaptainGuidebookObjectiveId;
  readonly chapter: string;
  readonly title: string;
  readonly description: string;
  readonly target: number;
  readonly destination: CaptainGuidebookDestination;
  readonly actionLabel: string;
  readonly reward: CaptainGuidebookReward;
}

export interface CaptainGuidebookObjectiveSnapshot
  extends CaptainGuidebookObjectiveDefinition {
  readonly presentation: 'current' | 'preview';
  readonly progress: number;
  readonly completed: boolean;
}

export const CAPTAIN_GUIDEBOOK_OBJECTIVES:
readonly CaptainGuidebookObjectiveDefinition[] = [
  {
    id: 'first-clear',
    chapter: '第一程',
    title: '让末班车穿过第一场潮汐',
    description: '完成一条普通航线，留下你的第一枚通关章。',
    target: 1,
    destination: 'battle',
    actionLabel: '检票出发',
    reward: { gears: 60, routeMarks: 0 },
  },
  {
    id: 'station-level-2',
    chapter: '第二程',
    title: '点亮车站的第二盏灯',
    description: '将车站升级到 Lv.2，开放更多值班功能。',
    target: 2,
    destination: 'station',
    actionLabel: '去升级',
    reward: { gears: 0, routeMarks: 2 },
  },
  {
    id: 'equipment-level-2',
    chapter: '第三程',
    title: '让海獭拧紧第一颗螺栓',
    description: '在装备舱把任意一件装备强化到 Lv.2。',
    target: 2,
    destination: 'equipment',
    actionLabel: '去装备舱',
    reward: { gears: 80, routeMarks: 0 },
  },
  {
    id: 'skill-mastery-level-5',
    chapter: '第四程',
    title: '唤醒第二种技能进化',
    description: '将任意技能精通提升到 Lv.5，扩充局内进化池。',
    target: 5,
    destination: 'captain',
    actionLabel: '去技能培养',
    reward: { gears: 0, routeMarks: 3 },
  },
  {
    id: 'join-legion',
    chapter: '第五程',
    title: '在灯塔留下你的呼号',
    description: '加入潮汐灯塔团，启用异步支援与远征。',
    target: 1,
    destination: 'legion',
    actionLabel: '去军团码头',
    reward: { gears: 100, routeMarks: 0 },
  },
  {
    id: 'account-level-10',
    chapter: '终点章',
    title: '成为独当一面的列车长',
    description: '将账号提升到 Lv.10，完成新手值班路线。',
    target: 10,
    destination: 'battle',
    actionLabel: '继续出发',
    reward: { gears: 120, routeMarks: 4 },
  },
] as const;

const OBJECTIVE_IDS = new Set<CaptainGuidebookObjectiveId>(
  CAPTAIN_GUIDEBOOK_OBJECTIVES.map(({ id }) => id),
);

export function defaultCaptainGuidebookState(): CaptainGuidebookState {
  return { version: 1, claimedObjectiveIds: [] };
}

export function normalizeCaptainGuidebookState(
  raw: unknown,
): CaptainGuidebookState {
  if (!raw || typeof raw !== 'object') return defaultCaptainGuidebookState();
  const claimed = (raw as { claimedObjectiveIds?: unknown }).claimedObjectiveIds;
  if (!Array.isArray(claimed)) return defaultCaptainGuidebookState();
  const requested = new Set(claimed.filter(
    (id): id is CaptainGuidebookObjectiveId => (
      typeof id === 'string'
      && OBJECTIVE_IDS.has(id as CaptainGuidebookObjectiveId)
    ),
  ));
  return {
    version: 1,
    claimedObjectiveIds: CAPTAIN_GUIDEBOOK_OBJECTIVES
      .map(({ id }) => id)
      .filter((id) => requested.has(id)),
  };
}

function safeProgress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function progressFor(
  id: CaptainGuidebookObjectiveId,
  source: CaptainGuidebookProgressSource,
): number {
  if (id === 'first-clear') return safeProgress(source.firstClearCount);
  if (id === 'station-level-2') return safeProgress(source.stationLevel);
  if (id === 'equipment-level-2') {
    return safeProgress(source.highestEquipmentLevel);
  }
  if (id === 'skill-mastery-level-5') {
    return safeProgress(source.highestSkillMasteryLevel);
  }
  if (id === 'join-legion') return source.legionId ? 1 : 0;
  return safeProgress(source.accountLevel);
}

export function getCaptainGuidebookSnapshot(
  state: CaptainGuidebookState,
  source: CaptainGuidebookProgressSource,
): readonly CaptainGuidebookObjectiveSnapshot[] {
  const normalized = normalizeCaptainGuidebookState(state);
  const claimed = new Set(normalized.claimedObjectiveIds);
  const firstUnclaimedIndex = CAPTAIN_GUIDEBOOK_OBJECTIVES.findIndex(
    ({ id }) => !claimed.has(id),
  );
  if (firstUnclaimedIndex < 0) return [];
  return CAPTAIN_GUIDEBOOK_OBJECTIVES
    .slice(firstUnclaimedIndex, firstUnclaimedIndex + 3)
    .map((definition, index) => {
      const progress = progressFor(definition.id, source);
      return {
        ...definition,
        presentation: index === 0 ? 'current' : 'preview',
        progress: Math.min(progress, definition.target),
        completed: progress >= definition.target,
      };
    });
}

export interface CaptainGuidebookClaimResult {
  readonly accepted: boolean;
  readonly reason: 'claimed' | 'not-current' | 'incomplete' | null;
  readonly state: CaptainGuidebookState;
  readonly save: PlayerSave;
  readonly reward: CaptainGuidebookReward;
}

export function claimCaptainGuidebookReward(
  state: CaptainGuidebookState,
  source: CaptainGuidebookProgressSource,
  objectiveId: CaptainGuidebookObjectiveId,
  save: PlayerSave,
): CaptainGuidebookClaimResult {
  const normalized = normalizeCaptainGuidebookState(state);
  const emptyReward = { gears: 0, routeMarks: 0 } as const;
  if (normalized.claimedObjectiveIds.includes(objectiveId)) {
    return { accepted: false, reason: 'claimed', state: normalized, save, reward: emptyReward };
  }
  const current = getCaptainGuidebookSnapshot(normalized, source)[0];
  if (!current || current.id !== objectiveId) {
    return { accepted: false, reason: 'not-current', state: normalized, save, reward: emptyReward };
  }
  if (!current.completed) {
    return { accepted: false, reason: 'incomplete', state: normalized, save, reward: emptyReward };
  }
  const nextState: CaptainGuidebookState = {
    version: 1,
    claimedObjectiveIds: [...normalized.claimedObjectiveIds, objectiveId],
  };
  return {
    accepted: true,
    reason: null,
    state: nextState,
    save: {
      ...save,
      gears: save.gears + current.reward.gears,
      routeMarks: save.routeMarks + current.reward.routeMarks,
    },
    reward: current.reward,
  };
}
