import { describe, expect, it } from 'vitest';
import {
  claimDailyTrialMilestone,
  createDailyTrialState,
  DAILY_TRIAL_RULES,
  getChinaDayId,
  getDailyTrialDefinition,
  normalizeDailyTrialState,
  submitDailyTrial,
} from '../../../src/domain/challenge/DailyTrialSystem';

describe('DailyTrialSystem', () => {
  it('rolls the Shanghai day at UTC 16:00', () => {
    expect(getChinaDayId(Date.UTC(2026, 6, 15, 15, 59, 59))).toBe('2026-07-15');
    expect(getChinaDayId(Date.UTC(2026, 6, 15, 16, 0, 0))).toBe('2026-07-16');
  });

  it('creates a stable positive seed and rotating rule', () => {
    const first = getDailyTrialDefinition('2026-07-16');
    const repeat = getDailyTrialDefinition('2026-07-16');
    const next = getDailyTrialDefinition('2026-07-17');

    expect(first).toEqual(repeat);
    expect(first.seed).toBeGreaterThan(0);
    expect(first.seed).toBeLessThanOrEqual(999999);
    expect(next.seed).not.toBe(first.seed);
    expect(DAILY_TRIAL_RULES.map((rule) => rule.id)).toContain(first.rule.id);
  });

  it('exposes the three exact combat rules', () => {
    expect(DAILY_TRIAL_RULES).toEqual([
      expect.objectContaining({ id: 'armored-current', enemyHpBonus: 20, maxPlayerHpDelta: 0, initialMomentumBonus: 20, damageBonus: 0 }),
      expect.objectContaining({ id: 'glass-express', enemyHpBonus: 10, maxPlayerHpDelta: -20, initialMomentumBonus: 0, damageBonus: 5 }),
      expect.objectContaining({ id: 'rescue-window', enemyHpBonus: 10, maxPlayerHpDelta: 0, initialMomentumBonus: 30, damageBonus: 0 }),
    ]);
  });

  it('scores defeat, victory, remaining hp, and assistance', () => {
    const state = createDailyTrialState('2026-07-16');
    const defeat = submitDailyTrial(state, {
      runId: 'r1', outcome: 'defeat', completedNodes: 0, remainingHp: 0, assisted: false,
    });
    const victory = submitDailyTrial(defeat.state, {
      runId: 'r2', outcome: 'victory', completedNodes: 4, remainingHp: 80, assisted: false,
    });
    const assisted = submitDailyTrial(victory.state, {
      runId: 'r3', outcome: 'victory', completedNodes: 4, remainingHp: 80, assisted: true,
    });

    expect(defeat).toMatchObject({ accepted: true, score: 20, improved: true, assisted: false });
    expect(victory).toMatchObject({ accepted: true, score: 240, improved: true, assisted: false });
    expect(assisted).toMatchObject({ accepted: true, score: 215, improved: false, assisted: true });
    expect(assisted.state).toMatchObject({ attempts: 3, bestScore: 240 });
  });

  it('keeps the participation floor after an assisted defeat', () => {
    const result = submitDailyTrial(createDailyTrialState('2026-07-16'), {
      runId: 'rescued', outcome: 'defeat', completedNodes: 0, remainingHp: 0, assisted: true,
    });

    expect(result.score).toBe(20);
  });

  it('submits one run id once and only raises best score', () => {
    const first = submitDailyTrial(createDailyTrialState('2026-07-16'), {
      runId: 'same', outcome: 'defeat', completedNodes: 0, remainingHp: 0, assisted: false,
    });
    const duplicate = submitDailyTrial(first.state, {
      runId: 'same', outcome: 'victory', completedNodes: 4, remainingHp: 100, assisted: false,
    });
    const lower = submitDailyTrial(first.state, {
      runId: 'new', outcome: 'defeat', completedNodes: 0, remainingHp: 0, assisted: false,
    });

    expect(duplicate).toMatchObject({ accepted: false, reason: 'run-already-submitted', score: 0, improved: false });
    expect(duplicate.state).toEqual(first.state);
    expect(lower.state.bestScore).toBe(first.state.bestScore);
  });

  it('claims participation and mastery once at their thresholds', () => {
    const participationState = submitDailyTrial(createDailyTrialState('2026-07-16'), {
      runId: 'r1', outcome: 'defeat', completedNodes: 0, remainingHp: 0, assisted: false,
    }).state;
    const participation = claimDailyTrialMilestone(participationState, 'participation');

    expect(participation.reward).toEqual({ gears: 30, routeMarks: 0, starTickets: 0 });
    expect(claimDailyTrialMilestone(participation.state, 'participation')).toMatchObject({
      accepted: false,
      reason: 'already-claimed',
      reward: { gears: 0, routeMarks: 0, starTickets: 0 },
    });
    expect(claimDailyTrialMilestone(participation.state, 'mastery').reason).toBe('threshold-not-reached');

    const masteryState = submitDailyTrial(participation.state, {
      runId: 'r2', outcome: 'victory', completedNodes: 4, remainingHp: 80, assisted: false,
    }).state;
    expect(claimDailyTrialMilestone(masteryState, 'mastery').reward).toEqual({
      gears: 0, routeMarks: 2, starTickets: 0,
    });
  });

  it('resets stale days and sanitizes malformed current-day state', () => {
    expect(normalizeDailyTrialState({
      version: 1,
      dayId: '2026-07-15',
      attempts: 9,
      bestScore: 999,
      submittedRunIds: ['stale'],
      claimedMilestoneIds: ['participation'],
    }, '2026-07-16')).toEqual(createDailyTrialState('2026-07-16'));

    expect(normalizeDailyTrialState({
      version: 1,
      dayId: '2026-07-16',
      attempts: 3,
      bestScore: 240,
      submittedRunIds: ['r1', 9, 'r1', 'r2'],
      claimedMilestoneIds: ['participation', 'fake', 'participation'],
    }, '2026-07-16')).toEqual({
      version: 1,
      dayId: '2026-07-16',
      attempts: 3,
      bestScore: 240,
      submittedRunIds: ['r1', 'r2'],
      claimedMilestoneIds: ['participation'],
    });
  });

  it('rejects invalid timestamps, day ids, and submissions', () => {
    expect(() => getChinaDayId(Number.NaN)).toThrow('Daily trial timestamp must be finite');
    expect(() => getDailyTrialDefinition('2026-02-30')).toThrow('Invalid daily trial day id');
    expect(() => submitDailyTrial(createDailyTrialState('2026-07-16'), {
      runId: '', outcome: 'victory', completedNodes: 0, remainingHp: 10, assisted: false,
    })).toThrow('Daily trial run id is required');
    expect(() => submitDailyTrial(createDailyTrialState('2026-07-16'), {
      runId: 'r', outcome: 'victory', completedNodes: 11, remainingHp: 10, assisted: false,
    })).toThrow('Daily trial completed nodes must be an integer from 0 to 10');
  });
});
