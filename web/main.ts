import { createRoute } from '../src/domain/route/RouteGenerator';
import { createRewardOptions } from '../src/domain/route/RewardResolver';
import {
  claimFirstClear,
  type FirstClearState,
} from '../src/domain/reward/FirstClearRewardService';
import {
  claimInteractionReward,
  createInteractionState,
  type InteractionState,
} from '../src/domain/reward/InteractionRewardService';
import {
  canUnlockMap,
  getMapDefinition,
  isMapUnlocked,
  MAP_PROGRESSION,
  unlockMap,
  unlockModule,
  unlockPassenger,
  upgradeStation,
  type MapId,
} from '../src/domain/station/MapProgression';
import { MockAds, MockStore } from '../src/platform/MockPlatform';
import {
  createMemorySaveRepository,
  defaultSave,
  type PlayerSave,
} from '../src/save/SaveRepository';
import { createMemoryTelemetry } from '../src/telemetry/TelemetryClient';
import type { PrototypeEventName } from '../src/telemetry/TelemetryEvents';
import './styles.css';

const SAVE_KEY = 'tidal-train-prototype-save-v1';
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('App root is missing');
}

function readSave(): PlayerSave {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const candidate = JSON.parse(raw) as PlayerSave;
    return createMemorySaveRepository(candidate).load();
  } catch {
    return defaultSave();
  }
}

const repository = createMemorySaveRepository(readSave());
const telemetry = createMemoryTelemetry();
const ads = new MockAds('completed');
const store = new MockStore('success');
let save = repository.load();
let phase: 'station' | 'combat' | 'reward' | 'route' | 'boss' | 'settlement' = 'station';
let currentMapId: MapId = 'drift-suburb';
let runId = '';
let seed = 0;
let currentNodeId = 'node-0';
let route = createRoute(seed);
let combatHp = 100;
let bossHp = 120;
let combatClears = 0;
let interactionState: InteractionState = createInteractionState();
let firstClearState: FirstClearState = { claimedMapIds: [...save.firstClearMapIds] };
let interactionAttempts: Record<string, number> = {};
let lastSettlementWasFirstClear = false;
let notice = '欢迎登车，先选择一条可以活着回来的路线。';

function commit(next: PlayerSave): void {
  save = next;
  repository.save(next);
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(next));
}

function track(name: PrototypeEventName, payload: Record<string, string | number | boolean> = {}): void {
  telemetry.track({ name, runId: runId || 'station', timestampMs: Date.now(), payload });
}

function formatMap(mapId: MapId): string {
  return getMapDefinition(mapId).name;
}

