import { describe, expect, it } from 'vitest';
import {
  createStarterEquipmentState,
  equipEquipment,
} from '../../../src/domain/equipment/EquipmentSystem';
import { createProgressionSnapshot } from '../../../src/domain/progression/ProgressionStatService';

describe('ProgressionStatService', () => {
  it('preserves baseline with only the base skin and no equipment modifiers', () => {
    const snapshot = createProgressionSnapshot({
      baseMaxHp: 100,
      ownedSkinIds: ['skin-tide-base'],
      equipmentState: {
        inventory: [],
        equippedEquipmentIds: {
          cannon: null,
          carriage: null,
          core: null,
          instrument: null,
        },
        fragments: {},
        gears: 0,
      },
    });

    expect(snapshot.maxPlayerHp).toBe(100);
    expect(snapshot.damageMultiplier).toBe(1);
    expect(snapshot.gearsMultiplier).toBe(1);
  });

  it('combines equipped gear and every owned skin', () => {
    let equipmentState = createStarterEquipmentState();
    for (const instance of equipmentState.inventory) {
      equipmentState = equipEquipment(equipmentState, instance.instanceId);
    }
    const snapshot = createProgressionSnapshot({
      baseMaxHp: 100,
      ownedSkinIds: [
        'skin-seafoam-departure',
        'skin-aurora-whale-song',
      ],
      equipmentState,
    });

    expect(snapshot.maxPlayerHp).toBe(117);
    expect(snapshot.damageFlat).toBe(2);
    expect(snapshot.damageMultiplier).toBeCloseTo(1.005);
    expect(snapshot.initialMomentum).toBe(5);
    expect(snapshot.repairBonus).toBe(8);
  });
});
