import { describe, expect, it } from 'vitest';
import {
  BATTLE_UPGRADE_DEFINITIONS,
} from '../../../web/battle/BattleUpgradeCatalog';

describe('BattleUpgradeCatalog', () => {
  it('contains nine general, three rank and twelve variant cards', () => {
    const values = Object.values(BATTLE_UPGRADE_DEFINITIONS);
    expect(values.filter((item) => item.kind === 'general')).toHaveLength(9);
    expect(values.filter((item) => item.kind === 'skill-rank')).toHaveLength(3);
    expect(values.filter((item) => item.kind === 'skill-variant')).toHaveLength(12);
    expect(new Set(values.map((item) => item.id)).size).toBe(24);
  });
});
