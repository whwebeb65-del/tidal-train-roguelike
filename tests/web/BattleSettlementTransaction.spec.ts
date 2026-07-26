import { describe, expect, it } from 'vitest';
import { defaultSave } from '../../src/save/SaveRepository';
import { settleNormalOutcomeForSave } from '../../web/LegacyGameRuntime';
import type { BattleOutcome } from '../../web/battle/BattleTypes';

const outcome = (battleId: string): BattleOutcome => ({
  battleId,
  victory: true,
  elapsedMs: 1,
  completedWaves: 6,
  remainingHp: 50,
  kills: 2,
  killCounts: { normal: 2, elite: 0, boss: 0 },
  skillCastCounts: { 'tidal-volley': 1, 'bubble-barrier': 0, 'extreme-tide': 0 },
  hardCapReached: false,
  adReviveUsed: false,
});

describe('persisted normal battle settlement transaction', () => {
  it('persists once across a new settler and still accepts a new battle id', () => {
    const first = settleNormalOutcomeForSave(defaultSave(), outcome('reload-safe'));
    const snapshot = first.save;
    const replay = settleNormalOutcomeForSave(snapshot, outcome('reload-safe'));
    const next = settleNormalOutcomeForSave(snapshot, outcome('new-battle'));

    expect(first.accepted).toBe(true);
    expect(replay).toMatchObject({ accepted: false, save: snapshot });
    expect(replay.presentation.rewards).toEqual({ gears: 0, routeMarks: 0, starTickets: 0 });
    expect(replay.presentation.title).toBe('本局已结算');
    expect(snapshot.settledBattleIds).toEqual(['reload-safe']);
    expect(next.accepted).toBe(true);
    expect(next.save.gears).toBeGreaterThan(snapshot.gears);
    expect(next.save.settledBattleIds).toEqual(['reload-safe', 'new-battle']);
  });

  it('returns the persisted result on a live duplicate without mutating it', () => {
    const first = settleNormalOutcomeForSave(defaultSave(), outcome('live-duplicate'));
    const duplicate = settleNormalOutcomeForSave(first.save, outcome('live-duplicate'));
    expect(duplicate.save).toEqual(first.save);
    expect(duplicate.presentation.rewards.gears).toBe(0);
  });
});
