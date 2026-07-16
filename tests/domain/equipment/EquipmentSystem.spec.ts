import { describe, expect, it } from 'vitest';
import {
  createStarterEquipmentState,
  equipEquipment,
  getEquipmentModifiers,
  rerollEquipment,
  starEquipment,
  upgradeEquipment,
} from '../../../src/domain/equipment/EquipmentSystem';

describe('EquipmentSystem', () => {
  it('grants four starter pieces without changing baseline stats', () => {
    const state = createStarterEquipmentState();
    expect(state.inventory).toHaveLength(4);
    expect(Object.values(state.equippedEquipmentIds).filter(Boolean)).toHaveLength(0);
    expect(getEquipmentModifiers(state).maxHpPercent).toBe(0);
    expect(getEquipmentModifiers(state).repairFlat).toBe(0);
  });

  it('equips only into the matching slot', () => {
    const state = createStarterEquipmentState();
    const next = equipEquipment(state, 'starter:tide-cannon');
    expect(next.equippedEquipmentIds.cannon).toBe('starter:tide-cannon');
  });

  it('activates two-piece and four-piece bonuses after equipping the set', () => {
    let state = createStarterEquipmentState();
    for (const instance of state.inventory) {
      state = equipEquipment(state, instance.instanceId);
    }
    expect(getEquipmentModifiers(state).maxHpPercent).toBeCloseTo(0.03);
    expect(getEquipmentModifiers(state).repairFlat).toBe(8);
  });

  it('upgrades, stars, and rerolls one instance immutably', () => {
    const state = { ...createStarterEquipmentState(), gears: 500 };
    const upgraded = upgradeEquipment(state, 'starter:tide-cannon');
    const starred = starEquipment(
      { ...upgraded.state, fragments: { 'tide-cannon': 10 } },
      'starter:tide-cannon',
    );
    const rerolled = rerollEquipment(
      { ...starred.state, gears: 500 },
      'starter:tide-cannon',
      [{ id: 'damage-percent', value: 0.01 }],
    );

    expect(upgraded.accepted).toBe(true);
    expect(upgraded.state.inventory[0]?.level).toBe(2);
    expect(starred.accepted).toBe(true);
    expect(starred.state.inventory[0]?.stars).toBe(1);
    expect(rerolled.accepted).toBe(true);
    expect(rerolled.state.inventory[0]?.affixes).toEqual([
      { id: 'damage-percent', value: 0.01 },
    ]);
  });
});
