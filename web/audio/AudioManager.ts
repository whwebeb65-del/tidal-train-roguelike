import {
  defaultGameSettings,
  type GameSettings,
} from '../app/SettingsRepository';
import type {
  BattleSoundPhase,
  BattleSoundPort,
} from '../battle/BattleSoundPort';
import type {
  BattleEvent,
  BattleFrameView,
} from '../battle/BattleTypes';
import type { AudioBackend } from './AudioBackend';
import { ProceduralScore } from './ProceduralScore';
import { SfxSynth } from './SfxSynth';
import type {
  MusicCue,
  SoundCue,
} from './AudioTypes';

const MUSIC_GAIN = 0.34;
const SFX_GAIN = 0.55;

export interface AudioManagerDebugState {
  readonly musicCue: MusicCue;
  readonly recentSoundCues: readonly SoundCue[];
  readonly score: ProceduralScore['debugState'];
  readonly settings: GameSettings;
}

export class AudioManager implements BattleSoundPort {
  private readonly score: ProceduralScore;
  private readonly sfx: SfxSynth;
  private settings = defaultGameSettings();
  private musicCue: MusicCue = 'silent';
  private readonly recentSoundCues: SoundCue[] = [];

  public constructor(private readonly backend: AudioBackend) {
    this.score = new ProceduralScore(backend);
    this.sfx = new SfxSynth(backend);
    this.applySettings(this.settings);
  }

  public get available(): boolean {
    return this.backend.available;
  }

  public get debugState(): AudioManagerDebugState {
    return {
      musicCue: this.musicCue,
      recentSoundCues: [...this.recentSoundCues],
      score: this.score.debugState,
      settings: { ...this.settings },
    };
  }

  public async unlockFromGesture(): Promise<boolean> {
    const unlocked = await this.backend.unlock();
    if (!unlocked) return false;
    this.applyBusGains(0.08);
    if (this.settings.musicEnabled) this.score.resume();
    return true;
  }

  public applySettings(settings: GameSettings): void {
    this.settings = { ...settings };
    this.applyBusGains(0.12);
    if (settings.musicEnabled) this.score.resume();
    else this.score.pause();
  }

  public setMusicCue(cue: MusicCue): void {
    if (cue === this.musicCue) return;
    this.musicCue = cue;
    this.score.setCue(cue, this.backend.nowSeconds());
  }

  public playSound(cue: SoundCue): boolean {
    this.recentSoundCues.push(cue);
    if (this.recentSoundCues.length > 32) this.recentSoundCues.shift();
    return this.sfx.play(cue, this.backend.nowSeconds());
  }

  public update(_nowMs: number): void {
    if (!this.settings.musicEnabled) return;
    this.score.update(this.backend.nowSeconds());
  }

  public consume(
    events: readonly BattleEvent[],
    _frame: BattleFrameView,
  ): void {
    for (const event of events) {
      if (event.type === 'weapon-fired') {
        this.playSound(
          event.source === 'main' ? 'cannon' : 'companion-cannon',
        );
      }
      if (event.type === 'projectile-hit') {
        this.playSound(event.critical ? 'critical-hit' : 'hit');
      }
      if (event.type === 'enemy-armour-broken') {
        this.playSound('armour-break');
      }
      if (event.type === 'train-damaged') {
        this.playSound(event.shieldAbsorbed > 0 ? 'shield-hit' : 'hit');
      }
      if (event.type === 'enemy-killed') {
        this.playSound(
          event.kind === 'deep-echo-boss'
            ? 'boss-down'
            : event.kind === 'storm-ray-elite'
              ? 'elite-down'
              : 'enemy-pop',
        );
      }
      if (event.type === 'loot-collected') this.playSound('loot');
      if (event.type === 'skill-used') {
        const cue = ({
          'tidal-volley': 'skill-volley',
          'bubble-barrier': 'skill-barrier',
          'extreme-tide': 'skill-extreme',
        } as const)[event.skillId];
        this.playSound(cue);
      }
      if (event.type === 'skill-cooldowns-refreshed') {
        this.playSound('skill-refresh');
      }
      if (
        event.type === 'upgrade-offered'
        || event.type === 'upgrade-rerolled'
      ) {
        this.playSound('upgrade-open');
      }
      if (event.type === 'upgrade-selected') {
        this.playSound('upgrade-select');
      }
      if (event.type === 'boss-intro-started') {
        this.setMusicCue('boss');
        this.playSound('boss-alarm');
      }
      if (event.type === 'boss-charge-started') {
        this.playSound('boss-charge');
      }
      if (event.type === 'battle-won') {
        this.setMusicCue('victory');
        this.playSound('victory');
      }
      if (event.type === 'battle-lost') {
        this.setMusicCue('defeat');
        this.playSound('defeat');
      }
    }
  }

  public setBattlePhase(phase: BattleSoundPhase): void {
    this.setMusicCue(phase);
  }

  public pause(): void {
    this.score.pause();
    void this.backend.suspend();
  }

  public async resume(): Promise<void> {
    await this.backend.resume();
    if (this.settings.musicEnabled) this.score.resume();
  }

  public dispose(): void {
    // BattleScene can release this shared port without closing app audio.
  }

  public async close(): Promise<void> {
    this.score.reset();
    this.sfx.reset();
    await this.backend.close();
  }

  private applyBusGains(rampSeconds: number): void {
    this.backend.setBusGain(
      'music',
      this.settings.musicEnabled ? MUSIC_GAIN : 0,
      rampSeconds,
    );
    this.backend.setBusGain(
      'sfx',
      this.settings.sfxEnabled ? SFX_GAIN : 0,
      rampSeconds,
    );
  }
}
