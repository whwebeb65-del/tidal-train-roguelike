import type { SceneId } from './AppTypes';
import {
  createLegacyGameRuntime,
  type LegacyGameRuntime,
} from '../LegacyGameRuntime';
import { AudioManager } from '../audio/AudioManager';
import { createWebAudioBackend } from '../audio/WebAudioBackend';
import {
  createBrowserSettingsRepository,
  type GameSettings,
  type SettingsRepository,
} from './SettingsRepository';

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
  private audio: AudioManager | null = null;
  private readonly settingsRepository: SettingsRepository;
  private settings: GameSettings;

  private constructor(
    private readonly root: HTMLElement,
    private readonly storage: Storage,
    private readonly systemReducedMotion: boolean,
  ) {
    this.settingsRepository = createBrowserSettingsRepository(storage);
    this.settings = this.settingsRepository.load();
  }

  public static createBrowser(root: HTMLElement): GameApp {
    const systemReducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches ?? false;
    return new GameApp(root, window.localStorage, systemReducedMotion);
  }

  public async start(): Promise<void> {
    if (this.runtime) return;
    this.audio = new AudioManager(createWebAudioBackend());
    this.audio.applySettings(this.settings);
    this.runtime = createLegacyGameRuntime(
      this.root,
      this.storage,
      this.settings.reducedMotion || this.systemReducedMotion,
      this.audio,
    );
    await this.runtime.start();
  }

  public destroy(): void {
    this.runtime?.destroy();
    this.runtime = null;
    void this.audio?.close();
    this.audio = null;
  }
}
