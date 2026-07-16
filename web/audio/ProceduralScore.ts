import type { AudioBackend } from './AudioBackend';
import type {
  MusicCue,
  ToneInstruction,
} from './AudioTypes';

const STATION_MELODY = [
  293.66,
  369.99,
  440,
  329.63,
  493.88,
  440,
  369.99,
  329.63,
] as const;
const BATTLE_PLUCK = [
  146.83,
  174.61,
  196,
  220,
  196,
  174.61,
  164.81,
  196,
  220,
  246.94,
  220,
  196,
  174.61,
  164.81,
  146.83,
  130.81,
] as const;
const VICTORY_PHRASE = [
  293.66,
  369.99,
  440,
  587.33,
  739.99,
  880,
] as const;
const DEFEAT_PHRASE = [
  293.66,
  261.63,
  220,
  174.61,
  146.83,
  110,
] as const;

export interface ProceduralScoreDebugState {
  readonly cue: MusicCue;
  readonly bpm: number;
  readonly stepIndex: number;
  readonly barIndex: number;
  readonly paused: boolean;
}

export class ProceduralScore {
  private cue: MusicCue = 'silent';
  private bpm = 92;
  private stepIndex = 0;
  private nextStepSeconds: number | null = null;
  private paused = false;
  private phraseEndSeconds = Number.POSITIVE_INFINITY;
  private transitionEndSeconds = 0;

  public constructor(private readonly backend: AudioBackend) {}

  public get debugState(): ProceduralScoreDebugState {
    return {
      cue: this.cue,
      bpm: this.bpm,
      stepIndex: this.stepIndex,
      barIndex: Math.floor(this.stepIndex / 8),
      paused: this.paused,
    };
  }

  public setCue(cue: MusicCue, nowSeconds: number): void {
    if (cue === this.cue) return;
    const preserveBattleClock = (
      cue === 'boss'
      && (this.cue === 'battle' || this.cue === 'boss')
    );
    this.cue = cue;
    this.bpm = cue === 'station' ? 92 : 122;
    this.phraseEndSeconds = cue === 'victory' || cue === 'defeat'
      ? nowSeconds + 3
      : Number.POSITIVE_INFINITY;
    if (!preserveBattleClock) {
      this.stepIndex = 0;
      this.nextStepSeconds = cue === 'silent' ? null : nowSeconds;
    }
    this.transitionEndSeconds = (
      cue === 'battle' || cue === 'station'
    )
      ? nowSeconds + 0.4
      : nowSeconds;
  }

  public update(nowSeconds: number): void {
    if (
      this.paused
      || this.cue === 'silent'
      || !Number.isFinite(nowSeconds)
    ) {
      return;
    }
    if (nowSeconds >= this.phraseEndSeconds) {
      this.setCue('silent', nowSeconds);
      return;
    }

    const secondsPerStep = 60 / this.bpm / 2;
    if (this.nextStepSeconds === null) this.nextStepSeconds = nowSeconds;
    if (this.nextStepSeconds < nowSeconds - 0.25) {
      const skipped = Math.max(
        0,
        Math.floor(
          (nowSeconds - this.nextStepSeconds) / secondsPerStep,
        ),
      );
      this.stepIndex += skipped;
      this.nextStepSeconds += skipped * secondsPerStep;
      if (this.nextStepSeconds < nowSeconds - 0.05) {
        this.nextStepSeconds = nowSeconds;
      }
    }

    let scheduledSteps = 0;
    while (
      this.nextStepSeconds <= nowSeconds + 0.2
      && scheduledSteps < 12
    ) {
      this.scheduleStep(
        this.cue,
        this.stepIndex,
        this.nextStepSeconds,
      );
      this.stepIndex += 1;
      this.nextStepSeconds += secondsPerStep;
      scheduledSteps += 1;
    }
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
    this.nextStepSeconds = null;
  }

  public reset(): void {
    this.cue = 'silent';
    this.bpm = 92;
    this.stepIndex = 0;
    this.nextStepSeconds = null;
    this.paused = false;
    this.phraseEndSeconds = Number.POSITIVE_INFINITY;
    this.transitionEndSeconds = 0;
  }

  private scheduleStep(
    cue: MusicCue,
    step: number,
    startSeconds: number,
  ): void {
    const transitionScale = startSeconds < this.transitionEndSeconds
      ? 0.52 + (
        0.48
        * Math.max(
          0,
          1 - (this.transitionEndSeconds - startSeconds) / 0.4,
        )
      )
      : 1;
    if (cue === 'station') {
      this.scheduleStationStep(step, startSeconds, transitionScale);
      return;
    }
    if (cue === 'battle' || cue === 'boss') {
      this.scheduleBattleStep(
        step,
        startSeconds,
        transitionScale,
        cue === 'boss',
      );
      return;
    }
    if (cue === 'victory' || cue === 'defeat') {
      this.schedulePhraseStep(cue, step, startSeconds);
    }
  }

