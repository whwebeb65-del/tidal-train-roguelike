export interface LaunchCampaignViewModel {
  readonly betaApplied: boolean;
  readonly betaGiftClaimed: boolean;
  readonly launchGiftClaimed: boolean;
  readonly badges: readonly string[];
  readonly giftCodeHint: string;
}

export function renderLaunchCampaignView(model: LaunchCampaignViewModel): string {
  const betaAction = !model.betaApplied
    ? '<button class="primary founder-ticket-action" data-action="apply-beta">领取候车票</button>'
    : !model.betaGiftClaimed
      ? '<button class="primary founder-ticket-action" data-action="claim-beta-gift">打开先行者行李</button>'
      : '<button class="primary founder-ticket-action" disabled>先行者补给已领取</button>';
  const launchAction = model.launchGiftClaimed
    ? '<button class="primary founder-ticket-action" disabled>开服礼已领取</button>'
    : '<button class="primary founder-ticket-action" data-action="claim-launch-gift">卸下开服礼</button>';
  const badges = model.badges.length > 0
    ? model.badges.map((badge) => `<span class="founder-passport__badge">✦ ${badge}</span>`).join('')
    : '<small>尚未获得开服纪念徽章</small>';

  return `<section class="deferred-section living-zone founder-ticket-office">
    <header class="ticket-office-sign station-prop">
      <div><span class="eyebrow">FOUNDERS / 3,000</span><h2>首班售票窗口</h2><p>申请限量内测资格、领取开服礼，并核验公开礼包码。正式资格与资产由服务端结算。</p></div>
      <span class="station-stamp ${model.betaApplied ? 'is-complete' : 'is-seasonal'}">${model.betaApplied ? '内测资格已锁定' : '内测申请开放'}</span>
    </header>
    <div class="founder-counter">
      <article class="founder-window">
        <span class="founder-window__ticket">BETA · 限量 3,000 席</span><h3>${model.betaApplied ? '你已登上先行名单' : '潮汐先行者招募'}</h3>
        <p>资格不提供永久战力，只开放一次先行者补给与身份徽章。</p>
        <div class="campaign-rewards"><span>60 齿轮</span><span>2 航线徽记</span><span>1 星票</span></div>
        ${betaAction}
      </article>
      <article class="launch-luggage-cart">
        <span class="launch-luggage-cart__tag">LAUNCH · 全体玩家一次</span><h3>开服列车长礼</h3>
        <p>一次性启航资源，帮助新玩家更快解锁车站和下一段航线。</p>
        <div class="campaign-rewards"><span>188 齿轮</span><span>6 航线徽记</span><span>3 星票</span></div>
        ${launchAction}
      </article>
    </div>
    <div class="campaign-badges founder-passport"><b>开服身份</b>${badges}</div>
    <form id="gift-code-form" class="gift-code-form gift-code-checkpoint" autocomplete="off">
      <label><span>礼包码兑换</span><input name="giftCode" maxlength="24" placeholder="输入礼包码" aria-label="礼包码"></label>
      <button class="secondary" type="submit" data-action="redeem-gift-code">检票兑换</button>
      <small>公开测试码：<b>${model.giftCodeHint}</b></small>
    </form>
  </section>`;
}
