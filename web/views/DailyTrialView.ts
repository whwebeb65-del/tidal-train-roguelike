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

export interface DailyTrialSettlementViewModel {
  readonly score: number;
  readonly bestScore: number;
  readonly attempts: number;
  readonly improved: boolean;
  readonly assisted: boolean;
  readonly sharePending: boolean;
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
    return `<article class="system-card__item daily-trial-milestone ${reached ? 'reached' : ''}">
      <span><small>${progress}/${milestone.threshold}</small><b>${milestone.label}</b><em>${formatReward(milestone.reward)}</em></span>
      <button class="chip" data-action="claim-daily-trial" data-milestone-id="${milestone.id}" ${claimed || !reached ? 'disabled' : ''}>${claimed ? '已领取' : reached ? '领取' : '未达成'}</button>
    </article>`;
  }).join('');
  const startAction = unlocked
    ? '<button class="primary" data-action="start-daily-trial">开始今日试炼</button>'
    : '<button class="primary" disabled>车站 Lv.2 开放</button>';

  return `<section class="system-card system-card--trial deferred-section daily-trial-hub ${unlocked ? '' : 'locked'}">
    <div class="system-card__heading daily-trial-heading"><div><span class="eyebrow">DAILY / ${model.definition.dayId}</span><h2>今日潮汐试炼</h2><p>固定种子、同一规则、无限重试；冲击个人最佳，不售卖挑战次数。</p></div>${startAction}</div>
    <div class="daily-trial-rule"><span class="daily-rule-mark">潮</span><div><small>今日规则 · 种子 ${model.definition.seed}</small><b>${rule.name}</b><p>${rule.description}</p></div></div>
    <div class="daily-trial-modifiers">
      <span>敌人生命 ${signed(rule.enemyHpBonus)}</span><span>列车生命 ${signed(rule.maxPlayerHpDelta)}</span><span>开场动能 ${signed(rule.initialMomentumBonus)}</span><span>行动伤害 ${signed(rule.damageBonus)}</span>
    </div>
    <div class="daily-trial-stats"><span>今日尝试 <b>${model.state.attempts}</b></span><span>个人最佳 <b>${model.state.bestScore}</b></span></div>
    <div class="system-card__grid daily-trial-milestones">${milestones}</div>
  </section>`;
}

export function renderDailyTrialRunBanner(model: DailyTrialRunViewModel): string {
  const rule = model.definition.rule;
  return `<aside class="daily-trial-banner">
    <div><span class="eyebrow">DAILY TRIAL / ${model.definition.dayId}</span><b>${rule.name}</b><small>种子 ${model.definition.seed} · 常规互动货币已关闭</small></div>
    <div class="daily-trial-modifiers compact-modifiers"><span>敌血 ${signed(rule.enemyHpBonus)}</span><span>车血 ${signed(rule.maxPlayerHpDelta)}</span><span>动能 ${signed(rule.initialMomentumBonus)}</span><span>伤害 ${signed(rule.damageBonus)}</span></div>
  </aside>`;
}

export function renderDailyTrialSettlement(model: DailyTrialSettlementViewModel): string {
  return `<section class="daily-trial-settlement scene">
    <div class="settlement-symbol daily-trial-symbol">潮</div><span class="eyebrow">DAILY TRIAL SETTLED</span><h1>今日航迹已记录</h1>
    <p>固定种子成绩只更新个人最佳；返回车站领取已经达到的里程碑。</p>
    <div class="daily-score"><small>本局得分</small><b>${model.score}</b>${model.improved ? '<strong>刷新最佳</strong>' : '<span>未超过最佳</span>'}</div>
    <div class="daily-trial-stats settlement-stats"><span>今日最佳 <b>${model.bestScore}</b></span><span>今日尝试 <b>${model.attempts}</b></span><span>${model.assisted ? '救援成绩 · -25' : '无救援成绩'}</span></div>
    <div class="daily-settlement-actions"><button class="secondary" data-action="share-daily-trial" ${model.sharePending ? 'disabled' : ''}>${model.sharePending ? '生成成绩卡中…' : '分享同种子试炼'}</button><button class="primary" data-action="back-station">回到车站</button></div>
    <div class="note">分享成绩不直接发放货币；正式排行榜将由服务端校验日期、种子、战斗和救援记录。</div>
  </section>`;
}
