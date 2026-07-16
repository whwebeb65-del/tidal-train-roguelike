import type { FeatureSceneContext, GameScene } from './Scene';

export function createStationScene(
  context: FeatureSceneContext,
): GameScene {
  let host: HTMLElement | null = null;
  return {
    id: 'station',
    mount(nextHost): void {
      host = nextHost;
      host.innerHTML = `<section class="game-scene game-scene--station">${context.renderStation()}</section>`;
    },
    unmount(): void {
      host = null;
    },
  };
}