  private scheduleStationStep(
    step: number,
    startSeconds: number,
    scale: number,
  ): void {
    if (step % 2 === 0) {
      const frequency = STATION_MELODY[
        Math.floor(step / 2) % STATION_MELODY.length
      ] ?? STATION_MELODY[0];
      this.tone({
        waveform: step % 4 === 0 ? 'sine' : 'triangle',
        frequencyHz: frequency,
        startSeconds,
        durationSeconds: 0.32,
        gain: 0.13 * scale,
        attackSeconds: 0.025,
        releaseSeconds: 0.2,
        pan: ((step % 8) - 3.5) / 10,
        filterHz: 1800,
      });
    }
    if (step % 4 === 0) {
      this.tone({
        waveform: 'sine',
        frequencyHz: step % 8 === 0 ? 73.42 : 110,
        startSeconds,
        durationSeconds: 0.5,
        gain: 0.12 * scale,
        attackSeconds: 0.04,
        releaseSeconds: 0.3,
        pan: 0,
        filterHz: 520,
      });
    }
    if (step % 16 === 3 || step % 16 === 11) {
      this.tone({
        waveform: 'sine',
        frequencyHz: step % 16 === 3 ? 1174.66 : 1318.51,
        startSeconds: startSeconds + 0.04,
        durationSeconds: 0.14,
        gain: 0.06 * scale,
        attackSeconds: 0.01,
        releaseSeconds: 0.1,
        pan: step % 16 === 3 ? -0.42 : 0.42,
        filterHz: 2800,
      });
    }
  }

  private scheduleBattleStep(
    step: number,
    startSeconds: number,
    scale: number,
    boss: boolean,
  ): void {
    const frequency = BATTLE_PLUCK[step % BATTLE_PLUCK.length]
      ?? BATTLE_PLUCK[0];
    this.tone({
      waveform: 'triangle',
      frequencyHz: frequency,
      startSeconds,
      durationSeconds: 0.16,
      gain: 0.1 * scale,
      attackSeconds: 0.008,
      releaseSeconds: 0.11,
      pan: step % 2 === 0 ? -0.16 : 0.16,
      filterHz: 1400,
    });
    if (step % 2 === 0) {
      this.tone({
        waveform: 'sine',
        frequencyHz: step % 4 === 0 ? 73.42 : 82.41,
        startSeconds,
        durationSeconds: 0.24,
        gain: 0.18 * scale,
        attackSeconds: 0.006,
        releaseSeconds: 0.18,
        pan: 0,
        filterHz: 480,
      });
      this.tone({
        waveform: 'square',
        frequencyHz: 118,
        startSeconds,
        durationSeconds: 0.045,
        gain: 0.025 * scale,
        attackSeconds: 0.002,
        releaseSeconds: 0.035,
        pan: 0,
        filterHz: 620,
      });
    }
    if (!boss) return;
    if (step % 2 === 0) {
      this.tone({
        waveform: 'sine',
        frequencyHz: step % 4 === 0 ? 48 : 62,
        startSeconds,
        durationSeconds: 0.28,
        gain: 0.22,
        attackSeconds: 0.01,
        releaseSeconds: 0.22,
        pan: 0,
        filterHz: 260,
      });
    }
    if (step % 16 === 0) {
      this.tone({
        waveform: 'sawtooth',
        frequencyHz: 196,
        startSeconds,
        durationSeconds: 0.46,
        gain: 0.075,
        attackSeconds: 0.02,
        releaseSeconds: 0.34,
        pan: 0,
        detuneCents: -700,
        filterHz: 900,
      });
    }
  }

  private schedulePhraseStep(
    cue: 'victory' | 'defeat',
    step: number,
    startSeconds: number,
  ): void {
    const phrase = cue === 'victory' ? VICTORY_PHRASE : DEFEAT_PHRASE;
    if (step >= phrase.length) return;
    this.tone({
      waveform: cue === 'victory' ? 'triangle' : 'sine',
      frequencyHz: phrase[step] ?? phrase[0],
      startSeconds,
      durationSeconds: cue === 'victory' ? 0.38 : 0.5,
      gain: cue === 'victory' ? 0.19 : 0.16,
      attackSeconds: 0.02,
      releaseSeconds: cue === 'victory' ? 0.24 : 0.38,
      pan: (step - phrase.length / 2) / 10,
      filterHz: cue === 'victory' ? 2400 : 900,
    });
  }

  private tone(
    instruction: Omit<ToneInstruction, 'bus'>,
  ): void {
    this.backend.scheduleTone({
      bus: 'music',
      ...instruction,
    });
  }
}
