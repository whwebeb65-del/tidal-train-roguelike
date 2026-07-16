import type { FeatureSceneContext, GameScene } from './Scene';

export function createEquipmentScene(
  context: FeatureSceneContext,
): GameScene {
  let host: HTMLElement | null = null;
  return {
    id: 'equipment',
    mount(nextHost): void {
      host = nextHost;
      host.innerHTML = `<section class="game-scene game-scene--equipment">${context.renderEquipment()}</section>`;
    },
    unmount(): void {
      host = null;
    },
  };
}
