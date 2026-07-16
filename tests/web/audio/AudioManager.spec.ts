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
});