function currency(label: string, value: number, tone: string): string {
  return `<span class="currency ${tone}"><b>${value}</b>${label}</span>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function renderHeader(): string {
  return `<header class="topbar">
    <div class="brand"><span class="brand-mark">✦</span><div><strong>最后一班</strong><small>潮汐列车</small></div></div>
    <div class="currencies">
      ${currency('齿轮', save.gears, 'gear')}
      ${currency('航线徽记', save.routeMarks, 'route-mark')}
      ${currency('星票', save.starTickets, 'ticket')}
    </div>
  </header>`;
}

function renderStation(): string {
  const nextLevelCost = save.stationLevel * 80;
  const mapCards = MAP_PROGRESSION.map((map) => {
    const unlocked = isMapUnlocked(save, map.id);
    const canUnlock = canUnlockMap(save, map.id);
    const selected = currentMapId === map.id;
    const action = unlocked
      ? `<button class="chip ${selected ? 'selected' : ''}" data-action="select-map" data-map-id="${map.id}">${selected ? '当前路线' : '选择路线'}</button>`
      : canUnlock
        ? `<button class="chip" data-action="unlock-map" data-map-id="${map.id}">解锁地图</button>`
        : `<span class="locked">车站 Lv.${map.minStationLevel} 开放</span>`;
    return `<article class="map-card ${unlocked ? 'unlocked' : 'locked-card'}">
      <div class="map-glow"></div><div class="map-copy"><small>区域 ${map.minStationLevel}</small><h3>${map.name}</h3><p>${map.feature}</p></div>${action}
    </article>`;
  }).join('');

  return `<section class="station scene">
    <div class="scene-heading"><div><span class="eyebrow">STATION / ${save.stationLevel}</span><h1>潮汐车站</h1><p>每次升级只打开一个新目标：下一张地图、下一项功能，或下一场更危险的挑战。</p></div><button class="primary" data-action="start-run">驶向 ${formatMap(currentMapId)} <span>→</span></button></div>
    <div class="train-platform"><div class="signal"></div><div class="train"><div class="train-window"></div><div class="train-light">潮</div><div class="train-wake"></div></div><div class="platform-line"></div><div class="platform-label">${formatMap(currentMapId)} · 潮位稳定</div></div>
    <div class="section-title"><h2>航线逐步开放</h2><span>已开放 ${save.unlockedMapIds.length}/${MAP_PROGRESSION.length}</span></div>
    <div class="map-grid">${mapCards}</div>
    <div class="station-footer"><div><b>车站升级</b><span>当前 Lv.${save.stationLevel} · 下一次需要 ${nextLevelCost} 齿轮</span></div><button class="secondary" data-action="upgrade-station" ${save.gears < nextLevelCost ? 'disabled' : ''}>升级车站</button></div>
    <div class="monetize-strip"><div><span class="eyebrow">航线补给</span><b>确定性内容，不卖随机胜率</b><small>星票可换外观、通行证与固定礼包；齿轮和徽记来自玩法。</small></div><button class="chip" data-action="buy-pack">模拟购买 60 星票</button></div>
  </section>`;
}

function renderInteractionCards(): string {
  const actions = [
    { id: 'salvage-a', label: '打捞废弃信标', currency: '齿轮', amount: 8, maxClaims: 2, tone: 'gear' },
    { id: 'aid-b', label: '给漂流者递水', currency: '航线徽记', amount: 1, maxClaims: 1, tone: 'route-mark' },
    { id: 'signal-c', label: '点亮潮汐信号', currency: '星票', amount: 1, maxClaims: 1, tone: 'ticket' },
  ] as const;
  return actions.map((action) => {
    const attempt = interactionAttempts[action.id] ?? 0;
    const reached = attempt >= action.maxClaims;
    return `<button class="interaction-card" data-action="interaction" data-interaction-id="${action.id}" ${reached ? 'disabled' : ''}>
      <span class="interaction-icon">${action.id === 'salvage-a' ? '⚙' : action.id === 'aid-b' ? '≈' : '✦'}</span><span><b>${action.label}</b><small>本局 ${attempt}/${action.maxClaims} 次 · +${action.amount} ${action.currency}</small></span><strong>${reached ? '已领完' : '点击领取'}</strong>
    </button>`;
  }).join('');
}

function renderCombat(): string {
  const damagePercent = Math.max(0, Math.round((combatHp / 100) * 100));
  const node = route.find((item) => item.id === currentNodeId);
  return `<section class="run scene">
    <div class="run-heading"><div><span class="eyebrow">RUN ${runId}</span><h1>${node?.type === 'event' ? '潮汐事件' : '漂流带遭遇'}</h1><p>自动战斗会推进列车，点击技能可以改变本局构筑节奏。</p></div><span class="risk">危险度 ${Math.round((node?.risk ?? 0.2) * 100)}%</span></div>
    <div class="combat-board"><div class="water-lines"></div><div class="enemy ${combatHp <= 0 ? 'defeated' : ''}"><div class="enemy-eye"></div><div class="enemy-mouth"></div><span>潮兽</span></div><div class="train small"><div class="train-window"></div><div class="train-light">潮</div></div><div class="lane-row"><button data-action="lane" data-lane="0">左航道</button><button class="active" data-action="lane" data-lane="1">中航道</button><button data-action="lane" data-lane="2">右航道</button></div></div>
    <div class="hp-line"><div><span>潮兽护甲</span><b>${Math.max(0, combatHp)} / 100</b></div><div class="progress"><i style="width:${damagePercent}%"></i></div></div>
    <div class="action-row"><button class="primary" data-action="attack">自动开炮 · -25</button><button class="secondary" data-action="skill">释放「汽笛共鸣」 · -40</button></div>
    <div class="section-title"><h2>同局互动奖励</h2><span>点击越多，路线资源越厚</span></div><div class="interaction-list">${renderInteractionCards()}</div>
  </section>`;
}

function renderReward(): string {
  const options = createRewardOptions(seed, currentNodeId);
  return `<section class="run scene compact"><div class="run-heading"><div><span class="eyebrow">REWARD CHOICE</span><h1>潮汐回响</h1><p>只选一张，下一站的风险会记住你的选择。</p></div><span class="choice-count">3 选 1</span></div><div class="choice-grid">${options.map((option) => `<button class="choice-card" data-action="reward" data-option-id="${option.id}"><small>${option.kind}</small><b>${option.contentId}</b><span>${option.kind === 'gear' ? '补充车站齿轮' : '加入本局构筑'}</span></button>`).join('')}</div><div class="note">奖励由规则层生成；客户端只提交选择 ID，正式服由服务端校验发放。</div></section>`;
}

function renderRoute(): string {
  const nextNodes = route.filter((node) => node.id !== currentNodeId && (route.find((item) => item.id === currentNodeId)?.nextNodeIds.includes(node.id) ?? false));
  return `<section class="run scene compact"><div class="run-heading"><div><span class="eyebrow">ROUTE CHOICE</span><h1>下一站去哪？</h1><p>补给更安全，但真正的高额奖励藏在潮位更高的分支。</p></div><span class="choice-count">航线 ${formatMap(currentMapId)}</span></div><div class="choice-grid">${nextNodes.map((node) => `<button class="choice-card route-choice" data-action="route" data-node-id="${node.id}"><small>深度 ${node.depth} · 风险 ${Math.round(node.risk * 100)}%</small><b>${node.type}</b><span>${node.type === 'boss' ? '潮汐巨兽正在等待' : '可能发现乘客、模块或互动点'}</span></button>`).join('')}</div></section>`;
}

function renderBoss(): string {
  const percent = Math.max(0, Math.round((bossHp / 120) * 100));
  return `<section class="run scene boss-scene"><div class="run-heading"><div><span class="eyebrow">FINAL BOSS</span><h1>潮汐巨兽 · 深海回响</h1><p>击败它，首次通关奖励将以地图为单位结算一次。</p></div><span class="risk danger">高风险</span></div><div class="boss-board"><div class="boss-orb">${bossHp > 0 ? '◉' : '✦'}</div><div class="boss-name">${bossHp > 0 ? '潮汐巨兽' : '潮位已平息'}</div></div><div class="hp-line"><div><span>Boss 生命</span><b>${Math.max(0, bossHp)} / 120</b></div><div class="progress danger"><i style="width:${percent}%"></i></div></div><div class="action-row"><button class="primary" data-action="boss-attack" ${bossHp <= 0 ? 'disabled' : ''}>集中火力 · -40</button><button class="secondary" data-action="revive">模拟看广告复活</button></div><div class="first-clear-callout">首次通关：+400 齿轮 · +10 航线徽记 · +3 星票</div></section>`;
}

function renderSettlement(): string {
  const repeatSettlement = !lastSettlementWasFirstClear;
  return `<section class="settlement scene"><div class="settlement-symbol">✦</div><span class="eyebrow">RUN SETTLED</span><h1>${repeatSettlement ? '潮汐已平息' : '首次通关完成'}</h1><p>${repeatSettlement ? '这条线路的首次通关奖励已经领取过，重复挑战会转为普通收益。' : `你完成了 ${formatMap(currentMapId)} 的首次通关，车站将从此拥有新的扩建方向。`}</p><div class="settlement-rewards">${currency(repeatSettlement ? '普通齿轮' : '首通齿轮', repeatSettlement ? 80 : 400, 'gear')}${currency(repeatSettlement ? '航线徽记' : '首通徽记', repeatSettlement ? 2 : 10, 'route-mark')}${currency(repeatSettlement ? '星票' : '首通星票', repeatSettlement ? 0 : 3, 'ticket')}</div><button class="primary" data-action="back-station">回到车站</button></section>`;
}

function render(): void {
  const scene = phase === 'station' ? renderStation() : phase === 'combat' ? renderCombat() : phase === 'reward' ? renderReward() : phase === 'route' ? renderRoute() : phase === 'boss' ? renderBoss() : renderSettlement();
  app.innerHTML = `${renderHeader()}<main>${scene}<div class="notice">${escapeHtml(notice)}</div></main><footer><span>Prototype Web Preview</span><button class="text-button" data-action="reset-save">清空本地存档</button></footer>`;
}

function persistInteractionState(): void {
  commit({ ...save, claimedInteractionIds: [...interactionState.claimedClaimIds] });
}

function startRun(): void {
  seed = Math.floor(Math.random() * 1000000) + 1;
  runId = `run-${Date.now()}`;
  route = createRoute(seed);
  currentNodeId = 'node-0';
  combatHp = 100;
  bossHp = 120;
  combatClears = 0;
  interactionAttempts = {};
  interactionState = { claimedClaimIds: [...save.claimedInteractionIds] };
  phase = 'combat';
  notice = `第 ${save.stationLevel} 级车站出发，潮汐种子 ${seed} 已锁定。`;
  track('run_start', { seed, mapId: currentMapId });
  render();
}

function settleRun(victory: boolean): void {
  if (!victory) {
    lastSettlementWasFirstClear = false;
    notice = '列车撤回车站，保留本局互动奖励；下一局仍然可以重新挑战。';
    phase = 'settlement';
    track('run_settled', { victory: false });
    render();
    return;
  }
  const result = claimFirstClear(firstClearState, {
    mapId: currentMapId,
    gears: 400,
    routeMarks: 10,
    starTickets: 3,
    collectionId: `${currentMapId}-first-clear`,
  });
  firstClearState = result.state;
  lastSettlementWasFirstClear = result.granted;
  commit({
    ...save,
    gears: save.gears + (result.granted ? result.reward.gears : 80),
    routeMarks: save.routeMarks + (result.granted ? result.reward.routeMarks : 2),
    starTickets: save.starTickets + result.reward.starTickets,
    firstClearMapIds: [...firstClearState.claimedMapIds],
  });
  notice = result.granted ? '首通奖励只在这张地图发放一次，欢迎回来刷构筑。' : '已是通关线路，重复挑战转为普通结算。';
  phase = 'settlement';
  track('run_settled', { victory: true, firstClear: result.granted });
  render();
}

function handleInteraction(actionId: string): void {
  const definitions = {
    'salvage-a': { actionId: 'salvage-a', currency: 'gears' as const, amount: 8, maxClaims: 2 },
    'aid-b': { actionId: 'aid-b', currency: 'routeMarks' as const, amount: 1, maxClaims: 1 },
    'signal-c': { actionId: 'signal-c', currency: 'starTickets' as const, amount: 1, maxClaims: 1 },
  } as const;
  const definition = definitions[actionId as keyof typeof definitions];
  if (!definition) return;
  const attempt = interactionAttempts[actionId] ?? 0;
  const result = claimInteractionReward(interactionState, { runId, actionId, attempt, definition });
  if (result.accepted) {
    interactionState = result.state;
    interactionAttempts[actionId] = attempt + 1;
    commit({ ...save, [result.currency]: save[result.currency] + result.amount, claimedInteractionIds: [...interactionState.claimedClaimIds] });
    notice = `互动成功：+${result.amount} ${result.currency}。同一局仍可尝试其它互动点。`;
    track('first_action', { actionId, attempt });
  } else {
    notice = result.alreadyClaimed ? '这次点击已经结算过，奖励不会重复发放。' : '这个互动点本局次数已用完。';
  }
  render();
}

function chooseReward(optionId: string): void {
  const [kind, contentId] = optionId.split(':');
  if (kind === 'passenger') commit(unlockPassenger(save, contentId));
  if (kind === 'module') commit(unlockModule(save, contentId));
  if (kind === 'gear') commit({ ...save, gears: save.gears + Number(contentId) });
  notice = `已选择 ${contentId}，构筑记录已写入本局。`;
  track('reward_choice', { optionId });
  phase = 'route';
  render();
}

function chooseRoute(nodeId: string): void {
  currentNodeId = nodeId;
  const node = route.find((item) => item.id === nodeId);
  if (!node) return;
  track('route_choice', { nodeId, type: node.type });
  if (node.type === 'boss') {
    phase = 'boss';
    track('boss_enter', { nodeId });
    notice = '潮汐巨兽出现了，先观察它的护甲节奏。';
  } else {
    combatClears += 1;
    combatHp = 100;
    phase = 'combat';
    notice = `${node.type} 节点已进入，点击互动奖励可以增加本局资源。`;
  }
  render();
}

function upgradeStationAtStation(): void {
  const cost = save.stationLevel * 80;
  if (save.gears < cost) {
    notice = `还需要 ${cost - save.gears} 齿轮才能升级车站。`;
    render();
    return;
  }
  commit(upgradeStation({ ...save, gears: save.gears - cost }));
  for (const map of MAP_PROGRESSION) {
    if (canUnlockMap(save, map.id)) {
      commit(unlockMap(save, map.id));
    }
  }
  notice = `车站升级至 Lv.${save.stationLevel}，新的功能已经在站台亮灯。`;
  render();
}

app.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'start-run') startRun();
  if (action === 'back-station') { phase = 'station'; render(); }
  if (action === 'interaction' && button.dataset.interactionId) handleInteraction(button.dataset.interactionId);
  if (action === 'attack') { combatHp = Math.max(0, combatHp - 25); notice = combatHp === 0 ? '敌人已击破，选择一张潮汐卡。' : '列车自动开炮，敌人护甲下降。'; if (combatHp === 0) phase = 'reward'; track('first_action', { actionId: 'auto-attack' }); render(); }
  if (action === 'skill') { combatHp = Math.max(0, combatHp - 40); notice = combatHp === 0 ? '汽笛共鸣撕开潮雾，奖励已经出现。' : '汽笛共鸣触发，下一次普通攻击更安全。'; if (combatHp === 0) phase = 'reward'; track('synergy_activated', { synergyId: 'sound-copy' }); render(); }
  if (action === 'lane') { notice = `已切换至${button.dataset.lane === '0' ? '左' : button.dataset.lane === '2' ? '右' : '中'}航道。`; render(); }
  if (action === 'reward' && button.dataset.optionId) chooseReward(button.dataset.optionId);
  if (action === 'route' && button.dataset.nodeId) chooseRoute(button.dataset.nodeId);
  if (action === 'boss-attack') { bossHp = Math.max(0, bossHp - 40); notice = bossHp === 0 ? 'Boss 已击破，正在发放首通判定。' : '炮火命中潮汐巨兽。'; if (bossHp === 0) settleRun(true); else render(); }
  if (action === 'revive') { const result = await ads.showRewardedAd('revive'); notice = result === 'completed' ? '模拟广告完成，列车获得一次复活机会。' : '广告未完成。'; render(); }
  if (action === 'select-map' && button.dataset.mapId) { currentMapId = button.dataset.mapId as MapId; notice = `已切换路线：${formatMap(currentMapId)}。`; render(); }
  if (action === 'unlock-map' && button.dataset.mapId) { commit(unlockMap(save, button.dataset.mapId as MapId)); currentMapId = button.dataset.mapId as MapId; notice = `新地图 ${formatMap(currentMapId)} 已开放。`; render(); }
  if (action === 'upgrade-station') upgradeStationAtStation();
  if (action === 'buy-pack') { const result = await store.purchase('starter-star-ticket-pack'); if (result === 'success') { commit({ ...save, starTickets: save.starTickets + 60 }); notice = '模拟购买成功：固定获得 60 星票。'; render(); } }
  if (action === 'reset-save') { window.localStorage.removeItem(SAVE_KEY); window.location.reload(); }
});

render();
