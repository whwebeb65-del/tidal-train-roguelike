import type { GameScene, SceneFactory } from '../scenes/Scene';
import type { SceneId } from './AppTypes';

export type SceneDirection = 'forward' | 'back' | 'replace';

export interface SceneRouterOptions {
  readonly transitionMs: number;
  readonly reducedMotion: boolean;
  readonly onSceneChanged?: (sceneId: SceneId) => void;
}

export class SceneRouter {
  private current: GameScene | null = null;
  private transitionToken = 0;

  public constructor(
    private readonly host: HTMLElement,
    private readonly factory: SceneFactory,
    private readonly options: SceneRouterOptions,
  ) {}

  public get currentSceneId(): SceneId | null {
    return this.current?.id ?? null;
  }

  public async go(
    sceneId: SceneId,
    direction: SceneDirection = 'forward',
  ): Promise<void> {
    if (this.current?.id === sceneId) return;

    const token = ++this.transitionToken;
    this.current?.unmount();

    const next = this.factory(sceneId);
    this.current = next;
    this.host.dataset.sceneDirection = direction;
    this.host.classList.add('scene-host--entering');
    await next.mount(this.host);
    if (token !== this.transitionToken) return;
    this.options.onSceneChanged?.(sceneId);

    if (!this.options.reducedMotion && this.options.transitionMs > 0) {
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, this.options.transitionMs);
      });
    }

    if (token !== this.transitionToken) return;
    this.host.classList.remove('scene-host--entering');
  }

  public async refresh(): Promise<void> {
    if (!this.current) return;
    await this.current.mount(this.host);
  }

  public destroy(): void {
    this.transitionToken += 1;
    this.current?.unmount();
    this.current = null;
    this.host.replaceChildren();
  }
}
