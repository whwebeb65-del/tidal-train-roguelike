import { describe, expect, it } from 'vitest';
import {
  claimDailyCheckIn,
  createDailyCheckInState,
  DAILY_CHECK_IN_REWARDS,
  getDailyCheckInPreview,
  normalizeDailyCheckInState,
} from '../../../src/domain/retention/DailyCheckInSystem';

describe('DailyCheckInSystem', () => {
  it('publishes the exact seven-day deterministic reward table', () => {
    expect(DAILY_CHECK_IN_REWARDS).toEqual([
      { gears: 20, routeMarks: 0, starTickets: 0 },
      { gears: 0, routeMarks: 1, starTickets: 0 },
      { gears: 30, routeMarks: 0, starTickets: 0 },
      { gears: 0, routeMarks: 0, starTickets: 1 },
      { gears: 40, routeMarks: 0, starTickets: 0 },
      { gears: 0, routeMarks: 2, starTickets: 0 },
      { gears: 60, routeMarks: 0, starTickets: 1 },
    ]);
  });

  it('grants the first reward once per China day', () => {
    const first = claimDailyCheckIn(createDailyCheckInState(), '2026-07-16');

    expect(first).toMatchObject({
      accepted: true,
      rewardDay: 1,
      completedCycle: false,
      reward: { gears: 20, routeMarks: 0, starTickets: 0 },
    });
    expect(first.state).toEqual({
      version: 1,
      cycleNumber: 1,
      cycleClaimCount: 1,
      totalClaims: 1,
      lastClaimDayId: '2026-07-16',
    });

    const repeat = claimDailyCheckIn(first.state, '2026-07-16');
    expect(repeat.accepted).toBe(false);
    expect(repeat.reason).toBe('already-claimed');
    expect(repeat.reward).toEqual({ gears: 0, routeMarks: 0, starTickets: 0 });
    expect(repeat.state).toEqual(first.state);
    expect(repeat.state).not.toBe(first.state);
  });

  it('continues progress after missed days without resetting', () => {
    const first = claimDailyCheckIn(createDailyCheckInState(), '2026-07-16');
    const delayed = claimDailyCheckIn(first.state, '2026-07-20');

    expect(delayed.accepted).toBe(true);
    expect(delayed.rewardDay).toBe(2);
    expect(delayed.reward).toEqual({ gears: 0, routeMarks: 1, starTickets: 0 });
    expect(delayed.state.cycleClaimCount).toBe(2);
    expect(delayed.state.lastClaimDayId).toBe('2026-07-20');
  });

  it('completes seven active days with the documented totals', () => {
    const dates = [
      '2026-07-01',
      '2026-07-03',
      '2026-07-06',
      '2026-07-07',
      '2026-07-11',
      '2026-07-12',
      '2026-07-16',
    ];
    let state = createDailyCheckInState();
    const total = { gears: 0, routeMarks: 0, starTickets: 0 };
    let finalResult = claimDailyCheckIn(state, dates[0]);

    dates.forEach((dayId) => {
      const result = claimDailyCheckIn(state, dayId);
      state = result.state;
      total.gears += result.reward.gears;
      total.routeMarks += result.reward.routeMarks;
      total.starTickets += result.reward.starTickets;
      finalResult = result;
    });

    expect(total).toEqual({ gears: 150, routeMarks: 3, starTickets: 2 });
    expect(finalResult.rewardDay).toBe(7);
    expect(finalResult.reward).toEqual({ gears: 60, routeMarks: 0, starTickets: 1 });
    expect(finalResult.completedCycle).toBe(true);
    expect(state).toMatchObject({ cycleNumber: 1, cycleClaimCount: 7, totalClaims: 7 });
  });

  it('starts cycle two at reward day one on the next valid day', () => {
    const dates = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07'];
    const completed = dates.reduce(
      (state, dayId) => claimDailyCheckIn(state, dayId).state,
      createDailyCheckInState(),
    );
    const next = claimDailyCheckIn(completed, '2026-07-08');

    expect(next).toMatchObject({
      accepted: true,
      rewardDay: 1,
      completedCycle: false,
      reward: { gears: 20, routeMarks: 0, starTickets: 0 },
      state: { cycleNumber: 2, cycleClaimCount: 1, totalClaims: 8 },
    });
  });

  it('rejects a day earlier than the last claim', () => {
    const first = claimDailyCheckIn(createDailyCheckInState(), '2026-07-16');
    const rolledBack = claimDailyCheckIn(first.state, '2026-07-15');

    expect(rolledBack.accepted).toBe(false);
    expect(rolledBack.reason).toBe('day-not-after-last-claim');
    expect(rolledBack.reward).toEqual({ gears: 0, routeMarks: 0, starTickets: 0 });
    expect(rolledBack.state).toEqual(first.state);
  });

  it('normalizes only internally consistent persisted state', () => {
    const valid = {
      version: 1,
      cycleNumber: 2,
      cycleClaimCount: 2,
      totalClaims: 9,
      lastClaimDayId: '2026-07-16',
    };

    expect(normalizeDailyCheckInState(valid)).toEqual(valid);
    expect(normalizeDailyCheckInState(null)).toEqual(createDailyCheckInState());
    expect(normalizeDailyCheckInState({ ...valid, cycleClaimCount: -1 })).toEqual(createDailyCheckInState());
    expect(normalizeDailyCheckInState({ ...valid, totalClaims: 2 })).toEqual(createDailyCheckInState());
    expect(normalizeDailyCheckInState({ ...valid, lastClaimDayId: '2026-02-30' })).toEqual(createDailyCheckInState());
    expect(normalizeDailyCheckInState({ ...createDailyCheckInState(), lastClaimDayId: '2026-07-16' })).toEqual(createDailyCheckInState());
  });

  it('previews initial, same-day, and next-cycle states', () => {
    const initial = getDailyCheckInPreview(createDailyCheckInState(), '2026-07-16');
    expect(initial).toMatchObject({ canClaim: true, displayCycleNumber: 1, displayClaimCount: 0, rewardDay: 1 });

    const first = claimDailyCheckIn(createDailyCheckInState(), '2026-07-16');
    const sameDay = getDailyCheckInPreview(first.state, '2026-07-16');
    expect(sameDay).toMatchObject({ canClaim: false, reason: 'already-claimed', displayCycleNumber: 1, displayClaimCount: 1, rewardDay: 2 });

    const completed = Array.from({ length: 7 }, (_, index) => `2026-07-${String(index + 1).padStart(2, '0')}`).reduce(
      (state, dayId) => claimDailyCheckIn(state, dayId).state,
      createDailyCheckInState(),
    );
    const nextCycle = getDailyCheckInPreview(completed, '2026-07-08');
    expect(nextCycle).toMatchObject({ canClaim: true, displayCycleNumber: 2, displayClaimCount: 0, rewardDay: 1 });
  });

  it('rejects malformed or impossible day IDs', () => {
    expect(() => claimDailyCheckIn(createDailyCheckInState(), '2026-7-16')).toThrow('Invalid daily check-in day id');
    expect(() => getDailyCheckInPreview(createDailyCheckInState(), '2026-02-30')).toThrow('Invalid daily check-in day id');
  });
});
