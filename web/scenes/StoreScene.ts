import type { FeatureSceneContext, GameScene } from './Scene';

export function createStoreScene(
  context: FeatureSceneContext,
): GameScene {
  let host: HTMLElement | null = null;
  return {
    id: 'store',
    mount(nextHost): void {
      host = nextHost;
      host.innerHTML = `<section class="game-scene game-scene--store">${context.renderStore()}</section>`;
    },
    unmount(): void {
      host = null;
    },
  };
}
