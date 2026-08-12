export type FirstRunBattleTutorialStepId = 'aim' | 'skill' | 'upgrade';

export type FirstRunBattleTutorialPlacement = 'battle' | 'upgrade';

export interface FirstRunBattleTutorialState {
  readonly version: 1;
  readonly completedStepIds: readonly FirstRunBattleTutorialStepId[];
  readonly skipped: boolean;
}

export interface FirstRunBattleTutorialPrompt {
  readonly stepId: FirstRunBattleTutorialStepId;
  readonly stepNumber: number;
  readonly totalSteps: 3;
  readonly placement: FirstRunBattleTutorialPlacement;
  readonly title: string;
  readonly body: string;
}

const TUTORIAL_PROMPTS: readonly FirstRunBattleTutorialPrompt[] = Object.freeze([
  Object.freeze({
    stepId: 'aim',
    stepNumber: 1,
    totalSteps: 3,
    placement: 'battle',
    title: '先盯住一只潮兽',
    body: '主炮会自动开火；点一下战场，可以让炮口优先追打那个方向。',
  }),
  Object.freeze({
    stepId: 'skill',
    stepNumber: 2,
    totalSteps: 3,
    placement: 'battle',
    title: '把技能用在潮头上',
    body: '下方三枚技能各管爆发、防护和清场；亮起时点任意一枚试试。',
  }),
  Object.freeze({
    stepId: 'upgrade',
    stepNumber: 3,
    totalSteps: 3,
    placement: 'upgrade',
    title: '挑一件真正改变打法的货',
    body: '这是本局强化，离站后重置；带“技能进化”的选项会改变技能机制。',
  }),
]);

function createState(
  completedStepIds: readonly FirstRunBattleTutorialStepId[],
  skipped: boolean,
): FirstRunBattleTutorialState {
  return Object.freeze({
    version: 1,
    completedStepIds: Object.freeze([...completedStepIds]),
    skipped,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createFirstRunBattleTutorialState(): FirstRunBattleTutorialState {
  return createState([], false);
}

export function normalizeFirstRunBattleTutorialState(
  value: unknown,
): FirstRunBattleTutorialState {
  if (!isRecord(value) || !Array.isArray(value.completedStepIds)) {
    return createFirstRunBattleTutorialState();
  }
  const candidateIds = new Set(
    value.completedStepIds.filter((stepId): stepId is string => (
      typeof stepId === 'string'
    )),
  );
  const completedStepIds: FirstRunBattleTutorialStepId[] = [];
  for (const prompt of TUTORIAL_PROMPTS) {
    if (!candidateIds.has(prompt.stepId)) break;
    completedStepIds.push(prompt.stepId);
  }
  return createState(completedStepIds, value.skipped === true);
}

export function getFirstRunBattleTutorialPrompt(
  state: FirstRunBattleTutorialState,
): FirstRunBattleTutorialPrompt | null {
  if (state.skipped) return null;
  return TUTORIAL_PROMPTS[state.completedStepIds.length] ?? null;
}

export function completeFirstRunBattleTutorialStep(
  state: FirstRunBattleTutorialState,
  stepId: FirstRunBattleTutorialStepId,
): FirstRunBattleTutorialState {
  const prompt = getFirstRunBattleTutorialPrompt(state);
  if (!prompt || prompt.stepId !== stepId) return state;
  return createState([...state.completedStepIds, stepId], false);
}

export function skipFirstRunBattleTutorial(
  state: FirstRunBattleTutorialState,
): FirstRunBattleTutorialState {
  if (state.skipped || getFirstRunBattleTutorialPrompt(state) === null) {
    return state;
  }
  return createState(state.completedStepIds, true);
}
