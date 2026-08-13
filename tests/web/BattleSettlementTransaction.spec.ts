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

const defeat = (battleId: string): BattleOutcome => ({
  ...outcome(battleId),
  victory: false,
  hardCapReached: true,
  skillCastCounts: { 'tidal-volley': 0, 'bubble-barrier': 1, 'extreme-tide': 0 },
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
    expect(first.presentation.archiveDiscoveries).toEqual([]);
    expect(replay.presentation.archiveDiscoveries).toEqual([]);
    expect(next.presentation.archiveDiscoveries).toEqual([]);
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
    expect(duplicate.presentation.archiveDiscoveries).toEqual([]);
  });

  it('settles victory once with first-clear, only used skill mastery, and stamina XP in the summary', () => {
    const result = settleNormalOutcomeForSave(defaultSave(), outcome('complete-victory'), 'drift-suburb', {
      staminaSpendXp: 50,
      accountLevelStart: 1,
    });

    expect(result.accepted).toBe(true);
    expect(result.presentation.rewards).toEqual({ gears: 400, routeMarks: 10, starTickets: 3 });
    expect(result.presentation.accountProgression).toMatchObject({
      staminaSpendXp: 50,
      gainedXp: expect.any(Number),
      level: result.save.accountLevel,
      xp: result.save.accountXp,
    });
    expect(result.presentation.skillMastery).toEqual({
      'tidal-volley': expect.objectContaining({ gainedXp: expect.any(Number) }),
    });
    expect(result.save.firstClearMapIds).toContain('drift-suburb');
    expect(result.save.settledBattleIds).toContain('complete-victory');
  });

  it('settles defeat and hard-cap mastery/account XP without victory currency or first-clear', () => {
    const result = settleNormalOutcomeForSave(defaultSave(), defeat('hard-cap-defeat'));

    expect(result.accepted).toBe(true);
    expect(result.presentation.rewards).toEqual({ gears: 0, routeMarks: 0, starTickets: 0 });
    expect(result.save.firstClearMapIds).toEqual([]);
    expect(result.presentation.skillMastery).toEqual({
      'bubble-barrier': expect.objectContaining({ gainedXp: expect.any(Number) }),
    });
    expect(result.presentation.skillMastery).not.toHaveProperty('tidal-volley');
    expect(result.save.settledBattleIds).toEqual(['hard-cap-defeat']);
  });
});
