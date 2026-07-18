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
  canRevive,
  createRecoveryState,
} from '../src/domain/recovery/RecoverySystem';
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
  joinLegion,
  normalizeSocialExpeditionState,
  SUPPORT_ROSTER,
  toggleSquadMember,
  type ExpeditionMilestoneId,
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
import { renderDailyTrialHub } from './views/DailyTrialView';
import { renderDailyCheckIn } from './views/DailyCheckInView';
import { renderCommerceStore } from './views/CommerceView';
import { renderCaptainSelection } from './views/CaptainSelectionView';
import { renderStationHero } from './views/StationHeroView';
import { renderWardrobe } from './views/WardrobeView';
import {
  PROTOTYPE_REROLL,
  renderEquipment,
} from './views/EquipmentView';
import { createBrowserAppStateRepository } from './app/AppStateRepository';
import {
  BattleSettlementAdapter,
} from './app/BattleSettlementAdapter';
import type {
  BattleSettlementPresentation,
  SceneId,
} from './app/AppTypes';
import type {
  GameSettings,
  QualityPreference,
} from './app/SettingsRepository';
import {
  BATTLE_ART_URLS,
  DEFERRED_BATTLE_ART_IDS,
  getCriticalBattleArtIds,
  type BattleArtId,
} from './assets/BattleArtCatalog';
import {
  BattleAssetLoader,
  type BattleAssetSet,
} from './battle/AssetLoader';
import { BATTLE_INTERACTIONS } from './battle/BattleInteractionSchedule';
import { BattleEngine } from './battle/BattleEngine';
import { BattleDiagnostics } from './battle/BattleDiagnostics';
import type {
  BattleE2EController,
  BattleE2ESnapshot,
} from './battle/BattleE2EHooks';
import { createBattleRunInput } from './battle/BattleRunInputFactory';
import { CanvasPainter } from './battle/CanvasPainter';
import { EffectSystem } from './battle/EffectSystem';
import { BattleHUD } from './battle/BattleHUD';
import { BattleRenderer } from './battle/BattleRenderer';
import type {
  BattleFrameView,
  BattleOutcome,
  BattleSkillId,
} from './battle/BattleTypes';
import type { AudioManager } from './audio/AudioManager';
import { renderLaunchCampaignView } from './views/LaunchCampaignView';
import { renderSocialHubView } from './views/SocialHubView';
import { mountAppShell } from './app/AppShell';
import { StationDepartureController } from './app/StationDepartureController';
import { SceneRouter } from './app/SceneRouter';
import { BattleScene } from './scenes/BattleScene';
import { createCaptainScene } from './scenes/CaptainScene';
import { createEquipmentScene } from './scenes/EquipmentScene';
import { createLegionScene } from './scenes/LegionScene';
import type { FeatureSceneContext, SceneFactory } from './scenes/Scene';
import { createStationScene, type StationScene } from './scenes/StationScene';
import { createStoreScene } from './scenes/StoreScene';
import { StationAmbientDirector } from './station/StationAmbientDirector';

export interface LegacyGameRuntime extends BattleE2EController {
  start(): Promise<void>;
  applySettings(
    settings: GameSettings,
    effectiveReducedMotion: boolean,
  ): void;
  handlePageHidden(): void;
  handlePageVisible(): void;
  captureUncaughtError(error: unknown): void;
  destroy(): void;
}

export interface RuntimeSettingsBridge {
  getSettings(): GameSettings;
  updateSettings(
    patch: Partial<Omit<GameSettings, 'version'>>,
  ): GameSettings;
}

