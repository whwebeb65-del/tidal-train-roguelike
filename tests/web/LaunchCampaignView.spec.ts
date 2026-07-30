import { describe, expect, it } from 'vitest';
import { renderLaunchCampaignView } from '../../web/views/LaunchCampaignView';

describe('LaunchCampaignView', () => {
  it('renders the founder ticket office and gift-code checkpoint', () => {
    const html = renderLaunchCampaignView({
      betaApplied: false,
      betaGiftClaimed: false,
      launchGiftClaimed: false,
      badges: [],
      giftCodeHint: 'TIDE2026',
    });

    expect(html).toContain('living-zone founder-ticket-office');
    expect(html).toContain('founder-window');
    expect(html).toContain('launch-luggage-cart');
    expect(html).toContain('gift-code-checkpoint');
    expect(html).not.toContain('class="system-card');
    expect(html).toContain('领取候车票');
    expect(html).toContain('卸下开服礼');
    expect(html).toContain('检票兑换');
    expect(html).toContain('开服列车长礼');
    expect(html).toContain('data-action="apply-beta"');
    expect(html).toContain('data-action="claim-launch-gift"');
    expect(html).toContain('data-action="redeem-gift-code"');
    expect(html).toContain('name="giftCode" maxlength="24" placeholder="输入礼包码" aria-label="礼包码"');
  });

  it('turns an approved founder claim into the luggage action', () => {
    const html = renderLaunchCampaignView({
      betaApplied: true,
      betaGiftClaimed: false,
      launchGiftClaimed: false,
      badges: [],
      giftCodeHint: 'TIDE2026',
    });

    expect(html).toContain('data-action="claim-beta-gift">打开先行者行李</button>');
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
