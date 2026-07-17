import { describe, expect, it } from 'vitest';
import { SfxSynth } from '../../../web/audio/SfxSynth';
import { RecordingAudioBackend } from './helpers/RecordingAudioBackend';

describe('SfxSynth', () => {
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
