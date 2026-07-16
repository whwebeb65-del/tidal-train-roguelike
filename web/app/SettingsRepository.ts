export type QualityPreference = 'auto' | 'high' | 'medium' | 'low';

export interface GameSettings {
  readonly version: 1;
  readonly musicEnabled: boolean;
  readonly sfxEnabled: boolean;
  readonly reducedMotion: boolean;
  readonly qualityPreference: QualityPreference;
}

export interface SettingsRepository {
  load(): GameSettings;
  save(settings: GameSettings): void;
  reset(): void;
}

export const SETTINGS_STORAGE_KEY = 'tidal-train-settings-v1';

const QUALITY_PREFERENCES = new Set<QualityPreference>([
  'auto',
  'high',
  'medium',
  'low',
]);

export function defaultGameSettings(): GameSettings {
  return {
    version: 1,
    musicEnabled: true,
    sfxEnabled: true,
    reducedMotion: false,
    qualityPreference: 'auto',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeGameSettings(candidate: unknown): GameSettings {
  const defaults = defaultGameSettings();
  if (!isRecord(candidate) || candidate.version !== 1) return defaults;
  const qualityPreference = (
    typeof candidate.qualityPreference === 'string'
    && QUALITY_PREFERENCES.has(
      candidate.qualityPreference as QualityPreference,
    )
  )
    ? candidate.qualityPreference as QualityPreference
    : defaults.qualityPreference;
  return {
    version: 1,
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
  };
}

export function createBrowserSettingsRepository(
  storage: Storage,
): SettingsRepository {
  return {
    load(): GameSettings {
      const serialized = storage.getItem(SETTINGS_STORAGE_KEY);
      if (!serialized) return defaultGameSettings();
      try {
        return normalizeGameSettings(JSON.parse(serialized));
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
    },
  };
}
