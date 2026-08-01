// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  createDailyTrialState,
  getDailyTrialDefinition,
} from '../../src/domain/challenge/DailyTrialSystem';
import {
  renderDailyTrialHub,
  renderDailyTrialRunBanner,
} from '../../web/views/DailyTrialView';

const definition = getDailyTrialDefinition('2026-07-16');
const state = createDailyTrialState(definition.dayId);

describe('DailyTrialView', () => {
  it('shows a level-two gate while preserving the daily preview', () => {
    const html = renderDailyTrialHub({ stationLevel: 1, state, definition });

    expect(html).toContain('DAILY / 2026-07-16');
    expect(html).toContain(definition.rule.name);
    expect(html).toContain('车站 Lv.2 点亮信号');
    expect(html).not.toContain('data-action="start-daily-trial"');
  });

  it('shows a start action and milestone progress after unlock', () => {
    const html = renderDailyTrialHub({ stationLevel: 2, state, definition });

    expect(html).toContain('data-action="start-daily-trial"');
    expect(html).toContain('敲钟开始试炼');
    expect(html).toContain('今日出发');
    expect(html).toContain('无损航标');
    expect(html).toContain('0/20');
  });

  it('renders the trial as a physical challenge board', () => {
    const html = renderDailyTrialHub({ stationLevel: 2, state, definition });

    expect(html).toContain('living-zone tide-trial-yard');
    expect(html).toContain('trial-chalkboard');
    expect(html).toContain('trial-signal-lights');
    expect(html).toContain('trial-score-tags');
    expect(html).not.toContain('system-card system-card--trial');
    expect(html).toContain('data-action="start-daily-trial"');
  });

  it.each([
    {
      label: 'unlit and disabled before reaching the milestone',
      bestScore: 0,
      claimedMilestoneIds: [],
      signalState: 'unlit',
      className: 'is-unlit',
      disabled: true,
    },
    {
      label: 'lit and claimable after reaching the milestone',
      bestScore: 20,
      claimedMilestoneIds: [],
      signalState: 'lit',
      className: 'is-lit',
      disabled: false,
    },
    {
      label: 'stamped and disabled after claiming the milestone',
      bestScore: 20,
      claimedMilestoneIds: ['participation'] as const,
      signalState: 'stamped',
      className: 'is-stamped',
      disabled: true,
    },
  ])('maps participation to $label', ({
    bestScore,
    claimedMilestoneIds,
    signalState,
    className,
    disabled,
  }) => {
    const html = renderDailyTrialHub({
      stationLevel: 2,
      definition,
      state: {
        ...state,
        bestScore,
        claimedMilestoneIds,
      },
    });
    const host = document.createElement('div');
    host.innerHTML = html;
    const button = host.querySelector<HTMLButtonElement>(
      '[data-milestone-id="participation"]',
    );
    const signal = button?.closest<HTMLElement>('.signal-post');

    expect(signal?.dataset.signalState).toBe(signalState);
    expect(signal?.classList.contains(className)).toBe(true);
    expect(button?.disabled).toBe(disabled);
  });

  it('renders the active combat rule and exact modifiers', () => {
    const html = renderDailyTrialRunBanner({ definition });

    expect(html).toContain('DAILY TRIAL');
    expect(html).toContain(definition.rule.name);
    expect(html).toContain(`种子 ${definition.seed}`);
  });

});
