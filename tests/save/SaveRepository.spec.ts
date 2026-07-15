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

  it('rejects negative premium and progression currencies', () => {
    const repository = createMemorySaveRepository();
    expect(() => repository.save({ ...defaultSave(), routeMarks: -1 })).toThrow('Route marks cannot be negative');
    expect(() => repository.save({ ...defaultSave(), starTickets: -1 })).toThrow('Star tickets cannot be negative');
  });

  it('keeps map and interaction progress isolated from caller mutations', () => {
    const repository = createMemorySaveRepository();
    const save = {
      ...defaultSave(),
      unlockedMapIds: ['drift-suburb', 'old-port'],
      firstClearMapIds: ['drift-suburb'],
      claimedInteractionIds: ['run-1:salvage-a:0'],
    };
    repository.save(save);
    save.unlockedMapIds.push('glass-city');
    save.firstClearMapIds.push('old-port');
    save.claimedInteractionIds.push('run-1:aid-b:0');
    expect(repository.load().unlockedMapIds).toEqual(['drift-suburb', 'old-port']);
    expect(repository.load().firstClearMapIds).toEqual(['drift-suburb']);
    expect(repository.load().claimedInteractionIds).toEqual(['run-1:salvage-a:0']);
  });
});
