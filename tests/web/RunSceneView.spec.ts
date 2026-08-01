import { describe, expect, it } from 'vitest';
import {
  renderRewardCards,
  renderRouteCards,
  renderSettlementCard,
} from '../../web/views/RunSceneView';

const escapeHtml = (value: string) => value;

describe('RunSceneView', () => {
  it('renders route, reward and settlement actions', () => {
    const routeHtml = renderRouteCards({
      nodes: [{ id: 'node-1', depth: 1, type: 'combat', nextNodeIds: [], risk: .25 }],
      mapName: '漂流近郊',
      escapeHtml,
    });
    const rewardHtml = renderRewardCards({
      options: [{ id: 'gear:20', kind: 'gear', contentId: '20' }],
      dailyTrial: false,
      rerollHtml: '<button data-action="reward-reroll">重选</button>',
      escapeHtml,
    });
    const settlementHtml = renderSettlementCard({
      firstClear: true,
      mapName: '漂流近郊',
      rewards: { gears: 400, routeMarks: 10, starTickets: 3 },
      doubleActionHtml: '',
      expeditionHtml: '<div>军团贡献 +8</div>',
      escapeHtml,
    });

    expect(routeHtml).toContain('data-action="route"');
    expect(routeHtml).toContain('living-zone dispatch-table');
    expect(routeHtml).toContain('route-ticket');
    expect(rewardHtml).toContain('data-action="reward"');
    expect(rewardHtml).toContain('living-zone cargo-unloading');
    expect(rewardHtml).toContain('reward-crate');
    expect(settlementHtml).toContain('living-zone arrival-platform');
    expect(settlementHtml).toContain('reward-luggage');
    expect(settlementHtml).toContain('data-action="back-station"');
  });

  it('renders a stamped first-clear ticket and worn repeat-clear ticket', () => {
    const firstClear = renderSettlementCard({
      firstClear: true,
      mapName: '漂流近郊',
      rewards: { gears: 400, routeMarks: 10, starTickets: 3 },
      doubleActionHtml: '',
      expeditionHtml: '',
      escapeHtml,
    });
    const repeatClear = renderSettlementCard({
      firstClear: false,
      mapName: '漂流近郊',
      rewards: { gears: 40, routeMarks: 1, starTickets: 0 },
      doubleActionHtml: '',
      expeditionHtml: '',
      escapeHtml,
    });

    expect(firstClear).toContain('arrival-platform is-first-clear');
    expect(firstClear).toContain('arrival-ticket arrival-ticket--first-clear');
    expect(repeatClear).toContain('arrival-platform is-repeat-clear');
    expect(repeatClear).toContain('arrival-ticket arrival-ticket--repeat-clear');
  });
});
