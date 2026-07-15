import { describe, expect, it } from 'vitest';
import {
  createDailyTrialState,
  getDailyTrialDefinition,
} from '../../src/domain/challenge/DailyTrialSystem';
import {
  renderDailyTrialHub,
  renderDailyTrialRunBanner,
  renderDailyTrialSettlement,
} from '../../web/views/DailyTrialView';

const definition = getDailyTrialDefinition('2026-07-16');
const state = createDailyTrialState(definition.dayId);

describe('DailyTrialView', () => {
  it('shows a level-two gate while preserving the daily preview', () => {
    const html = renderDailyTrialHub({ stationLevel: 1, state, definition });

    expect(html).toContain('DAILY / 2026-07-16');
    expect(html).toContain(definition.rule.name);
    expect(html).toContain('车站 Lv.2 开放');
    expect(html).not.toContain('data-action="start-daily-trial"');
  });

  it('shows a start action and milestone progress after unlock', () => {
    const html = renderDailyTrialHub({ stationLevel: 2, state, definition });

    expect(html).toContain('data-action="start-daily-trial"');
    expect(html).toContain('开始今日试炼');
    expect(html).toContain('今日出发');
    expect(html).toContain('无损航标');
    expect(html).toContain('0/20');
  });

  it('renders the active combat rule and exact modifiers', () => {
    const html = renderDailyTrialRunBanner({ definition });

    expect(html).toContain('DAILY TRIAL');
    expect(html).toContain(definition.rule.name);
    expect(html).toContain(`种子 ${definition.seed}`);
  });

  it('renders best-score, assistance, and share states', () => {
    const normal = renderDailyTrialSettlement({
      score: 20,
      bestScore: 20,
      attempts: 1,
      improved: true,
      assisted: false,
      sharePending: false,
    });
    const assisted = renderDailyTrialSettlement({
      score: 215,
      bestScore: 240,
      attempts: 3,
      improved: false,
      assisted: true,
      sharePending: true,
    });

    expect(normal).toContain('刷新最佳');
    expect(normal).toContain('分享同种子试炼');
    expect(normal).toContain('data-action="back-station"');
    expect(assisted).toContain('救援成绩 · -25');
    expect(assisted).toContain('生成成绩卡中…');
  });
});
