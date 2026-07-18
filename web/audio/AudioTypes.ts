export type MusicCue =
  | 'station'
  | 'battle'
  | 'boss'
  | 'victory'
  | 'defeat'
  | 'silent';

export type SoundCue =
  | 'ui-tap'
  | 'scene-open'
  | 'ticket-stamp'
  | 'station-tool'
  | 'station-chime'
  | 'station-mail'
  | 'station-whistle'
  | 'cannon'
  | 'companion-cannon'
  | 'hit'
  | 'critical-hit'
  | 'armour-break'
  | 'shield-hit'
  | 'enemy-pop'
  | 'elite-down'
  | 'boss-alarm'
  | 'boss-charge'
  | 'boss-down'
  | 'train-charge'
  | 'train-depart'
  | 'loot'
  | 'upgrade-open'
  | 'upgrade-select'
  | 'skill-volley'
  | 'skill-barrier'
  | 'skill-extreme'
  | 'skill-refresh'
  | 'revive'
  | 'victory'
  | 'defeat';

export type AudioBus = 'music' | 'sfx';

export interface ContinuousToneInstruction {
  readonly bus: AudioBus;
  readonly waveform: OscillatorType;
  readonly frequencyHz: number;
  readonly gain: number;
  readonly filterHz: number;
  readonly rampSeconds: number;
}

export interface ToneInstruction {
  readonly bus: AudioBus;
  readonly waveform: OscillatorType;
  readonly frequencyHz: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly gain: number;
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
  readonly pan: number;
  readonly detuneCents?: number;
  readonly filterHz?: number;
}
