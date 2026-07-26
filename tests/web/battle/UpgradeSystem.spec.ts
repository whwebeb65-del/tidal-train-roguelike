import { describe, expect, it } from 'vitest';
import { getBattleUpgradeDefinition } from '../../../web/battle/BattleUpgradeCatalog';
import {
  applyBattleUpgrade,
  createEmptyBattleBuild,
  createUpgradeOffer,
} from '../../../web/battle/UpgradeSystem';

describe('UpgradeSystem', () => {
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
});
