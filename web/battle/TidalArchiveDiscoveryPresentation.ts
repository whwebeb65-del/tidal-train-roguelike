import {
  tidalArchiveEnemyKey,
  tidalArchiveSkillVariantKey,
  type TideBeastArchiveId,
} from '../../src/domain/collection/TidalArchiveSystem';
import type { SkillVariantId } from '../../src/domain/skill/SkillProgressionTypes';
import type { TidalArchiveDiscoveryPresentation } from '../app/AppTypes';
import { BATTLE_VARIANT_GLYPH_URLS } from '../assets/BattleArtCatalog';
import { TIDAL_ARCHIVE_ENEMIES } from '../views/TidalArchiveCatalog';
import { getBattleUpgradeCopy } from './BattleUpgradeCopy';

export function getTidalArchiveEnemyDiscovery(
  id: TideBeastArchiveId,
): TidalArchiveDiscoveryPresentation {
  const entry = TIDAL_ARCHIVE_ENEMIES.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown tidal archive enemy: ${id}`);
  return Object.freeze({
    key: tidalArchiveEnemyKey(id),
    entryType: 'enemy',
    entryId: id,
    name: entry.name,
    artUrl: entry.artUrl,
  });
}

export function getTidalArchiveSkillVariantDiscovery(
  id: SkillVariantId,
): TidalArchiveDiscoveryPresentation {
  const copy = getBattleUpgradeCopy(id);
  return Object.freeze({
    key: tidalArchiveSkillVariantKey(id),
    entryType: 'skill-variant',
    entryId: id,
    name: copy.name,
    artUrl: BATTLE_VARIANT_GLYPH_URLS[id],
  });
}
