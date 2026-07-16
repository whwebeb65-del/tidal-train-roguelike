import { describe, expect, it } from 'vitest';
import { renderLaunchCampaignView } from '../../web/views/LaunchCampaignView';

describe('LaunchCampaignView', () => {
  it('renders locked founder actions and gift-code submission', () => {
    const html = renderLaunchCampaignView({
      betaApplied: false,
      betaGiftClaimed: false,
      launchGiftClaimed: false,
      badges: [],
      giftCodeHint: 'TIDE2026',
    });

    expect(html).toContain('申请内测资格');
    expect(html).toContain('开服列车长礼');
    expect(html).toContain('data-action="redeem-gift-code"');
    expect(html).toContain('class="system-card');
  });

  it('renders claimed founder state without enabled duplicate claims', () => {
    const html = renderLaunchCampaignView({
      betaApplied: true,
      betaGiftClaimed: true,
      launchGiftClaimed: true,
      badges: ['潮汐先行者', '开服列车长'],
      giftCodeHint: 'TIDE2026',
    });

    expect(html).toContain('先行者补给已领取');
    expect(html).toContain('开服礼已领取');
    expect(html).toContain('潮汐先行者');
  });
});
