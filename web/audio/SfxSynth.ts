import type { AudioBackend } from './AudioBackend';
import type {
  SoundCue,
  ToneInstruction,
} from './AudioTypes';

type SfxGroup =
  | 'cannon'
  | 'hit'
  | 'enemy-pop'
  | 'loot'
  | 'ui'
  | 'major'
  | 'other';

interface GroupPolicy {
  readonly windowSeconds: number;
  readonly limit: number;
}

const GROUP_POLICIES: Readonly<Record<SfxGroup, GroupPolicy>> = {
  cannon: { windowSeconds: 0.12, limit: 4 },
  hit: { windowSeconds: 0.1, limit: 6 },
  'enemy-pop': { windowSeconds: 0.18, limit: 4 },
  loot: { windowSeconds: 0.08, limit: 3 },
  ui: { windowSeconds: 0.08, limit: 2 },
  major: { windowSeconds: 0.35, limit: 2 },
  other: { windowSeconds: 0.12, limit: 5 },
};

const GROUP_BY_CUE: Readonly<Record<SoundCue, SfxGroup>> = {
  'ui-tap': 'ui',
  'scene-open': 'ui',
  cannon: 'cannon',
  'companion-cannon': 'cannon',
  hit: 'hit',
  'critical-hit': 'hit',
  'armour-break': 'hit',
  'shield-hit': 'hit',
  'enemy-pop': 'enemy-pop',
  'elite-down': 'major',
  'boss-alarm': 'major',
  'boss-charge': 'major',
  'boss-down': 'major',
  'train-charge': 'major',
  'train-depart': 'major',
  loot: 'loot',
  'upgrade-open': 'ui',
  'upgrade-select': 'ui',
  'skill-volley': 'major',
  'skill-barrier': 'major',
  'skill-extreme': 'major',
  'skill-refresh': 'ui',
  revive: 'major',
  victory: 'major',
  defeat: 'major',
};

export interface SfxSynthDebugState {
  readonly activeByGroup: Readonly<Record<SfxGroup, number>>;
}

export class SfxSynth {
  private readonly activeUntil: Record<SfxGroup, number[]> = {
    cannon: [],
    hit: [],
    'enemy-pop': [],
    loot: [],
    ui: [],
    major: [],
    other: [],
  };
  private readonly variations = new Map<SoundCue, number>();

  public constructor(private readonly backend: AudioBackend) {}

  public get debugState(): SfxSynthDebugState {
    return {
      activeByGroup: {
        cannon: this.activeUntil.cannon.length,
        hit: this.activeUntil.hit.length,
        'enemy-pop': this.activeUntil['enemy-pop'].length,
        loot: this.activeUntil.loot.length,
        ui: this.activeUntil.ui.length,
        major: this.activeUntil.major.length,
        other: this.activeUntil.other.length,
      },
    };
  }

  public play(cue: SoundCue, nowSeconds: number): boolean {
    if (!Number.isFinite(nowSeconds)) return false;
    const group = GROUP_BY_CUE[cue];
    const policy = GROUP_POLICIES[group];
    const active = this.activeUntil[group].filter(
      (expiresAt) => expiresAt > nowSeconds,
    );
    this.activeUntil[group] = active;
    if (active.length >= policy.limit) return false;
    active.push(nowSeconds + policy.windowSeconds);
    this.scheduleRecipe(cue, nowSeconds, this.nextVariation(cue));
    return true;
  }

  public reset(): void {
    for (const group of Object.keys(this.activeUntil) as SfxGroup[]) {
      this.activeUntil[group] = [];
    }
    this.variations.clear();
  }

  private nextVariation(cue: SoundCue): number {
    const variation = this.variations.get(cue) ?? 0;
    this.variations.set(cue, variation + 1);
    return variation;
  }

