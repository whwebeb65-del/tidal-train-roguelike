import { describe, expect, it } from 'vitest';
import { createMemorySaveRepository, defaultSave, normalizePlayerSave } from '../../src/save/SaveRepository';

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

  it('migrates a version 1 save without losing progress', () => {
    const migrated = normalizePlayerSave({
      version: 1,
      gears: 90,
      routeMarks: 3,
      starTickets: 2,
      stationLevel: 2,
      unlockedPassengerIds: ['mechanic'],
      unlockedModuleIds: ['sound-mirror'],
      unlockedMapIds: ['drift-suburb', 'old-port'],
      firstClearMapIds: ['drift-suburb'],
      claimedInteractionIds: ['run-1:salvage-a:0'],
    });

    expect(migrated).toMatchObject({
      version: 3,
      gears: 90,
      stationLevel: 2,
      purchasedProductIds: [],
      processedTransactionIds: [],
      ownedCosmeticIds: [],
    });
  });

  it('deep copies commerce ownership arrays', () => {
    const repository = createMemorySaveRepository();
    const save = {
      ...defaultSave(),
      purchasedProductIds: ['starter-star-ticket-pack'],
      processedTransactionIds: ['tx-1'],
      ownedCosmeticIds: ['deep-sea-engine'],
    };
    repository.save(save);
    save.purchasedProductIds.push('mutated');
    save.processedTransactionIds.push('tx-2');
    save.ownedCosmeticIds.push('mutated-cosmetic');

    expect(repository.load().purchasedProductIds).toEqual(['starter-star-ticket-pack']);
    expect(repository.load().processedTransactionIds).toEqual(['tx-1']);
    expect(repository.load().ownedCosmeticIds).toEqual(['deep-sea-engine']);
  });

  it('migrates a version 2 save into captain, skin, and equipment progress', () => {
    const migrated = normalizePlayerSave({
      version: 2,
      gears: 250,
      routeMarks: 12,
      starTickets: 3,
      stationLevel: 2,
      unlockedPassengerIds: ['otter-mechanic'],
      unlockedModuleIds: ['pressure-cannon'],
      unlockedMapIds: ['drift-suburb', 'coral-furnace'],
      firstClearMapIds: ['drift-suburb'],
      claimedInteractionIds: ['run-1:salvage-a:0'],
      purchasedProductIds: ['starter-star-ticket-pack'],
      processedTransactionIds: ['tx-old-1'],
      ownedCosmeticIds: ['deep-sea-engine'],
    });

    expect(migrated.version).toBe(3);
    expect(migrated.selectedCaptainId).toBeNull();
    expect(migrated.ownedSkinIds).toEqual(['skin-tide-base']);
    expect(migrated.equipmentInventory).toHaveLength(4);
    expect(Object.values(migrated.equippedEquipmentIds).filter(Boolean)).toHaveLength(0);
    expect(migrated.equipmentFragments).toEqual({});
    expect(migrated.ownedCosmeticIds).toEqual(['deep-sea-engine']);
  });

  it('deep copies progression collections', () => {
    const repository = createMemorySaveRepository();
    const save = repository.load();
    save.ownedSkinIds.push('skin-aurora-whale-song');
    save.equipmentFragments['tide-cannon'] = 10;
    repository.save(save);
    save.ownedSkinIds.push('mutation');
    save.equipmentFragments['tide-cannon'] = 999;

    expect(repository.load().ownedSkinIds).toEqual([
      'skin-tide-base',
      'skin-aurora-whale-song',
    ]);
    expect(repository.load().equipmentFragments['tide-cannon']).toBe(10);
  });
});
