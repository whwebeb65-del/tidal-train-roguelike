import { describe, expect, it } from 'vitest';
import {
  createTidalArchiveState,
  discoverSkillVariant,
  discoverTideBeast,
  markTidalArchiveRead,
  normalizeTidalArchiveState,
} from '../../../src/domain/collection/TidalArchiveSystem';

describe('TidalArchiveSystem', () => {
  it('migrates version-1 discoveries to version 2 with no unread entries', () => {
    expect(normalizeTidalArchiveState({
      version: 1,
      discoveredEnemyKinds: ['bubble-fin'],
      discoveredSkillVariantIds: ['split-tide-arrow'],
    })).toEqual({
      version: 2,
      discoveredEnemyKinds: ['bubble-fin'],
      discoveredSkillVariantIds: ['split-tide-arrow'],
      unreadEntryKeys: [],
    });
  });

  it('normalizes discovered unread entries in authoritative catalog order', () => {
    expect(normalizeTidalArchiveState({
      version: 2,
      discoveredEnemyKinds: ['deep-echo-boss', 'bad', 'bubble-fin', 'bubble-fin'],
      discoveredSkillVariantIds: ['double-crest', 'bad', 'split-tide-arrow'],
      unreadEntryKeys: [
        'skill-variant:double-crest',
        'enemy:deep-echo-boss',
        'enemy:bad',
        'skill-variant:bad',
        'enemy:needle-jelly',
        'enemy:bubble-fin',
        'enemy:bubble-fin',
        'skill-variant:split-tide-arrow',
        1,
        null,
      ],
    })).toEqual({
      version: 2,
      discoveredEnemyKinds: ['bubble-fin', 'deep-echo-boss'],
      discoveredSkillVariantIds: ['split-tide-arrow', 'double-crest'],
      unreadEntryKeys: [
        'enemy:bubble-fin',
        'enemy:deep-echo-boss',
        'skill-variant:split-tide-arrow',
        'skill-variant:double-crest',
      ],
    });
    expect(normalizeTidalArchiveState(null)).toEqual(createTidalArchiveState());
  });

  it('marks newly discovered archive entries unread exactly once', () => {
    const initial = createTidalArchiveState();
    const firstEnemy = discoverTideBeast(initial, 'bubble-fin');
    expect(firstEnemy.unreadEntryKeys).toEqual(['enemy:bubble-fin']);
    expect(discoverTideBeast(firstEnemy, 'bubble-fin')).toBe(firstEnemy);

    const firstVariant = discoverSkillVariant(firstEnemy, 'split-tide-arrow');
    expect(firstVariant.unreadEntryKeys).toEqual([
      'enemy:bubble-fin',
      'skill-variant:split-tide-arrow',
    ]);

    const read = markTidalArchiveRead(firstVariant);
    expect(read.unreadEntryKeys).toEqual([]);
    expect(read.discoveredEnemyKinds).toEqual(['bubble-fin']);
    expect(markTidalArchiveRead(read)).toBe(read);
  });

  it('freezes the root and all state arrays against mutation', () => {
    const state = discoverSkillVariant(
      discoverTideBeast(createTidalArchiveState(), 'bubble-fin'),
      'split-tide-arrow',
    );

    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.discoveredEnemyKinds)).toBe(true);
    expect(Object.isFrozen(state.discoveredSkillVariantIds)).toBe(true);
    expect(Object.isFrozen(state.unreadEntryKeys)).toBe(true);
    expect(() => {
      (state as { version: number }).version = 1;
    }).toThrow(TypeError);
    expect(() => {
      (state.discoveredEnemyKinds as string[]).push('needle-jelly');
    }).toThrow(TypeError);
    expect(() => {
      (state.discoveredSkillVariantIds as string[]).push('double-crest');
    }).toThrow(TypeError);
    expect(() => {
      (state.unreadEntryKeys as string[]).push('enemy:needle-jelly');
    }).toThrow(TypeError);
    expect(state).toEqual({
      version: 2,
      discoveredEnemyKinds: ['bubble-fin'],
      discoveredSkillVariantIds: ['split-tide-arrow'],
      unreadEntryKeys: [
        'enemy:bubble-fin',
        'skill-variant:split-tide-arrow',
      ],
    });
  });
});
