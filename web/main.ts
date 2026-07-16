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
import {
  applyRevive,
  applySkillRefresh,
  canRevive,
  canRefreshSkill,
  createRecoveryState,
  startCombatNode,
  useSkill,
} from '../src/domain/recovery/RecoverySystem';
import {
  createCombatLoopState,
  getTideModifierLabel,
  receiveDamage,
  resolveCombatAction,
  type CombatAction,
  type CombatLoopState,
  type TideModifier,
} from '../src/domain/combat/CombatLoopSystem';
import {
  equipEquipment,
  rerollEquipment,
  starEquipment,
  upgradeEquipment,
  type EquipmentMutationResult,
  type EquipmentState,
} from '../src/domain/equipment/EquipmentSystem';
import {
  getEquipmentDefinition,
} from '../src/domain/equipment/EquipmentCatalog';
import {
  equipCaptainSkin,
  selectCaptain,
} from '../src/domain/captain/CaptainProfileSystem';
import type { CaptainId } from '../src/domain/captain/CaptainCatalog';
import {
  getSkinDefinition,
  SKIN_CATALOG,
  type SkinId,
} from '../src/domain/skin/SkinCatalog';
import {
  canCaptainWearSkin,
  getSkinCollectionModifiers,
} from '../src/domain/skin/SkinCollectionSystem';
import {
  createProgressionSnapshot,
  type ProgressionSnapshot,
} from '../src/domain/progression/ProgressionStatService';
import {
  applyForBeta,
  claimBetaGift,
  claimLaunchGift,
  GIFT_CODE_CATALOG,
  normalizeLaunchCampaignState,
  redeemGiftCode,
  type CampaignFailureReason,
  type CampaignReward,
  type LaunchCampaignState,
} from '../src/domain/campaign/LaunchCampaignSystem';
import {
  claimDailyTrialMilestone,
  createDailyTrialState,
  getChinaDayId,
  getDailyTrialDefinition,
  normalizeDailyTrialState,
  submitDailyTrial,
  type DailyTrialDefinition,
  type DailyTrialMilestoneId,
  type DailyTrialState,
  type DailyTrialSubmissionResult,
} from '../src/domain/challenge/DailyTrialSystem';
import {
  claimDailyCheckIn,
  normalizeDailyCheckInState,
  type DailyCheckInState,
} from '../src/domain/retention/DailyCheckInSystem';
import {
  getProductDefinition,
  PRODUCT_CATALOG,
  type ProductReward,
} from '../src/domain/commerce/ProductCatalog';
import { settlePurchase } from '../src/domain/commerce/PurchaseService';
import {
  claimExpeditionMilestone,
  contributeToExpedition,
  EXPEDITION_MILESTONES,
  getSquadBonuses,
  joinLegion,
  normalizeSocialExpeditionState,
  SUPPORT_ROSTER,
  toggleSquadMember,
  type ExpeditionMilestoneId,
  type ExpeditionOutcome,
  type SocialExpeditionState,
  type SupportId,
} from '../src/domain/social/SocialExpeditionSystem';
import { MockAds, MockShare, MockStore } from '../src/platform/MockPlatform';
import type { RewardedPlacement } from '../src/platform/PlatformContracts';
import {
  createMemorySaveRepository,
  type PlayerSave,
} from '../src/save/SaveRepository';
import { createMemoryTelemetry } from '../src/telemetry/TelemetryClient';
import type { PrototypeEventName } from '../src/telemetry/TelemetryEvents';
import {
  renderDailyTrialHub,
  renderDailyTrialRunBanner,
  renderDailyTrialSettlement,
} from './views/DailyTrialView';
import { renderDailyCheckIn } from './views/DailyCheckInView';
import { renderCommerceStore } from './views/CommerceView';
import { renderCaptainSelection } from './views/CaptainSelectionView';
import { renderStationHero } from './views/StationHeroView';
import { renderCombatScene } from './views/CombatSceneView';
import {
  renderRewardCards,
  renderRouteCards,
  renderSettlementCard,
} from './views/RunSceneView';
import { renderWardrobe } from './views/WardrobeView';
import {
  PROTOTYPE_REROLL,
  renderEquipment,
} from './views/EquipmentView';
import { createBrowserAppStateRepository } from './app/AppStateRepository';
import { renderLaunchCampaignView } from './views/LaunchCampaignView';
import { renderSocialHubView } from './views/SocialHubView';
import { requireElement } from './app/dom';
import './styles.css';

const app = requireElement<HTMLDivElement>(document, '#app');
const appStateRepository = createBrowserAppStateRepository(window.localStorage);
const initialState = appStateRepository.load();
const expeditionCycleId = initialState.social.cycleId;
const repository = createMemorySaveRepository(initialState.save);
const telemetry = createMemoryTelemetry();
const ads = new MockAds('completed');
const share = new MockShare('completed');
const store = new MockStore('verified');
let save = repository.load();
let socialState = initialState.social;
let campaignState = initialState.campaign;
let dailyTrialState = initialState.dailyTrial;
let dailyCheckInState = initialState.dailyCheckIn;
let phase: 'station' | 'combat' | 'reward' | 'route' | 'boss' | 'failure' | 'settlement' = 'station';
type HubView = 'station' | 'wardrobe' | 'equipment';
let hubView: HubView = 'station';
let captainSelectionTracked = false;
let wardrobeViewTracked = false;
let equipmentViewTracked = false;
let runMode: 'normal' | 'daily-trial' = 'normal';
let currentMapId: MapId = initialState.selectedMapId;
let runId = '';
let seed = 0;
let currentNodeId = 'node-0';
let route = createRoute(seed);
let battleState: CombatLoopState = createCombatLoopState({ enemyHp: 100 });
let failureEncounter: 'combat' | 'boss' = 'combat';
let recoveryState = createRecoveryState();
const pendingRecoveryActions = new Set<'ad' | RewardedPlacement>();
const trackedAdOffers = new Set<RewardedPlacement>();
let lastRunRecovery: 'ad' | 'none' = 'none';
let combatClears = 0;
let interactionState: InteractionState = createInteractionState();
let firstClearState: FirstClearState = { claimedMapIds: [...save.firstClearMapIds] };
let interactionAttempts: Record<string, number> = {};
let lastSettlementWasFirstClear = false;
let lastExpeditionContribution = 0;
let squadSharePending = false;
let lastDailySubmission: DailyTrialSubmissionResult | null = null;
let dailyTrialSharePending = false;
let pendingProductId: string | null = null;
let storeViewTracked = false;
let rewardRerollUsed = false;
let rewardRerollOffset = 0;
let settlementDoubleAvailable = false;
let settlementDoubleClaimed = false;
let notice = '欢迎登车，先选择一条可以活着回来的路线。';

function commit(next: PlayerSave): void {
  save = next;
  repository.save(next);
  appStateRepository.savePlayer(next);
}

function getEquipmentStateFromSave(): EquipmentState {
  return {
    inventory: save.equipmentInventory,
    equippedEquipmentIds: save.equippedEquipmentIds,
    fragments: save.equipmentFragments,
    gears: save.gears,
  };
}

function getProgressionSnapshot(): ProgressionSnapshot {
  return createProgressionSnapshot({
    baseMaxHp: 100,
    ownedSkinIds: save.ownedSkinIds,
    equipmentState: getEquipmentStateFromSave(),
  });
}

function getActiveCaptainId(): CaptainId {
  return save.selectedCaptainId ?? 'captain-tide-female';
}

function getActiveSkinId(): SkinId {
  const candidate = save.equippedSkinIds[getActiveCaptainId()];
  return getSkinDefinition(candidate ?? '')?.id ?? 'skin-tide-base';
}

function scaleGearReward(baseGears: number): number {
  return Math.floor(baseGears * getProgressionSnapshot().gearsMultiplier);
}

function commitSocial(next: SocialExpeditionState): void {
  socialState = normalizeSocialExpeditionState(next, expeditionCycleId);
  appStateRepository.saveSocial(socialState);
}

function commitCampaign(next: LaunchCampaignState): void {
  campaignState = normalizeLaunchCampaignState(next);
  appStateRepository.saveCampaign(campaignState);
}

function commitDailyTrial(next: DailyTrialState): void {
  dailyTrialState = normalizeDailyTrialState(next, next.dayId);
  appStateRepository.saveDailyTrial(dailyTrialState);
}

function commitDailyCheckIn(next: DailyCheckInState): void {
  dailyCheckInState = normalizeDailyCheckInState(next);
  appStateRepository.saveDailyCheckIn(dailyCheckInState);
}

