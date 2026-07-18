import { describe, expect, it } from 'vitest';
import { SfxSynth } from '../../../web/audio/SfxSynth';
import { RecordingAudioBackend } from './helpers/RecordingAudioBackend';

describe('SfxSynth', () => {
  it('renders every station-life cue with the exact procedural recipe', () => {
    const backend = new RecordingAudioBackend();
    const synth = new SfxSynth(backend);
    const cues = [
      'ticket-stamp',
      'station-tool',
      'station-chime',
      'station-mail',
      'station-whistle',
    ] as const;

    cues.forEach((cue, index) => {
      expect(synth.play(cue, index + 1)).toBe(true);
    });

    expect(backend.instructions).toHaveLength(11);
    expect(backend.instructions.map((tone) => ({
      frequencyHz: tone.frequencyHz,
      startSeconds: tone.startSeconds,
      durationSeconds: tone.durationSeconds,
      gain: tone.gain,
      waveform: tone.waveform,
      pan: tone.pan,
      filterHz: tone.filterHz,
    }))).toEqual([
      { frequencyHz: 180, startSeconds: 1, durationSeconds: 0.035, gain: 0.12, waveform: 'square', pan: 0, filterHz: 900 },
      { frequencyHz: 92, startSeconds: 1.025, durationSeconds: 0.055, gain: 0.1, waveform: 'triangle', pan: 0, filterHz: 480 },
      { frequencyHz: 620, startSeconds: 2, durationSeconds: 0.07, gain: 0.055, waveform: 'triangle', pan: -0.125, filterHz: 3200 },
      { frequencyHz: 410, startSeconds: 2.055, durationSeconds: 0.07, gain: 0.055, waveform: 'triangle', pan: 0, filterHz: 3200 },
      { frequencyHz: 523.25, startSeconds: 3, durationSeconds: 0.18, gain: 0.07, waveform: 'sine', pan: -0.1875, filterHz: 3200 },
      { frequencyHz: 659.25, startSeconds: 3.09, durationSeconds: 0.18, gain: 0.07, waveform: 'sine', pan: -0.0625, filterHz: 3200 },
      { frequencyHz: 783.99, startSeconds: 3.18, durationSeconds: 0.18, gain: 0.07, waveform: 'sine', pan: 0.0625, filterHz: 3200 },
      { frequencyHz: 392, startSeconds: 4, durationSeconds: 0.08, gain: 0.06, waveform: 'triangle', pan: -0.125, filterHz: 3200 },
      { frequencyHz: 493.88, startSeconds: 4.045, durationSeconds: 0.08, gain: 0.06, waveform: 'triangle', pan: 0, filterHz: 3200 },
      { frequencyHz: 293.66, startSeconds: 5, durationSeconds: 0.5, gain: 0.055, waveform: 'sine', pan: -0.35, filterHz: 1700 },
      { frequencyHz: 440, startSeconds: 5.08, durationSeconds: 0.42, gain: 0.035, waveform: 'sine', pan: 0.35, filterHz: 2200 },
    ]);
  });

  it('maps station-life cues into the shared ui, other and major limits', () => {
    const backend = new RecordingAudioBackend();
    const synth = new SfxSynth(backend);

    expect(synth.play('ticket-stamp', 0)).toBe(true);
    expect(synth.play('station-chime', 0)).toBe(true);
    expect(synth.play('ui-tap', 0)).toBe(false);
    expect(synth.debugState.activeByGroup.ui).toBe(2);

    for (let index = 0; index < 5; index += 1) {
      expect(synth.play(index % 2 === 0 ? 'station-tool' : 'station-mail', 1)).toBe(true);
    }
    expect(synth.play('station-tool', 1)).toBe(false);
    expect(synth.debugState.activeByGroup.other).toBe(5);

    expect(synth.play('station-whistle', 2)).toBe(true);
    expect(synth.play('train-depart', 2)).toBe(true);
    expect(synth.play('boss-alarm', 2)).toBe(false);
    expect(synth.debugState.activeByGroup.major).toBe(2);
  });

  it('keeps every pre-existing cue playable after station cue additions', () => {
    const backend = new RecordingAudioBackend();
    const synth = new SfxSynth(backend);
    const cues = [
      'ui-tap', 'scene-open', 'cannon', 'companion-cannon', 'hit',
      'critical-hit', 'armour-break', 'shield-hit', 'enemy-pop',
      'elite-down', 'boss-alarm', 'boss-charge', 'boss-down',
      'train-charge', 'train-depart', 'loot', 'upgrade-open',
      'upgrade-select', 'skill-volley', 'skill-barrier', 'skill-extreme',
      'skill-refresh', 'revive', 'victory', 'defeat',
    ] as const;

    expect(cues.map((cue, index) => synth.play(cue, 10 + index))).toEqual(
      cues.map(() => true),
    );
  });

  it('rotates cannon pitch and limits dense hit polyphony', () => {
    const backend = new RecordingAudioBackend();
    const synth = new SfxSynth(backend);

    synth.play('cannon', 0);
    synth.play('cannon', 0.02);
    synth.play('cannon', 0.04);
    expect(new Set(
      backend.instructions
        .filter((tone) => (
          tone.bus === 'sfx'
          && tone.waveform === 'triangle'
        ))
        .map((tone) => tone.frequencyHz),
    ).size).toBeGreaterThan(1);

    for (let index = 0; index < 20; index += 1) {
      synth.play('hit', 0.05);
    }
    expect(synth.debugState.activeByGroup.hit).toBeLessThanOrEqual(6);
  });

  it('merges dense loot sounds and differentiates active skills', () => {
    const backend = new RecordingAudioBackend();
    const synth = new SfxSynth(backend);
    const lootResults = Array.from(
      { length: 8 },
      () => synth.play('loot', 1),
    );
    synth.play('skill-volley', 2);
    synth.play('skill-barrier', 2.5);
    synth.play('skill-extreme', 3);

    expect(lootResults.filter(Boolean)).toHaveLength(3);
    const skillFrequencies = backend.instructions
      .filter((tone) => tone.startSeconds >= 2)
      .map((tone) => tone.frequencyHz);
    expect(new Set(skillFrequencies).size).toBeGreaterThan(5);
  });

  it('clears concurrency and variation state on reset', () => {
    const backend = new RecordingAudioBackend();
    const synth = new SfxSynth(backend);
    synth.play('cannon', 0);
    synth.play('hit', 0);
    synth.reset();

    expect(synth.debugState.activeByGroup.cannon).toBe(0);
    expect(synth.debugState.activeByGroup.hit).toBe(0);
    expect(synth.play('cannon', 0)).toBe(true);
  });

  it('synthesizes the filtered 110 to 220 Hz train charge rise', () => {
    const backend = new RecordingAudioBackend();
    const synth = new SfxSynth(backend);

    expect(synth.play('train-charge', 4)).toBe(true);

    const charge = backend.instructions.filter((tone) => (
      tone.startSeconds >= 4 && tone.startSeconds < 4.3
    ));
    expect(charge[0]?.frequencyHz).toBe(110);
    expect(charge.at(-1)?.frequencyHz).toBe(220);
    expect(charge.every((tone) => tone.filterHz !== undefined)).toBe(true);
    expect(charge.map((tone) => tone.filterHz)).toEqual(
      [...charge.map((tone) => tone.filterHz)].sort((left, right) => (
        (left ?? 0) - (right ?? 0)
      )),
    );
    expect(synth.debugState.activeByGroup.major).toBe(1);
  });

  it('synthesizes the exact train departure arpeggio and low pulse', () => {
    const backend = new RecordingAudioBackend();
    const synth = new SfxSynth(backend);

    expect(synth.play('train-depart', 8)).toBe(true);

    const departure = backend.instructions.filter((tone) => (
      tone.startSeconds >= 8 && tone.startSeconds < 8.4
    ));
    const arpeggio = departure.filter((tone) => tone.frequencyHz !== 70);
    expect(arpeggio.map((tone) => tone.frequencyHz)).toEqual([90, 180, 360]);
    expect(arpeggio.every((tone) => tone.durationSeconds === 0.18)).toBe(true);
    expect(departure).toEqual(expect.arrayContaining([
      expect.objectContaining({ frequencyHz: 70, waveform: 'sine' }),
    ]));
    expect(synth.debugState.activeByGroup.major).toBe(1);
  });
});
