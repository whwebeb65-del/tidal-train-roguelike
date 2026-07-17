import type { SceneId } from '../app/AppTypes';
import type {
  BattleFrameView,
  BattleSkillId,
} from './BattleTypes';
import type {
  BattleDiagnosticsSnapshot,
} from './BattleDiagnostics';

export interface BattleE2ESnapshot {
  readonly sceneId: SceneId;
  readonly battle: BattleFrameView | null;
  readonly diagnostics: BattleDiagnosticsSnapshot;
  readonly settlementCount: number;
}

export interface BattleE2EController {
  e2eSnapshot(): BattleE2ESnapshot;
  e2eNavigate(sceneId: Exclude<SceneId, 'battle'>): Promise<void>;
  e2eStartNormalBattle(): Promise<void>;
  e2eStartDailyTrial(): Promise<void>;
  e2eAdvanceBattle(durationMs: number): void;
  e2eChooseFirstUpgrade(): boolean;
  e2eUseSkill(skillId: BattleSkillId): boolean;
  e2eRequestPause(): void;
  e2eRequestResume(): Promise<void>;
  e2eReturnToStation(): Promise<void>;
}

export interface TidalTrainE2EHooks {
  snapshot(): BattleE2ESnapshot;
  navigate(sceneId: Exclude<SceneId, 'battle'>): Promise<void>;
  startNormalBattle(): Promise<void>;
  startDailyTrial(): Promise<void>;
  advanceBattle(durationMs: number): void;
  chooseFirstUpgrade(): boolean;
  useSkill(skillId: BattleSkillId): boolean;
  requestPause(): void;
  requestResume(): Promise<void>;
  returnToStation(): Promise<void>;
}

interface E2EWindowTarget {
  readonly location: Pick<Location, 'search'>;
  __TIDAL_TRAIN_E2E__?: TidalTrainE2EHooks;
}

declare global {
  interface Window {
    __TIDAL_TRAIN_E2E__?: TidalTrainE2EHooks;
  }
}

export function installBattleE2EHooks(
  target: E2EWindowTarget,
  controller: BattleE2EController,
): boolean {
  removeBattleE2EHooks(target);
  const enabled = new URLSearchParams(target.location.search)
    .get('e2e') === '1';
  if (!enabled) return false;

  const hooks: TidalTrainE2EHooks = {
    snapshot: () => controller.e2eSnapshot(),
    navigate: (sceneId) => controller.e2eNavigate(sceneId),
    startNormalBattle: () => controller.e2eStartNormalBattle(),
    startDailyTrial: () => controller.e2eStartDailyTrial(),
    advanceBattle: (durationMs) => (
      controller.e2eAdvanceBattle(durationMs)
    ),
    chooseFirstUpgrade: () => controller.e2eChooseFirstUpgrade(),
    useSkill: (skillId) => controller.e2eUseSkill(skillId),
    requestPause: () => controller.e2eRequestPause(),
    requestResume: () => controller.e2eRequestResume(),
    returnToStation: () => controller.e2eReturnToStation(),
  };
  Object.defineProperty(target, '__TIDAL_TRAIN_E2E__', {
    configurable: true,
    enumerable: false,
    value: hooks,
  });
  return true;
}

export function removeBattleE2EHooks(target: E2EWindowTarget): void {
  delete target.__TIDAL_TRAIN_E2E__;
}
