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
    expect(initial.guidebook).toEqual({ version: 1, claimedObjectiveIds: [] });
    expect(initial.firstRunBattleTutorial).toEqual({
      version: 1,
      completedStepIds: [],
      skipped: false,
    });
    expect(initial.tidalArchive).toEqual({
      version: 2,
      discoveredEnemyKinds: [],
      discoveredSkillVariantIds: [],
      unreadEntryKeys: [],
    });

    repository.savePlayer({ ...initial.save, gears: 77 });
    expect(repository.load().save.gears).toBe(77);
    repository.saveGuidebook({
      version: 1,
      claimedObjectiveIds: ['first-clear'],
    });
    expect(repository.load().guidebook.claimedObjectiveIds)
      .toEqual(['first-clear']);
    repository.saveFirstRunBattleTutorial({
      version: 1,
      completedStepIds: ['aim'],
      skipped: false,
    });
    expect(repository.load().firstRunBattleTutorial.completedStepIds)
      .toEqual(['aim']);
    repository.saveTidalArchive({
      version: 2,
      discoveredEnemyKinds: ['bubble-fin'],
      discoveredSkillVariantIds: ['split-tide-arrow'],
      unreadEntryKeys: [],
    });
    expect(repository.load().tidalArchive.discoveredEnemyKinds)
      .toEqual(['bubble-fin']);

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

  it('normalizes malformed guidebook claims without affecting the player save', () => {
    const storage = new MemoryStorage();
    storage.setItem(APP_STORAGE_KEYS.guidebook, JSON.stringify({
      version: 99,
      claimedObjectiveIds: ['station-level-2', 'bad', 'station-level-2'],
    }));
    const repository = createBrowserAppStateRepository(storage);

    expect(repository.load().guidebook).toEqual({
      version: 1,
      claimedObjectiveIds: ['station-level-2'],
    });
    expect(repository.load().save).toEqual(defaultSave());
  });

  it('normalizes malformed first-run tutorial progress without affecting the player save', () => {
    const storage = new MemoryStorage();
    storage.setItem(APP_STORAGE_KEYS.firstRunBattleTutorial, JSON.stringify({
      version: 99,
      completedStepIds: ['aim', 'upgrade', 'bad', 'aim'],
      skipped: 'yes',
    }));
    const repository = createBrowserAppStateRepository(storage);

    expect(repository.load().firstRunBattleTutorial).toEqual({
      version: 1,
      completedStepIds: ['aim'],
      skipped: false,
    });
    expect(repository.load().save).toEqual(defaultSave());
  });

  it('normalizes malformed tidal archive discoveries in catalog order', () => {
    const storage = new MemoryStorage();
    storage.setItem(APP_STORAGE_KEYS.tidalArchive, JSON.stringify({
      version: 99,
      discoveredEnemyKinds: ['reef-crab', 'unknown', 'bubble-fin', 'reef-crab'],
      discoveredSkillVariantIds: [
        'double-crest',
        'unknown',
        'split-tide-arrow',
        'double-crest',
      ],
    }));
    const repository = createBrowserAppStateRepository(storage);

    expect(repository.load().tidalArchive).toEqual({
      version: 2,
      discoveredEnemyKinds: ['bubble-fin', 'reef-crab'],
      discoveredSkillVariantIds: ['split-tide-arrow', 'double-crest'],
      unreadEntryKeys: [],
    });
    expect(repository.load().save).toEqual(defaultSave());
  });
});