  private scheduleRecipe(
    cue: SoundCue,
    nowSeconds: number,
    variation: number,
  ): void {
    switch (cue) {
      case 'ui-tap':
        this.tone(nowSeconds, 0, 620 + variation % 3 * 35, 0.05, 0.07);
        return;
      case 'scene-open':
        this.arpeggio(nowSeconds, [293.66, 369.99], 0.06, 0.08, 0.12);
        return;
      case 'cannon': {
        const base = [82.41, 92.5, 98][variation % 3] ?? 82.41;
        this.tone(nowSeconds, 0, base, 0.16, 0.24, 'triangle', 0, 420);
        this.tone(nowSeconds, 0.008, base * 5.5, 0.045, 0.055, 'square', 0.08, 1800);
        return;
      }
      case 'companion-cannon': {
        const base = [130.81, 146.83, 164.81][variation % 3] ?? 130.81;
        this.tone(nowSeconds, 0, base, 0.09, 0.13, 'triangle', -0.32, 900);
        this.tone(nowSeconds, 0.01, base * 3, 0.035, 0.045, 'sine', -0.18, 2200);
        return;
      }
      case 'hit': {
        const base = [420, 480, 540][variation % 3] ?? 420;
        this.tone(nowSeconds, 0, base, 0.035, 0.055, 'sine', 0.2, 2600);
        return;
      }
      case 'critical-hit':
        this.tone(nowSeconds, 0, 520, 0.05, 0.08, 'triangle', 0.24, 3000);
        this.tone(nowSeconds, 0.012, 1040, 0.045, 0.1, 'sine', -0.12, 4200);
        return;
      case 'armour-break':
        this.arpeggio(nowSeconds, [620, 430, 280], 0.026, 0.09, 0.1, 'sawtooth');
        return;
      case 'shield-hit':
        this.arpeggio(nowSeconds, [330, 440, 370], 0.018, 0.065, 0.07, 'sine');
        return;
      case 'enemy-pop': {
        const base = [440, 523.25, 659.25][variation % 3] ?? 440;
        this.arpeggio(nowSeconds, [base, base * 1.18], 0.025, 0.08, 0.09);
        return;
      }
      case 'elite-down':
        this.arpeggio(nowSeconds, [220, 164.81, 110, 73.42], 0.055, 0.21, 0.2, 'sawtooth');
        return;
      case 'boss-alarm':
        this.arpeggio(nowSeconds, [98, 146.83, 98], 0.12, 0.18, 0.16, 'square');
        return;
      case 'boss-charge':
        this.arpeggio(nowSeconds, [82.41, 110, 146.83, 220], 0.045, 0.13, 0.14, 'sawtooth');
        return;
      case 'boss-down':
        this.arpeggio(nowSeconds, [196, 146.83, 98, 62, 48], 0.065, 0.25, 0.23, 'triangle');
        return;
      case 'train-charge':
        [110, 146.83, 180, 220].forEach((frequency, index) => {
          this.tone(
            nowSeconds,
            index * 0.04,
            frequency,
            0.13,
            0.09,
            'triangle',
            0,
            520 + index * 360,
          );
        });
        return;
      case 'train-depart':
        this.arpeggio(nowSeconds, [90, 180, 360], 0.06, 0.18, 0.12);
        this.tone(nowSeconds, 0, 70, 0.24, 0.14, 'sine', 0, 360);
        return;
      case 'loot':
        this.arpeggio(nowSeconds, [740, 932.33, 1174.66], 0.022, 0.055, 0.05);
        return;
      case 'upgrade-open':
        this.arpeggio(nowSeconds, [293.66, 369.99, 493.88], 0.05, 0.12, 0.1);
        return;
      case 'upgrade-select':
        this.chord(nowSeconds, [293.66, 369.99, 440], 0.18, 0.11);
        return;
      case 'skill-volley':
        this.arpeggio(nowSeconds, [220, 293.66, 440, 587.33], 0.025, 0.11, 0.13, 'square');
        return;
      case 'skill-barrier':
        this.chord(nowSeconds, [261.63, 392, 523.25], 0.42, 0.12, 'sine');
        this.tone(nowSeconds, 0.08, 784, 0.26, 0.07, 'sine', 0.35, 2600);
        return;
      case 'skill-extreme':
        this.arpeggio(nowSeconds, [73.42, 146.83, 293.66, 587.33, 1174.66], 0.035, 0.18, 0.17, 'sawtooth');
        return;
      case 'skill-refresh':
        this.arpeggio(nowSeconds, [659.25, 880, 1174.66], 0.035, 0.08, 0.07);
        return;
      case 'revive':
        this.arpeggio(nowSeconds, [146.83, 220, 329.63, 440, 659.25], 0.055, 0.19, 0.14, 'triangle');
        return;
      case 'victory':
        this.arpeggio(nowSeconds, [293.66, 369.99, 440, 587.33, 739.99], 0.07, 0.24, 0.16);
        return;
      case 'defeat':
        this.arpeggio(nowSeconds, [293.66, 220, 174.61, 110], 0.09, 0.32, 0.15, 'sine');
    }
  }

  private arpeggio(
    nowSeconds: number,
    frequencies: readonly number[],
    spacingSeconds: number,
    durationSeconds: number,
    gain: number,
    waveform: OscillatorType = 'triangle',
  ): void {
    frequencies.forEach((frequency, index) => {
      this.tone(
        nowSeconds,
        index * spacingSeconds,
        frequency,
        durationSeconds,
        gain,
        waveform,
        (index - frequencies.length / 2) / 8,
        waveform === 'sawtooth' ? 1300 : 3200,
      );
    });
  }

  private chord(
    nowSeconds: number,
    frequencies: readonly number[],
    durationSeconds: number,
    gain: number,
    waveform: OscillatorType = 'triangle',
  ): void {
    frequencies.forEach((frequency, index) => {
      this.tone(
        nowSeconds,
        0,
        frequency,
        durationSeconds,
        gain,
        waveform,
        (index - frequencies.length / 2) / 6,
        2400,
      );
    });
  }

  private tone(
    nowSeconds: number,
    offsetSeconds: number,
    frequencyHz: number,
    durationSeconds: number,
    gain: number,
    waveform: OscillatorType = 'sine',
    pan = 0,
    filterHz = 2600,
  ): void {
    const instruction: ToneInstruction = {
      bus: 'sfx',
      waveform,
      frequencyHz,
      startSeconds: nowSeconds + offsetSeconds,
      durationSeconds,
      gain,
      attackSeconds: Math.min(0.012, durationSeconds / 4),
      releaseSeconds: Math.max(0.02, durationSeconds * 0.72),
      pan,
      filterHz,
    };
    this.backend.scheduleTone(instruction);
  }
}
