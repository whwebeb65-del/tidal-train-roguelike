import type { SceneId } from '../app/AppTypes';

export interface GameScene {
  readonly id: SceneId;
  mount(host: HTMLElement): void | Promise<void>;
  unmount(): void;
}

export type SceneFactory = (sceneId: SceneId) => GameScene;
