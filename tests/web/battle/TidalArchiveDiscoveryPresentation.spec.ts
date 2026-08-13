import { describe, expect, it } from 'vitest';
import { BATTLE_VARIANT_GLYPH_URLS } from '../../../web/assets/BattleArtCatalog';
import {
  getTidalArchiveEnemyDiscovery,
  getTidalArchiveSkillVariantDiscovery,
} from '../../../web/battle/TidalArchiveDiscoveryPresentation';
import { TIDAL_ARCHIVE_ENEMIES } from '../../../web/views/TidalArchiveCatalog';

describe('TidalArchiveDiscoveryPresentation', () => {
  it('maps an enemy from the authoritative archive catalog', () => {
    const discovery = getTidalArchiveEnemyDiscovery('bubble-fin');
    const catalogEntry = TIDAL_ARCHIVE_ENEMIES.find(
      (entry) => entry.id === 'bubble-fin',
    );

    expect(discovery).toMatchObject({
      key: 'enemy:bubble-fin',
      entryType: 'enemy',
      entryId: 'bubble-fin',
      name: '泡鳍怪',
      artUrl: catalogEntry?.artUrl,
    });
    expect(Object.isFrozen(discovery)).toBe(true);
  });

  it('maps a skill variant from authoritative upgrade copy and art', () => {
    const discovery = getTidalArchiveSkillVariantDiscovery('split-tide-arrow');

    expect(discovery).toMatchObject({
      key: 'skill-variant:split-tide-arrow',
      entryType: 'skill-variant',
      entryId: 'split-tide-arrow',
      name: '分汐浪箭',
      artUrl: BATTLE_VARIANT_GLYPH_URLS['split-tide-arrow'],
    });
    expect(Object.isFrozen(discovery)).toBe(true);
  });
});
