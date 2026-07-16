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
  private readonly onMotionPreferenceChange = (): void => {
    this.runtime?.applySettings(
      this.settings,
      this.effectiveReducedMotion(),
    );
  };

  private constructor(
    private readonly root: HTMLElement,
    private readonly storage: Storage,
    private readonly motionQuery: MediaQueryList | null,
  ) {
    this.settingsRepository = createBrowserSettingsRepository(storage);
    this.settings = this.settingsRepository.load();
  }

  public static createBrowser(root: HTMLElement): GameApp {
    const motionQuery = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ) ?? null;
    return new GameApp(root, window.localStorage, motionQuery);
  }

  public async start(): Promise<void> {
    if (this.runtime) return;
    this.motionQuery?.addEventListener(
      'change',
      this.onMotionPreferenceChange,
    );
    this.audio = new AudioManager(createWebAudioBackend());
    this.audio.applySettings(this.settings);
    this.runtime = createLegacyGameRuntime(
      this.root,
      this.storage,
      this.effectiveReducedMotion(),
      this.audio,
      {
        getSettings: () => ({ ...this.settings }),
        updateSettings: (patch) => this.updateSettings(patch),
      },
    );
    await this.runtime.start();
  }

  public updateSettings(
    patch: Partial<Omit<GameSettings, 'version'>>,
  ): GameSettings {
    this.settings = {
      ...this.settings,
      ...patch,
      version: 1,
    };
    this.settingsRepository.save(this.settings);
    this.audio?.applySettings(this.settings);
    this.runtime?.applySettings(
      this.settings,
      this.effectiveReducedMotion(),
    );
    return { ...this.settings };
  }

  public destroy(): void {
    this.motionQuery?.removeEventListener(
      'change',
      this.onMotionPreferenceChange,
    );
    this.runtime?.destroy();
    this.runtime = null;
    void this.audio?.close();
    this.audio = null;
  }

  private effectiveReducedMotion(): boolean {
    return this.settings.reducedMotion
      || (this.motionQuery?.matches ?? false);
  }
}
