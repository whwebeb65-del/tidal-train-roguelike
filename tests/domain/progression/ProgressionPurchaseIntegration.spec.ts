import { describe, expect, it } from 'vitest';
import { settlePurchase } from '../../../src/domain/commerce/PurchaseService';
import type { EquipmentState } from '../../../src/domain/equipment/EquipmentSystem';
import { createProgressionSnapshot } from '../../../src/domain/progression/ProgressionStatService';
import {
  createMemorySaveRepository,
  normalizePlayerSave,
  type PlayerSave,
} from '../../../src/save/SaveRepository';

function equipmentState(save: PlayerSave): EquipmentState {
  return {
    inventory: save.equipmentInventory,
    equippedEquipmentIds: save.equippedEquipmentIds,
    fragments: save.equipmentFragments,
    gears: save.gears,
  };
}

function snapshot(save: PlayerSave) {
  return createProgressionSnapshot({
    baseMaxHp: 100,
    ownedSkinIds: save.ownedSkinIds,
    equipmentState: equipmentState(save),
  });
}

describe('purchased progression integration', () => {
  it('migrates, grants one permanent skin bonus, and survives serialization', () => {
    const migrated = normalizePlayerSave({
      version: 2,
      gears: 90,
      routeMarks: 3,
      starTickets: 2,
      stationLevel: 2,
      unlockedPassengerIds: ['mechanic'],
      unlockedModuleIds: ['sound-mirror'],
      unlockedMapIds: ['drift-suburb', 'old-port'],
      firstClearMapIds: ['drift-suburb'],
      claimedInteractionIds: ['run-1:salvage-a:0'],
      purchasedProductIds: [],
      processedTransactionIds: [],
      ownedCosmeticIds: [],
    });

    expect(snapshot(migrated).maxPlayerHp).toBe(100);
    expect(snapshot(migrated).damageMultiplier).toBe(1);

    const purchased = settlePurchase(migrated, {
      productId: 'aurora-whale-song-skin',
      result: { status: 'verified', transactionId: 'tx-integration-skin' },
    });
    expect(purchased.accepted).toBe(true);
    expect(purchased.save.ownedSkinIds.filter(
      (id) => id === 'skin-aurora-whale-song',
    )).toHaveLength(1);
    expect(snapshot(purchased.save).maxPlayerHp).toBe(101);
    expect(snapshot(purchased.save).damageMultiplier).toBeCloseTo(1.005);

    const serialized = JSON.stringify(purchased.save);
    const reloaded = createMemorySaveRepository(JSON.parse(serialized)).load();
    expect(reloaded.gears).toBe(90);
    expect(reloaded.unlockedMapIds).toEqual(['drift-suburb', 'old-port']);
    expect(reloaded.ownedSkinIds).toContain('skin-aurora-whale-song');
    expect(snapshot(reloaded).maxPlayerHp).toBe(101);
  });
});
