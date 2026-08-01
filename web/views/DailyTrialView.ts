import {
  DAILY_TRIAL_MILESTONES,
  type DailyTrialDefinition,
  type DailyTrialReward,
  type DailyTrialState,
} from '../../src/domain/challenge/DailyTrialSystem';

export interface DailyTrialHubViewModel {
  readonly stationLevel: number;
  readonly state: DailyTrialState;
  readonly definition: DailyTrialDefinition;
}

export interface DailyTrialRunViewModel {
  readonly definition: DailyTrialDefinition;
}

function formatReward(reward: DailyTrialReward): string {
  return [
    reward.gears > 0 ? `${reward.gears} 齿轮` : '',
    reward.routeMarks > 0 ? `${reward.routeMarks} 航线徽记` : '',
    reward.starTickets > 0 ? `${reward.starTickets} 星票` : '',
  ].filter(Boolean).join(' · ');
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function renderDailyTrialHub(model: DailyTrialHubViewModel): string {
  const unlocked = model.stationLevel >= 2;
  const rule = model.definition.rule;
  const milestones = DAILY_TRIAL_MILESTONES.map((milestone) => {
    const claimed = model.state.claimedMilestoneIds.includes(milestone.id);
    const reached = model.state.bestScore >= milestone.threshold;
    const progress = Math.min(model.state.bestScore, milestone.threshold);
    const signalState = claimed ? 'is-stamped' : reached ? 'is-lit' : 'is-unlit';
    return `<article class="daily-trial-milestone signal-post ${signalState}" data-signal-state="${signalState.slice(3)}">
      <span><small>${progress}/${milestone.threshold}</small><b>${milestone.label}</b><em>${formatReward(milestone.reward)}</em></span>
      <button class="chip" data-action="claim-daily-trial" data-milestone-id="${milestone.id}" ${claimed || !reached ? 'disabled' : ''}>${claimed ? '已领取' : reached ? '领取' : '未达成'}</button>
    </article>`;
  }).join('');
  const startAction = unlocked
    ? '<button class="trial-bell" data-action="start-daily-trial">敲钟开始试炼</button>'
    : '<button class="trial-bell" disabled>车站 Lv.2 点亮信号</button>';

  return `<section class="deferred-section living-zone tide-trial-yard ${unlocked ? '' : 'is-locked'}">
    <div class="daily-trial-heading"><div><span class="eyebrow">DAILY / ${model.definition.dayId}</span><h2>今日潮汐试炼</h2><p>固定种子、同一规则、无限重试；冲击个人最佳，不售卖挑战次数。</p></div>${startAction}</div>
    <div class="trial-chalkboard station-prop"><div class="daily-trial-rule"><span class="daily-rule-mark">潮</span><div><small>今日规则 · 种子 ${model.definition.seed}</small><b>${rule.name}</b><p>${rule.description}</p></div></div></div>
    <div class="daily-trial-modifiers trial-hangtags">
      <span>敌人生命 ${signed(rule.enemyHpBonus)}</span><span>列车生命 ${signed(rule.maxPlayerHpDelta)}</span><span>开场动能 ${signed(rule.initialMomentumBonus)}</span><span>行动伤害 ${signed(rule.damageBonus)}</span>
    </div>
    <div class="daily-trial-stats trial-score-tags"><span>今日尝试 <b>${model.state.attempts}</b></span><span>个人最佳 <b>${model.state.bestScore}</b></span></div>
    <div class="daily-trial-milestones trial-signal-lights">${milestones}</div>
  </section>`;
}

export function renderDailyTrialRunBanner(model: DailyTrialRunViewModel): string {
  const rule = model.definition.rule;
  return `<aside class="daily-trial-banner">
    <div><span class="eyebrow">DAILY TRIAL / ${model.definition.dayId}</span><b>${rule.name}</b><small>种子 ${model.definition.seed} · 常规互动货币已关闭</small></div>
    <div class="daily-trial-modifiers compact-modifiers"><span>敌血 ${signed(rule.enemyHpBonus)}</span><span>车血 ${signed(rule.maxPlayerHpDelta)}</span><span>动能 ${signed(rule.initialMomentumBonus)}</span><span>伤害 ${signed(rule.damageBonus)}</span></div>
  </aside>`;
}
