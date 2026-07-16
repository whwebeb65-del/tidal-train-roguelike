import { describe, expect, it } from 'vitest';
import {
  createBaseModifiers,
  UPGRADE_IDS,
} from '../../../web/battle/BattleConfig';
import {
  applyUpgrade,
  createUpgradeOffer,
} from '../../../web/battle/UpgradeSystem';

describe('UpgradeSystem', () => {
  it('offers three unique non-maxed choices deterministically', () => {
    const levels = Object.fromEntries(
      UPGRADE_IDS.map((id) => [id, 0]),
    ) as Record<(typeof UPGRADE_IDS)[number], number>;
    const first = createUpgradeOffer(17, 1, levels);
    const second = createUpgradeOffer(17, 1, levels);

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(new Set(first).size).toBe(3);
  });

  it('applies exact level changes and caps every upgrade at level three', () => {
    const levels = Object.fromEntries(
      UPGRADE_IDS.map((id) => [id, 0]),
    ) as Record<(typeof UPGRADE_IDS)[number], number>;
    let modifiers = createBaseModifiers();
    for (let level = 1; level <= 3; level += 1) {
      const result = applyUpgrade(modifiers, levels, 'rapid-reload');
      expect(result.accepted).toBe(true);
      modifiers = result.modifiers;
      Object.assign(levels, result.levels);
      expect(levels['rapid-reload']).toBe(level);
    }
    expect(
      applyUpgrade(modifiers, levels, 'rapid-reload').accepted,
    ).toBe(false);
    expect(modifiers.reloadMultiplier).toBeCloseTo(0.64);
  });
});
