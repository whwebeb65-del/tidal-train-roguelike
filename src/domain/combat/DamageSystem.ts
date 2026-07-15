import type { Combatant, DamageResult } from './CombatTypes';

function assertAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amount must be a finite non-negative number');
  }
}

function assertCombatant(target: Combatant): void {
  if (!Number.isFinite(target.hp) || !Number.isFinite(target.maxHp) || !Number.isFinite(target.shield)) {
    throw new Error('Combatant values must be finite');
  }
  if (target.maxHp < 0 || target.hp < 0 || target.hp > target.maxHp || target.shield < 0) {
    throw new Error('Combatant values are out of range');
  }
}

export function applyDamage(target: Combatant, amount: number): DamageResult {
  assertCombatant(target);
  assertAmount(amount);

  const absorbedByShield = Math.min(target.shield, amount);
  const hpLost = Math.min(target.hp, amount - absorbedByShield);
  const nextTarget: Combatant = {
    ...target,
    shield: target.shield - absorbedByShield,
    hp: target.hp - hpLost,
  };

  return {
    target: nextTarget,
    absorbedByShield,
    hpLost,
    defeated: nextTarget.hp === 0,
  };
}

export function heal(target: Combatant, amount: number): Combatant {
  assertCombatant(target);
  assertAmount(amount);
  return {
    ...target,
    hp: Math.min(target.maxHp, target.hp + amount),
  };
}
