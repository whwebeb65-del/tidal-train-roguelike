import { describe, expect, it } from 'vitest';
import type { CaptainGuidebookObjectiveSnapshot } from '../../src/domain/retention/CaptainGuidebookSystem';
import { renderCaptainGuidebook } from '../../web/views/CaptainGuidebookView';

function objective(
  patch: Partial<CaptainGuidebookObjectiveSnapshot> = {},
): CaptainGuidebookObjectiveSnapshot {
  return {
    id: 'first-clear',
    chapter: '第一程',
    title: '让末班车穿过第一场潮汐',
    description: '完成一条普通航线。',
    target: 1,
    destination: 'battle',
    actionLabel: '检票出发',
    reward: { gears: 60, routeMarks: 0 },
    presentation: 'current',
    progress: 0,
    completed: false,
    ...patch,
  };
}

describe('CaptainGuidebookView', () => {
  it('renders a physical living-zone board with one actionable current objective', () => {
    const html = renderCaptainGuidebook({
      objectives: [
        objective(),
        objective({ id: 'station-level-2', presentation: 'preview', title: '点亮第二盏灯' }),
        objective({ id: 'equipment-level-2', presentation: 'preview', title: '拧紧第一颗螺栓' }),
      ],
    });

    expect(html).toContain('captain-guidebook living-zone');
    expect(html).not.toContain('system-card');
    expect(html).toContain('data-guidebook-objective="first-clear"');
    expect(html).toContain('data-action="guidebook-destination"');
    expect(html).toContain('data-guidebook-destination="battle"');
    expect(html).toContain('60 齿轮');
    expect(html.match(/guidebook-preview-ticket/g)).toHaveLength(2);
  });

  it('turns the current completed objective into an idempotent claim action', () => {
    const html = renderCaptainGuidebook({
      objectives: [objective({ completed: true, progress: 1 })],
    });
    expect(html).toContain('data-action="claim-guidebook"');
    expect(html).toContain('盖章领奖');
    expect(html).not.toContain('data-action="guidebook-destination"');
  });

  it('renders a stamped completion state after all objectives are claimed', () => {
    const html = renderCaptainGuidebook({ objectives: [] });
    expect(html).toContain('is-complete');
    expect(html).toContain('新手值班路线完成');
    expect(html).not.toContain('<button');
  });
});
