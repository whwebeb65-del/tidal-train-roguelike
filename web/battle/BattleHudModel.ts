import type { RunMode } from '../app/AppTypes';
import {
  getAvailableBattleInteractions,
  type AvailableBattleInteraction,
  type BattleInteractionClaims,
} from './BattleInteractionSchedule';
import type {
  BattleFrameView,
  BattleSkillId,
  BattleUpgradeId,
  EnemyKind,
} from './BattleTypes';

export interface BattleSettlementPresentation {
  readonly title: string;
  readonly description: string;
  readonly rewards: {
    readonly gears: number;
    readonly routeMarks: number;
    readonly starTickets: number;
  };
  readonly expeditionPoints: number;
  readonly dailyTrialScore: number | null;
  readonly doubleSettlementAvailable: boolean;
  readonly doubled: boolean;
}

export interface BattleUpgradeCardModel {
  readonly id: BattleUpgradeId;
  readonly name: string;
  readonly currentLevel: number;
  readonly nextLevel: number;
  readonly effect: string;
  readonly synergy: string;
}

export interface BattleSkillModel {
  readonly id: BattleSkillId;
  readonly name: string;
  readonly shortcut: string;
  readonly cooldownMs: number;
  readonly cooldownLabel: string;
  readonly ready: boolean;
  readonly energyRequired: boolean;
}

export interface BattleBossBarModel {
  readonly visible: boolean;
  readonly label: string;
  readonly hpPercent: number;
  readonly shieldPercent: number;
}

export interface BattleHudModel {
  readonly status: BattleFrameView['status'];
  readonly waveLabel: string;
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
  readonly bossBar: BattleBossBarModel;
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
}

export interface BattleHudModelOptions {
  readonly mode: RunMode;
  readonly upgradeRerollAvailable: boolean;
  readonly skillRefreshAvailable: boolean;
  readonly interactionClaims?: BattleInteractionClaims;
  readonly interactionNotice?: string;
  readonly reviveAvailable?: boolean;
  readonly settlement?: BattleSettlementPresentation | null;
  readonly pendingActions?: ReadonlySet<string>;
}

const UPGRADE_COPY: Readonly<Record<BattleUpgradeId, {
  readonly name: string;
  readonly effect: string;
  readonly synergy: string;
}>> = {
  'multi-barrel': {
    name: '多管潮炮',
    effect: '主炮弹道 +1，单发倍率调整为 72%',
    synergy: '适合命中、暴击和溅射构筑',
  },
  'rapid-reload': {
    name: '急速装填',
    effect: '主炮射击间隔 -12%',
    synergy: '提高所有命中特效触发频率',
  },
  'coral-warhead': {
    name: '珊瑚弹头',
    effect: '获得 54 范围溅射，溅射伤害 +35%',
    synergy: '怪潮密集时收益更高',
  },
  'echo-chain': {
    name: '回声弹射',
    effect: '弹射次数 +1，弹射继承 45% 伤害',
    synergy: '补足多目标清场能力',
  },
  'precision-lens': {
    name: '精准透镜',
    effect: '暴击率 +8%',
    synergy: '配合多弹道快速放大收益',
  },
  'bubble-capacitor': {
    name: '泡泡电容',
    effect: '屏障量 +25%，修复比例 +4%',
    synergy: '强化付费装备与生存构筑',
  },
  'tidal-resonance': {
    name: '潮汐共振',
    effect: '主动技能冷却 -15%',
    synergy: '更频繁使用齐射和屏障',
  },
  'magnetic-salvage': {
    name: '磁吸打捞',
    effect: '吸附速度 +40%，经验收益 +10%',
    synergy: '更快进入下一次三选一',
  },
  'overload-core': {
    name: '过载核心',
    effect: '能量获取 +25%，极潮伤害 +20%',
    synergy: '加速大招循环并提高爆发',
  },
};

const SKILL_COPY: Readonly<Record<BattleSkillId, {
  readonly name: string;
  readonly shortcut: string;
}>> = {
  'tidal-volley': { name: '潮汐齐射', shortcut: '1' },
  'bubble-barrier': { name: '泡泡屏障', shortcut: '2' },
  'extreme-tide': { name: '极潮爆发', shortcut: '3' },
};

const BOSS_LABELS: Partial<Record<EnemyKind, string>> = {
  'storm-ray-elite': '雷鳐督军',
  'deep-echo-boss': '深海回响',
};

export function createBattleHudModel(
  frame: BattleFrameView,
  options: BattleHudModelOptions,
): BattleHudModel {
  const nextThreshold = frame.nextExperienceThreshold;
  const activeBoss = frame.enemies.find(
    (enemy) => (
      enemy.alive
      && (
        enemy.kind === 'storm-ray-elite'
        || enemy.kind === 'deep-echo-boss'
      )
    ),
  );
  const upgradeCards = frame.offeredUpgradeIds.map((id) => {
    const copy = UPGRADE_COPY[id];
    const currentLevel = frame.upgradeLevels[id];
    return {
      id,
      name: copy.name,
      currentLevel,
      nextLevel: Math.min(3, currentLevel + 1),
      effect: copy.effect,
      synergy: copy.synergy,
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

  return {
    status: frame.status,
    waveLabel: `第 ${frame.wave} 波`,
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
        `${UPGRADE_COPY[id as BattleUpgradeId].name} ${level}`
      )),
    skills: createSkillModels(frame),
    bossBar: activeBoss
      ? {
          visible: true,
          label: BOSS_LABELS[activeBoss.kind] ?? '精英潮兽',
          hpPercent: percent(activeBoss.hp, activeBoss.maxHp),
          shieldPercent: percent(activeBoss.shield, activeBoss.maxHp),
        }
      : {
          visible: false,
          label: '',
          hpPercent: 0,
          shieldPercent: 0,
        },
    upgradeVisible: frame.status === 'upgrade' || upgradeCountdownVisible,
    upgradeCountdownVisible,
    upgradeCards,
    upgradeRerollVisible:
      frame.status === 'upgrade'
      && options.mode === 'normal'
      && options.upgradeRerollAvailable,
    skillRefreshVisible:
      frame.status === 'running'
      && options.skillRefreshAvailable
      && (
        frame.cooldowns['tidal-volley'] > 0
        || frame.cooldowns['bubble-barrier'] > 0
      ),
    interaction,
    interactionNotice: options.interactionNotice ?? '',
    pauseOverlayVisible: frame.status === 'paused',
    failureVisible: frame.status === 'defeat' && settlement === null,
    reviveAvailable: options.reviveAvailable ?? false,
    failureSummary: `坚持到第 ${frame.wave} 波 · 击败 ${frame.kills} 只潮兽`,
    settlement,
    settlementVisible: settlement !== null,
    doubleSettlementVisible:
      settlement?.doubleSettlementAvailable === true
      && settlement.doubled === false,
    pendingActions,
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
    };
  });
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
