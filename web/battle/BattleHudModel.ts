import type {
  BattleSettlementPresentation,
  RunMode,
} from '../app/AppTypes';
export type {
  BattleSettlementPresentation,
} from '../app/AppTypes';
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
  readonly visibilityResumeRequired?: boolean;
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
  'rank-tidal-volley': { name: '浪箭鱼群', effect: '潮汐齐射 Rank +1', synergy: '提高总伤害、缩短冷却并强化徽章' },
  'rank-bubble-barrier': { name: '珊甲泡膜', effect: '泡泡屏障 Rank +1', synergy: '提高治疗与护盾并强化徽章' },
  'rank-extreme-tide': { name: '涡星潮眼', effect: '极潮爆发 Rank +1', synergy: '提高爆发伤害并强化徽章' },
  'split-tide-arrow': { name: '分汐浪箭', effect: '命中后分裂至第二目标，造成 35% 伤害', synergy: '强化多目标清场' },
  'reef-piercer': { name: '贯礁箭鳍', effect: '额外穿透一个目标，保留 60% 伤害', synergy: '对密集直线怪潮有效' },
  'returning-volley': { name: '回潮齐射', effect: '首轮后追加 4 枚 45% 伤害回旋浪箭', synergy: '补充二次打击' },
  'rainstorm-school': { name: '暴雨鱼群', effect: '16 枚 75% 浪箭，冷却增加 20%', synergy: '把齐射进化为终局弹幕' },
  'bursting-bubble': { name: '破泡潮鸣', effect: '屏障结束时造成主炮 150% 冲击伤害', synergy: '把防御转为近线清场' },
  'reflective-spines': { name: '反棘潮膜', effect: '返还吸收伤害的 35%', synergy: '对高频攻击者有效' },
  'overflow-membrane': { name: '过量潮膜', effect: '溢出治疗转为最多 15% 最大生命的护盾', synergy: '满血施放不再浪费治疗' },
  'emergency-trigger': { name: '濒海自启', effect: '每局一次，低于 25% 生命自动触发 60% 屏障', synergy: '提供濒死保险' },
  'undertow-eye': { name: '引潮眼', effect: '将敌人向中央牵引 2 秒', synergy: '为后续范围攻击聚怪' },
  'lingering-vortex': { name: '余涡', effect: '留下 4 秒、总计主炮 200% 伤害的漩涡', synergy: '补充持续伤害' },
  'energy-return': { name: '回能潮', effect: '每次击杀返还 2 能量，最多 20', synergy: '加快下一次极潮循环' },
  'double-crest': { name: '双潮峰', effect: '1.2 秒后追加 45% 伤害潮击', synergy: '强化延迟爆发' },
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
    const currentLevel = frame.upgradeLevels[id] ?? 0;
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
  const visibilityResumeRequired =
    options.visibilityResumeRequired ?? false;

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
