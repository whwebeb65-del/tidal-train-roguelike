import type { BattleSpeed } from '../../src/domain/progression/AccountProgressionSystem';

export type QualityPreference = 'auto' | 'high' | 'medium' | 'low';

export interface GameSettings {
  readonly version: 2;
  readonly musicEnabled: boolean;
  readonly sfxEnabled: boolean;
  readonly reducedMotion: boolean;
  readonly qualityPreference: QualityPreference;
  readonly preferredBattleSpeed: BattleSpeed;
}

export interface SettingsRepository {
  load(): GameSettings;
  save(settings: GameSettings): void;
  reset(): void;
}

export const SETTINGS_STORAGE_KEY = 'tidal-train-settings-v2';
export const LEGACY_SETTINGS_STORAGE_KEY = 'tidal-train-settings-v1';

const QUALITY_PREFERENCES = new Set<QualityPreference>([
  'auto',
  'high',
  'medium',
  'low',
]);

const BATTLE_SPEEDS = new Set<BattleSpeed>([1, 1.5, 2, 3]);

export function defaultGameSettings(): GameSettings {
  return {
    version: 2,
    musicEnabled: true,
    sfxEnabled: true,
    reducedMotion: false,
    qualityPreference: 'auto',
    preferredBattleSpeed: 1,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeGameSettings(candidate: unknown): GameSettings {
  const defaults = defaultGameSettings();
  if (
    !isRecord(candidate)
    || (candidate.version !== 1 && candidate.version !== 2)
  ) return defaults;
  const qualityPreference = (
    typeof candidate.qualityPreference === 'string'
    && QUALITY_PREFERENCES.has(
      candidate.qualityPreference as QualityPreference,
    )
  )
    ? candidate.qualityPreference as QualityPreference
    : defaults.qualityPreference;
  return {
    version: 2,
    musicEnabled: typeof candidate.musicEnabled === 'boolean'
      ? candidate.musicEnabled
      : defaults.musicEnabled,
    sfxEnabled: typeof candidate.sfxEnabled === 'boolean'
      ? candidate.sfxEnabled
      : defaults.sfxEnabled,
    reducedMotion: typeof candidate.reducedMotion === 'boolean'
      ? candidate.reducedMotion
      : defaults.reducedMotion,
    qualityPreference,
    preferredBattleSpeed: BATTLE_SPEEDS.has(
      candidate.preferredBattleSpeed as BattleSpeed,
    )
      ? candidate.preferredBattleSpeed as BattleSpeed
      : defaults.preferredBattleSpeed,
  };
}

export function createBrowserSettingsRepository(
  storage: Storage,
): SettingsRepository {
  return {
    load(): GameSettings {
      const serialized = storage.getItem(SETTINGS_STORAGE_KEY)
        ?? storage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
      if (!serialized) return defaultGameSettings();
      try {
        const settings = normalizeGameSettings(JSON.parse(serialized));
        storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        return settings;
      } catch {
        return defaultGameSettings();
      }
    },
    save(settings): void {
      storage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(normalizeGameSettings(settings)),
      );
    },
    reset(): void {
      storage.removeItem(SETTINGS_STORAGE_KEY);
      storage.removeItem(LEGACY_SETTINGS_STORAGE_KEY);
    },
  };
}
