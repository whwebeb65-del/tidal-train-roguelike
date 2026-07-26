import { describe, expect, it } from 'vitest';
import {
  LEGACY_SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  createBrowserSettingsRepository,
  defaultGameSettings,
  normalizeGameSettings,
} from '../../web/app/SettingsRepository';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  public get length(): number {
    return this.values.size;
  }

  public clear(): void {
    this.values.clear();
  }

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  public removeItem(key: string): void {
    this.values.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('SettingsRepository', () => {
  it('migrates version one settings with a one-times speed default', () => {
    expect(normalizeGameSettings({
      version: 1,
      musicEnabled: false,
      sfxEnabled: true,
      reducedMotion: false,
      qualityPreference: 'high',
    })).toMatchObject({
      version: 2,
      musicEnabled: false,
      preferredBattleSpeed: 1,
    });
  });

  it('accepts only supported battle speeds', () => {
    expect(normalizeGameSettings({
      ...defaultGameSettings(),
      preferredBattleSpeed: 3,
    }).preferredBattleSpeed).toBe(3);
    expect(normalizeGameSettings({
      ...defaultGameSettings(),
      preferredBattleSpeed: 9,
    }).preferredBattleSpeed).toBe(1);
  });

  it('migrates legacy storage into version two storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      musicEnabled: false,
      sfxEnabled: true,
      reducedMotion: false,
      qualityPreference: 'high',
    }));
    const repository = createBrowserSettingsRepository(storage);

    expect(repository.load()).toMatchObject({
      version: 2,
      musicEnabled: false,
      preferredBattleSpeed: 1,
    });
    expect(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
      version: 2,
      preferredBattleSpeed: 1,
    });
  });

  it('persists a normalized version two record after correcting invalid speed', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      ...defaultGameSettings(),
      preferredBattleSpeed: 9,
    }));
    const repository = createBrowserSettingsRepository(storage);

    expect(repository.load().preferredBattleSpeed).toBe(1);
    expect(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
      version: 2,
      preferredBattleSpeed: 1,
    });
  });

  it('loads defaults, normalizes invalid values and preserves unrelated keys', () => {
    const storage = new MemoryStorage();
    storage.setItem('unrelated', 'keep');
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      musicEnabled: 'yes',
      sfxEnabled: false,
      reducedMotion: true,
      qualityPreference: 'ultra',
    }));
    const repository = createBrowserSettingsRepository(storage);

    expect(repository.load()).toEqual({
      ...defaultGameSettings(),
      sfxEnabled: false,
      reducedMotion: true,
    });

    repository.reset();
    expect(storage.getItem('unrelated')).toBe('keep');
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it('round-trips valid settings and recovers from corrupt JSON', () => {
    const storage = new MemoryStorage();
    const repository = createBrowserSettingsRepository(storage);
    const settings = {
      ...defaultGameSettings(),
      musicEnabled: false,
      qualityPreference: 'medium' as const,
    };

    repository.save(settings);
    expect(repository.load()).toEqual(settings);

    storage.setItem(SETTINGS_STORAGE_KEY, '{broken');
    expect(repository.load()).toEqual(defaultGameSettings());
  });
});
