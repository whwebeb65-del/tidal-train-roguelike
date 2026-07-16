import type {
  ExpeditionMilestoneId,
  SupportId,
} from '../../src/domain/social/SocialExpeditionSystem';

export interface SocialHubViewModel {
  readonly cycleId: string;
  readonly legionId: string | null;
  readonly contribution: number;
  readonly milestones: readonly {
    readonly id: ExpeditionMilestoneId;
    readonly label: string;
    readonly threshold: number;
    readonly progress: number;
    readonly claimed: boolean;
    readonly rewardLabel: string;
  }[];
  readonly supports: readonly {
    readonly id: SupportId;
    readonly name: string;
    readonly role: string;
    readonly effect: string;
    readonly selected: boolean;
  }[];
  readonly sharePending: boolean;
}

export function renderSocialHubView(model: SocialHubViewModel): string {
  if (!model.legionId) {
    return `<section id="legion-center" class="system-card system-card--social deferred-section">
      <div class="system-card__heading">
        <div><span class="eyebrow">CO-OP / ${model.cycleId}</span><h2>潮汐灯塔团</h2><p>加入异步军团，选择两名队友支援单局，并用每次结算推进共同远征。</p></div>
        <span class="system-card__badge">尚未加入</span>
      </div>
      <button class="primary system-card__action" data-action="join-legion">加入「潮汐灯塔团」</button>
    </section>`;
  }

  const milestones = model.milestones.map((milestone) => {
    const reached = milestone.progress >= milestone.threshold;
    return `<article class="system-card__item expedition-milestone ${reached ? 'reached' : ''}">
      <span><small>${milestone.progress}/${milestone.threshold}</small><b>${milestone.label}</b><em>${milestone.rewardLabel}</em></span>
      <button class="chip" data-action="claim-expedition" data-milestone-id="${milestone.id}" ${milestone.claimed || !reached ? 'disabled' : ''}>${milestone.claimed ? '已领取' : reached ? '领取' : '未达成'}</button>
    </article>`;
  }).join('');
  const supports = model.supports.map((support) => `<button class="system-card__item support-card ${support.selected ? 'selected' : ''}" data-action="toggle-support" data-support-id="${support.id}">
    <span class="support-avatar">${support.id === 'navigator' ? '航' : support.id === 'gunner' ? '炮' : '修'}</span>
    <span class="support-copy"><small>${support.role}</small><b>${support.name}</b><em>${support.effect}</em></span>
    <strong>${support.selected ? '已上车' : '选择'}</strong>
  </button>`).join('');
  const selectedEffects = model.supports
    .filter((support) => support.selected)
    .map((support) => support.effect)
    .join(' · ') || '尚未选择支援';

  return `<section id="legion-center" class="system-card system-card--social deferred-section">
    <div class="system-card__heading">
      <div><span class="eyebrow">LEGION / ${model.cycleId}</span><h2>潮汐灯塔团</h2><p>异步远征不要求队友同时在线；正式服贡献和奖励由服务端校验。</p></div>
      <button class="chip" data-action="share-squad" ${model.sharePending ? 'disabled' : ''}>${model.sharePending ? '生成招募卡中…' : '分享列车队招募卡'}</button>
    </div>
    <div class="expedition-progress"><div><span>本周远征贡献</span><b>${model.contribution} / 100</b></div><div class="progress"><i style="width:${Math.min(100, model.contribution)}%"></i></div></div>
    <div class="system-card__grid">${milestones}</div>
    <div class="section-title"><h2>异步列车队</h2><span>${model.supports.filter((support) => support.selected).length}/2 名支援 · ${selectedEffects}</span></div>
    <div class="system-card__grid support-grid">${supports}</div>
  </section>`;
}
