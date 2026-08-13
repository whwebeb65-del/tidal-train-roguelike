import type {
  BattleSettlementPresentation,
  RunMode,
  TidalArchiveDiscoveryPresentation,
} from '../app/AppTypes';
export type {
  BattleSettlementPresentation,
} from '../app/AppTypes';
import {
  getAvailableBattleInteractions,
  type AvailableBattleInteraction,
  type BattleInteractionClaims,
} from './BattleInteractionSchedule';
import { getBattleUpgradeDefinition } from './BattleUpgradeCatalog';
import { getBattleUpgradeCopy } from './BattleUpgradeCopy';
import { BATTLE_ART_URLS } from '../assets/BattleArtCatalog';
import type {
  BattleFrameView,
  BattleSkillId,
  BattleUpgradeId,
  SkillVariantId,
} from './BattleTypes';
import type { BattleSpeed } from '../../src/domain/progression/AccountProgressionSystem';
import type { FirstRunBattleTutorialPrompt } from '../../src/domain/onboarding/FirstRunBattleTutorial';

export interface BattleUpgradeCardModel {
  readonly id: BattleUpgradeId;
  readonly name: string;
  readonly currentLevel: number;
  readonly nextLevel: number;
  readonly effect: string;
  readonly synergy: string;
  readonly isEvolution: boolean;
}

export interface BattleSkillModel {
  readonly id: BattleSkillId;
  readonly name: string;
  readonly shortcut: string;
  readonly cooldownMs: number;
  readonly cooldownLabel: string;
  readonly ready: boolean;
  readonly energyRequired: boolean;
  readonly rank: number;
  readonly variantIds: readonly SkillVariantId[];
  readonly iconUrl: string;
}

export interface BattleSpeedModel {
  readonly current: BattleSpeed;
  readonly available: readonly BattleSpeed[];
  readonly nextUnlockLevel: number | null;
}

export interface BattleHudModel {
  readonly status: BattleFrameView['status'];
  readonly waveLabel: string;
  readonly runLevelLabel: string;
  readonly timerLabel: string;
  readonly hpLabel: string;
  readonly hpPercent: number;
  readonly shieldLabel: string;
  readonly energyLabel: string;
  readonly energyPercent: number;
  readonly comboLabel: string;
  readonly experienceLabel: string;
  readonly experiencePercent: number;
  readonly upgradeIcons: readonly string[];
  readonly skills: readonly BattleSkillModel[];
  readonly speed: BattleSpeedModel;
  readonly upgradeVisible: boolean;
  readonly upgradeCountdownVisible: boolean;
  readonly upgradeCards: readonly BattleUpgradeCardModel[];
  readonly upgradeRerollVisible: boolean;
  readonly skillRefreshVisible: boolean;
  readonly interaction: AvailableBattleInteraction | null;
  readonly interactionNotice: string;
  readonly pauseOverlayVisible: boolean;
  readonly failureVisible: boolean;
  readonly reviveAvailable: boolean;
  readonly failureSummary: string;
  readonly settlement: BattleSettlementPresentation | null;
  readonly settlementVisible: boolean;
  readonly doubleSettlementVisible: boolean;
  readonly pendingActions: ReadonlySet<string>;
  readonly firstRunTutorialPrompt: FirstRunBattleTutorialPrompt | null;
  readonly archiveDiscovery: TidalArchiveDiscoveryPresentation | null;
}

export interface BattleHudModelOptions {
  readonly mode: RunMode;
  readonly upgradeRerollAvailable: boolean;
  readonly skillRefreshAvailable: boolean;
  readonly visibilityResumeRequired?: boolean;
  readonly interactionClaims?: BattleInteractionClaims;
  readonly interactionNotice?: string;
  readonly reviveAvailable?: boolean;
  readonly settlement?: BattleSettlementPresentation | null;
  readonly pendingActions?: ReadonlySet<string>;
  readonly battleSpeed?: BattleSpeed;
  readonly availableBattleSpeeds?: readonly BattleSpeed[];
  readonly firstRunTutorialPrompt?: FirstRunBattleTutorialPrompt | null;
  readonly archiveDiscovery?: TidalArchiveDiscoveryPresentation | null;
}

const SKILL_COPY: Readonly<Record<BattleSkillId, {
  readonly name: string;
  readonly shortcut: string;
}>> = {
  'tidal-volley': { name: '潮汐齐射', shortcut: '1' },
  'bubble-barrier': { name: '泡泡屏障', shortcut: '2' },
  'extreme-tide': { name: '极潮爆发', shortcut: '3' },
};

