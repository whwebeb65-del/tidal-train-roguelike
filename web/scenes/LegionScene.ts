import type { FeatureSceneContext, GameScene } from './Scene';

export function createLegionScene(
  context: FeatureSceneContext,
): GameScene {
  let host: HTMLElement | null = null;
  return {
    id: 'legion',
    mount(nextHost): void {
      host = nextHost;
      host.innerHTML = `<section class="game-scene game-scene--legion">${context.renderLegion()}</section>`;
    },
    unmount(): void {
      host = null;
    },
  };
}
