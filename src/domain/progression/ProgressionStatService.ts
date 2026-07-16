import type { EquipmentState } from '../equipment/EquipmentSystem';
import { getEquipmentModifiers } from '../equipment/EquipmentSystem';
import { getSkinCollectionModifiers } from '../skin/SkinCollectionSystem';
import type { PermanentStatModifiers } from './ProgressionTypes';

export interface ProgressionSnapshot {
  readonly maxPlayerHp: number;
  readonly damageFlat: number;
  readonly damageMultiplier: number;
  readonly gearsMultiplier: number;
  readonly initialMomentum: number;
  readonly repairBonus: number;
  readonly skinModifiers: PermanentStatModifiers;
  readonly equipmentModifiers: PermanentStatModifiers;
}

export function createProgressionSnapshot(input: {
  readonly baseMaxHp: number;
  readonly ownedSkinIds: readonly string[];
  readonly equipmentState: EquipmentState;
}): ProgressionSnapshot {
  const skinModifiers = getSkinCollectionModifiers(input.ownedSkinIds);
  const equipmentModifiers = getEquipmentModifiers(input.equipmentState);
  return {
    maxPlayerHp: Math.floor(
      (input.baseMaxHp + equipmentModifiers.maxHpFlat)
      * (1 + equipmentModifiers.maxHpPercent + skinModifiers.maxHpPercent),
    ),
    damageFlat: equipmentModifiers.damageFlat,
    damageMultiplier:
      1 + equipmentModifiers.damagePercent + skinModifiers.damagePercent,
    gearsMultiplier:
      1 + equipmentModifiers.gearsPercent + skinModifiers.gearsPercent,
    initialMomentum: equipmentModifiers.initialMomentum,
    repairBonus: equipmentModifiers.repairFlat,
    skinModifiers,
    equipmentModifiers,
  };
}