function syncDailyTrialDay(): DailyTrialDefinition {
  const currentDayId = getChinaDayId(Date.now());
  if (dailyTrialState.dayId !== currentDayId) {
    commitDailyTrial(createDailyTrialState(currentDayId));
  }
  return getDailyTrialDefinition(dailyTrialState.dayId);
}

function getActiveDailyTrialDefinition(): DailyTrialDefinition | null {
  return runMode === 'daily-trial' ? getDailyTrialDefinition(dailyTrialState.dayId) : null;
}

function applyCampaignReward(reward: CampaignReward): void {
  commit({
    ...save,
    gears: save.gears + reward.gears,
    routeMarks: save.routeMarks + reward.routeMarks,
    starTickets: save.starTickets + reward.starTickets,
  });
}

function track(name: PrototypeEventName, payload: Record<string, string | number | boolean> = {}): void {
  telemetry.track({ name, runId: runId || 'station', timestampMs: Date.now(), payload });
}

function trackAdOfferOnce(placement: RewardedPlacement): void {
  if (trackedAdOffers.has(placement)) return;
  trackedAdOffers.add(placement);
  track('rewarded_ad_offer_shown', { placement });
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

function createBattleModifier(seedValue: number, nodeId: string): TideModifier {
  let hash = seedValue >>> 0;
  for (const character of nodeId) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return (['calm-water', 'surge-current', 'echo-fog'] as const)[hash % 3];
}

function resetBattleState(enemyHp: number): void {
  const bonuses = getSquadBonuses(socialState);
  const rule = getActiveDailyTrialDefinition()?.rule;
  const progression = getProgressionSnapshot();
  battleState = createCombatLoopState({
    enemyHp: enemyHp + (rule?.enemyHpBonus ?? 0),
    modifier: createBattleModifier(seed, currentNodeId),
    maxPlayerHp: Math.max(
      1,
      progression.maxPlayerHp
        + bonuses.maxPlayerHpBonus
        + (rule?.maxPlayerHpDelta ?? 0),
    ),
    initialMomentum: Math.min(
      100,
      progression.initialMomentum
        + bonuses.initialMomentum
        + (rule?.initialMomentumBonus ?? 0),
    ),
  });
}

function getActionDamageBonus(): number {
  return getSquadBonuses(socialState).damageBonus
    + (getActiveDailyTrialDefinition()?.rule.damageBonus ?? 0);
}

function renderBattleStatus(): string {
  const modifier = getTideModifierLabel(battleState.modifier);
  const supportNames = SUPPORT_ROSTER
    .filter((support) => socialState.squadMemberIds.includes(support.id))
    .map((support) => support.displayName)
    .join(' · ');
  return `<div class="battle-status">
    <div class="momentum-panel"><div><span>潮汐动能</span><b>${battleState.momentum}/100</b></div><div class="momentum-progress"><i style="width:${battleState.momentum}%"></i></div></div>
    <span class="combo-chip">连击 x${battleState.combo}</span>
    <span class="modifier-chip"><b>${modifier.name}</b><small>${modifier.effect}</small></span>
    <span class="squad-battle-chip"><b>${supportNames || '单车作战'}</b><small>${supportNames ? '异步队友支援已生效' : '可在车站选择两名支援队友'}</small></span>
  </div>`;
}

function renderBattleActions(isBoss: boolean): string {
  const burstReady = battleState.momentum >= 100 && !battleState.burstUsed;
  const repairReady = !battleState.repairUsed && battleState.playerHp < battleState.maxPlayerHp;
  const damageBonus = getActionDamageBonus();
  const progression = getProgressionSnapshot();
  const totalFlatDamage = damageBonus + progression.damageFlat;
  const attackDamage = Math.floor(
    ((battleState.modifier === 'surge-current' ? 30 : 25) + totalFlatDamage)
      * progression.damageMultiplier,
  );
  const skillDamage = Math.floor(
    ((battleState.modifier === 'echo-fog' ? 60 : 50) + totalFlatDamage)
      * progression.damageMultiplier,
  );
  const repairAmount = (battleState.modifier === 'calm-water' ? 24 : 18)
    + progression.repairBonus;
  const burstDamage = Math.floor(
    (60 + totalFlatDamage) * progression.damageMultiplier,
  );
  return `<div class="battle-actions action-row">
    <button class="primary battle-action" data-action="combat-action" data-combat-action="attack">${isBoss ? '集中火力' : '自动开炮'} · -${attackDamage}</button>
    <button class="secondary battle-action" data-action="combat-action" data-combat-action="skill" ${recoveryState.skillCharges <= 0 || battleState.enemyHp <= 0 ? 'disabled' : ''}>释放「汽笛共鸣」 · -${skillDamage}</button>
    <button class="secondary battle-action repair-action" data-action="combat-action" data-combat-action="repair" ${!repairReady ? 'disabled' : ''}>维修车厢 · +${repairAmount}</button>
    <button class="burst-action ${burstReady ? 'burst-ready' : ''}" data-action="combat-action" data-combat-action="burst" ${!burstReady ? 'disabled' : ''}>潮汐爆发 · -${burstDamage}</button>
    <button class="debug-hit" data-action="damage">模拟受击 · -35</button>
  </div>`;
}

function getBattleActionValues(): {
  readonly attackDamage: number;
  readonly skillDamage: number;
  readonly repairAmount: number;
  readonly burstDamage: number;
  readonly burstReady: boolean;
  readonly repairReady: boolean;
} {
  const damageBonus = getActionDamageBonus();
  const progression = getProgressionSnapshot();
  const totalFlatDamage = damageBonus + progression.damageFlat;
  return {
    attackDamage: Math.floor(
      ((battleState.modifier === 'surge-current' ? 30 : 25) + totalFlatDamage)
        * progression.damageMultiplier,
    ),
    skillDamage: Math.floor(
      ((battleState.modifier === 'echo-fog' ? 60 : 50) + totalFlatDamage)
        * progression.damageMultiplier,
    ),
    repairAmount: (battleState.modifier === 'calm-water' ? 24 : 18)
      + progression.repairBonus,
    burstDamage: Math.floor(
      (60 + totalFlatDamage) * progression.damageMultiplier,
    ),
    burstReady: battleState.momentum >= 100 && !battleState.burstUsed,
    repairReady: !battleState.repairUsed && battleState.playerHp < battleState.maxPlayerHp,
  };
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

function formatExpeditionReward(reward: { readonly gears: number; readonly routeMarks: number; readonly starTickets: number }): string {
  return [
    reward.gears > 0 ? `${reward.gears} 齿轮` : '',
    reward.routeMarks > 0 ? `${reward.routeMarks} 航线徽记` : '',
    reward.starTickets > 0 ? `${reward.starTickets} 星票` : '',
  ].filter(Boolean).join(' · ');
}

function formatCommerceReward(reward: ProductReward): string {
  const equipmentFragments = Object.values(reward.equipmentFragments)
    .reduce((total, amount) => total + amount, 0);
  return [
    formatExpeditionReward(reward),
    reward.cosmeticIds.length > 0 ? `${reward.cosmeticIds.length} 件非战力外观` : '',
    reward.skinIds.length > 0 ? `${reward.skinIds.length} 套列车长皮肤` : '',
    reward.equipmentDefinitionIds.length > 0
      ? `${reward.equipmentDefinitionIds.length} 件确定性装备`
      : '',
    equipmentFragments > 0 ? `${equipmentFragments} 个装备碎片` : '',
  ].filter(Boolean).join(' · ');
}

function renderLaunchCampaignCenter(): string {
  return renderLaunchCampaignView({
    betaApplied: campaignState.betaQualified,
    betaGiftClaimed: campaignState.betaGiftClaimed,
    launchGiftClaimed: campaignState.launchGiftClaimed,
    badges: campaignState.cosmeticBadgeIds.map((badgeId) => (
      badgeId === 'beta-pioneer' ? '潮汐先行者' : '开服列车长'
    )),
    giftCodeHint: GIFT_CODE_CATALOG[0]?.code ?? '',
  });
}

function renderSocialHub(): string {
  return renderSocialHubView({
    cycleId: socialState.cycleId,
    legionId: socialState.legionId,
    contribution: socialState.contribution,
    milestones: EXPEDITION_MILESTONES.map((milestone) => ({
      id: milestone.id,
      label: milestone.label,
      threshold: milestone.threshold,
      progress: Math.min(socialState.contribution, milestone.threshold),
      claimed: socialState.claimedMilestoneIds.includes(milestone.id),
      rewardLabel: formatExpeditionReward(milestone.reward),
    })),
    supports: SUPPORT_ROSTER.map((support) => ({
      id: support.id,
      name: support.displayName,
      role: support.role,
      effect: support.description,
      selected: socialState.squadMemberIds.includes(support.id),
    })),
    sharePending: squadSharePending,
  });
}

function renderStation(): string {
  if (!storeViewTracked) {
    track('store_viewed', { productCount: PRODUCT_CATALOG.length });
    storeViewTracked = true;
  }
  const nextLevelCost = save.stationLevel * 80;
  const currentDayId = getChinaDayId(Date.now());
  const dailyDefinition = syncDailyTrialDay();
  const progression = getProgressionSnapshot();
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
    ${renderStationHero({
      captainId: getActiveCaptainId(),
      skinId: getActiveSkinId(),
      mapName: formatMap(currentMapId),
      stationLevel: save.stationLevel,
      maxHp: progression.maxPlayerHp,
      damagePercent: Math.max(0, Math.round((progression.damageMultiplier - 1) * 100)),
    })}
    <div class="section-title"><h2>航线逐步开放</h2><span>已开放 ${save.unlockedMapIds.length}/${MAP_PROGRESSION.length}</span></div>
    <div class="map-grid">${mapCards}</div>
    <div class="station-footer"><div><b>车站升级</b><span>当前 Lv.${save.stationLevel} · 下一次需要 ${nextLevelCost} 齿轮</span></div><button class="secondary" data-action="upgrade-station" ${save.gears < nextLevelCost ? 'disabled' : ''}>升级车站</button></div>
    ${renderDailyCheckIn({ state: dailyCheckInState, currentDayId })}
    ${renderDailyTrialHub({ stationLevel: save.stationLevel, state: dailyTrialState, definition: dailyDefinition })}
    ${renderLaunchCampaignCenter()}
    ${renderSocialHub()}
    <div id="shop-center">${renderCommerceStore({
      products: PRODUCT_CATALOG,
      purchasedProductIds: save.purchasedProductIds,
      pendingProductId,
    })}</div>
  </section>`;
}

function renderHubNavigation(): string {
  return `<nav class="hub-nav" aria-label="车站功能">
    <button class="hub-nav__item ${hubView === 'station' ? 'is-active' : ''}" data-action="open-hub" data-hub-view="station" ${hubView === 'station' ? 'aria-current="page"' : ''}>车站</button>
    <button class="hub-nav__item ${hubView !== 'station' ? 'is-active' : ''}" data-action="open-hub" data-hub-view="wardrobe" ${hubView !== 'station' ? 'aria-current="page"' : ''}>衣柜</button>
    <button class="hub-nav__item" data-action="start-run">出发</button>
    <button class="hub-nav__item" data-action="open-hub-anchor" data-anchor-id="legion-center">军团</button>
    <button class="hub-nav__item" data-action="open-hub-anchor" data-anchor-id="shop-center">商店</button>
  </nav>`;
}

function renderWardrobeScreen(): string {
  if (!wardrobeViewTracked) {
    track('wardrobe_viewed', { ownedSkins: save.ownedSkinIds.length });
    wardrobeViewTracked = true;
  }
  const auroraProduct = getProductDefinition('aurora-whale-song-skin');
  return renderWardrobe({
    selectedCaptainId: getActiveCaptainId(),
    ownedSkinIds: save.ownedSkinIds,
    equippedSkinIds: save.equippedSkinIds,
    skins: SKIN_CATALOG,
    collectionModifiers: getSkinCollectionModifiers(save.ownedSkinIds),
    pendingProductId,
    productBySkinId: auroraProduct
      ? { 'skin-aurora-whale-song': auroraProduct }
      : {},
  });
}

function renderEquipmentScreen(): string {
  if (!equipmentViewTracked) {
    track('equipment_viewed', { inventorySize: save.equipmentInventory.length });
    equipmentViewTracked = true;
  }
  return renderEquipment({ state: getEquipmentStateFromSave() });
}

function handleCaptainSwitch(captainId: CaptainId): void {
  const profile = selectCaptain(save, captainId);
  commit({ ...save, ...profile });
  track('captain_switched', { captainId });
  notice = `已切换为${captainId === 'captain-tide-female' ? '女列车长' : '男列车长'}，基础能力保持一致。`;
  render();
}

function handleSkinEquip(skinId: SkinId): void {
  const captainId = getActiveCaptainId();
  track('skin_clicked', { skinId, captainId });
  if (!save.ownedSkinIds.includes(skinId)) {
    notice = '该皮肤尚未解锁，不能直接穿戴。';
    render();
    return;
  }
  if (!canCaptainWearSkin(captainId, skinId)) {
    notice = '当前列车长无法穿戴该皮肤。';
    render();
    return;
  }
  const profile = equipCaptainSkin(save, captainId, skinId);
  commit({ ...save, ...profile });
  track('skin_equipped', { skinId, captainId });
  notice = `已穿戴「${getSkinDefinition(skinId)?.name ?? skinId}」，收藏属性继续永久叠加。`;
  render();
}

function commitEquipmentState(state: EquipmentState): void {
  commit({
    ...save,
    gears: state.gears,
    equipmentInventory: state.inventory.map((instance) => ({
      ...instance,
      affixes: instance.affixes.map((affix) => ({ ...affix })),
    })),
    equippedEquipmentIds: { ...state.equippedEquipmentIds },
    equipmentFragments: { ...state.fragments },
  });
}

function equipmentFailureNotice(result: EquipmentMutationResult): string {
  const messages: Record<NonNullable<EquipmentMutationResult['reason']>, string> = {
    'not-found': '装备不存在，请刷新后重试。',
    'max-level': '该装备已经达到最高等级。',
    'max-stars': '该装备已经达到五星。',
    'insufficient-gears': '齿轮不足，完成航线或购买固定补给后再试。',
    'insufficient-fragments': '对应装备碎片不足，暂时无法升星。',
    'invalid-affixes': '定向词条配置无效，未消耗齿轮。',
  };
  return result.reason ? messages[result.reason] : '装备操作未完成。';
}

function trackEquipmentSet(instanceId: string, state: EquipmentState): void {
  const instance = state.inventory.find((item) => item.instanceId === instanceId);
  if (!instance) return;
  const definition = getEquipmentDefinition(instance.definitionId);
  const count = Object.values(state.equippedEquipmentIds)
    .filter((equippedId): equippedId is string => Boolean(equippedId))
    .map((equippedId) => state.inventory.find((item) => item.instanceId === equippedId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => getEquipmentDefinition(item.definitionId).setId === definition.setId)
    .length;
  if (count === 2 || count === 4) {
    track('equipment_set_activated', { setId: definition.setId, pieces: count });
  }
}

function handleEquipmentEquip(instanceId: string): void {
  try {
    const next = equipEquipment(getEquipmentStateFromSave(), instanceId);
    commitEquipmentState(next);
    const instance = next.inventory.find((item) => item.instanceId === instanceId);
    const name = instance ? getEquipmentDefinition(instance.definitionId).name : instanceId;
    track('equipment_equipped', { instanceId });
    trackEquipmentSet(instanceId, next);
    notice = `已装备「${name}」，属性立即生效。`;
  } catch {
    notice = '装备不存在，请刷新后重试。';
  }
  render();
}

function handleEquipmentUpgrade(instanceId: string): void {
  const result = upgradeEquipment(getEquipmentStateFromSave(), instanceId);
  if (!result.accepted) {
    notice = equipmentFailureNotice(result);
    render();
    return;
  }
  commitEquipmentState(result.state);
  track('equipment_upgraded', { instanceId });
  notice = '装备强化成功，主属性已提高。';
  render();
}

function handleEquipmentStar(instanceId: string): void {
  const result = starEquipment(getEquipmentStateFromSave(), instanceId);
  if (!result.accepted) {
    notice = equipmentFailureNotice(result);
    render();
    return;
  }
  commitEquipmentState(result.state);
  track('equipment_starred', { instanceId });
  notice = '装备升星成功，成长倍率已提高。';
  render();
}

function handleEquipmentReroll(instanceId: string): void {
  const state = getEquipmentStateFromSave();
  const instance = state.inventory.find((item) => item.instanceId === instanceId);
  if (!instance) {
    notice = '装备不存在，请刷新后重试。';
    render();
    return;
  }
  const slot = getEquipmentDefinition(instance.definitionId).slot;
  const result = rerollEquipment(state, instanceId, PROTOTYPE_REROLL[slot]);
  if (!result.accepted) {
    notice = equipmentFailureNotice(result);
    render();
    return;
  }
  commitEquipmentState(result.state);
  track('equipment_rerolled', { instanceId, slot });
  notice = '定向重铸完成，预览词条已固定写入装备。';
  render();
}

function renderInteractionCards(): string {
  const actions = [
    { id: 'salvage-a', label: '打捞废弃信标', currency: '齿轮', amount: 8, maxClaims: 2, tone: 'gear' },
    { id: 'aid-b', label: '给漂流者递水', currency: '航线徽记', amount: 1, maxClaims: 1, tone: 'route-mark' },
    { id: 'signal-c', label: '点亮潮汐信号', currency: '齿轮', amount: 12, maxClaims: 1, tone: 'gear' },
  ] as const;
  return actions.map((action) => {
    const attempt = interactionAttempts[action.id] ?? 0;
    const reached = attempt >= action.maxClaims;
    return `<button class="interaction-card" data-action="interaction" data-interaction-id="${action.id}" ${reached ? 'disabled' : ''}>
      <span class="interaction-icon">${action.id === 'salvage-a' ? '⚙' : action.id === 'aid-b' ? '≈' : '✦'}</span><span><b>${action.label}</b><small>本局 ${attempt}/${action.maxClaims} 次 · +${action.amount} ${action.currency}</small></span><strong>${reached ? '已领完' : '点击领取'}</strong>
    </button>`;
  }).join('');
}

function handleCombatAction(action: CombatAction): void {
  const progression = getProgressionSnapshot();
  const result = resolveCombatAction(battleState, action, {
    skillAvailable: recoveryState.skillCharges > 0,
    damageBonus: getActionDamageBonus() + progression.damageFlat,
    damageMultiplier: progression.damageMultiplier,
    repairBonus: progression.repairBonus,
  });
  if (!result.accepted) {
    const messages = {
      'enemy-defeated': '敌人已经倒下，先选择奖励。',
      'skill-unavailable': '技能充能不足，请等待下一节点或看广告刷新。',
      'repair-used': '本节点的维修机会已经使用。',
      'momentum-not-ready': '潮汐动能还未蓄满。',
      'burst-used': '本节点的潮汐爆发已经使用。',
    } as const;
    notice = messages[result.reason ?? 'enemy-defeated'];
    render();
    return;
  }

  if (action === 'skill') {
    const used = useSkill(recoveryState);
    if (!used.accepted) {
      notice = '技能充能不足，请等待下一节点或看广告刷新。';
      render();
      return;
    }
    recoveryState = used.state;
  }

  battleState = result.state;
  if (result.defeated) {
    if (phase === 'boss') {
      notice = '潮汐爆发撕开深海回响，正在结算首通。';
      settleRun(true);
    } else {
      notice = '敌人已击破，选择一张潮汐卡。';
      phase = 'reward';
      render();
    }
    return;
  }

  notice = action === 'repair'
    ? `维修完成，恢复 ${result.hpRestored} 点生命。`
    : action === 'burst'
      ? '潮汐爆发命中，动能归零。'
      : action === 'skill'
        ? '汽笛共鸣触发，技能充能归零。'
        : `列车开炮，连击达到 x${battleState.combo}。`;
  track(action === 'skill' ? 'synergy_activated' : 'first_action', {
    actionId: action,
    damage: result.damageDealt,
    momentum: battleState.momentum,
  });
  render();
}

function renderCombat(): string {
  const node = route.find((item) => item.id === currentNodeId);
  const dailyDefinition = getActiveDailyTrialDefinition();
  const dailyBanner = dailyDefinition ? renderDailyTrialRunBanner({ definition: dailyDefinition }) : '';
  const skillRefreshAvailable = canRefreshSkill(recoveryState);
  const actionValues = getBattleActionValues();
  if (skillRefreshAvailable) trackAdOfferOnce('skill-refresh');
  const interactionContent = dailyDefinition
    ? '<div class="note daily-trial-fairness">每日试炼关闭常规互动货币，避免无限重玩刷取资源；战斗、救援和成绩仍会正常记录。</div>'
    : '<div class="section-title"><h2>同局互动奖励</h2><span>点击越多，路线资源越厚</span></div><div class="interaction-list">' + renderInteractionCards() + '</div>';
  return `<section class="run scene">
    <div class="run-heading"><div><span class="eyebrow">RUN ${runId}</span><h1>${node?.type === 'event' ? '潮汐事件' : '漂流带遭遇'}</h1><p>自动战斗会推进列车，点击技能可以改变本局构筑节奏。</p></div><span class="risk">危险度 ${Math.round((node?.risk ?? 0.2) * 100)}%</span></div>
    ${dailyBanner}
    ${renderCombatScene({
      captainId: getActiveCaptainId(),
      skinId: getActiveSkinId(),
      boss: false,
      enemyHp: battleState.enemyHp,
      enemyMaxHp: battleState.enemyMaxHp,
      playerHp: battleState.playerHp,
      playerMaxHp: battleState.maxPlayerHp,
      skillCharges: recoveryState.skillCharges,
      ...actionValues,
    })}
    ${skillRefreshAvailable ? `<div class="rewarded-actions"><button class="chip" data-action="skill-refresh" ${pendingRecoveryActions.has('skill-refresh') ? 'disabled' : ''}>看广告刷新技能</button><small>广告取消或失败不会消耗机会。</small></div>` : ''}
    ${renderBattleStatus()}
    ${interactionContent}
  </section>`;
}

function renderReward(): string {
  const options = createRewardOptions(seed, currentNodeId, rewardRerollOffset);
  const dailyDefinition = getActiveDailyTrialDefinition();
  const rerollPending = pendingRecoveryActions.has('reroll');
  if (!dailyDefinition && !rewardRerollUsed) trackAdOfferOnce('reroll');
  const rerollAction = dailyDefinition
    ? ''
    : `<div class="rewarded-actions"><button class="secondary" data-action="reward-reroll" ${rewardRerollUsed || rerollPending ? 'disabled' : ''}>${rerollPending ? '广告加载中…' : rewardRerollUsed ? '本局已重选' : '看广告重选一次'}</button><small>取消或广告失败不会消耗本局重选机会。</small></div>`;
  return `${dailyDefinition ? renderDailyTrialRunBanner({ definition: dailyDefinition }) : ''}${renderRewardCards({
    options,
    dailyTrial: Boolean(dailyDefinition),
    rerollHtml: rerollAction,
    escapeHtml,
  })}`;
}

function renderRoute(): string {
  const nextNodes = route.filter((node) => node.id !== currentNodeId && (route.find((item) => item.id === currentNodeId)?.nextNodeIds.includes(node.id) ?? false));
  return renderRouteCards({
    nodes: nextNodes,
    mapName: formatMap(currentMapId),
    escapeHtml,
  });
}

function renderBoss(): string {
  const dailyDefinition = getActiveDailyTrialDefinition();
  const dailyBanner = dailyDefinition ? renderDailyTrialRunBanner({ definition: dailyDefinition }) : '';
  const skillRefreshAvailable = canRefreshSkill(recoveryState);
  const actionValues = getBattleActionValues();
  if (skillRefreshAvailable) trackAdOfferOnce('skill-refresh');
  const rewardCallout = dailyDefinition
    ? '<div class="first-clear-callout">试炼胜利只提交今日分数，不触发普通地图首通或重复通关奖励。</div>'
    : '<div class="first-clear-callout">首次通关：+400 齿轮 · +10 航线徽记 · +3 星票</div>';
  return `<section class="run scene boss-scene">
    <div class="run-heading"><div><span class="eyebrow">FINAL BOSS</span><h1>潮汐巨兽 · 深海回响</h1><p>${dailyDefinition ? '击败它，提交今日固定种子试炼成绩。' : '击败它，首次通关奖励将以地图为单位结算一次。'}</p></div><span class="risk danger">高风险</span></div>
    ${dailyBanner}
    ${renderCombatScene({
      captainId: getActiveCaptainId(),
      skinId: getActiveSkinId(),
      boss: true,
      enemyHp: battleState.enemyHp,
      enemyMaxHp: battleState.enemyMaxHp,
      playerHp: battleState.playerHp,
      playerMaxHp: battleState.maxPlayerHp,
      skillCharges: recoveryState.skillCharges,
      ...actionValues,
    })}
    ${skillRefreshAvailable ? `<div class="rewarded-actions"><button class="chip" data-action="skill-refresh" ${pendingRecoveryActions.has('skill-refresh') ? 'disabled' : ''}>看广告刷新技能</button></div>` : ''}
    ${renderBattleStatus()}
    ${rewardCallout}
  </section>`;
}

function renderFailure(): string {
  const isBoss = failureEncounter === 'boss';
  const adAvailable = canRevive(recoveryState);
  const adPending = pendingRecoveryActions.has('ad');
  if (adAvailable) trackAdOfferOnce('revive');
  const encounterLabel = isBoss ? '潮汐巨兽战' : '普通战斗';
  return `<section class="failure-panel scene"><span class="eyebrow">RUN FAILED / ${encounterLabel}</span><div class="settlement-symbol failure-symbol">!</div><h1>列车失守</h1><p>本局构筑、互动奖励和路线进度仍然保留。可选择一次广告救场，或直接结算回站。</p><div class="failure-stats"><span>列车生命 <b>0 / 100</b></span><span>广告复活 <b>${adAvailable ? '可用' : '已用'}</b></span></div><div class="recovery-actions"><button class="primary recovery-button" data-action="ad-revive" ${!adAvailable || adPending ? 'disabled' : ''}>${adPending ? '广告加载中…' : adAvailable ? `看广告复活 · +${isBoss ? 50 : 60} 生命` : '广告复活已使用'}</button><button class="text-button give-up-button" data-action="give-up">放弃本局，结算并回车站</button></div><div class="note">广告每局限一次；取消或平台失败不会消耗次数，也不会阻断结算。Boss 复活后保留当前 Boss 生命。</div></section>`;
}

function renderSettlement(): string {
  if (runMode === 'daily-trial' && lastDailySubmission) {
    return renderDailyTrialSettlement({
      score: lastDailySubmission.score,
      bestScore: dailyTrialState.bestScore,
      attempts: dailyTrialState.attempts,
      improved: lastDailySubmission.improved,
      assisted: lastDailySubmission.assisted,
      sharePending: dailyTrialSharePending,
    });
  }
  const repeatSettlement = !lastSettlementWasFirstClear;
  const firstClearGears = scaleGearReward(400);
  const repeatGears = scaleGearReward(80);
  const settlementDoublePending = pendingRecoveryActions.has('double-settlement');
  if (settlementDoubleAvailable && !settlementDoubleClaimed) trackAdOfferOnce('double-settlement');
  const doubleAction = settlementDoubleClaimed
    ? '<div class="rewarded-actions"><button class="secondary" disabled>普通奖励已加倍</button></div>'
    : settlementDoubleAvailable
      ? `<div class="rewarded-actions"><button class="secondary" data-action="double-settlement" ${settlementDoublePending ? 'disabled' : ''}>${settlementDoublePending ? '广告加载中…' : `看广告再领 ${repeatGears} 齿轮 · 2 航线徽记`}</button><small>仅重复通关可用；取消或失败不会消耗机会。</small></div>`
      : '';
  const expeditionResult = socialState.legionId
    ? `<div class="expedition-settlement"><span>潮汐灯塔团</span><b>本局远征贡献 +${lastExpeditionContribution}</b><small>本周累计 ${socialState.contribution} / 100</small></div>`
    : '<div class="expedition-settlement muted"><span>军团远征</span><b>尚未加入军团</b><small>回到车站加入后，下一局开始累计贡献。</small></div>';
  return renderSettlementCard({
    firstClear: !repeatSettlement,
    mapName: formatMap(currentMapId),
    rewards: {
      gears: repeatSettlement ? repeatGears : firstClearGears,
      routeMarks: repeatSettlement ? 2 : 10,
      starTickets: repeatSettlement ? 0 : 3,
    },
    doubleActionHtml: doubleAction,
    expeditionHtml: expeditionResult,
    escapeHtml,
  });
}

function render(): void {
  if (!save.selectedCaptainId) {
    app.innerHTML = `<div class="app-shell">${renderHeader()}<main>${renderCaptainSelection()}</main></div>`;
    if (!captainSelectionTracked) {
      track('captain_selection_viewed', {});
      captainSelectionTracked = true;
    }
    return;
  }

  const stationScene = hubView === 'station'
    ? renderStation()
    : hubView === 'wardrobe'
      ? renderWardrobeScreen()
      : renderEquipmentScreen();
  const scene = phase === 'station' ? stationScene : phase === 'combat' ? renderCombat() : phase === 'reward' ? renderReward() : phase === 'route' ? renderRoute() : phase === 'boss' ? renderBoss() : phase === 'failure' ? renderFailure() : renderSettlement();
  const hubNavigation = phase === 'station' ? renderHubNavigation() : '';
  app.innerHTML = `<div class="app-shell">${renderHeader()}<main>${scene}<div class="notice">${escapeHtml(notice)}</div></main>${hubNavigation}<footer><span>Prototype Web Preview</span><button class="text-button" data-action="reset-save">清空本地存档</button></footer></div>`;
}

function persistInteractionState(): void {
  commit({ ...save, claimedInteractionIds: [...interactionState.claimedClaimIds] });
}

function startRun(mode: 'normal' | 'daily-trial' = 'normal'): void {
  if (mode === 'daily-trial' && save.stationLevel < 2) {
    notice = '每日潮汐试炼将在车站达到 Lv.2 后开放。';
    render();
    return;
  }
  if (runId) {
    track('run_restart', { afterAdRevive: lastRunRecovery === 'ad' });
  }
  runMode = mode;
  const dailyDefinition = mode === 'daily-trial' ? syncDailyTrialDay() : null;
  seed = dailyDefinition?.seed ?? Math.floor(Math.random() * 1000000) + 1;
  runId = mode === 'daily-trial' ? `daily-${dailyDefinition?.dayId}-${Date.now()}` : `run-${Date.now()}`;
  route = createRoute(seed);
  currentNodeId = 'node-0';
  resetBattleState(100);
  failureEncounter = 'combat';
  recoveryState = createRecoveryState();
  pendingRecoveryActions.clear();
  trackedAdOffers.clear();
  lastRunRecovery = 'none';
  combatClears = 0;
  lastExpeditionContribution = 0;
  lastDailySubmission = null;
  dailyTrialSharePending = false;
  rewardRerollUsed = false;
  rewardRerollOffset = 0;
  settlementDoubleAvailable = false;
  settlementDoubleClaimed = false;
  interactionAttempts = {};
  interactionState = { claimedClaimIds: [...save.claimedInteractionIds] };
  phase = 'combat';
  notice = dailyDefinition
    ? `${dailyDefinition.dayId} 每日试炼出发：${dailyDefinition.rule.name}，固定种子 ${seed}。`
    : `第 ${save.stationLevel} 级车站出发，潮汐种子 ${seed} 已锁定。`;
  track('run_start', { seed, mapId: currentMapId });
  if (dailyDefinition) {
    track('daily_trial_started', {
      dayId: dailyDefinition.dayId,
      seed: dailyDefinition.seed,
      ruleId: dailyDefinition.rule.id,
    });
  }
  render();
}

function recordExpeditionContribution(outcome: ExpeditionOutcome): void {
  const result = contributeToExpedition(socialState, {
    runId,
    outcome,
    completedNodes: combatClears + (outcome === 'victory' ? 1 : 0),
  });
  lastExpeditionContribution = result.pointsGranted;
  if (!result.accepted) return;
  commitSocial(result.state);
  track('expedition_contributed', {
    outcome,
    points: result.pointsGranted,
    total: socialState.contribution,
  });
}

function settleDailyTrial(victory: boolean): void {
  settlementDoubleAvailable = false;
  settlementDoubleClaimed = false;
  const assisted = recoveryState.adReviveUsed;
  const result = submitDailyTrial(dailyTrialState, {
    runId,
    outcome: victory ? 'victory' : 'defeat',
    completedNodes: combatClears + (victory ? 1 : 0),
    remainingHp: victory ? battleState.playerHp : 0,
    assisted,
  });
  if (result.accepted) commitDailyTrial(result.state);
  track('daily_trial_submitted', {
    outcome: victory ? 'victory' : 'defeat',
    score: result.score,
    bestScore: result.state.bestScore,
    assisted,
    accepted: result.accepted,
  });
  lastDailySubmission = result;
  lastSettlementWasFirstClear = false;
  lastExpeditionContribution = 0;
  notice = result.accepted
    ? `今日试炼成绩已提交：${result.score} 分${result.improved ? '，刷新个人最佳。' : '。'}`
    : '这局试炼成绩已经提交过，未重复计分。';
  phase = 'settlement';
  track('run_settled', { victory, dailyTrial: true, score: result.score });
  render();
}

function settleRun(victory: boolean): void {
  if (runMode === 'daily-trial') {
    settleDailyTrial(victory);
    return;
  }
  recordExpeditionContribution(victory ? 'victory' : 'defeat');
  if (!victory) {
    lastSettlementWasFirstClear = false;
    settlementDoubleAvailable = false;
    settlementDoubleClaimed = false;
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
  settlementDoubleAvailable = !result.granted;
  settlementDoubleClaimed = false;
  const gearsGranted = scaleGearReward(
    result.granted ? result.reward.gears : 80,
  );
  commit({
    ...save,
    gears: save.gears + gearsGranted,
    routeMarks: save.routeMarks + (result.granted ? result.reward.routeMarks : 2),
    starTickets: save.starTickets + result.reward.starTickets,
    firstClearMapIds: [...firstClearState.claimedMapIds],
  });
  track('economy_reward_granted', {
    source: result.granted ? 'first-clear' : 'repeat-victory',
    gears: gearsGranted,
    routeMarks: result.granted ? result.reward.routeMarks : 2,
    starTickets: result.reward.starTickets,
  });
  notice = result.granted ? '首通奖励只在这张地图发放一次，欢迎回来刷构筑。' : '已是通关线路，重复挑战转为普通结算。';
  phase = 'settlement';
  track('run_settled', { victory: true, firstClear: result.granted });
  render();
}

function handleInteraction(actionId: string): void {
  if (runMode === 'daily-trial') {
    notice = '每日试炼不结算常规互动货币，避免无限重玩刷取资源。';
    render();
    return;
  }
  const definitions = {
    'salvage-a': { actionId: 'salvage-a', currency: 'gears' as const, amount: 8, maxClaims: 2 },
    'aid-b': { actionId: 'aid-b', currency: 'routeMarks' as const, amount: 1, maxClaims: 1 },
    'signal-c': { actionId: 'signal-c', currency: 'gears' as const, amount: 12, maxClaims: 1 },
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
    track('economy_reward_granted', {
      source: 'interaction',
      actionId,
      currency: result.currency,
      amount: result.amount,
    });
  } else {
    notice = result.alreadyClaimed ? '这次点击已经结算过，奖励不会重复发放。' : '这个互动点本局次数已用完。';
  }
  render();
}

function chooseReward(optionId: string): void {
  const [kind, contentId] = optionId.split(':');
  if (runMode !== 'daily-trial') {
    if (kind === 'passenger') commit(unlockPassenger(save, contentId));
    if (kind === 'module') commit(unlockModule(save, contentId));
    if (kind === 'gear') commit({ ...save, gears: save.gears + Number(contentId) });
  }
  notice = runMode === 'daily-trial'
    ? `已选择 ${contentId} 作为试炼构筑，本局不写入永久资源。`
    : `已选择 ${contentId}，构筑记录已写入本局。`;
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
    recoveryState = startCombatNode(recoveryState);
    failureEncounter = 'boss';
    resetBattleState(120);
    track('boss_enter', { nodeId });
    notice = '潮汐巨兽出现了，先观察它的护甲节奏。';
  } else {
    combatClears += 1;
    failureEncounter = 'combat';
    resetBattleState(100);
    recoveryState = startCombatNode(recoveryState);
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

function handleIncomingDamage(amount: number): void {
  if (phase !== 'combat' && phase !== 'boss') return;
  if (recoveryState.reviveProtectionUntilMs > Date.now()) {
    notice = '潮位迟滞生效，列车暂时避开了这次冲击。';
    render();
    return;
  }
  battleState = receiveDamage(battleState, amount);
  track('first_action', { actionId: 'debug-hit', amount });
  if (battleState.playerHp === 0) {
    failureEncounter = phase;
    phase = 'failure';
    notice = failureEncounter === 'boss' ? '潮汐巨兽击穿了列车，仍可选择一次广告救场。' : '潮兽击穿了列车，可以广告复活或直接结算。';
  }
  render();
}

function recoveryResultName(result: 'completed' | 'closed' | 'failed'): 'completed' | 'cancelled' | 'failed' {
  return result === 'completed' ? 'completed' : result === 'closed' ? 'cancelled' : 'failed';
}

async function handleAdRevive(): Promise<void> {
  if (phase !== 'failure' || pendingRecoveryActions.has('ad')) return;
  const available = canRevive(recoveryState);
  track('revive_clicked', { type: 'ad', available, usedBefore: recoveryState.adReviveUsed });
  if (!available) {
    notice = '本局广告复活已经使用过。';
    render();
    return;
  }
  pendingRecoveryActions.add('ad');
  track('rewarded_ad_clicked', { placement: 'revive' });
  render();
  const encounter = failureEncounter;
  const result = await ads.showRewardedAd('revive');
  pendingRecoveryActions.delete('ad');
  const resultName = recoveryResultName(result);
  track('rewarded_ad_result', { placement: 'revive', result: resultName });
  if (resultName !== 'completed') {
    notice = resultName === 'cancelled' ? '你取消了广告，复活次数没有消耗。' : '广告播放失败，复活次数没有消耗。';
    track('revive_result', { type: 'ad', result: resultName, hpRestored: 0 });
    render();
    return;
  }
  const revived = applyRevive({ state: recoveryState, encounter, playerHp: battleState.playerHp, maxPlayerHp: battleState.maxPlayerHp, nowMs: Date.now() });
  if (revived.result === 'completed') {
    recoveryState = revived.state;
    battleState = { ...battleState, playerHp: revived.playerHp };
    lastRunRecovery = 'ad';
    phase = encounter;
    notice = `广告完成，列车恢复 ${revived.hpRestored} 点生命，继续当前战斗。`;
  } else {
    notice = '这次复活请求已经结算过，生命不会重复恢复。';
  }
  track('revive_result', { type: 'ad', result: revived.result, hpRestored: revived.hpRestored });
  render();
}

async function handleSkillRefresh(): Promise<void> {
  if ((phase !== 'combat' && phase !== 'boss') || pendingRecoveryActions.has('skill-refresh')) return;
  const available = canRefreshSkill(recoveryState);
  track('skill_refresh_clicked', { available, usedBefore: recoveryState.skillRefreshUsed });
  if (!available) {
    notice = recoveryState.skillRefreshUsed ? '本局技能刷新已经使用过。' : '当前技能仍有充能，不需要刷新。';
    render();
    return;
  }
  pendingRecoveryActions.add('skill-refresh');
  track('rewarded_ad_clicked', { placement: 'skill-refresh' });
  render();
  const result = await ads.showRewardedAd('skill-refresh');
  pendingRecoveryActions.delete('skill-refresh');
  const resultName = recoveryResultName(result);
  track('rewarded_ad_result', { placement: 'skill-refresh', result: resultName });
  if (result !== 'completed') {
    notice = result === 'closed' ? '你取消了广告，技能刷新次数没有消耗。' : '广告播放失败，技能刷新次数没有消耗。';
    track('skill_refresh_result', { result: result === 'closed' ? 'cancelled' : 'failed', chargesGranted: 0 });
    render();
    return;
  }
  const refreshed = applySkillRefresh(recoveryState);
  if (refreshed.result === 'completed') {
    recoveryState = refreshed.state;
    notice = '广告完成，汽笛共鸣恢复 1 次充能。';
  } else {
    notice = '技能刷新请求已经结算过。';
  }
  track('skill_refresh_result', { result: refreshed.result, chargesGranted: refreshed.chargesGranted });
  render();
}

async function handleRewardReroll(): Promise<void> {
  if (
    phase !== 'reward'
    || runMode === 'daily-trial'
    || rewardRerollUsed
    || pendingRecoveryActions.has('reroll')
  ) return;

  pendingRecoveryActions.add('reroll');
  track('rewarded_ad_clicked', { placement: 'reroll' });
  render();
  const result = await ads.showRewardedAd('reroll');
  pendingRecoveryActions.delete('reroll');
  const resultName = recoveryResultName(result);
  track('rewarded_ad_result', { placement: 'reroll', result: resultName });

  if (result === 'completed') {
    rewardRerollUsed = true;
    rewardRerollOffset = 1;
    notice = '广告完成，三张构筑奖励已按本局种子重新生成。';
  } else {
    notice = result === 'closed'
      ? '你取消了广告，本局奖励重选机会仍然保留。'
      : '广告播放失败，本局奖励重选机会仍然保留。';
  }
  render();
}

async function handleSettlementDouble(): Promise<void> {
  if (
    phase !== 'settlement'
    || runMode === 'daily-trial'
    || !settlementDoubleAvailable
    || settlementDoubleClaimed
    || pendingRecoveryActions.has('double-settlement')
  ) return;

  pendingRecoveryActions.add('double-settlement');
  track('rewarded_ad_clicked', { placement: 'double-settlement' });
  render();
  const result = await ads.showRewardedAd('double-settlement');
  pendingRecoveryActions.delete('double-settlement');
  const resultName = recoveryResultName(result);
  track('rewarded_ad_result', { placement: 'double-settlement', result: resultName });

  if (result === 'completed') {
    const gearsGranted = scaleGearReward(80);
    commit({
      ...save,
      gears: save.gears + gearsGranted,
      routeMarks: save.routeMarks + 2,
    });
    settlementDoubleAvailable = false;
    settlementDoubleClaimed = true;
    track('economy_reward_granted', {
      source: 'rewarded-ad',
      placement: 'double-settlement',
      gears: gearsGranted,
      routeMarks: 2,
      starTickets: 0,
    });
    notice = `广告完成，重复通关奖励已追加 ${gearsGranted} 齿轮和 2 航线徽记。`;
  } else {
    notice = result === 'closed'
      ? '你取消了广告，重复通关加倍机会仍然保留。'
      : '广告播放失败，重复通关加倍机会仍然保留。';
  }
  render();
}

async function handlePurchase(productId: string): Promise<void> {
  if (pendingProductId) return;
  const product = getProductDefinition(productId);
  track('product_clicked', { productId });
  if (!product) {
    track('purchase_result', { productId, result: 'unknown-product', transactionRef: 'none' });
    notice = '商品配置不存在，没有发起支付。';
    render();
    return;
  }
  if (save.purchasedProductIds.includes(productId)) {
    track('purchase_result', { productId, result: 'already-owned', transactionRef: 'none' });
    notice = `${product.name} 已经拥有，不会重复发起购买。`;
    render();
    return;
  }

  pendingProductId = productId;
  track('purchase_started', { productId, displayPrice: product.displayPrice });
  render();
  const platformResult = await store.purchase(productId);
  pendingProductId = null;
  const settlement = settlePurchase(save, { productId, result: platformResult });
  const transactionRef = platformResult.status === 'verified'
    ? `mock:${platformResult.transactionId.split('-').at(-1) ?? 'verified'}`
    : 'none';
  track('purchase_result', {
    productId,
    result: settlement.accepted ? 'verified' : settlement.reason ?? platformResult.status,
    transactionRef,
  });

  if (!settlement.accepted) {
    const messages = {
      cancelled: '已取消模拟购买，没有扣款或发货。',
      failed: '模拟支付暂时失败，没有发货，可以稍后重试。',
      'unknown-product': '商品配置不存在，没有发货。',
      'duplicate-transaction': '这笔模拟交易已经结算过，没有重复发货。',
      'already-owned': '这件一次性商品已经拥有，没有重复发货。',
    } as const;
    notice = messages[settlement.reason ?? 'failed'];
    render();
    return;
  }

  commit(settlement.save);
  track('economy_reward_granted', {
    source: 'purchase',
    productId,
    gears: settlement.reward.gears,
    routeMarks: settlement.reward.routeMarks,
    starTickets: settlement.reward.starTickets,
    cosmetics: settlement.reward.cosmeticIds.length,
    skins: settlement.reward.skinIds.length,
    equipment: settlement.reward.equipmentDefinitionIds.length,
  });
  notice = `模拟验单完成：${product.name}，固定获得 ${formatCommerceReward(settlement.reward)}。`;
  render();
}

function campaignFailureMessage(reason: CampaignFailureReason | undefined): string {
  const messages: Record<CampaignFailureReason, string> = {
    'already-qualified': '内测资格已经锁定，不需要重复申请。',
    'beta-required': '请先申请并锁定内测资格。',
    'already-claimed': '这份活动奖励已经领取过。',
    'empty-code': '请输入礼包码。',
    'unknown-code': '礼包码无效，请检查活动说明。',
    'not-started': '这个礼包码的活动还没有开始。',
    expired: '这个礼包码已经过期。',
    'already-redeemed': '这个礼包码已经兑换过。',
  };
  return reason ? messages[reason] : '活动请求未完成，请稍后再试。';
}

function handleBetaApplication(): void {
  const result = applyForBeta(campaignState);
  track('beta_application_result', {
    result: result.accepted ? 'qualified' : result.reason ?? 'failed',
  });
  if (!result.accepted) {
    notice = campaignFailureMessage(result.reason);
    render();
    return;
  }
  commitCampaign(result.state);
  notice = '内测资格已锁定：你可以领取潮汐先行者补给。';
  render();
}

function handleBetaGiftClaim(): void {
  const result = claimBetaGift(campaignState);
  if (!result.accepted) {
    notice = campaignFailureMessage(result.reason);
    render();
    return;
  }
  commitCampaign(result.state);
  applyCampaignReward(result.reward);
  track('campaign_reward_claimed', {
    campaignReward: 'beta',
    gears: result.reward.gears,
    routeMarks: result.reward.routeMarks,
    starTickets: result.reward.starTickets,
  });
  notice = `先行者补给已领取：${formatExpeditionReward(result.reward)}。`;
  render();
}

function handleLaunchGiftClaim(): void {
  const result = claimLaunchGift(campaignState);
  if (!result.accepted) {
    notice = campaignFailureMessage(result.reason);
    render();
    return;
  }
  commitCampaign(result.state);
  applyCampaignReward(result.reward);
  track('campaign_reward_claimed', {
    campaignReward: 'launch',
    gears: result.reward.gears,
    routeMarks: result.reward.routeMarks,
    starTickets: result.reward.starTickets,
  });
  notice = `开服列车长礼已领取：${formatExpeditionReward(result.reward)}。`;
  render();
}

function handleGiftCodeRedeem(rawCode: string): void {
  const result = redeemGiftCode(campaignState, rawCode, Date.now());
  track('gift_code_redeem_result', {
    result: result.accepted ? 'completed' : result.reason ?? 'failed',
    codeId: result.codeId ?? 'unknown',
  });
  if (!result.accepted) {
    notice = campaignFailureMessage(result.reason);
    render();
    return;
  }
  commitCampaign(result.state);
  applyCampaignReward(result.reward);
  const definition = GIFT_CODE_CATALOG.find((item) => item.id === result.codeId);
  notice = `${definition?.label ?? '活动'}礼包兑换成功：${formatExpeditionReward(result.reward)}。`;
  render();
}

function handleDailyCheckInClaim(): void {
  const result = claimDailyCheckIn(dailyCheckInState, getChinaDayId(Date.now()));
  if (!result.accepted) {
    notice = result.reason === 'already-claimed'
      ? '今日值班奖励已经领取，明天再来。'
      : '设备日期早于上次签到日期，请校准时间后重试。';
    render();
    return;
  }

  commitDailyCheckIn(result.state);
  commit({
    ...save,
    gears: save.gears + result.reward.gears,
    routeMarks: save.routeMarks + result.reward.routeMarks,
    starTickets: save.starTickets + result.reward.starTickets,
  });
  track('daily_check_in_claimed', {
    cycleNumber: result.state.cycleNumber,
    rewardDay: result.rewardDay,
    totalClaims: result.state.totalClaims,
    gears: result.reward.gears,
    routeMarks: result.reward.routeMarks,
    starTickets: result.reward.starTickets,
    completedCycle: result.completedCycle,
  });
  notice = `第 ${result.rewardDay} 格值班奖励已领取：${formatExpeditionReward(result.reward)}。${result.completedCycle ? ' 本轮七日值班簿已完成。' : ''}`;
  render();
}

function handleClaimDailyTrial(milestoneId: DailyTrialMilestoneId): void {
  const result = claimDailyTrialMilestone(dailyTrialState, milestoneId);
  if (!result.accepted) {
    const messages = {
      'threshold-not-reached': '今日最佳分还没有达到这个试炼里程碑。',
      'already-claimed': '这个试炼里程碑今天已经领取。',
      'unknown-milestone': '试炼里程碑配置无效。',
    } as const;
    notice = messages[result.reason ?? 'unknown-milestone'];
    render();
    return;
  }
  commitDailyTrial(result.state);
  commit({
    ...save,
    gears: save.gears + result.reward.gears,
    routeMarks: save.routeMarks + result.reward.routeMarks,
    starTickets: save.starTickets + result.reward.starTickets,
  });
  track('daily_trial_reward_claimed', {
    milestoneId,
    gears: result.reward.gears,
    routeMarks: result.reward.routeMarks,
    starTickets: result.reward.starTickets,
  });
  notice = `今日试炼里程碑已领取：${formatExpeditionReward(result.reward)}。`;
  render();
}

async function handleShareDailyTrial(): Promise<void> {
  if (runMode !== 'daily-trial' || !lastDailySubmission || dailyTrialSharePending) return;
  const definition = getDailyTrialDefinition(dailyTrialState.dayId);
  dailyTrialSharePending = true;
  render();
  const result = await share.share({
    shareType: 'daily-trial',
    mapId: currentMapId,
    depth: dailyTrialState.bestScore,
    passengers: [definition.rule.id],
    modules: [`seed-${definition.seed}`],
    failureReason: `${definition.dayId} · ${definition.rule.name} · 最佳 ${dailyTrialState.bestScore} 分`,
    cta: '挑战同一潮汐种子',
  });
  dailyTrialSharePending = false;
  track('daily_trial_shared', {
    result,
    seed: definition.seed,
    bestScore: dailyTrialState.bestScore,
  });
  notice = result === 'completed'
    ? '今日试炼成绩卡已生成；分享不会直接发放货币。'
    : result === 'cancelled'
      ? '已取消成绩分享，分数和奖励状态不变。'
      : '成绩分享接口暂时不可用，请稍后再试。';
  render();
}

function handleJoinLegion(): void {
  if (socialState.legionId) {
    notice = '你已经加入潮汐灯塔团。';
    render();
    return;
  }
  commitSocial(joinLegion(socialState, 'tide-beacon'));
  notice = '已加入潮汐灯塔团。现在选择最多两名异步队友。';
  track('legion_joined', { legionId: 'tide-beacon', cycleId: socialState.cycleId });
  render();
}

function handleToggleSupport(supportId: SupportId): void {
  const result = toggleSquadMember(socialState, supportId);
  if (!result.accepted) {
    notice = result.reason === 'squad-full'
      ? '列车队只有两个支援位，请先让一名队友下车。'
      : '请先加入军团，再选择支援队友。';
    render();
    return;
  }
  commitSocial(result.state);
  const support = SUPPORT_ROSTER.find((item) => item.id === supportId);
  const selected = socialState.squadMemberIds.includes(supportId);
  notice = selected
    ? `${support?.displayName ?? supportId} 已加入列车队，下个战斗节点生效。`
    : `${support?.displayName ?? supportId} 已离开列车队。`;
  track('squad_changed', {
    supportId,
    selected,
    squadSize: socialState.squadMemberIds.length,
  });
  render();
}

function handleClaimExpedition(milestoneId: ExpeditionMilestoneId): void {
  const result = claimExpeditionMilestone(socialState, milestoneId);
  if (!result.accepted) {
    const messages = {
      'legion-required': '请先加入军团。',
      'threshold-not-reached': '本周远征贡献还没有达到这个里程碑。',
      'already-claimed': '这个里程碑本周期已经领取。',
      'unknown-milestone': '远征里程碑配置无效。',
    } as const;
    notice = messages[result.reason ?? 'unknown-milestone'];
    render();
    return;
  }
  commitSocial(result.state);
  commit({
    ...save,
    gears: save.gears + result.reward.gears,
    routeMarks: save.routeMarks + result.reward.routeMarks,
    starTickets: save.starTickets + result.reward.starTickets,
  });
  notice = `军团里程碑已领取：${formatExpeditionReward(result.reward)}。`;
  track('expedition_reward_claimed', {
    milestoneId,
    gears: result.reward.gears,
    routeMarks: result.reward.routeMarks,
    starTickets: result.reward.starTickets,
  });
  render();
}

async function handleShareSquad(): Promise<void> {
  if (!socialState.legionId || squadSharePending) return;
  squadSharePending = true;
  render();
  const result = await share.share({
    shareType: 'squad-invite',
    mapId: currentMapId,
    depth: 0,
    passengers: [...socialState.squadMemberIds],
    modules: [],
    failureReason: '潮汐灯塔团正在集结异步列车队',
    cta: '加入列车队',
  });
  squadSharePending = false;
  notice = result === 'completed'
    ? '列车队招募卡已生成；分享本身不直接发放货币。'
    : result === 'cancelled'
      ? '已取消分享，不影响军团和队伍状态。'
      : '分享接口暂时不可用，请稍后再试。';
  track('squad_invite_shared', {
    result,
    squadSize: socialState.squadMemberIds.length,
  });
  render();
}

app.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'select-captain' && button.dataset.captainId) {
    const profile = selectCaptain(save, button.dataset.captainId as CaptainId);
    commit({ ...save, ...profile });
    track('captain_selected', { captainId: button.dataset.captainId });
    captainSelectionTracked = false;
    hubView = 'station';
    notice = '列车长已就位，潮汐列车准备出发。';
    render();
    return;
  }
  if (action === 'open-hub' && button.dataset.hubView) {
    hubView = button.dataset.hubView as HubView;
    render();
    return;
  }
  if (action === 'open-hub-anchor' && button.dataset.anchorId) {
    hubView = 'station';
    render();
    document.getElementById(button.dataset.anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (action === 'switch-captain' && button.dataset.captainId) {
    handleCaptainSwitch(button.dataset.captainId as CaptainId);
    return;
  }
  if (action === 'equip-skin' && button.dataset.skinId) {
    handleSkinEquip(button.dataset.skinId as SkinId);
    return;
  }
  if (action === 'equip-equipment' && button.dataset.instanceId) {
    handleEquipmentEquip(button.dataset.instanceId);
    return;
  }
  if (action === 'upgrade-equipment' && button.dataset.instanceId) {
    handleEquipmentUpgrade(button.dataset.instanceId);
    return;
  }
  if (action === 'star-equipment' && button.dataset.instanceId) {
    handleEquipmentStar(button.dataset.instanceId);
    return;
  }
  if (action === 'reroll-equipment' && button.dataset.instanceId) {
    handleEquipmentReroll(button.dataset.instanceId);
    return;
  }
  if (action === 'purchase-product' && button.dataset.skinId) {
    track('skin_clicked', { skinId: button.dataset.skinId, source: 'wardrobe' });
    track('skin_purchase_started', { skinId: button.dataset.skinId });
  }
  if (action === 'start-run') startRun('normal');
  if (action === 'start-daily-trial') startRun('daily-trial');
  if (action === 'back-station') { phase = 'station'; render(); }
  if (action === 'interaction' && button.dataset.interactionId) handleInteraction(button.dataset.interactionId);
  if (action === 'combat-action' && button.dataset.combatAction) handleCombatAction(button.dataset.combatAction as CombatAction);
  if (action === 'lane') { notice = `已切换至${button.dataset.lane === '0' ? '左' : button.dataset.lane === '2' ? '右' : '中'}航道。`; render(); }
  if (action === 'reward' && button.dataset.optionId) chooseReward(button.dataset.optionId);
  if (action === 'reward-reroll') await handleRewardReroll();
  if (action === 'route' && button.dataset.nodeId) chooseRoute(button.dataset.nodeId);
  if (action === 'damage') handleIncomingDamage(35);
  if (action === 'skill-refresh') await handleSkillRefresh();
  if (action === 'ad-revive') await handleAdRevive();
  if (action === 'double-settlement') await handleSettlementDouble();
  if (action === 'give-up') settleRun(false);
  if (action === 'select-map' && button.dataset.mapId) { currentMapId = button.dataset.mapId as MapId; appStateRepository.saveSelectedMap(currentMapId); notice = `已切换路线：${formatMap(currentMapId)}。`; render(); }
  if (action === 'unlock-map' && button.dataset.mapId) { commit(unlockMap(save, button.dataset.mapId as MapId)); currentMapId = button.dataset.mapId as MapId; appStateRepository.saveSelectedMap(currentMapId); notice = `新地图 ${formatMap(currentMapId)} 已开放。`; render(); }
  if (action === 'upgrade-station') upgradeStationAtStation();
  if (action === 'apply-beta') handleBetaApplication();
  if (action === 'claim-beta-gift') handleBetaGiftClaim();
  if (action === 'claim-launch-gift') handleLaunchGiftClaim();
  if (action === 'claim-daily-check-in') handleDailyCheckInClaim();
  if (action === 'claim-daily-trial' && button.dataset.milestoneId) handleClaimDailyTrial(button.dataset.milestoneId as DailyTrialMilestoneId);
  if (action === 'share-daily-trial') await handleShareDailyTrial();
  if (action === 'join-legion') handleJoinLegion();
  if (action === 'toggle-support' && button.dataset.supportId) handleToggleSupport(button.dataset.supportId as SupportId);
  if (action === 'claim-expedition' && button.dataset.milestoneId) handleClaimExpedition(button.dataset.milestoneId as ExpeditionMilestoneId);
  if (action === 'share-squad') await handleShareSquad();
  if (action === 'purchase-product' && button.dataset.productId) {
    await handlePurchase(button.dataset.productId);
    if (button.dataset.skinId) {
      track('skin_purchase_result', {
        skinId: button.dataset.skinId,
        owned: save.ownedSkinIds.includes(button.dataset.skinId),
      });
    }
  }
  if (action === 'reset-save') { appStateRepository.clear(); window.location.reload(); }
});

app.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement;
  if (form.id !== 'gift-code-form') return;
  event.preventDefault();
  const rawCode = new FormData(form).get('giftCode');
  handleGiftCodeRedeem(typeof rawCode === 'string' ? rawCode : '');
});

render();
