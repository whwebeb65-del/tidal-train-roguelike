import { describe, expect, it } from 'vitest';
import { defaultSave } from '../../src/save/SaveRepository';
import {
  APP_STORAGE_KEYS,
  createBrowserAppStateRepository,
} from '../../web/app/AppStateRepository';

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

describe('AppStateRepository', () => {
  it('loads safe defaults, persists slices and clears only game keys', () => {
    const storage = new MemoryStorage();
    storage.setItem('unrelated', 'keep');
    const repository = createBrowserAppStateRepository(
      storage,
      () => new Date('2026-07-16T08:00:00Z'),
    );

    const initial = repository.load();
    expect(initial.save).toEqual(defaultSave());
    expect(initial.selectedMapId).toBe('drift-suburb');

    repository.savePlayer({ ...initial.save, gears: 77 });
    expect(repository.load().save.gears).toBe(77);

    repository.clear();
    expect(storage.getItem('unrelated')).toBe('keep');
    for (const key of Object.values(APP_STORAGE_KEYS)) {
      expect(storage.getItem(key)).toBeNull();
    }
  });

  it('falls back when stored json is invalid', () => {
    const storage = new MemoryStorage();
    storage.setItem(APP_STORAGE_KEYS.player, '{bad json');
    const repository = createBrowserAppStateRepository(
      storage,
      () => new Date('2026-07-16T08:00:00Z'),
    );

    expect(repository.load().save).toEqual(defaultSave());
  });
});
