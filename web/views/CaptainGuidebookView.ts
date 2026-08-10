import type {
  CaptainGuidebookObjectiveSnapshot,
} from '../../src/domain/retention/CaptainGuidebookSystem';

export interface CaptainGuidebookViewModel {
  readonly objectives: readonly CaptainGuidebookObjectiveSnapshot[];
}

function rewardLabel(
  reward: CaptainGuidebookObjectiveSnapshot['reward'],
): string {
  return [
    reward.gears > 0 ? `${reward.gears} 齿轮` : '',
    reward.routeMarks > 0 ? `${reward.routeMarks} 航线徽记` : '',
  ].filter(Boolean).join(' · ');
}

function renderCurrent(
  objective: CaptainGuidebookObjectiveSnapshot,
): string {
  const action = objective.completed
    ? `<button class="guidebook-action guidebook-action--claim" data-action="claim-guidebook" data-guidebook-objective="${objective.id}"><span aria-hidden="true">✓</span>盖章领奖</button>`
    : `<button class="guidebook-action" data-action="guidebook-destination" data-guidebook-destination="${objective.destination}">${objective.actionLabel}</button>`;
  const progress = Math.min(objective.progress, objective.target);
  return `<article class="guidebook-current-ticket ${objective.completed ? 'is-ready' : ''}" data-guidebook-objective="${objective.id}">
    <div class="guidebook-current-ticket__copy">
      <span class="guidebook-chapter">${objective.chapter}</span>
      <h3>${objective.title}</h3>
      <p>${objective.description}</p>
    </div>
    <div class="guidebook-progress" aria-label="进度 ${progress}/${objective.target}">
      <span><i style="--guidebook-progress:${progress / objective.target}"></i></span>
      <b>${progress}/${objective.target}</b>
    </div>
    <div class="guidebook-reward"><small>值班补给</small><strong>${rewardLabel(objective.reward)}</strong></div>
    ${action}
  </article>`;
}

function renderPreview(
  objective: CaptainGuidebookObjectiveSnapshot,
  index: number,
): string {
  return `<article class="guidebook-preview-ticket" data-guidebook-objective="${objective.id}" style="--ticket-index:${index}">
    <span>${objective.chapter}</span>
    <b>${objective.title}</b>
    <small>完成上一程后公开 · ${rewardLabel(objective.reward)}</small>
  </article>`;
}

export function renderCaptainGuidebook(
  model: CaptainGuidebookViewModel,
): string {
  const [current, ...previews] = model.objectives;
  if (!current) {
    return `<section class="captain-guidebook living-zone is-complete" aria-labelledby="guidebook-title">
      <div class="guidebook-heading"><span>CAPTAIN LOG / COMPLETE</span><h2 id="guidebook-title">列车长成长手册</h2></div>
      <div class="guidebook-complete-stamp"><b>新手值班路线完成</b><span>你的名字已经写进末班车日志</span></div>
    </section>`;
  }
  return `<section class="captain-guidebook living-zone" aria-labelledby="guidebook-title">
    <div class="guidebook-heading">
      <span>CAPTAIN LOG / ${current.chapter}</span>
      <h2 id="guidebook-title">列车长成长手册</h2>
      <p>一次只处理眼前这一程，后面的路会自己亮起来。</p>
    </div>
    <div class="guidebook-paper-stack">
      ${renderCurrent(current)}
      <aside class="guidebook-preview-rail" aria-label="后续值班路线">
        ${previews.map(renderPreview).join('')}
      </aside>
    </div>
  </section>`;
}
