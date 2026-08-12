import { describe, expect, it } from 'vitest';
import {
  createTidalArchiveState,
  discoverSkillVariant,
  discoverTideBeast,
  normalizeTidalArchiveState,
} from '../../../src/domain/collection/TidalArchiveSystem';

describe('TidalArchiveSystem', () => {
  it('normalizes known entries in catalog order and filters corrupt values', () => {
    expect(normalizeTidalArchiveState({
      version: 99,
      discoveredEnemyKinds: ['deep-echo-boss', 'bad', 'bubble-fin', 'bubble-fin'],
      discoveredSkillVariantIds: ['double-crest', 'bad', 'split-tide-arrow'],
    })).toEqual({
      version: 1,
      discoveredEnemyKinds: ['bubble-fin', 'deep-echo-boss'],
      discoveredSkillVariantIds: ['split-tide-arrow', 'double-crest'],
    });
    expect(normalizeTidalArchiveState(null)).toEqual(createTidalArchiveState());
  });

  it('discovers each real entry once without mutating prior snapshots', () => {
    const initial = createTidalArchiveState();
    const enemy = discoverTideBeast(initial, 'bubble-fin');
    const variant = discoverSkillVariant(enemy, 'split-tide-arrow');
    expect(initial.discoveredEnemyKinds).toEqual([]);
    expect(variant.discoveredEnemyKinds).toEqual(['bubble-fin']);
    expect(variant.discoveredSkillVariantIds).toEqual(['split-tide-arrow']);
    expect(discoverTideBeast(enemy, 'bubble-fin')).toBe(enemy);
    expect(discoverSkillVariant(variant, 'split-tide-arrow')).toBe(variant);
    expect(Object.isFrozen(variant)).toBe(true);
  });
});
