import {
  TIDE_BEAST_ARCHIVE_IDS,
  type TideBeastArchiveId,
} from '../../src/domain/collection/TidalArchiveSystem';
import {
  EQUIPMENT_CATALOG,
  type EquipmentRarity,
  type EquipmentSetId,
  type EquipmentSlot,
} from '../../src/domain/equipment/EquipmentCatalog';
import type { EquipmentInstance } from '../../src/domain/equipment/EquipmentSystem';
import type { PermanentStatModifiers } from '../../src/domain/progression/ProgressionTypes';
import {
  BATTLE_SKILL_IDS,
  SKILL_VARIANT_IDS,
  SKILL_VARIANTS_BY_SKILL,
  type BattleSkillId,
  type SkillVariantId,
} from '../../src/domain/skill/SkillProgressionTypes';
import {
  skillMasteryLevelFromXp,
  type SkillMasteryXp,
} from '../../src/domain/progression/SkillMasterySystem';
import {
  BATTLE_ART_URLS,
  BATTLE_VARIANT_GLYPH_URLS,
} from '../assets/BattleArtCatalog';
import { getBattleUpgradeCopy } from '../battle/BattleUpgradeCopy';

export interface TidalArchiveEnemyDefinition {
  readonly id: TideBeastArchiveId;
  readonly name: string;
  readonly artUrl: string;
  readonly role: string;
  readonly counter: string;
  readonly source: string;
}

export interface TidalArchiveEnemyCard extends TidalArchiveEnemyDefinition {
  readonly discovered: boolean;
}

export interface TidalArchiveVariantCard {
  readonly id: SkillVariantId;
  readonly discovered: boolean;
  readonly name: string;
  readonly effect: string;
  readonly synergy: string;
  readonly artUrl: string;
  readonly skillId: BattleSkillId;
  readonly skillName: string;
  readonly requiredMasteryLevel: 1 | 5 | 10 | 15;
  readonly currentMasteryLevel: number;
  readonly source: string;
}

export interface TidalArchiveEquipmentCard {
  readonly id: string;
  readonly discovered: boolean;
  readonly name: string;
  readonly effect: string;
  readonly slotName: string;
  readonly setName: string;
  readonly rarityName: string;
  readonly source: string;
}

type TidalArchiveEnemyMetadata = Omit<TidalArchiveEnemyDefinition, 'id'>;

const TIDAL_ARCHIVE_ENEMY_METADATA = {
  'bubble-fin': {
    name: '泡鳍怪',
    artUrl: BATTLE_ART_URLS.bubbleFin,
    role: '贴线冲锋',
    counter: '优先集火，别让它贴近车体',
    source: '任意航线 · 第 1 波',
  },
  'needle-jelly': {
    name: '针水母',
    artUrl: BATTLE_ART_URLS.needleJelly,
    role: '远程针刺',
    counter: '利用齐射尽早削减远程火力',
    source: '任意航线 · 第 2 波',
  },
  'reef-crab': {
    name: '礁蟹',
    artUrl: BATTLE_ART_URLS.reefCrab,
    role: '护甲前排',
    counter: '先破防，再投入爆发伤害',
    source: '任意航线 · 第 3 波',
  },
  'tide-shell-hatchling': {
    name: '潮壳幼蟹',
    artUrl: BATTLE_ART_URLS.tideShellHatchling,
    role: '换道突进',
    counter: '留意换道路线并及时转移火力',
    source: '任意航线 · 第 1 波',
  },
  'lantern-ray': {
    name: '灯笼鳐',
    artUrl: BATTLE_ART_URLS.lanternRay,
    role: '蓄光远射',
    counter: '看到蓄光预警后优先打断',
    source: '任意航线 · 第 3 波',
  },
  'tide-parasite-snail': {
    name: '寄潮螺',
    artUrl: BATTLE_ART_URLS.tideParasiteSnail,
    role: '怪潮支援',
    counter: '先清除支援脉冲的源头',
    source: '任意航线 · 第 5 波',
  },
  'storm-ray-elite': {
    name: '雷鳐督军',
    artUrl: BATTLE_ART_URLS.stormRayElite,
    role: '精英冲锋',
    counter: '躲过冲锋后抓住暴露窗口',
    source: '精英潮头',
  },
  'deep-echo-boss': {
    name: '深海回响',
    artUrl: BATTLE_ART_URLS.deepEchoBoss,
    role: '多阶段 Boss',
    counter: '观察安全航道，并瞄准开放弱点',
    source: 'Boss 潮头',
  },
} as const satisfies Readonly<
  Record<TideBeastArchiveId, TidalArchiveEnemyMetadata>
