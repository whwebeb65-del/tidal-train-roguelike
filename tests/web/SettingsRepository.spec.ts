import { describe, expect, it } from 'vitest';
import {
  SETTINGS_STORAGE_KEY,
  createBrowserSettingsRepository,
  defaultGameSettings,
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
