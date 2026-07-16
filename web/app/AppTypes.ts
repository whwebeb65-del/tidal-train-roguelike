import type { LaunchCampaignState } from '../../src/domain/campaign/LaunchCampaignSystem';
import type { DailyTrialState } from '../../src/domain/challenge/DailyTrialSystem';
import type { DailyCheckInState } from '../../src/domain/retention/DailyCheckInSystem';
import type { SocialExpeditionState } from '../../src/domain/social/SocialExpeditionSystem';
import type { MapId } from '../../src/domain/station/MapProgression';
import type { PlayerSave } from '../../src/save/SaveRepository';

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
}

export interface StartBattleRequest {
  readonly mode: RunMode;
  readonly mapId: MapId;
}