export function createBattleHudModel(
  frame: BattleFrameView,
  options: BattleHudModelOptions,
): BattleHudModel {
  const nextThreshold = frame.nextExperienceThreshold;
  const upgradeCards = frame.offeredUpgradeIds.map((id) => {
    const copy = getBattleUpgradeCopy(id);
    const definition = getBattleUpgradeDefinition(id);
    const currentLevel = frame.upgradeLevels[id] ?? 0;
    return {
      id,
      name: copy.name,
      currentLevel,
      nextLevel: Math.min(
        definition.maxLevel,
        currentLevel + 1,
      ),
      effect: copy.effect,
      synergy: copy.synergy,
      isEvolution: definition.kind === 'skill-variant',
    };
  });
  const interaction = getAvailableBattleInteractions(
    frame.elapsedMs,
    options.interactionClaims ?? {},
    options.mode,
  )[0] ?? null;
  const settlement = options.settlement ?? null;
  const pendingActions = options.pendingActions ?? new Set<string>();
  const upgradeCountdownVisible = pendingActions.has('upgrade-resume');
  const visibilityResumeRequired =
    options.visibilityResumeRequired ?? false;
  const availableBattleSpeeds = options.availableBattleSpeeds ?? [1];
  const firstRunTutorialPrompt = options.firstRunTutorialPrompt ?? null;
  const archiveDiscovery =
    frame.status === 'running'
    && !visibilityResumeRequired
    && settlement === null
    && firstRunTutorialPrompt === null
    && interaction === null
      ? options.archiveDiscovery ?? null
      : null;

  return {
    status: frame.status,
    waveLabel: `第 ${frame.wave} 波`,
    runLevelLabel: `Lv.${frame.runLevel}`,
    timerLabel: formatBattleTime(frame.elapsedMs),
    hpLabel: `${Math.ceil(frame.trainHp)} / ${frame.maxTrainHp}`,
    hpPercent: percent(frame.trainHp, frame.maxTrainHp),
    shieldLabel: frame.shield > 0
      ? `${Math.ceil(frame.shield)} 护盾 · ${(frame.shieldRemainingMs / 1000).toFixed(1)} 秒`
      : '护盾未展开',
    energyLabel: `${Math.floor(frame.energy)} / 100`,
    energyPercent: percent(frame.energy, 100),
    comboLabel: frame.combo > 0 ? `${frame.combo} 连击` : '等待命中',
    experienceLabel: nextThreshold === null
      ? '强化已满'
      : `${frame.experience} / ${nextThreshold}`,
    experiencePercent: nextThreshold === null
      ? 100
      : percent(frame.experience, nextThreshold),
    upgradeIcons: Object.entries(frame.upgradeLevels)
      .filter(([, level]) => level > 0)
      .slice(0, 6)
      .map(([id, level]) => (
        `${getBattleUpgradeCopy(id as BattleUpgradeId).name} ${level}`
      )),
    skills: createSkillModels(frame),
    speed: {
      current: options.battleSpeed ?? 1,
      available: [...availableBattleSpeeds],
      nextUnlockLevel: nextSpeedUnlockLevel(availableBattleSpeeds),
    },
    upgradeVisible:
      !visibilityResumeRequired
      && (frame.status === 'upgrade' || upgradeCountdownVisible),
    upgradeCountdownVisible:
      !visibilityResumeRequired && upgradeCountdownVisible,
    upgradeCards,
    upgradeRerollVisible:
      !visibilityResumeRequired
      && frame.status === 'upgrade'
      && options.mode === 'normal'
      && options.upgradeRerollAvailable,
    skillRefreshVisible:
      !visibilityResumeRequired
      && frame.status === 'running'
      && options.skillRefreshAvailable
      && (
        frame.cooldowns['tidal-volley'] > 0
        || frame.cooldowns['bubble-barrier'] > 0
      ),
    interaction,
    interactionNotice: options.interactionNotice ?? '',
    pauseOverlayVisible:
      visibilityResumeRequired
      || (frame.status === 'paused' && !upgradeCountdownVisible),
    failureVisible:
      !visibilityResumeRequired
      && frame.status === 'defeat'
      && settlement === null,
    reviveAvailable: options.reviveAvailable ?? false,
    failureSummary: `坚持到第 ${frame.wave} 波 · 击败 ${frame.kills} 只潮兽`,
    settlement,
    settlementVisible: !visibilityResumeRequired && settlement !== null,
    doubleSettlementVisible:
      !visibilityResumeRequired
      && settlement?.doubleSettlementAvailable === true
      && settlement.doubled === false,
    pendingActions,
    firstRunTutorialPrompt,
    archiveDiscovery,
  };
}

function createSkillModels(
  frame: BattleFrameView,
): readonly BattleSkillModel[] {
  const ids: readonly BattleSkillId[] = [
    'tidal-volley',
    'bubble-barrier',
    'extreme-tide',
  ];
  return ids.map((id) => {
    const cooldownMs = frame.cooldowns[id];
    const energyRequired = id === 'extreme-tide';
    const ready = energyRequired ? frame.energy >= 100 : cooldownMs <= 0;
    return {
      id,
      name: SKILL_COPY[id].name,
      shortcut: SKILL_COPY[id].shortcut,
      cooldownMs,
      cooldownLabel: energyRequired
        ? ready ? '就绪' : `${Math.floor(frame.energy)}%`
        : cooldownMs <= 0 ? '就绪' : `${(cooldownMs / 1000).toFixed(1)}s`,
      ready,
      energyRequired,
      rank: frame.skillRanks[id],
      variantIds: [...frame.skillVariants[id]],
      iconUrl: skillIconUrl(id),
    };
  });
}

function skillIconUrl(id: BattleSkillId): string {
  switch (id) {
    case 'tidal-volley':
      return BATTLE_ART_URLS.skillTidalVolley;
    case 'bubble-barrier':
      return BATTLE_ART_URLS.skillBubbleBarrier;
    case 'extreme-tide':
      return BATTLE_ART_URLS.skillExtremeTide;
  }
}

function nextSpeedUnlockLevel(
  available: readonly BattleSpeed[],
): number | null {
  if (!available.includes(1.5)) return 10;
  if (!available.includes(2)) return 20;
  if (!available.includes(3)) return 30;
  return null;
}

function formatBattleTime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function percent(value: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, value / maximum * 100));
}
