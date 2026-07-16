import { describe, expect, it } from 'vitest';
import { renderSocialHubView } from '../../web/views/SocialHubView';

describe('SocialHubView', () => {
  it('renders the locked legion join action', () => {
    const html = renderSocialHubView({
      cycleId: '2026-W29',
      legionId: null,
      contribution: 0,
      milestones: [],
      supports: [],
      sharePending: false,
    });

    expect(html).toContain('潮汐灯塔团');
    expect(html).toContain('data-action="join-legion"');
    expect(html).toContain('class="system-card');
  });

  it('renders active squad, milestone and sharing actions', () => {
    const html = renderSocialHubView({
      cycleId: '2026-W29',
      legionId: 'legion-tidal-beacon',
      contribution: 42,
      milestones: [{
        id: 'supply-20',
        label: '近海信标',
        threshold: 25,
        progress: 25,
        claimed: false,
        rewardLabel: '30 齿轮',
      }],
      supports: [{
        id: 'navigator',
        name: '小满',
        role: '领航员',
        effect: '开场动能 +10',
        selected: true,
      }],
      sharePending: false,
    });

    expect(html).toContain('data-action="toggle-support"');
    expect(html).toContain('data-action="share-squad"');
    expect(html).toContain('data-action="claim-expedition"');
  });
});
