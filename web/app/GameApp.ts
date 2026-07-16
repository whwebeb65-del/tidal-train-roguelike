import type { SceneId } from './AppTypes';
import {
  createLegacyGameRuntime,
  type LegacyGameRuntime,
} from '../LegacyGameRuntime';

export function appSceneForAction(action: string): SceneId | null {
  if (action === 'start-run' || action === 'start-daily-trial') {
    return 'battle';
  }
  if (
    action === 'station'
    || action === 'captain'
    || action === 'equipment'
    || action === 'legion'
    || action === 'store'
  ) {
    return action;
  }
  return null;
}

export class GameApp {
  private runtime: LegacyGameRuntime | null = null;

  private constructor(
    private readonly root: HTMLElement,
    private readonly storage: Storage,
    private readonly reducedMotion: boolean,
  ) {}

  public static createBrowser(root: HTMLElement): GameApp {
    const reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches ?? false;
    return new GameApp(root, window.localStorage, reducedMotion);
  }

  public async start(): Promise<void> {
    if (this.runtime) return;
    this.runtime = createLegacyGameRuntime(
      this.root,
      this.storage,
      this.reducedMotion,
    );
    await this.runtime.start();
  }

  public destroy(): void {
    this.runtime?.destroy();
    this.runtime = null;
  }
}
