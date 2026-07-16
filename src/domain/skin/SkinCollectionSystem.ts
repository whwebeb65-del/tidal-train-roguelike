import type { CaptainId } from '../captain/CaptainCatalog';
import {
  addPermanentStatModifiers,
  zeroPermanentStatModifiers,
} from '../progression/ProgressionTypes';
import {
  getSkinDefinition,
  type SkinId,
} from './SkinCatalog';

export function normalizeOwnedSkinIds(ids: readonly string[]): readonly string[] {
  return [...new Set(['skin-tide-base', ...ids.filter((id) => id.length > 0)])];
}

export function getSkinCollectionModifiers(ids: readonly string[]) {
  return normalizeOwnedSkinIds(ids).reduce((total, id) => {
    const definition = getSkinDefinition(id);
    return definition
      ? addPermanentStatModifiers(total, definition.modifiers)
      : total;
  }, zeroPermanentStatModifiers());
}

export function canCaptainWearSkin(
  captainId: CaptainId,
  skinId: SkinId,
): boolean {
  return getSkinDefinition(skinId)?.wearableBy.includes(captainId) ?? false;
}
