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
});
