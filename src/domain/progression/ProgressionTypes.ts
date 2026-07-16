export interface PermanentStatModifiers {
  readonly maxHpFlat: number;
  readonly maxHpPercent: number;
  readonly damageFlat: number;
  readonly damagePercent: number;
  readonly gearsPercent: number;
  readonly initialMomentum: number;
  readonly repairFlat: number;
}

export function zeroPermanentStatModifiers(): PermanentStatModifiers {
  return {
    maxHpFlat: 0,
    maxHpPercent: 0,
    damageFlat: 0,
    damagePercent: 0,
    gearsPercent: 0,
    initialMomentum: 0,
    repairFlat: 0,
  };
}

export function addPermanentStatModifiers(
  left: PermanentStatModifiers,
  right: PermanentStatModifiers,
): PermanentStatModifiers {
  return {
    maxHpFlat: left.maxHpFlat + right.maxHpFlat,
    maxHpPercent: left.maxHpPercent + right.maxHpPercent,
    damageFlat: left.damageFlat + right.damageFlat,
    damagePercent: left.damagePercent + right.damagePercent,
    gearsPercent: left.gearsPercent + right.gearsPercent,
    initialMomentum: left.initialMomentum + right.initialMomentum,
    repairFlat: left.repairFlat + right.repairFlat,
  };
}