>;

export const TIDAL_ARCHIVE_ENEMIES = Object.freeze(
  TIDE_BEAST_ARCHIVE_IDS.map((id) => Object.freeze({
    id,
    ...TIDAL_ARCHIVE_ENEMY_METADATA[id],
  })),
) satisfies readonly TidalArchiveEnemyDefinition[];

const SKILL_NAMES: Readonly<Record<BattleSkillId, string>> = {
  'tidal-volley': '潮汐齐射',
  'bubble-barrier': '泡泡屏障',
  'extreme-tide': '极潮爆发',
};

const MASTERY_MILESTONES = [1, 5, 10, 15] as const;

const SLOT_NAMES: Readonly<Record<EquipmentSlot, string>> = {
  cannon: '主炮',
  carriage: '车体',
  core: '动力核',
  instrument: '潮汐仪',
};

const SET_NAMES: Readonly<Record<EquipmentSetId, string>> = {
  'tide-guard': '潮泡守望',
  'coral-assault': '珊瑚突击',
};

const RARITY_NAMES: Readonly<Record<EquipmentRarity, string>> = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
};

export function equipmentModifierSummary(
  modifiers: PermanentStatModifiers,
): string {
  return [
    modifiers.maxHpFlat ? `生命 +${modifiers.maxHpFlat}` : '',
    modifiers.maxHpPercent ? `生命 +${modifiers.maxHpPercent * 100}%` : '',
    modifiers.damageFlat ? `伤害 +${modifiers.damageFlat}` : '',
    modifiers.damagePercent ? `伤害 +${modifiers.damagePercent * 100}%` : '',
    modifiers.gearsPercent ? `齿轮 +${modifiers.gearsPercent * 100}%` : '',
    modifiers.initialMomentum ? `动能 +${modifiers.initialMomentum}` : '',
    modifiers.repairFlat ? `维修 +${modifiers.repairFlat}` : '',
  ].filter(Boolean).join(' · ');
}

function skillForVariant(id: SkillVariantId): BattleSkillId {
  const skillId = BATTLE_SKILL_IDS.find((candidate) =>
    (SKILL_VARIANTS_BY_SKILL[candidate] as readonly SkillVariantId[])
      .includes(id));
  if (!skillId) throw new Error(`Unknown skill variant: ${id}`);
  return skillId;
}

export function buildTidalArchiveVariantCards(
  discoveredIds: readonly SkillVariantId[],
  masteryXp: Readonly<SkillMasteryXp>,
): readonly TidalArchiveVariantCard[] {
  const discovered = new Set(discoveredIds);
  return SKILL_VARIANT_IDS.map((id) => {
    const skillId = skillForVariant(id);
    const variants = SKILL_VARIANTS_BY_SKILL[skillId] as readonly SkillVariantId[];
    const requiredMasteryLevel = MASTERY_MILESTONES[variants.indexOf(id)]!;
    const copy = getBattleUpgradeCopy(id);
    const isDiscovered = discovered.has(id);
    return {
      id,
      discovered: isDiscovered,
      name: isDiscovered ? copy.name : '未发现进化',
      effect: isDiscovered ? copy.effect : '效果记录尚未解密',
      synergy: isDiscovered ? copy.synergy : '协同记录尚未解密',
      artUrl: BATTLE_VARIANT_GLYPH_URLS[id],
      skillId,
      skillName: SKILL_NAMES[skillId],
      requiredMasteryLevel,
      currentMasteryLevel: skillMasteryLevelFromXp(masteryXp[skillId] ?? 0),
      source: `${SKILL_NAMES[skillId]}精通 Lv.${requiredMasteryLevel}`,
    };
  });
}

export function buildTidalArchiveEquipmentCards(
  inventory: readonly EquipmentInstance[],
): readonly TidalArchiveEquipmentCard[] {
  const ownedDefinitionIds = new Set(inventory.map((item) => item.definitionId));
  return EQUIPMENT_CATALOG.map((definition) => {
    const discovered = ownedDefinitionIds.has(definition.id);
    return {
      id: definition.id,
      discovered,
      name: discovered ? definition.name : '未获得蓝图',
      effect: discovered
        ? equipmentModifierSummary(definition.baseModifiers)
        : '基础属性尚未解密',
      slotName: SLOT_NAMES[definition.slot],
      setName: SET_NAMES[definition.setId],
      rarityName: discovered ? RARITY_NAMES[definition.rarity] : '未鉴定',
      source: definition.setId === 'tide-guard'
        ? '初始装备'
        : '珊瑚突击装备组',
    };
  });
}
