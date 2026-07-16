import { describe, expect, it } from 'vitest';
import { ProceduralScore } from '../../../web/audio/ProceduralScore';
import { RecordingAudioBackend } from './helpers/RecordingAudioBackend';

describe('ProceduralScore', () => {
  it('uses 92 BPM at station, 122 BPM in battle and layers boss without restarting battle bars', () => {
    const backend = new RecordingAudioBackend();
    const score = new ProceduralScore(backend);

    score.setCue('station', 0);
    score.update(2);
    expect(score.debugState.bpm).toBe(92);

    score.setCue('battle', 4);
    score.update(6);
    const battleBar = score.debugState.barIndex;

    score.setCue('boss', 6);
    score.update(8);
    expect(score.debugState.bpm).toBe(122);
    expect(score.debugState.barIndex).toBeGreaterThanOrEqual(battleBar);
    expect(backend.instructions.some((tone) => tone.frequencyHz < 90))
      .toBe(true);
  });

  it('does not restart identical cues or backfill a long hidden interval', () => {
    const backend = new RecordingAudioBackend();
    const score = new ProceduralScore(backend);
    score.setCue('battle', 0);
    score.update(3);
    const before = score.debugState.stepIndex;

    score.setCue('battle', 3);
    score.update(3.1);
    expect(score.debugState.stepIndex).toBeGreaterThanOrEqual(before);

    const scheduledBeforeJump = backend.instructions.length;
    score.update(300);
    expect(backend.instructions.length - scheduledBeforeJump)
      .toBeLessThan(20);
    expect(Math.max(
      ...backend.instructions.slice(scheduledBeforeJump)
        .map((tone) => tone.startSeconds),
    )).toBeLessThanOrEqual(300.2);
  });

  it('stops scheduling while paused and resumes from a fresh clock edge', () => {
    const backend = new RecordingAudioBackend();
    const score = new ProceduralScore(backend);
    score.setCue('station', 0);
    score.update(1);
    score.pause();
    const pausedCount = backend.instructions.length;
    score.update(20);
    expect(backend.instructions).toHaveLength(pausedCount);

    score.resume();
    score.update(20);
    expect(backend.instructions.length).toBeGreaterThan(pausedCount);
    expect(backend.instructions.at(-1)?.startSeconds)
      .toBeLessThanOrEqual(20.2);
  });
});
