import type { AudioBackend } from './AudioBackend';
import type {
  AudioBus,
  ToneInstruction,
} from './AudioTypes';

export interface WebAudioBackendOptions {
  readonly createContext?: () => AudioContext;
}

interface WebkitAudioWindow extends Window {
  readonly webkitAudioContext?: typeof AudioContext;
}

const DEFAULT_BUS_GAIN: Readonly<Record<AudioBus, number>> = {
  music: 0.34,
  sfx: 0.55,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function browserContextFactory(): (() => AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const constructor = window.AudioContext
    ?? (window as WebkitAudioWindow).webkitAudioContext;
  return constructor ? () => new constructor() : null;
}

export function createWebAudioBackend(
  options: WebAudioBackendOptions = {},
): AudioBackend {
  const factory = options.createContext ?? browserContextFactory();
  return new WebAudioBackend(factory);
}

class WebAudioBackend implements AudioBackend {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses: Partial<Record<AudioBus, GainNode>> = {};
  private readonly busValues: Record<AudioBus, number> = {
    music: DEFAULT_BUS_GAIN.music,
    sfx: DEFAULT_BUS_GAIN.sfx,
  };
  private permanentlyClosed = false;
  private usable: boolean;

  public constructor(
    private readonly createContext: (() => AudioContext) | null,
  ) {
    this.usable = createContext !== null;
  }

  public get available(): boolean {
    return this.usable;
  }

  public get unlocked(): boolean {
    return Boolean(
      this.context
      && this.context.state !== 'closed'
      && !this.permanentlyClosed,
    );
  }

  public nowSeconds(): number {
    return this.context?.currentTime ?? 0;
  }

  public async unlock(): Promise<boolean> {
    if (!this.usable || this.permanentlyClosed) return false;
    if (!this.context) {
      try {
        const context = this.createContext?.();
        if (!context) {
          this.usable = false;
          return false;
        }
        this.context = context;
        this.createGraph(context);
      } catch {
        this.context = null;
        this.usable = false;
        return false;
      }
    }

    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        return false;
      }
    }
    return this.context.state !== 'closed';
  }

  public scheduleTone(instruction: ToneInstruction): void {
    const context = this.context;
    const bus = this.buses[instruction.bus];
    if (!context || !bus || context.state === 'closed') return;

    const start = clamp(
      instruction.startSeconds,
      context.currentTime,
      context.currentTime + 30,
    );
    const duration = clamp(instruction.durationSeconds, 0.01, 4);
    const end = start + duration;
    const attack = clamp(
      instruction.attackSeconds,
      0.001,
      Math.min(0.5, duration / 2),
    );
    const release = clamp(
      instruction.releaseSeconds,
      0.001,
      Math.min(0.75, duration / 2),
    );
    const peakGain = clamp(instruction.gain, 0, 1);

    let oscillator: OscillatorNode;
    let envelope: GainNode;
    let panner: StereoPannerNode | null = null;
    let filter: BiquadFilterNode | null = null;
    try {
      oscillator = context.createOscillator();
      envelope = context.createGain();
      panner = typeof context.createStereoPanner === 'function'
        ? context.createStereoPanner()
        : null;
      filter = instruction.filterHz !== undefined
        && typeof context.createBiquadFilter === 'function'
        ? context.createBiquadFilter()
        : null;

      oscillator.type = instruction.waveform;
      oscillator.frequency.setValueAtTime(
        clamp(instruction.frequencyHz, 20, 20_000),
        start,
      );
      oscillator.detune.setValueAtTime(
        clamp(instruction.detuneCents ?? 0, -2400, 2400),
        start,
      );
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(
        peakGain,
        start + attack,
      );
      envelope.gain.setValueAtTime(
        peakGain,
        Math.max(start + attack, end - release),
      );
      envelope.gain.linearRampToValueAtTime(0, end);
      if (panner) {
        panner.pan.setValueAtTime(
          clamp(instruction.pan, -1, 1),
          start,
        );
      }
      if (filter) {
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(
          clamp(instruction.filterHz ?? 20_000, 20, 20_000),
          start,
        );
      }

      if (filter) {
        oscillator.connect(filter);
        filter.connect(envelope);
      } else {
        oscillator.connect(envelope);
      }
      if (panner) {
        envelope.connect(panner);
        panner.connect(bus);
      } else {
        envelope.connect(bus);
      }

      const cleanup = (): void => {
        oscillator.disconnect();
        filter?.disconnect();
        envelope.disconnect();
        panner?.disconnect();
      };
      oscillator.onended = cleanup;
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    } catch {
      return;
    }
  }

  public setBusGain(
    bus: AudioBus,
    value: number,
    rampSeconds = 0,
  ): void {
    const next = clamp(value, 0, 1);
    this.busValues[bus] = next;
    const context = this.context;
    const node = this.buses[bus];
    if (!context || !node || context.state === 'closed') return;
    const now = context.currentTime;
    const ramp = clamp(rampSeconds, 0, 2);
    node.gain.cancelScheduledValues(now);
    if (ramp > 0) {
      node.gain.setValueAtTime(node.gain.value, now);
      node.gain.linearRampToValueAtTime(next, now + ramp);
      return;
    }
    node.gain.setValueAtTime(next, now);
  }

  public async suspend(): Promise<void> {
    if (!this.context || this.context.state !== 'running') return;
    try {
      await this.context.suspend();
    } catch {
      // Audio failure must never interrupt gameplay.
    }
  }

  public async resume(): Promise<boolean> {
    if (!this.context || this.permanentlyClosed) return false;
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        return false;
      }
    }
    return this.context.state === 'running';
  }

  public async close(): Promise<void> {
    if (this.permanentlyClosed) return;
    this.permanentlyClosed = true;
    const context = this.context;
    this.context = null;
    if (!context || context.state === 'closed') return;
    try {
      await context.close();
    } catch {
      // Closing is best-effort during application teardown.
    } finally {
      this.master?.disconnect();
      this.buses.music?.disconnect();
      this.buses.sfx?.disconnect();
      this.master = null;
      delete this.buses.music;
      delete this.buses.sfx;
    }
  }

  private createGraph(context: AudioContext): void {
    const master = context.createGain();
    const music = context.createGain();
    const sfx = context.createGain();
    master.gain.setValueAtTime(1, context.currentTime);
    music.gain.setValueAtTime(this.busValues.music, context.currentTime);
    sfx.gain.setValueAtTime(this.busValues.sfx, context.currentTime);
    music.connect(master);
    sfx.connect(master);
    master.connect(context.destination);
    this.master = master;
    this.buses.music = music;
    this.buses.sfx = sfx;
  }
}
