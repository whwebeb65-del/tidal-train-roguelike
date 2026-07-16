import { describe, expect, it } from 'vitest';
import { CAPTAIN_CATALOG } from '../../../src/domain/captain/CaptainCatalog';
import {
  createCaptainProfileState,
  equipCaptainSkin,
  selectCaptain,
} from '../../../src/domain/captain/CaptainProfileSystem';

describe('CaptainProfileSystem', () => {
  it('offers two captains with identical base stats', () => {
    expect(CAPTAIN_CATALOG.map((captain) => captain.id)).toEqual([
      'captain-tide-female',
      'captain-tide-male',
    ]);
    expect(CAPTAIN_CATALOG[0]?.baseStats).toEqual(CAPTAIN_CATALOG[1]?.baseStats);
  });

  it('selects and switches captains without changing equipped skins', () => {
    const initial = createCaptainProfileState();
    const female = selectCaptain(initial, 'captain-tide-female');
    const skinned = equipCaptainSkin(
      female,
      'captain-tide-female',
      'skin-aurora-whale-song',
    );
    const male = selectCaptain(skinned, 'captain-tide-male');

    expect(male.selectedCaptainId).toBe('captain-tide-male');
    expect(male.equippedSkinIds['captain-tide-female']).toBe(
      'skin-aurora-whale-song',
    );
  });

  it('rejects unknown captains', () => {
    expect(() => selectCaptain(
      createCaptainProfileState(),
      'unknown' as never,
    )).toThrow('Unknown captain: unknown');
  });
});
