import type { FeatureSceneContext, GameScene } from './Scene';

export function createCaptainScene(
  context: FeatureSceneContext,
): GameScene {
  let host: HTMLElement | null = null;
  return {
    id: 'captain',
    mount(nextHost): void {
      host = nextHost;
      host.innerHTML = `<section class="game-scene game-scene--captain">${context.renderCaptain()}</section>`;
    },
    unmount(): void {
      host = null;
    },
  };
}
