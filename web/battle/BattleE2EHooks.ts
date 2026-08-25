import type { SceneId } from '../app/AppTypes';
import type {
  BattleFrameView,
  BattleSkillId,
} from './BattleTypes';
import type {
  BattleDiagnosticsSnapshot,
} from './BattleDiagnostics';
import type { TrainMotionFrameView } from './TrainMotionTypes';
import type {
  EffectParticleKind,
  ImpactRingView,
} from './EffectSystem';
import type { BattleSpeed } from '../../src/domain/progression/AccountProgressionSystem';
import type { BattleMusicIntensity } from '../audio/BattleMusicDirector';
import type { FirstRunBattleTutorialStepId } from '../../src/domain/onboarding/FirstRunBattleTutorial';

export interface BattleE2EEffectGeometry {
  readonly particles: readonly {
    readonly id: number;
    readonly kind: EffectParticleKind;
    readonly layer: 'enemies' | 'front-effects';
    readonly x: number;
    readonly y: number;
    readonly size: number;
    readonly color: string;
    readonly secondaryColor?: string;
    readonly alpha: number;
    readonly rotation: number;
    readonly progress: number;
    readonly sourceEnemyId?: number | null;
    readonly originX?: number;
    readonly originY?: number;
  }[];
  readonly damageNumbers: readonly {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly critical: boolean;
  }[];
  readonly rings: readonly {
    readonly id: number;
    readonly kind: NonNullable<ImpactRingView['kind']>;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly color: string;
    readonly alpha: number;
    readonly secondaryColor?: string;
  }[];
  readonly camera: Readonly<{
    readonly x: number;
    readonly y: number;
    readonly rotation: number;
    readonly amplitude: number;
  }>;
}

export interface BattleE2ESnapshot {
  readonly sceneId: SceneId;
  readonly battle: BattleFrameView | null;
  readonly trainMotion: TrainMotionFrameView | null;
  readonly effects: BattleE2EEffectGeometry | null;
  readonly diagnostics: BattleDiagnosticsSnapshot;
  readonly settlementCount: number;
  readonly verification: {
    readonly precisionWeakPointHits: number;
    readonly musicIntensity: BattleMusicIntensity;
    readonly firstRunTutorialStep: FirstRunBattleTutorialStepId | null;
    readonly effectKinds: readonly string[];
    readonly bossTideWarningActive: boolean;
    readonly cinematicTitle: string | null;
  };
  readonly progression: {
    readonly runLevel: number;
    readonly ranks: Readonly<Record<string, number>>;
    readonly variants: Readonly<Record<string, readonly string[]>>;
    readonly speed: BattleSpeed;
    readonly accountLevel: number;
    readonly xp: number;
    readonly stamina: number;
    readonly hardCap: boolean;
  };
}

export interface BattleE2EController {
  e2eSnapshot(): BattleE2ESnapshot;
  e2eNavigate(sceneId: Exclude<SceneId, 'battle'>): Promise<void>;
  e2eStartNormalBattle(): Promise<void>;
  e2eStartDailyTrial(): Promise<void>;
  e2eAdvanceBattle(durationMs: number): void;
  e2eChooseFirstUpgrade(): boolean;
  e2eSetBattleSpeed(speed: BattleSpeed): boolean;
  e2eSetMainCannonAim(x: number, y: number): boolean;
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
  setBattleSpeed(speed: BattleSpeed): boolean;
  setMainCannonAim(x: number, y: number): boolean;
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
    setBattleSpeed: (speed) => controller.e2eSetBattleSpeed(speed),
    setMainCannonAim: (x, y) => controller.e2eSetMainCannonAim(x, y),
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
