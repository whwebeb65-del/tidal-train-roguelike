import { describe, expect, it } from 'vitest';
import {
  claimDailyCheckIn,
  createDailyCheckInState,
} from '../../src/domain/retention/DailyCheckInSystem';
import { renderDailyCheckIn } from '../../web/views/DailyCheckInView';

function countClass(html: string, className: string): number {
  return (html.match(new RegExp(`class="[^"]*\\b${className}\\b`, 'g')) ?? []).length;
}

describe('DailyCheckInView', () => {
  it('renders seven visible rewards and the initial claim action', () => {
    const html = renderDailyCheckIn({
      state: createDailyCheckInState(),
      currentDayId: '2026-07-16',
    });

    expect(html).toContain('车站值班簿');
    expect(html).toContain('漏签不清零');
    expect(html).toContain('第 1 轮');
    expect(countClass(html, 'daily-check-in-cell')).toBe(7);
    expect(html).toContain('20 齿轮');
    expect(html).toContain('60 齿轮 · 1 星票');
    expect(html).toContain('data-action="claim-daily-check-in"');
    expect(html).toContain('领取第 1 格');
  });

  it('shows one claimed cell and disables a same-day repeat', () => {
    const first = claimDailyCheckIn(createDailyCheckInState(), '2026-07-16');
    const html = renderDailyCheckIn({ state: first.state, currentDayId: '2026-07-16' });

    expect(countClass(html, 'claimed')).toBe(1);
    expect(html).toContain('今日已签到');
    expect(html).toContain('明日第 2 格');
    expect(html).toContain('data-action="claim-daily-check-in" disabled');
  });

  it('keeps a completed cycle visible on its seventh claim day', () => {
    const dates = ['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'];
    const completed = dates.reduce(
      (state, dayId) => claimDailyCheckIn(state, dayId).state,
      createDailyCheckInState(),
    );
    const html = renderDailyCheckIn({ state: completed, currentDayId: '2026-07-16' });

    expect(countClass(html, 'claimed')).toBe(7);
    expect(html).toContain('本轮完成');
    expect(html).toContain('明日开启第 2 轮');
  });

  it('previews cycle two on the next date without modifying state', () => {
    const dates = ['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'];
    const completed = dates.reduce(
      (state, dayId) => claimDailyCheckIn(state, dayId).state,
      createDailyCheckInState(),
    );
    const html = renderDailyCheckIn({ state: completed, currentDayId: '2026-07-17' });

    expect(html).toContain('第 2 轮');
    expect(html).toContain('领取第 1 格');
    expect(countClass(html, 'claimed')).toBe(0);
  });

  it('shows a clock warning for a rolled-back date', () => {
    const first = claimDailyCheckIn(createDailyCheckInState(), '2026-07-16');
    const html = renderDailyCheckIn({ state: first.state, currentDayId: '2026-07-15' });

    expect(html).toContain('设备日期异常');
    expect(html).toContain('disabled');
  });
});
