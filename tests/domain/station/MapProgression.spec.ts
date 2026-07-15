import { describe, expect, it } from 'vitest';
import {
  canUnlockMap,
  getMapDefinition,
  isMapUnlocked,
  unlockMap,
  unlockModule,
  unlockPassenger,
  upgradeStation,
} from '../../../src/domain/station/MapProgression';
import { defaultSave } from '../../../src/save/SaveRepository';

describe('MapProgression', () => {
  it('keeps the first map open and gates the old port at station level three', () => {
    const save = defaultSave();
    expect(isMapUnlocked(save, 'drift-suburb')).toBe(true);
    expect(canUnlockMap(save, 'old-port')).toBe(false);
    expect(getMapDefinition('old-port').minStationLevel).toBe(3);
  });

  it('unlocks old port after the station reaches level three', () => {
    const save = upgradeStation(defaultSave(), 3);
    const next = unlockMap(save, 'old-port');
    expect(next.unlockedMapIds).toEqual(['drift-suburb', 'old-port']);
    expect(unlockMap(next, 'old-port').unlockedMapIds).toEqual(['drift-suburb', 'old-port']);
  });

  it('rejects a map unlock before the required level', () => {
    expect(() => unlockMap(defaultSave(), 'old-port')).toThrow('Station level is too low');
  });

  it('deduplicates permanent passenger and module unlocks', () => {
    const save = defaultSave();
    const next = unlockModule(unlockModule(unlockPassenger(save, 'mechanic'), 'steam-cannon'), 'steam-cannon');
    expect(next.unlockedPassengerIds).toEqual(['mechanic']);
    expect(next.unlockedModuleIds).toEqual(['steam-cannon']);
  });
});
