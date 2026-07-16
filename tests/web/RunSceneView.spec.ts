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
    expect(rewardHtml).toContain('data-action="reward"');
    expect(settlementHtml).toContain('data-action="back-station"');
  });
});
