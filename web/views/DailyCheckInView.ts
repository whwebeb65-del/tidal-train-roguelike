import {
  DAILY_CHECK_IN_REWARDS,
  getDailyCheckInPreview,
  type DailyCheckInReward,
  type DailyCheckInState,
} from '../../src/domain/retention/DailyCheckInSystem';

export interface DailyCheckInViewInput {
  readonly state: DailyCheckInState;
  readonly currentDayId: string;
}

function formatReward(reward: DailyCheckInReward): string {
  return [
    reward.gears > 0 ? `${reward.gears} 齿轮` : '',
    reward.routeMarks > 0 ? `${reward.routeMarks} 航线徽记` : '',
    reward.starTickets > 0 ? `${reward.starTickets} 星票` : '',
  ].filter(Boolean).join(' · ');
}

export function renderDailyCheckIn(input: DailyCheckInViewInput): string {
  const preview = getDailyCheckInPreview(input.state, input.currentDayId);
  const claimedToday = preview.reason === 'already-claimed';
  const clockRolledBack = preview.reason === 'day-not-after-last-claim';
  const completedToday = claimedToday && input.state.cycleClaimCount === DAILY_CHECK_IN_REWARDS.length;
  const displayCycleNumber = preview.canClaim ? preview.displayCycleNumber : input.state.cycleNumber;
  const displayClaimCount = preview.canClaim ? preview.displayClaimCount : input.state.cycleClaimCount;

  const cells = DAILY_CHECK_IN_REWARDS.map((reward, index) => {
    const rewardDay = index + 1;
    const claimed = rewardDay <= displayClaimCount;
    const current = preview.canClaim && rewardDay === preview.rewardDay;
    const classes = [
      'daily-check-in-cell',
      claimed ? 'claimed' : current ? 'current' : 'pending',
      rewardDay === DAILY_CHECK_IN_REWARDS.length ? 'grand' : '',
    ].filter(Boolean).join(' ');
    const stateLabel = claimed ? '已领取' : current ? '今日' : '待领取';
    return `<article class="system-card__item ${classes}">
      <span class="check-in-day">第 ${rewardDay} 格</span>
      <b>${formatReward(reward)}</b>
      <small>${stateLabel}</small>
    </article>`;
  }).join('');

  const status = clockRolledBack
    ? '设备日期异常'
    : completedToday
      ? '本轮完成'
      : claimedToday
        ? '今日已签到'
        : '今日可领取';
  const buttonLabel = clockRolledBack
    ? '请校准设备日期'
    : completedToday
      ? `明日开启第 ${input.state.cycleNumber + 1} 轮`
      : claimedToday
        ? `明日第 ${preview.rewardDay} 格`
        : `领取第 ${preview.rewardDay} 格 · ${formatReward(preview.reward)}`;
  const progressCopy = completedToday
    ? `第 ${displayCycleNumber} 轮全部领取 · 累计 ${input.state.totalClaims} 次`
    : `第 ${displayCycleNumber} 轮 · ${displayClaimCount}/7 · 累计 ${input.state.totalClaims} 次`;

  return `<section class="system-card system-card--check-in deferred-section daily-check-in">
    <div class="system-card__heading daily-check-in-heading">
      <div><span class="eyebrow">DAILY DUTY / ${input.currentDayId}</span><h2>车站值班簿</h2><p>每天领取下一格，漏签不清零，也不需要补签。</p></div>
      <span class="system-card__badge daily-check-in-status">${status}</span>
    </div>
    <div class="daily-check-in-progress"><span>${progressCopy}</span><b>七日合计：150 齿轮 · 3 航线徽记 · 2 星票</b></div>
    <div class="system-card__grid daily-check-in-grid">${cells}</div>
    <div class="system-card__action daily-check-in-action">
      <small>奖励固定展示；签到不绑定广告、分享或充值。</small>
      <button class="primary" data-action="claim-daily-check-in" ${preview.canClaim ? '' : 'disabled'}>${buttonLabel}</button>
    </div>
  </section>`;
}
