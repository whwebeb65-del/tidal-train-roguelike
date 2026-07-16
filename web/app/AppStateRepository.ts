import {
  normalizeLaunchCampaignState,
  type LaunchCampaignState,
} from '../../src/domain/campaign/LaunchCampaignSystem';
import {
  getChinaDayId,
  normalizeDailyTrialState,
  type DailyTrialState,
} from '../../src/domain/challenge/DailyTrialSystem';
import {
  normalizeDailyCheckInState,
  type DailyCheckInState,
} from '../../src/domain/retention/DailyCheckInSystem';
import {
  getIsoWeekCycleId,
  normalizeSocialExpeditionState,
  type SocialExpeditionState,
} from '../../src/domain/social/SocialExpeditionSystem';
import {
  MAP_PROGRESSION,
  type MapId,
} from '../../src/domain/station/MapProgression';
import {
  defaultSave,
  normalizePlayerSave,
  type PlayerSave,
} from '../../src/save/SaveRepository';
import type { PersistentAppState } from './AppTypes';

export const APP_STORAGE_KEYS = {
  player: 'tidal-train-prototype-save-v1',
  social: 'tidal-train-social-v1',
  campaign: 'tidal-train-launch-campaign-v1',
  dailyTrial: 'tidal-train-daily-trial-v1',
  dailyCheckIn: 'tidal-train-daily-checkin-v1',
  selectedMap: 'tidal-train-selected-map-v1',
} as const;

export interface AppStateRepository {
  load(): PersistentAppState;
  savePlayer(next: PlayerSave): void;
  saveSocial(next: SocialExpeditionState): void;
  saveCampaign(next: LaunchCampaignState): void;
  saveDailyTrial(next: DailyTrialState): void;
  saveDailyCheckIn(next: DailyCheckInState): void;
  saveSelectedMap(next: MapId): void;
  clear(): void;
}

function readJson(storage: Storage, key: string): unknown {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readPlayer(storage: Storage): PlayerSave {
  try {
    return normalizePlayerSave(readJson(storage, APP_STORAGE_KEYS.player));
  } catch {
    return defaultSave();
  }
}

function readSelectedMap(storage: Storage, save: PlayerSave): MapId {
  const candidate = storage.getItem(APP_STORAGE_KEYS.selectedMap);
  const isKnownMap = candidate !== null
    && MAP_PROGRESSION.some((map) => map.id === candidate);
  if (candidate !== null && isKnownMap && save.unlockedMapIds.includes(candidate)) {
    return candidate as MapId;
  }
  return 'drift-suburb';
}

export function createBrowserAppStateRepository(
  storage: Storage,
  now: () => Date = () => new Date(),
): AppStateRepository {
  return {
    load(): PersistentAppState {
      const currentDate = now();
      const dayId = getChinaDayId(currentDate.getTime());
      const cycleId = getIsoWeekCycleId(currentDate);
      const save = readPlayer(storage);

      return {
        save,
        social: normalizeSocialExpeditionState(
          readJson(storage, APP_STORAGE_KEYS.social),
          cycleId,
        ),
        campaign: normalizeLaunchCampaignState(
          readJson(storage, APP_STORAGE_KEYS.campaign),
        ),
        dailyTrial: normalizeDailyTrialState(
          readJson(storage, APP_STORAGE_KEYS.dailyTrial),
          dayId,
        ),
        dailyCheckIn: normalizeDailyCheckInState(
          readJson(storage, APP_STORAGE_KEYS.dailyCheckIn),
        ),
        selectedMapId: readSelectedMap(storage, save),
      };
    },

    savePlayer(next: PlayerSave): void {
      storage.setItem(
        APP_STORAGE_KEYS.player,
        JSON.stringify(normalizePlayerSave(next)),
      );
    },

    saveSocial(next: SocialExpeditionState): void {
      storage.setItem(APP_STORAGE_KEYS.social, JSON.stringify(next));
    },

    saveCampaign(next: LaunchCampaignState): void {
      storage.setItem(APP_STORAGE_KEYS.campaign, JSON.stringify(next));
    },

    saveDailyTrial(next: DailyTrialState): void {
      storage.setItem(APP_STORAGE_KEYS.dailyTrial, JSON.stringify(next));
    },

    saveDailyCheckIn(next: DailyCheckInState): void {
      storage.setItem(APP_STORAGE_KEYS.dailyCheckIn, JSON.stringify(next));
    },

    saveSelectedMap(next: MapId): void {
      storage.setItem(APP_STORAGE_KEYS.selectedMap, next);
    },

    clear(): void {
      for (const key of Object.values(APP_STORAGE_KEYS)) {
        storage.removeItem(key);
      }
    },
  };
}
