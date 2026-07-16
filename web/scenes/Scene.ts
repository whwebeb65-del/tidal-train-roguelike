import type { SceneId } from '../app/AppTypes';

export interface GameScene {
  readonly id: SceneId;
  mount(host: HTMLElement): void | Promise<void>;
  unmount(): void;
}

export type SceneFactory = (sceneId: SceneId) => GameScene;

export interface SceneAction {
  readonly action: string;
  readonly data: Readonly<Record<string, string>>;
}

export interface FeatureSceneContext {
  renderStation(): string;
  renderCaptain(): string;
  renderEquipment(): string;
  renderLegion(): string;
  renderStore(): string;
  dispatch(command: SceneAction): void | Promise<void>;
}
