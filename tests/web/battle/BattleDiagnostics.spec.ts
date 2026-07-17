import { describe, expect, it } from 'vitest';
import {
  BattleDiagnostics,
} from '../../../web/battle/BattleDiagnostics';

describe('BattleDiagnostics', () => {
  it('tracks active resources without retaining battle objects after disposal', () => {
    const diagnostics = new BattleDiagnostics();
    diagnostics.frameLoopStarted();
    diagnostics.listenerAdded(5);
    diagnostics.audioSchedulerStarted();
    diagnostics.updateEntities({
      enemies: 20,
      projectiles: 30,
      loot: 8,
      effects: 50,
      pooledInUse: 88,
    });
    diagnostics.setQualityLevel('medium');
    diagnostics.battleSettled();
    diagnostics.frameLoopStopped();
    diagnostics.listenerRemoved(5);
    diagnostics.audioSchedulerStopped();
    diagnostics.updateEntities({
      enemies: 0,
      projectiles: 0,
      loot: 0,
      effects: 0,
      pooledInUse: 0,
    });

    expect(diagnostics.snapshot()).toEqual({
      activeFrameLoops: 0,
      activeListeners: 0,
      activeAudioSchedulers: 0,
      enemies: 0,
      projectiles: 0,
      loot: 0,
      effects: 0,
      pooledInUse: 0,
      settledBattleCount: 1,
      qualityLevel: 'medium',
      lastUncaughtError: null,
    });
  });

  it('clamps resource counters and stores only a bounded error string', () => {
    const diagnostics = new BattleDiagnostics();
    diagnostics.frameLoopStopped();
    diagnostics.listenerRemoved(10);
    diagnostics.audioSchedulerStopped();
    diagnostics.captureUncaughtError('x'.repeat(1000));

    const snapshot = diagnostics.snapshot();
    expect(snapshot.activeFrameLoops).toBe(0);
    expect(snapshot.activeListeners).toBe(0);
    expect(snapshot.activeAudioSchedulers).toBe(0);
    expect(snapshot.lastUncaughtError?.length).toBeLessThanOrEqual(240);
  });
});
