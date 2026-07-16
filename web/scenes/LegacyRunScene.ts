import type { GameScene, SceneAction } from './Scene';

export interface LegacyRunAdapter {
  render(): string;
  dispatch(command: SceneAction): void | Promise<void>;
  destroy(): void;
}

export function createLegacyRunScene(
  adapter: LegacyRunAdapter,
): GameScene {
  let host: HTMLElement | null = null;
  return {
    id: 'battle',
    mount(nextHost): void {
      host = nextHost;
      host.innerHTML = `<section class="game-scene game-scene--battle legacy-run">${adapter.render()}</section>`;
    },
    unmount(): void {
      adapter.destroy();
      host = null;
    },
  };
}
