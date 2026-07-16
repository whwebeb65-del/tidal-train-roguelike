import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BATTLE_ART_URLS,
  DEFERRED_BATTLE_ART_IDS,
  getCriticalBattleArtIds,
} from '../../web/assets/BattleArtCatalog';

describe('battle art catalog', () => {
  it('references local source files that exist', () => {
    for (const [id, href] of Object.entries(BATTLE_ART_URLS)) {
      const url = new URL(href);
      expect(url.protocol, `${id} must be a local source asset`).toBe('file:');
      expect(existsSync(fileURLToPath(url)), `${id} source asset`).toBe(true);
    }
  });

  it('keeps the first battle stage separate from elite and boss art', () => {
    const critical = getCriticalBattleArtIds('captainFemaleBase');

    expect(critical).toContain('captainFemaleBase');
    expect(critical).toContain('needleJelly');
    expect(critical).not.toContain('stormRayElite');
    expect(critical).not.toContain('deepEchoBoss');
    expect(DEFERRED_BATTLE_ART_IDS).toEqual([
      'stormRayElite',
      'deepEchoBoss',
    ]);
  });
});
