import { describe, expect, it } from 'vitest';
import { applyDamage, heal } from '../../../src/domain/combat/DamageSystem';

describe('DamageSystem', () => {
  it('uses shield before hp', () => {
    const result = applyDamage({ id: 'train', hp: 80, maxHp: 100, shield: 30 }, 50);
    expect(result.absorbedByShield).toBe(30);
    expect(result.hpLost).toBe(20);
    expect(result.target.hp).toBe(60);
    expect(result.defeated).toBe(false);
  });

  it('marks a target defeated when hp reaches zero', () => {
    const result = applyDamage({ id: 'enemy', hp: 10, maxHp: 10, shield: 0 }, 10);
    expect(result.target.hp).toBe(0);
    expect(result.defeated).toBe(true);
  });

  it('does not heal above max hp', () => {
    expect(heal({ id: 'train', hp: 90, maxHp: 100, shield: 0 }, 50).hp).toBe(100);
  });

  it('rejects invalid damage and healing values', () => {
    const target = { id: 'train', hp: 90, maxHp: 100, shield: 0 };
    expect(() => applyDamage(target, -1)).toThrow('Amount must be a finite non-negative number');
    expect(() => heal(target, Number.NaN)).toThrow('Amount must be a finite non-negative number');
  });
});
