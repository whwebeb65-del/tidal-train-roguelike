import { describe, expect, it } from 'vitest';
import {
  BATTLE_UPGRADE_DEFINITIONS,
  getBattleUpgradeDefinition,
} from '../../../web/battle/BattleUpgradeCatalog';
import {
  applyBattleUpgrade,
  createEmptyBattleBuild,
  createUpgradeOffer,
  isEvolutionMilestone,
} from '../../../web/battle/UpgradeSystem';
import type { BattleGeneralUpgradeId } from '../../../web/battle/BattleTypes';

describe('UpgradeSystem', () => {
  it('guarantees one legal evolution at run levels 5, 10, 15 and 20', () => {
    const build = createEmptyBattleBuild({
      skillRanks: {
        'tidal-volley': 2,
        'bubble-barrier': 2,
        'extreme-tide': 2,
      },
    });
    const unlocked = [
      'split-tide-arrow',
      'bursting-bubble',
      'undertow-eye',
    ] as const;

    for (const level of [5, 10, 15, 20]) {
      expect(isEvolutionMilestone(level)).toBe(true);
      const offer = createUpgradeOffer(71, level, build, unlocked, 0);
      expect(offer.some((id) => (
        getBattleUpgradeDefinition(id).kind === 'skill-variant'
      ))).toBe(true);
    }
    expect(isEvolutionMilestone(6)).toBe(false);
  });

  it('makes the three starter evolutions legal before any skill rank upgrade', () => {
    const offer = createUpgradeOffer(
      91,
      5,
      createEmptyBattleBuild(),
      ['split-tide-arrow', 'bursting-bubble', 'undertow-eye'],
      0,
    );

    expect(offer.some((id) => (
      getBattleUpgradeDefinition(id).kind === 'skill-variant'
    ))).toBe(true);
  });

  it('always offers one skill card, one general card and no duplicates', () => {
    const build = createEmptyBattleBuild();
    const offer = createUpgradeOffer(
      17,
      7,
      build,
      ['split-tide-arrow'],
      0,
    );
    const definitions = offer.map(getBattleUpgradeDefinition);

    expect(offer).toHaveLength(3);
    expect(new Set(offer).size).toBe(3);
    expect(definitions.some((item) => item.kind !== 'general')).toBe(true);
    expect(definitions.some((item) => item.kind === 'general')).toBe(true);
    expect(createUpgradeOffer(17, 7, build, ['split-tide-arrow'], 0))
      .toEqual(offer);
  });

  it('changes a deterministic legal offer when the reroll changes', () => {
    const build = createEmptyBattleBuild();
    const first = createUpgradeOffer(17, 7, build, [], 0);
    const rerolled = createUpgradeOffer(17, 7, build, [], 1);

    expect(rerolled).not.toEqual(first);
    for (const offer of [first, rerolled]) {
      const definitions = offer.map(getBattleUpgradeDefinition);
      expect(new Set(offer).size).toBe(offer.length);
      expect(definitions.some((item) => item.kind === 'general')).toBe(true);
      expect(definitions.some((item) => item.kind !== 'general')).toBe(true);
    }
  });

  it('does not offer locked, maxed, under-ranked or third variants', () => {
    const build = createEmptyBattleBuild({
      skillRanks: { 'tidal-volley': 2, 'bubble-barrier': 5, 'extreme-tide': 1 },
      skillVariants: {
        'tidal-volley': ['split-tide-arrow', 'reef-piercer'],
        'bubble-barrier': [],
        'extreme-tide': [],
      },
    });
    const offer = createUpgradeOffer(9, 12, build, ['returning-volley'], 0);

    expect(offer).not.toContain('returning-volley');
    expect(offer).not.toContain('rank-bubble-barrier');
    expect(offer).not.toContain('rainstorm-school');
    expect(offer).not.toContain('undertow-eye');
  });

  it('applies general, rank and variant cards without mutating the build', () => {
    const build = createEmptyBattleBuild({
      skillRanks: { 'tidal-volley': 2, 'bubble-barrier': 1, 'extreme-tide': 1 },
    });

    const general = applyBattleUpgrade(build, 'rapid-reload');
    const ranked = applyBattleUpgrade(general, 'rank-tidal-volley');
    const variant = applyBattleUpgrade(ranked, 'split-tide-arrow');

    expect(build.generalLevels['rapid-reload']).toBe(0);
    expect(general.generalLevels['rapid-reload']).toBe(1);
    expect(ranked.skillRanks['tidal-volley']).toBe(3);
    expect(variant.skillVariants['tidal-volley']).toEqual(['split-tide-arrow']);
    expect(applyBattleUpgrade(variant, 'split-tide-arrow')).toEqual(variant);
  });

  it('returns a fully detached build for applied and no-op upgrades', () => {
    const build = createEmptyBattleBuild({
      skillRanks: { 'tidal-volley': 2, 'bubble-barrier': 1, 'extreme-tide': 1 },
      skillVariants: {
        'tidal-volley': ['split-tide-arrow'],
        'bubble-barrier': [],
        'extreme-tide': [],
      },
    });

    for (const result of [
      applyBattleUpgrade(build, 'rapid-reload'),
      applyBattleUpgrade(build, 'split-tide-arrow'),
    ]) {
      expect(result).not.toBe(build);
      expect(result.generalLevels).not.toBe(build.generalLevels);
      expect(result.skillRanks).not.toBe(build.skillRanks);
      expect(result.skillVariants).not.toBe(build.skillVariants);
      for (const skillId of ['tidal-volley', 'bubble-barrier', 'extreme-tide'] as const) {
        expect(result.skillVariants[skillId]).not.toBe(build.skillVariants[skillId]);
      }
    }
  });

  it('handles the cap and eligibility behavior for all catalog cards', () => {
    for (const definition of Object.values(BATTLE_UPGRADE_DEFINITIONS)) {
      const skillId = definition.skillId;
      const applicable = definition.kind === 'skill-variant'
        ? createEmptyBattleBuild({
          skillRanks: { 'tidal-volley': 2, 'bubble-barrier': 2, 'extreme-tide': 2 },
        })
        : createEmptyBattleBuild();
      const applied = applyBattleUpgrade(applicable, definition.id);

      if (definition.kind === 'general') {
        const generalId = definition.id as BattleGeneralUpgradeId;
        expect(applied.generalLevels[generalId]).toBe(1);
        expect(
          applyBattleUpgrade(createEmptyBattleBuild({
            generalLevels: { ...applicable.generalLevels, [generalId]: 3 },
          }), definition.id).generalLevels[generalId],
        ).toBe(3);
      } else if (definition.kind === 'skill-rank') {
        expect(applied.skillRanks[skillId!]).toBe(2);
        expect(
          applyBattleUpgrade(createEmptyBattleBuild({
            skillRanks: { ...applicable.skillRanks, [skillId!]: 5 },
          }), definition.id).skillRanks[skillId!],
        ).toBe(5);
      } else {
        expect(applied.skillVariants[skillId!]).toContain(definition.id);
        const appliedAgain = applyBattleUpgrade(applied, definition.id);
        expect(appliedAgain.skillVariants[skillId!]).toEqual(
          applied.skillVariants[skillId!],
        );
        expect(appliedAgain.skillVariants[skillId!]).toHaveLength(1);
        expect(appliedAgain).not.toBe(applied);
        expect(appliedAgain.generalLevels).not.toBe(applied.generalLevels);
        expect(appliedAgain.skillRanks).not.toBe(applied.skillRanks);
        expect(appliedAgain.skillVariants).not.toBe(applied.skillVariants);
        expect(appliedAgain.skillVariants[skillId!])
          .not.toBe(applied.skillVariants[skillId!]);
        expect(
          applyBattleUpgrade(createEmptyBattleBuild({
            skillRanks: { 'tidal-volley': 1, 'bubble-barrier': 1, 'extreme-tide': 1 },
          }), definition.id).skillVariants[skillId!],
        ).toHaveLength(definition.requiredRank === 1 ? 1 : 0);
      }
    }
  });

  it('rejects a third variant while returning a fully detached equal build', () => {
    const build = createEmptyBattleBuild({
      skillRanks: { 'tidal-volley': 2, 'bubble-barrier': 1, 'extreme-tide': 1 },
      skillVariants: {
        'tidal-volley': ['split-tide-arrow', 'reef-piercer'],
        'bubble-barrier': [],
        'extreme-tide': [],
      },
    });
    const result = applyBattleUpgrade(build, 'returning-volley');

    expect(result).toEqual(build);
    expect(result).not.toBe(build);
    expect(result.generalLevels).not.toBe(build.generalLevels);
    expect(result.skillRanks).not.toBe(build.skillRanks);
    expect(result.skillVariants).not.toBe(build.skillVariants);
    for (const skillId of ['tidal-volley', 'bubble-barrier', 'extreme-tide'] as const) {
      expect(result.skillVariants[skillId]).not.toBe(build.skillVariants[skillId]);
    }
  });
});
