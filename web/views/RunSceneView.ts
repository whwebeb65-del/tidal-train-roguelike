import type { RewardOption, RouteNode } from '../../src/domain/route/RouteTypes';

type EscapeHtml = (value: string) => string;

export interface RouteCardsModel {
  readonly nodes: readonly RouteNode[];
  readonly mapName: string;
  readonly escapeHtml: EscapeHtml;
}

export interface RewardCardsModel {
  readonly options: readonly RewardOption[];
  readonly dailyTrial: boolean;
  readonly rerollHtml: string;
  readonly escapeHtml: EscapeHtml;
}

export interface SettlementCardModel {
  readonly firstClear: boolean;
  readonly mapName: string;
  readonly rewards: {
    readonly gears: number;
    readonly routeMarks: number;
    readonly starTickets: number;
  };
  readonly doubleActionHtml: string;
  readonly expeditionHtml: string;
  readonly escapeHtml: EscapeHtml;
}

const NODE_LABELS: Readonly<Record<RouteNode['type'], string>> = {
  combat: '战斗',
  rescue: '救援',
  shop: '漂流商店',
  repair: '维修港',
  event: '潮汐事件',
  boss: '深海巨兽',
};

const REWARD_LABELS: Readonly<Record<RewardOption['kind'], string>> = {
  passenger: '乘客',
  module: '车厢模块',
  temporary: '本局增益',
  gear: '齿轮补给',
};

export function renderRouteCards(model: RouteCardsModel): string {
  const cards = model.nodes.map((node) => `<button class="route-card route-choice route-ticket" data-action="route" data-node-id="${model.escapeHtml(node.id)}">
    <small>深度 ${node.depth} · 风险 ${Math.round(node.risk * 100)}%</small>
    <b>${NODE_LABELS[node.type]}</b>
    <span>${node.type === 'boss' ? '首通高额奖励正在终点等待' : '路线事件与奖励会随风险提高'}</span>
  </button>`).join('');

  return `<section class="run scene compact living-zone dispatch-table">
    <div class="run-heading dispatch-board"><div><span class="eyebrow">ROUTE CHOICE</span><h1>下一站去哪？</h1><p>补给更安全，高额奖励藏在潮位更高的分支。</p></div><span class="choice-count">航线 ${model.escapeHtml(model.mapName)}</span></div>
    <div class="choice-grid">${cards}</div>
  </section>`;
}

export function renderRewardCards(model: RewardCardsModel): string {
  const cards = model.options.map((option) => `<button class="reward-card choice-card reward-crate" data-action="reward" data-option-id="${model.escapeHtml(option.id)}">
    <small>${REWARD_LABELS[option.kind]}</small>
    <b>${model.escapeHtml(option.contentId)}</b>
    <span>${model.dailyTrial ? '试炼本局临时选择' : option.kind === 'gear' ? '补充车站齿轮' : '加入本局构筑'}</span>
  </button>`).join('');

  return `<section class="run scene compact living-zone cargo-unloading">
    <div class="run-heading"><div><span class="eyebrow">REWARD CHOICE</span><h1>潮汐回响</h1><p>只选一张，下一站会记住你的构筑。</p></div><span class="choice-count">${model.options.length} 选 1</span></div>
    <div class="choice-grid">${cards}</div>
    ${model.rerollHtml}
    <div class="note">${model.dailyTrial ? '每日试炼使用固定种子，不开放广告重选。' : '奖励选择只提交选项 ID，正式服由服务端校验。'}</div>
  </section>`;
}

export function renderSettlementCard(model: SettlementCardModel): string {
  const title = model.firstClear ? '首次通关完成' : '潮汐已平息';
  const description = model.firstClear
    ? `你完成了 ${model.escapeHtml(model.mapName)} 的首次通关，已获得高额开荒奖励。`
    : '这条线路的首通奖励已领取，重复挑战转为稳定收益。';
  const arrivalTicket = model.firstClear
    ? '<div class="arrival-ticket arrival-ticket--first-clear" aria-label="首次通关到站票"><span>ARRIVAL PASS</span><b>FIRST CLEAR</b></div>'
    : '<div class="arrival-ticket arrival-ticket--repeat-clear" aria-label="重复通关到站票"><span>ARRIVAL PASS</span><b>REPEAT RUN</b></div>';

  return `<section class="settlement-card settlement scene living-zone arrival-platform ${model.firstClear ? 'is-first-clear' : 'is-repeat-clear'}">
    <div class="settlement-symbol">✦</div>
    <span class="eyebrow">RUN SETTLED</span>
    ${arrivalTicket}
    <h1>${title}</h1>
    <p>${description}</p>
    <div class="settlement-rewards reward-luggage">
      <span class="currency gear"><b>${model.rewards.gears}</b>齿轮</span>
      <span class="currency route-mark"><b>${model.rewards.routeMarks}</b>航线徽记</span>
      <span class="currency ticket"><b>${model.rewards.starTickets}</b>星票</span>
    </div>
    ${model.doubleActionHtml}
    ${model.expeditionHtml}
    <button class="primary" data-action="back-station">回到车站</button>
  </section>`;
}
