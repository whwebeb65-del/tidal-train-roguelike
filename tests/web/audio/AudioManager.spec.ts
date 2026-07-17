import { describe, expect, it } from 'vitest';
import { defaultGameSettings } from '../../../web/app/SettingsRepository';
import { AudioManager } from '../../../web/audio/AudioManager';
import type { BattleEvent } from '../../../web/battle/BattleTypes';
import { createFrameFixture } from '../battle/helpers/BattleFixtures';
import { RecordingAudioBackend } from './helpers/RecordingAudioBackend';

describe('AudioManager', () => {
  it('maps battle events to distinct sound cues and music phases', () => {
    const backend = new RecordingAudioBackend();
    const audio = new AudioManager(backend);
    const events: BattleEvent[] = [
      { type: 'weapon-fired', projectileId: 1, source: 'main' },
      {
        type: 'projectile-hit',
        enemyId: 1,
        damage: 30,
        critical: true,
        source: 'main',
      },
      { type: 'enemy-armour-broken', enemyId: 1 },
      {
        type: 'train-damaged',
        amount: 0,
        shieldAbsorbed: 10,
        remainingHp: 100,
        impactDirectionX: 0,
      },
      {
        type: 'enemy-killed',
        enemyId: 2,
        kind: 'storm-ray-elite',
        x: 195,
        y: 200,
      },
      { type: 'skill-used', skillId: 'bubble-barrier' },
      { type: 'skill-cooldowns-refreshed' },
      {
        type: 'upgrade-offered',
        upgradeIds: [
          'multi-barrel',
          'rapid-reload',
          'coral-warhead',
        ],
      },
      { type: 'boss-intro-started' },
      { type: 'boss-charge-started', durationMs: 1200 },
    ];

    audio.consume(events, createFrameFixture());

    expect(audio.debugState.recentSoundCues).toEqual([
      'cannon',
      'critical-hit',
      'armour-break',
      'shield-hit',
      'elite-down',
      'skill-barrier',
      'skill-refresh',
      'upgrade-open',
      'boss-alarm',
      'boss-charge',
    ]);
    expect(audio.debugState.musicCue).toBe('boss');
  });

  it('mutes music and effects independently and keeps locked audio safe', async () => {
    const backend = new RecordingAudioBackend();
    backend.unlocked = false;
    backend.unlockResult = false;
    const audio = new AudioManager(backend);
    audio.applySettings({
      ...defaultGameSettings(),
      musicEnabled: false,
      sfxEnabled: true,
    });

    await expect(audio.unlockFromGesture()).resolves.toBe(false);
    expect(() => audio.consume([
      { type: 'battle-lost' },
    ], createFrameFixture())).not.toThrow();
    expect(backend.busGains.at(-2)).toMatchObject({
      bus: 'music',
      value: 0,
    });
    expect(backend.busGains.at(-1)).toMatchObject({
      bus: 'sfx',
      value: 0.55,
    });
  });

  it('does not restart an identical music cue and resumes after pause', async () => {
    const backend = new RecordingAudioBackend();
    const audio = new AudioManager(backend);
    audio.setMusicCue('battle');
    audio.update(0);
    const before = audio.debugState.score.stepIndex;
    audio.setMusicCue('battle');
    audio.update(16);
    expect(audio.debugState.score.stepIndex).toBeGreaterThanOrEqual(before);

    audio.pause();
    expect(backend.suspendCalls).toBe(1);
    await audio.resume();
    expect(backend.resumeCalls).toBe(1);
  });

  it('throttles the latest train motion to one exact update per 125 ms', () => {
    const backend = new RecordingAudioBackend();
    const audio = new AudioManager(backend);

    audio.setTrainMotion({ active: true, speed: 1.22, power: 0.9 });
    audio.update(0);
    audio.update(60);
    audio.update(130);

    expect(backend.continuousTones).toHaveLength(2);
    expect(backend.continuousTones.at(-1)).toMatchObject({
      id: 'train-engine',
      instruction: {
        bus: 'sfx',
        waveform: 'triangle',
        rampSeconds: 0.12,
      },
    });
    const instruction = backend.continuousTones.at(-1)?.instruction;
    expect(instruction?.frequencyHz).toBeCloseTo(72.84);
    expect(instruction?.gain).toBeCloseTo(0.035964);
    expect(instruction?.filterHz).toBeCloseTo(448.4);
  });

  it('clamps train inputs without tying propulsion updates to music mute', () => {
    const backend = new RecordingAudioBackend();
    const audio = new AudioManager(backend);
    audio.applySettings({
      ...defaultGameSettings(),
      musicEnabled: false,
      sfxEnabled: true,
    });

    audio.setTrainMotion({ active: true, speed: -4, power: 9 });
    audio.update(0);
    audio.setTrainMotion({ active: false, speed: 99, power: -2 });
    audio.update(125);

    expect(backend.continuousTones[0]?.instruction).toMatchObject({
      frequencyHz: 46,
      gain: 0.018,
      filterHz: 180,
    });
    expect(backend.continuousTones[1]?.instruction).toMatchObject({
      frequencyHz: 79,
      gain: 0,
      filterHz: 510,
    });
  });

  it('stops train propulsion before closing once', async () => {
    const backend = new RecordingAudioBackend();
    const audio = new AudioManager(backend);
    audio.setTrainMotion({ active: true, speed: 1, power: 1 });
    audio.update(0);

    await audio.close();
    await audio.close();

    expect(backend.lifecycle.slice(-2)).toEqual([
      'continuous:train-engine:stop',
      'close',
    ]);
    expect(backend.closeCalls).toBe(1);
  });

  it('does not let backward timestamps bypass the 125 ms throttle', () => {
    const backend = new RecordingAudioBackend();
    const audio = new AudioManager(backend);
    audio.setTrainMotion({ active: true, speed: 0.18, power: 0.55 });
    audio.update(10_000);

    audio.setTrainMotion({ active: true, speed: 1, power: 0.8 });
    audio.update(0);
    audio.update(10_016);

    expect(backend.continuousTones).toHaveLength(1);

    audio.update(10_125);

    expect(backend.continuousTones).toHaveLength(2);
    expect(backend.continuousTones.at(-1)?.instruction?.frequencyHz).toBe(68);
  });
});
