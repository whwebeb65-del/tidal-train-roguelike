import { describe, expect, it } from 'vitest';
import { createCaptainScene } from '../../web/scenes/CaptainScene';
import { createEquipmentScene } from '../../web/scenes/EquipmentScene';
import { createLegionScene } from '../../web/scenes/LegionScene';
import type { FeatureSceneContext } from '../../web/scenes/Scene';
import { createStationScene } from '../../web/scenes/StationScene';
import { createStoreScene } from '../../web/scenes/StoreScene';

describe('feature scenes', () => {
  it('mounts one independent scene body for every bottom navigation item', () => {
    const context: FeatureSceneContext = {
      renderStation: () => '<div>station-only</div>',
      renderCaptain: () => '<div>captain-only</div>',
      renderEquipment: () => '<div>equipment-only</div>',
      renderLegion: () => '<div>legion-only</div>',
      renderStore: () => '<div>store-only</div>',
      dispatch: () => undefined,
    };
    const host = { innerHTML: '' } as HTMLElement;
    const scenes = [
      createStationScene(context),
      createCaptainScene(context),
      createEquipmentScene(context),
      createLegionScene(context),
      createStoreScene(context),
    ];

    expect(scenes.map((scene) => scene.id)).toEqual([
      'station',
      'captain',
      'equipment',
      'legion',
      'store',
    ]);
    for (const scene of scenes) {
      scene.mount(host);
      expect(host.innerHTML).toContain(`game-scene--${scene.id}`);
    }
  });
});