export function createLegacyGameRuntime(
  app: HTMLElement,
  storage: Storage,
  reducedMotion: boolean,
  audio: AudioManager,
  settingsBridge: RuntimeSettingsBridge,
): LegacyGameRuntime {
const appStateRepository = createBrowserAppStateRepository(storage);
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
let phase: 'station' | 'combat' = 'station';
type HubView = Exclude<SceneId, 'battle'>;
let hubView: HubView = 'station';
let captainSelectionTracked = false;
let wardrobeViewTracked = false;
let equipmentViewTracked = false;
let runMode: 'normal' | 'daily-trial' = 'normal';
let currentMapId: MapId = initialState.selectedMapId;
let runId = '';
let seed = 0;
let recoveryState = createRecoveryState();
const pendingRecoveryActions = new Set<'ad' | RewardedPlacement>();
const trackedAdOffers = new Set<RewardedPlacement>();
let lastRunRecovery: 'ad' | 'none' = 'none';
let interactionState: InteractionState = createInteractionState();
let firstClearState: FirstClearState = { claimedMapIds: [...save.firstClearMapIds] };
let squadSharePending = false;
let lastDailySubmission: DailyTrialSubmissionResult | null = null;
let dailyTrialSharePending = false;
let pendingProductId: string | null = null;
let storeViewTracked = false;
let settlementDoubleClaimed = false;
const battleAssetLoader = new BattleAssetLoader(BATTLE_ART_URLS);
const diagnostics = new BattleDiagnostics();
const runtimeSearchParams = new URLSearchParams(window.location.search);
const e2eEnabled = runtimeSearchParams.get('e2e') === '1';
const requestedE2ESeed = Number(runtimeSearchParams.get('e2eSeed'));
const e2eSeed = Number.isSafeInteger(requestedE2ESeed)
  && requestedE2ESeed > 0
  ? requestedE2ESeed
  : 17;
const battleSettlementAdapter =
  new BattleSettlementAdapter<BattleSettlementPresentation | null>();
let battleAssets: BattleAssetSet<BattleArtId> | null = null;
let deferredAssetTimerId: ReturnType<typeof setTimeout> | null = null;
let activeBattleEngine: BattleEngine | null = null;
let activeBattleProgression: ProgressionSnapshot | null = null;
let activeBattleSettlement: BattleSettlementPresentation | null = null;
let activeBattleScene: BattleScene | null = null;
let activeStationScene: StationScene | null = null;
let activeStationDeparture: StationDepartureController | null = null;
let battleStartPending = false;
let effectiveReducedMotion = reducedMotion;
let qualityPreference = settingsBridge.getSettings().qualityPreference;
let pageHidden = false;
let notice = '欢迎登车，先选择一条可以活着回来的路线。';
const shell = mountAppShell(app, {
  gears: save.gears,
  routeMarks: save.routeMarks,
  starTickets: save.starTickets,
});
const featureContext: FeatureSceneContext = {
  renderStation: () => renderStationScene(),
  renderCaptain: () => renderCaptainScene(),
  renderEquipment: () => renderEquipmentScene(),
  renderLegion: () => renderLegionScene(),
  renderStore: () => renderStoreScene(),
  isPageHidden: () => pageHidden,
  isStationLowPerformance: () => qualityPreference === 'low',
  createStationAmbient: (host) => new StationAmbientDirector(host, {
    reducedMotion: effectiveReducedMotion,
    lowPerformance: qualityPreference === 'low',
    announce: (message) => {
      const dialogue = host.querySelector<HTMLElement>(
        '[data-ambient-role="dialogue"]',
      );
      if (dialogue) dialogue.textContent = message;
    },
  }),
  dispatch: () => undefined,
};
const sceneFactory: SceneFactory = (sceneId) => {
  if (sceneId === 'station') {
    const scene = createStationScene(featureContext);
    activeStationScene = scene;
    return scene;
  }
  activeStationScene = null;
  if (sceneId === 'captain') return createCaptainScene(featureContext);
  if (sceneId === 'equipment') return createEquipmentScene(featureContext);
  if (sceneId === 'legion') return createLegionScene(featureContext);
  if (sceneId === 'store') return createStoreScene(featureContext);
  if (!activeBattleEngine || !battleAssets) {
    throw new Error('Battle scene requested before battle preparation');
  }
  const scene = new BattleScene({
    engine: activeBattleEngine,
    effects: new EffectSystem({
      particleLimit: 200,
      damageNumberLimit: 18,
      reducedMotion: effectiveReducedMotion,
    }),
    assets: battleAssets,
    callbacks: {
      onOutcome: settleBattleOutcome,
      onRequestRevive: requestBattleRevive,
      onRequestUpgradeReroll: requestBattleUpgradeReroll,
      onRequestSkillRefresh: requestBattleSkillRefresh,
      onClaimInteraction: claimBattleInteraction,
      onRequestDoubleSettlement: requestBattleDoubleSettlement,
      onGiveUp: settleBattleOutcome,
      onExit: exitBattle,
      onQualityChanged: (change) => {
        track('battle_performance_changed', {
          from: change.from,
          to: change.to,
          averageFrameMs:
            Math.round(change.averageFrameMs * 10) / 10,
        });
      },
    },
    createRenderer: (context) => (
      new BattleRenderer(new CanvasPainter(context))
    ),
    createHud: (callbacks) => new BattleHUD(callbacks),
    captainArtId: getActiveCaptainArtId(),
    reducedMotion: effectiveReducedMotion,
    qualityPreference,
    diagnostics,
    manualStepMode: e2eEnabled,
    sound: audio,
  });
  activeBattleScene = scene;
  return scene;
};
const router = new SceneRouter(shell.sceneHost, sceneFactory, {
  transitionMs: 220,
  reducedMotion: effectiveReducedMotion,
  onSceneChanged: (sceneId) => {
    audio.playSound('scene-open');
    if (sceneId === 'battle') {
      stopStationAudioLoop();
      if (pageHidden) activeBattleScene?.pauseForVisibility();
      return;
    }
    setStationIdleMotion();
    audio.setMusicCue('station');
    startStationAudioLoop();
  },
});
let renderQueue = Promise.resolve();
let started = false;
let stationAudioFrameId: number | null = null;

function setStationIdleMotion(): void {
  audio.setTrainMotion({ active: true, speed: 0.18, power: 0.55 });
}

function stationAudioFrame(nowMs: number): void {
  stationAudioFrameId = null;
  diagnostics.audioSchedulerStopped();
  if (!started || router.currentSceneId === 'battle') return;
  audio.update(nowMs);
  startStationAudioLoop();
}

function startStationAudioLoop(): void {
  if (
    stationAudioFrameId !== null
    || !started
    || pageHidden
    || router.currentSceneId === 'battle'
  ) {
    return;
  }
  stationAudioFrameId = window.requestAnimationFrame(stationAudioFrame);
  diagnostics.audioSchedulerStarted();
}

function stopStationAudioLoop(): void {
  if (stationAudioFrameId === null) return;
  window.cancelAnimationFrame(stationAudioFrameId);
  stationAudioFrameId = null;
  diagnostics.audioSchedulerStopped();
}

function cancelActiveStationDeparture(): void {
  const departure = activeStationDeparture;
  activeStationDeparture = null;
  departure?.dispose();
}

async function loadCriticalBattleAssets(
  captainArtId: BattleArtId,
): Promise<BattleAssetSet<BattleArtId>> {
  const assets = battleAssetLoader.assets;
  battleAssets = assets;
  const load = battleAssetLoader.load(
    getCriticalBattleArtIds(captainArtId),
  );
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  await Promise.race([
    load,
    new Promise<void>((resolve) => {
      timeoutId = globalThis.setTimeout(resolve, 3000);
    }),
  ]);
  if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
  return assets;
}

function scheduleDeferredBattleAssets(): void {
  if (deferredAssetTimerId !== null) return;
  deferredAssetTimerId = globalThis.setTimeout(() => {
    deferredAssetTimerId = null;
    void battleAssetLoader.load(DEFERRED_BATTLE_ART_IDS);
  }, 0);
}

function handlePageHidden(): void {
  pageHidden = true;
  stopStationAudioLoop();
  activeStationScene?.pauseForVisibility();
  if (router.currentSceneId === 'battle') {
    activeBattleScene?.pauseForVisibility();
    return;
  }
  audio.pause();
}

function handlePageVisible(): void {
  pageHidden = false;
  if (router.currentSceneId === 'battle') return;
  void audio.resume()
    .catch(() => undefined)
    .then(() => {
      activeStationScene?.resumeForVisibility();
      startStationAudioLoop();
    });
}

function openSettingsPanel(): void {
  const settings = settingsBridge.getSettings();
  shell.openSettings({
    settings,
    audioAvailable: audio.available,
    effectiveReducedMotion,
  });
}

function applyRuntimeSettings(
  settings: GameSettings,
  nextReducedMotion: boolean,
): void {
  if (effectiveReducedMotion !== nextReducedMotion) {
    cancelActiveStationDeparture();
  }
  effectiveReducedMotion = nextReducedMotion;
  qualityPreference = settings.qualityPreference;
  router.setReducedMotion(nextReducedMotion);
  activeStationScene?.setReducedMotion(nextReducedMotion);
  activeStationScene?.setLowPerformance(qualityPreference === 'low');
  activeBattleScene?.setReducedMotion(nextReducedMotion);
  activeBattleScene?.setQualityPreference(qualityPreference);
  if (shell.isSettingsOpen()) {
    shell.openSettings({
      settings,
      audioAvailable: audio.available,
      effectiveReducedMotion,
    });
  }
}

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

function getActiveCaptainArtId(): BattleArtId {
  const captainId = getActiveCaptainId();
  const skinId = getActiveSkinId();
  if (captainId === 'captain-tide-male') {
    if (skinId === 'skin-seafoam-departure') return 'captainMaleSeafoam';
    if (skinId === 'skin-aurora-whale-song') return 'captainMaleAurora';
    return 'captainMaleBase';
  }
  if (skinId === 'skin-seafoam-departure') return 'captainFemaleSeafoam';
  if (skinId === 'skin-aurora-whale-song') return 'captainFemaleAurora';
  return 'captainFemaleBase';
}

function scaleGearReward(baseGears: number): number {
  const progression = activeBattleProgression ?? getProgressionSnapshot();
  return Math.floor(baseGears * progression.gearsMultiplier);
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

function renderStationScene(): string {
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
      reducedMotion: effectiveReducedMotion,
    })}
    <div class="section-title"><h2>航线逐步开放</h2><span>已开放 ${save.unlockedMapIds.length}/${MAP_PROGRESSION.length}</span></div>
    <div class="map-grid">${mapCards}</div>
    <div class="station-footer"><div><b>车站升级</b><span>当前 Lv.${save.stationLevel} · 下一次需要 ${nextLevelCost} 齿轮</span></div><button class="secondary" data-action="upgrade-station" ${save.gears < nextLevelCost ? 'disabled' : ''}>升级车站</button></div>
    ${renderDailyCheckIn({ state: dailyCheckInState, currentDayId })}
    ${renderDailyTrialHub({ stationLevel: save.stationLevel, state: dailyTrialState, definition: dailyDefinition })}
    ${renderLaunchCampaignCenter()}
  </section>`;
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

function renderCaptainScene(): string {
  if (!save.selectedCaptainId) {
    if (!captainSelectionTracked) {
      track('captain_selection_viewed', {});
      captainSelectionTracked = true;
    }
    return renderCaptainSelection();
  }
  return renderWardrobeScreen();
}

function renderEquipmentScene(): string {
  return renderEquipmentScreen();
}

function renderLegionScene(): string {
  return renderSocialHub();
}

function renderStoreScene(): string {
  if (!storeViewTracked) {
    track('store_viewed', { productCount: PRODUCT_CATALOG.length });
    storeViewTracked = true;
  }
  return renderCommerceStore({
    products: PRODUCT_CATALOG,
    purchasedProductIds: save.purchasedProductIds,
    pendingProductId,
  });
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

async function syncView(): Promise<void> {
  shell.setCurrencies({
    gears: save.gears,
    routeMarks: save.routeMarks,
    starTickets: save.starTickets,
  });
  shell.setNotice(notice);

  const targetScene: SceneId = !save.selectedCaptainId
    ? 'captain'
    : phase === 'station'
      ? hubView
      : 'battle';
  const navigationHidden = !save.selectedCaptainId || targetScene === 'battle';
  shell.setNavigationHidden(navigationHidden);
  shell.setActiveScene(targetScene);

  if (router.currentSceneId === targetScene) {
    if (targetScene !== 'battle') await router.refresh();
    return;
  }

  const direction = router.currentSceneId === null
    ? 'replace'
    : router.currentSceneId === 'battle'
      ? 'back'
      : 'forward';
  await router.go(targetScene, direction);
}

function render(): void {
  renderQueue = renderQueue
    .then(() => syncView())
    .catch((error: unknown) => {
      console.error(error);
      diagnostics.captureUncaughtError(error);
      shell.setNotice('界面刷新失败，请重试或清空本地存档。');
    });
}

async function startRun(
  mode: 'normal' | 'daily-trial' = 'normal',
): Promise<void> {
  if (battleStartPending) return;
  if (mode === 'daily-trial' && save.stationLevel < 2) {
    notice = '每日潮汐试炼将在车站达到 Lv.2 后开放。';
    render();
    return;
  }

  battleStartPending = true;
  const stationNotice = notice;
  const departure = new StationDepartureController(
    shell.sceneHost,
    effectiveReducedMotion,
  );
  activeStationDeparture = departure;
  try {
    const audioReady = await audio.unlockFromGesture();
    if (audioReady) audio.playSound('ui-tap');
    notice = audioReady
      ? '正在装载列车、潮兽与战斗特效……'
      : '当前浏览器未启用声音，游戏仍可正常游玩。正在装载战斗……';
    shell.setNotice(notice);
    if (!departure.beginCharging()) {
      setStationIdleMotion();
      notice = stationNotice;
      return;
    }
    audio.setTrainMotion({ active: true, speed: 0.18, power: 0.9 });
    audio.playSound('train-charge');
    const currentBattleAssets = await loadCriticalBattleAssets(
      getActiveCaptainArtId(),
    );
    if (activeStationDeparture !== departure) {
      setStationIdleMotion();
      notice = stationNotice;
      return;
    }
    audio.setTrainMotion({ active: true, speed: 1, power: 0.9 });
    audio.playSound('train-depart');
    if (!await departure.playDeparture()) {
      setStationIdleMotion();
      notice = stationNotice;
      return;
    }
    if (runId) {
      track('run_restart', { afterAdRevive: lastRunRecovery === 'ad' });
    }

    runMode = mode;
    const dailyDefinition =
      mode === 'daily-trial' ? syncDailyTrialDay() : null;
    seed = dailyDefinition?.seed
      ?? (e2eEnabled
        ? e2eSeed
        : Math.floor(Math.random() * 1_000_000) + 1);
    runId = mode === 'daily-trial'
      ? `daily-${dailyDefinition?.dayId}-${Date.now()}`
      : `run-${Date.now()}`;

    recoveryState = createRecoveryState();
    pendingRecoveryActions.clear();
    trackedAdOffers.clear();
    lastRunRecovery = 'none';
    lastDailySubmission = null;
    dailyTrialSharePending = false;
    settlementDoubleClaimed = false;
    interactionState = {
      claimedClaimIds: [...save.claimedInteractionIds],
    };
    activeBattleSettlement = null;
    activeBattleProgression = getProgressionSnapshot();
    activeBattleEngine = new BattleEngine(createBattleRunInput({
      battleId: runId,
      seed,
      mode,
      mapId: currentMapId,
      progression: activeBattleProgression,
      social: socialState,
      dailyTrial: dailyDefinition,
    }));

    phase = 'combat';
    scheduleDeferredBattleAssets();
    notice = dailyDefinition
      ? `${dailyDefinition.dayId} 每日试炼出发：${dailyDefinition.rule.name}，固定种子 ${seed}。`
      : `${formatMap(currentMapId)} 已发车，潮汐种子 ${seed}。`;
    track('run_start', { seed, mapId: currentMapId });
    if (dailyDefinition) {
      track('daily_trial_started', {
        dayId: dailyDefinition.dayId,
        seed: dailyDefinition.seed,
        ruleId: dailyDefinition.rule.id,
      });
    }
    if (currentBattleAssets.failedIds.length > 0) {
      notice += ` ${currentBattleAssets.failedIds.length} 项美术资源将使用安全替代图形。`;
    }
  } catch (error) {
    departure.cancel();
    setStationIdleMotion();
    console.error(error);
    activeBattleEngine = null;
    activeBattleProgression = null;
    activeBattleSettlement = null;
    phase = 'station';
    notice = '战斗资源初始化失败，请稍后重试。';
  } finally {
    departure.dispose();
    if (activeStationDeparture === departure) {
      activeStationDeparture = null;
    }
    battleStartPending = false;
    render();
  }
}

function settleBattleOutcome(
  outcome: BattleOutcome,
): BattleSettlementPresentation {
  const settlement = battleSettlementAdapter.settle(
    activeBattleSettlement,
    outcome,
    (_current, settledOutcome) => (
      runMode === 'daily-trial'
        ? settleDynamicDailyTrial(settledOutcome)
        : settleDynamicNormalRun(settledOutcome)
    ),
  );
  activeBattleSettlement = settlement.state;
  if (!activeBattleSettlement) {
    throw new Error('Battle settlement did not produce a presentation');
  }
  return activeBattleSettlement;
}

function settleDynamicDailyTrial(
  outcome: BattleOutcome,
): BattleSettlementPresentation {
  settlementDoubleClaimed = false;
  const result = submitDailyTrial(dailyTrialState, {
    runId: outcome.battleId,
    outcome: outcome.victory ? 'victory' : 'defeat',
    completedNodes: outcome.completedWaves,
    remainingHp: outcome.remainingHp,
    assisted: outcome.adReviveUsed,
  });
  if (result.accepted) commitDailyTrial(result.state);
  lastDailySubmission = result;
  track('daily_trial_submitted', {
    outcome: outcome.victory ? 'victory' : 'defeat',
    score: result.score,
    bestScore: result.state.bestScore,
    assisted: outcome.adReviveUsed,
    accepted: result.accepted,
  });
  track('run_settled', {
    victory: outcome.victory,
    dailyTrial: true,
    score: result.score,
  });
  notice = result.accepted
    ? `每日试炼成绩已提交：${result.score} 分。`
    : '本局每日试炼已经提交过，不会重复计分。';
  render();
  return {
    title: outcome.victory ? '每日试炼完成' : '本次试炼结束',
    description: outcome.adReviveUsed
      ? '已按广告复活辅助局规则计分，本局不发放普通通关货币。'
      : '成绩已写入今日试炼榜，本局不发放普通通关货币。',
    rewards: { gears: 0, routeMarks: 0, starTickets: 0 },
    expeditionPoints: 0,
    dailyTrialScore: result.score,
    doubleSettlementAvailable: false,
    doubled: false,
  };
}

function settleDynamicNormalRun(
  outcome: BattleOutcome,
): BattleSettlementPresentation {
  const expedition = contributeToExpedition(socialState, {
    runId: outcome.battleId,
    outcome: outcome.victory ? 'victory' : 'defeat',
    completedNodes: outcome.completedWaves,
  });
  if (expedition.accepted) {
    commitSocial(expedition.state);
    track('expedition_contributed', {
      outcome: outcome.victory ? 'victory' : 'defeat',
      points: expedition.pointsGranted,
      total: expedition.state.contribution,
    });
  }

  if (!outcome.victory) {
    settlementDoubleClaimed = false;
    track('run_settled', { victory: false });
    notice = '列车已撤回车站；本局互动奖励保留，通关奖励未发放。';
    render();
    return {
      title: '列车撤回',
      description: '整备后可以重新挑战；已领取的局内互动奖励不会回收。',
      rewards: { gears: 0, routeMarks: 0, starTickets: 0 },
      expeditionPoints: expedition.pointsGranted,
      dailyTrialScore: null,
      doubleSettlementAvailable: false,
      doubled: false,
    };
  }

  const firstClear = claimFirstClear(firstClearState, {
    mapId: currentMapId,
    gears: 400,
    routeMarks: 10,
    starTickets: 3,
    collectionId: `${currentMapId}-first-clear`,
  });
  firstClearState = firstClear.state;
  settlementDoubleClaimed = false;
  const rewards = {
    gears: scaleGearReward(firstClear.granted ? 400 : 80),
    routeMarks: firstClear.granted ? 10 : 2,
    starTickets: firstClear.granted ? 3 : 0,
  };
  commit({
    ...save,
    gears: save.gears + rewards.gears,
    routeMarks: save.routeMarks + rewards.routeMarks,
    starTickets: save.starTickets + rewards.starTickets,
    firstClearMapIds: [...firstClearState.claimedMapIds],
  });
  track('economy_reward_granted', {
    source: firstClear.granted ? 'first-clear' : 'repeat-victory',
    gears: rewards.gears,
    routeMarks: rewards.routeMarks,
    starTickets: rewards.starTickets,
  });
  track('run_settled', {
    victory: true,
    firstClear: firstClear.granted,
  });
  notice = firstClear.granted
    ? '首通高额奖励已到账，同一地图只发放一次。'
    : '重复通关奖励已到账，可看广告再领取一份普通通关奖励。';
  render();
  return {
    title: firstClear.granted ? '航线首次打通！' : '潮汐航线通关',
    description: firstClear.granted
      ? '首次通关奖励与收藏记录已经写入存档。'
      : '这是重复通关结算，可选择观看广告追加一份普通奖励。',
    rewards,
    expeditionPoints: expedition.pointsGranted,
    dailyTrialScore: null,
    doubleSettlementAvailable: !firstClear.granted,
    doubled: false,
  };
}

async function requestBattleRevive(): Promise<{
  readonly accepted: boolean;
  readonly hpRestored: number;
}> {
  const engine = activeBattleEngine;
  if (
    !engine
    || engine.frame.status !== 'defeat'
    || pendingRecoveryActions.has('revive')
  ) {
    return { accepted: false, hpRestored: 0 };
  }
  const available = canRevive(recoveryState);
  track('revive_clicked', {
    type: 'ad',
    available,
    usedBefore: recoveryState.adReviveUsed,
  });
  if (!available) return { accepted: false, hpRestored: 0 };

  pendingRecoveryActions.add('revive');
  trackAdOfferOnce('revive');
  track('rewarded_ad_clicked', { placement: 'revive' });
  const adResult = await ads.showRewardedAd('revive');
  pendingRecoveryActions.delete('revive');
  const resultName = recoveryResultName(adResult);
  track('rewarded_ad_result', {
    placement: 'revive',
    result: resultName,
  });
  if (resultName !== 'completed') {
    notice = resultName === 'cancelled'
      ? '已取消广告，复活机会没有消耗。'
      : '广告播放失败，复活机会没有消耗。';
    track('revive_result', {
      type: 'ad',
      result: resultName,
      hpRestored: 0,
    });
    render();
    return { accepted: false, hpRestored: 0 };
  }

  const frame = engine.frame;
  const encounter = frame.enemies.some((enemy) => (
    enemy.alive && enemy.kind === 'deep-echo-boss'
  ))
    ? 'boss'
    : 'combat';
  const revived = applyRevive({
    state: recoveryState,
    encounter,
    playerHp: 0,
    maxPlayerHp: frame.maxTrainHp,
    nowMs: Date.now(),
  });
  if (revived.result !== 'completed') {
    track('revive_result', {
      type: 'ad',
      result: revived.result,
      hpRestored: 0,
    });
    return { accepted: false, hpRestored: 0 };
  }

  recoveryState = revived.state;
  lastRunRecovery = 'ad';
  notice = `广告完成，列车恢复 ${revived.hpRestored} 点耐久并获得短暂无敌。`;
  track('revive_result', {
    type: 'ad',
    result: revived.result,
    hpRestored: revived.hpRestored,
  });
  render();
  return { accepted: true, hpRestored: revived.hpRestored };
}

async function requestBattleSkillRefresh(): Promise<boolean> {
  const engine = activeBattleEngine;
  if (
    !engine
    || engine.frame.status !== 'paused'
    || recoveryState.skillRefreshUsed
    || pendingRecoveryActions.has('skill-refresh')
  ) {
    return false;
  }
  const hasCooldown = (
    engine.frame.cooldowns['tidal-volley'] > 0
    || engine.frame.cooldowns['bubble-barrier'] > 0
  );
  if (!hasCooldown) {
    notice = '两个主动技能都已就绪，暂时不需要刷新。';
    render();
    return false;
  }

  pendingRecoveryActions.add('skill-refresh');
  trackAdOfferOnce('skill-refresh');
  track('rewarded_ad_clicked', { placement: 'skill-refresh' });
  const adResult = await ads.showRewardedAd('skill-refresh');
  pendingRecoveryActions.delete('skill-refresh');
  const resultName = recoveryResultName(adResult);
  track('rewarded_ad_result', {
    placement: 'skill-refresh',
    result: resultName,
  });
  if (resultName !== 'completed') {
    notice = resultName === 'cancelled'
      ? '已取消广告，技能刷新机会仍然保留。'
      : '广告播放失败，技能刷新机会仍然保留。';
    track('skill_refresh_result', {
      result: resultName,
      chargesGranted: 0,
    });
    render();
    return false;
  }

  recoveryState = {
    ...recoveryState,
    skillRefreshUsed: true,
    skillCharges: 0,
  };
  notice = '广告完成，两个主动技能的冷却即将清零。';
  track('skill_refresh_result', {
    result: 'completed',
    chargesGranted: 1,
  });
  render();
  return true;
}

async function requestBattleUpgradeReroll(): Promise<boolean> {
  const engine = activeBattleEngine;
  if (
    !engine
    || runMode !== 'normal'
    || engine.frame.status !== 'upgrade'
    || engine.frame.upgradeRerollUsed
    || pendingRecoveryActions.has('reroll')
  ) {
    return false;
  }
  pendingRecoveryActions.add('reroll');
  trackAdOfferOnce('reroll');
  track('rewarded_ad_clicked', { placement: 'reroll' });
  const adResult = await ads.showRewardedAd('reroll');
  pendingRecoveryActions.delete('reroll');
  const resultName = recoveryResultName(adResult);
  track('rewarded_ad_result', {
    placement: 'reroll',
    result: resultName,
  });
  if (resultName !== 'completed') {
    notice = resultName === 'cancelled'
      ? '已取消广告，本次三选一重抽机会仍然保留。'
      : '广告播放失败，本次三选一重抽机会仍然保留。';
    render();
    return false;
  }
  notice = '广告完成，三张构筑卡即将重新生成。';
  render();
  return true;
}

function claimBattleInteraction(
  actionId: string,
  attempt: number,
): boolean {
  if (runMode !== 'normal') return false;
  const definition = BATTLE_INTERACTIONS.find(
    (candidate) => candidate.actionId === actionId,
  );
  if (!definition) return false;
  const result = claimInteractionReward(interactionState, {
    runId,
    actionId,
    attempt,
    definition,
  });
  if (!result.accepted) {
    notice = result.alreadyClaimed
      ? '这次互动已经结算过，不会重复发奖。'
      : '这个互动点的本局次数已经用完。';
    render();
    return false;
  }

  interactionState = result.state;
  commit({
    ...save,
    [result.currency]: save[result.currency] + result.amount,
    claimedInteractionIds: [...interactionState.claimedClaimIds],
  });
  notice = `互动奖励到账：${result.amount} ${definition.currencyLabel}。`;
  track('first_action', { actionId, attempt });
  track('economy_reward_granted', {
    source: 'interaction',
    actionId,
    currency: result.currency,
    amount: result.amount,
  });
  render();
  return true;
}

async function requestBattleDoubleSettlement(
  outcome: BattleOutcome,
): Promise<BattleSettlementPresentation | null> {
  if (
    runMode !== 'normal'
    || !outcome.victory
    || !activeBattleSettlement
    || !activeBattleSettlement.doubleSettlementAvailable
    || settlementDoubleClaimed
    || pendingRecoveryActions.has('double-settlement')
  ) {
    return null;
  }

  pendingRecoveryActions.add('double-settlement');
  trackAdOfferOnce('double-settlement');
  track('rewarded_ad_clicked', { placement: 'double-settlement' });
  const adResult = await ads.showRewardedAd('double-settlement');
  pendingRecoveryActions.delete('double-settlement');
  const resultName = recoveryResultName(adResult);
  track('rewarded_ad_result', {
    placement: 'double-settlement',
    result: resultName,
  });
  if (resultName !== 'completed') {
    notice = resultName === 'cancelled'
      ? '已取消广告，追加奖励机会仍然保留。'
      : '广告播放失败，追加奖励机会仍然保留。';
    render();
    return null;
  }

  const gears = scaleGearReward(80);
  commit({
    ...save,
    gears: save.gears + gears,
    routeMarks: save.routeMarks + 2,
  });
  settlementDoubleClaimed = true;
  activeBattleSettlement = {
    ...activeBattleSettlement,
    rewards: {
      gears: activeBattleSettlement.rewards.gears + gears,
      routeMarks: activeBattleSettlement.rewards.routeMarks + 2,
      starTickets: activeBattleSettlement.rewards.starTickets,
    },
    doubleSettlementAvailable: false,
    doubled: true,
  };
  track('economy_reward_granted', {
    source: 'rewarded-ad',
    placement: 'double-settlement',
    gears,
    routeMarks: 2,
    starTickets: 0,
  });
  notice = `广告完成，已追加 ${gears} 齿轮和 2 航线徽记。`;
  render();
  return activeBattleSettlement;
}

function exitBattle(): void {
  phase = 'station';
  hubView = 'station';
  activeBattleEngine = null;
  activeBattleProgression = null;
  activeBattleSettlement = null;
  activeBattleScene = null;
  notice = '列车已经返回潮汐车站，可以整备后再次出发。';
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

function recoveryResultName(result: 'completed' | 'closed' | 'failed'): 'completed' | 'cancelled' | 'failed' {
  return result === 'completed' ? 'completed' : result === 'closed' ? 'cancelled' : 'failed';
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

const onClick = async (event: Event): Promise<void> => {
  const target = event.target as HTMLElement;
  const navigation = target.closest<HTMLButtonElement>('[data-nav-scene]');
  if (navigation?.dataset.navScene && phase === 'station') {
    cancelActiveStationDeparture();
    audio.playSound('ui-tap');
    hubView = navigation.dataset.navScene as HubView;
    render();
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (
    battleStartPending
    && action !== 'open-settings'
    && action !== 'close-settings'
  ) {
    return;
  }
  if (action !== 'start-run' && action !== 'start-daily-trial') {
    audio.playSound('ui-tap');
  }
  if (action === 'open-settings') {
    openSettingsPanel();
    return;
  }
  if (action === 'close-settings') {
    shell.closeSettings();
    return;
  }
  if (action === 'captain-greeting') {
    activeStationScene?.requestCaptainGreeting();
    return;
  }
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
  if (action === 'start-run') {
    await startRun('normal');
    return;
  }
  if (action === 'start-daily-trial') {
    await startRun('daily-trial');
    return;
  }
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
};

const onSubmit = (event: Event): void => {
  const form = event.target as HTMLFormElement;
  if (form.id !== 'gift-code-form') return;
  event.preventDefault();
  if (battleStartPending) return;
  const rawCode = new FormData(form).get('giftCode');
  handleGiftCodeRedeem(typeof rawCode === 'string' ? rawCode : '');
};

const onChange = (event: Event): void => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    && target.dataset.setting
    && (
      target.dataset.setting === 'musicEnabled'
      || target.dataset.setting === 'sfxEnabled'
      || target.dataset.setting === 'reducedMotion'
    )
  ) {
    settingsBridge.updateSettings({
      [target.dataset.setting]: target.checked,
    });
    openSettingsPanel();
    return;
  }
  if (
    target instanceof HTMLSelectElement
    && target.dataset.setting === 'qualityPreference'
  ) {
    const quality = target.value as QualityPreference;
    if (!['auto', 'high', 'medium', 'low'].includes(quality)) return;
    settingsBridge.updateSettings({ qualityPreference: quality });
    openSettingsPanel();
  }
};

const onKeyDown = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape' || !shell.isSettingsOpen()) return;
  event.preventDefault();
  shell.closeSettings();
};

function e2eSnapshot(): BattleE2ESnapshot {
  const sceneId = router.currentSceneId
    ?? (phase === 'combat' ? 'battle' : hubView);
  const snapshot = diagnostics.snapshot();
  return {
    sceneId,
    battle: activeBattleEngine
      ? cloneBattleFrame(activeBattleEngine.frame)
      : null,
    trainMotion: activeBattleScene
      ? activeBattleScene.snapshotTrainMotion()
      : null,
    diagnostics: snapshot,
    settlementCount: snapshot.settledBattleCount,
  };
}

async function e2eNavigate(sceneId: HubView): Promise<void> {
  if (!e2eEnabled) return;
  cancelActiveStationDeparture();
  if (phase === 'combat') {
    phase = 'station';
    activeBattleEngine = null;
    activeBattleProgression = null;
    activeBattleSettlement = null;
    activeBattleScene = null;
  }
  hubView = sceneId;
  render();
  await renderQueue;
}

async function e2eStartBattle(
  mode: 'normal' | 'daily-trial',
): Promise<void> {
  if (!e2eEnabled) return;
  await startRun(mode);
  await renderQueue;
}

return {
  async start(): Promise<void> {
    if (started) return;
    started = true;
    app.addEventListener('click', onClick);
    app.addEventListener('submit', onSubmit);
    app.addEventListener('change', onChange);
    app.addEventListener('keydown', onKeyDown);
    await syncView();
  },
  applySettings(
    settings: GameSettings,
    nextReducedMotion: boolean,
  ): void {
    applyRuntimeSettings(settings, nextReducedMotion);
  },
  handlePageHidden,
  handlePageVisible,
  captureUncaughtError(error: unknown): void {
    diagnostics.captureUncaughtError(error);
  },
  e2eSnapshot,
  async e2eNavigate(sceneId: HubView): Promise<void> {
    await e2eNavigate(sceneId);
  },
  async e2eStartNormalBattle(): Promise<void> {
    await e2eStartBattle('normal');
  },
  async e2eStartDailyTrial(): Promise<void> {
    await e2eStartBattle('daily-trial');
  },
  e2eAdvanceBattle(durationMs: number): void {
    activeBattleScene?.advanceForE2E(durationMs);
  },
  e2eChooseFirstUpgrade(): boolean {
    return activeBattleScene?.chooseFirstUpgradeForE2E() ?? false;
  },
  e2eUseSkill(skillId: BattleSkillId): boolean {
    return activeBattleScene?.useSkillForE2E(skillId) ?? false;
  },
  e2eRequestPause(): void {
    activeBattleScene?.requestPauseForE2E();
  },
  async e2eRequestResume(): Promise<void> {
    await activeBattleScene?.requestResumeForE2E();
  },
  async e2eReturnToStation(): Promise<void> {
    if (!e2eEnabled) return;
    exitBattle();
    await renderQueue;
  },
  destroy(): void {
    if (!started) return;
    started = false;
    cancelActiveStationDeparture();
    stopStationAudioLoop();
    if (deferredAssetTimerId !== null) {
      globalThis.clearTimeout(deferredAssetTimerId);
      deferredAssetTimerId = null;
    }
    app.removeEventListener('click', onClick);
    app.removeEventListener('submit', onSubmit);
    app.removeEventListener('change', onChange);
    app.removeEventListener('keydown', onKeyDown);
    shell.closeSettings();
    router.destroy();
    activeStationScene = null;
    app.replaceChildren();
  },
};
}

function cloneBattleFrame(frame: BattleFrameView): BattleFrameView {
  return {
    ...frame,
    offeredUpgradeIds: [...frame.offeredUpgradeIds],
    upgradeLevels: { ...frame.upgradeLevels },
    cooldowns: { ...frame.cooldowns },
    enemies: frame.enemies.map((enemy) => ({ ...enemy })),
    projectiles: frame.projectiles.map((projectile) => ({ ...projectile })),
    loot: frame.loot.map((loot) => ({ ...loot })),
  };
}
