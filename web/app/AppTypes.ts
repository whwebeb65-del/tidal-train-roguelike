import type { LaunchCampaignState } from '../../src/domain/campaign/LaunchCampaignSystem';
import type { DailyTrialState } from '../../src/domain/challenge/DailyTrialSystem';
import type { DailyCheckInState } from '../../src/domain/retention/DailyCheckInSystem';
import type { SocialExpeditionState } from '../../src/domain/social/SocialExpeditionSystem';
import type { MapId } from '../../src/domain/station/MapProgression';
import type { PlayerSave } from '../../src/save/SaveRepository';
import type { CaptainGuidebookState } from '../../src/domain/retention/CaptainGuidebookSystem';

export type SceneId =
  | 'station'
  | 'captain'
  | 'equipment'
  | 'legion'
  | 'store'
  | 'battle';

export type RunMode = 'normal' | 'daily-trial';

export interface PersistentAppState {
  readonly save: PlayerSave;
  readonly social: SocialExpeditionState;
  readonly campaign: LaunchCampaignState;
  readonly dailyTrial: DailyTrialState;
  readonly dailyCheckIn: DailyCheckInState;
  readonly selectedMapId: MapId;
  readonly guidebook: CaptainGuidebookState;
}

export interface StartBattleRequest {
  readonly mode: RunMode;
  readonly mapId: MapId;
}

export interface BattleSettlementPresentation {
  readonly title: string;
  readonly description: string;
  readonly rewards: {
    readonly gears: number;
    readonly routeMarks: number;
    readonly starTickets: number;
  };
  readonly expeditionPoints: number;
  readonly dailyTrialScore: number | null;
  readonly firstClear?: boolean | null;
  readonly doubleSettlementAvailable: boolean;
  readonly doubled: boolean;
  readonly accountProgression?: {
    readonly gainedXp: number;
    readonly staminaSpendXp: number;
    readonly level: number;
    readonly xp: number;
    readonly levelsGained: number;
  };
  readonly skillMastery?: Readonly<Record<string, {
    readonly gainedXp: number;
    readonly level: number;
  }>>;
}
