import { describe, expect, it } from 'vitest';
import { createMemorySaveRepository, defaultSave } from '../../src/save/SaveRepository';

describe('SaveRepository', () => {
  it('returns a safe default save when no data exists', () => {
    const repository = createMemorySaveRepository();
    expect(repository.load()).toEqual(defaultSave());
  });

  it('persists a deep copy of valid progress', () => {
    const repository = createMemorySaveRepository();
    const save = { ...defaultSave(), gears: 20, unlockedPassengerIds: ['mechanic'] };
    repository.save(save);
    save.unlockedPassengerIds.push('doctor');
    expect(repository.load().unlockedPassengerIds).toEqual(['mechanic']);
  });

  it('rejects negative gears', () => {
    const repository = createMemorySaveRepository();
    expect(() => repository.save({ ...defaultSave(), gears: -1 })).toThrow('Gears cannot be negative');
  });
});
