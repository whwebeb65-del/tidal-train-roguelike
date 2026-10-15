import type { BattleFrameView, BattleGeneralUpgradeId, BattleSkillId, BattleUpgradeId } from './BattleTypes';
import { getBattleUpgradeDefinition } from './BattleUpgradeCatalog';
import { getBattleUpgradeCopy } from './BattleUpgradeCopy';

export type BuildFamily = 'cannon' | 'volley' | 'barrier' | 'tide' | 'growth';

const GENERAL_FAMILIES: Readonly<Record<BattleGeneralUpgradeId, BuildFamily>> = {
  'multi-barrel': 'cannon',
  'rapid-reload': 'cannon',
  'coral-warhead': 'cannon',
  'echo-chain': 'cannon',
  'precision-lens': 'cannon',
  'bubble-capacitor': 'barrier',
  'tidal-resonance': 'volley',
  'magnetic-salvage': 'growth',
  'overload-core': 'tide',
};

const SKILL_FAMILIES: Readonly<Record<BattleSkillId, BuildFamily>> = {
  'tidal-volley': 'volley',
  'bubble-barrier': 'barrier',
  'extreme-tide': 'tide',
};

const FAMILY_LABELS: Readonly<Record<BuildFamily, string>> = {
  cannon: '主炮火力', volley: '鱼群齐射', barrier: '屏障续航', tide: '极潮爆发', growth: '经验成长',
};

// These pairs describe real complementary effects, not a new combat bonus.
const CONNECTIONS: Partial<Readonly<Record<BattleUpgradeId, readonly BattleUpgradeId[]>>> = {
  'multi-barrel': ['precision-lens', 'coral-warhead'],
  'rapid-reload': ['multi-barrel', 'precision-lens'],
  'coral-warhead': ['undertow-eye', 'multi-barrel'],
  'echo-chain': ['precision-lens', 'rapid-reload'],
  'precision-lens': ['multi-barrel', 'rapid-reload'],
  'bubble-capacitor': ['overflow-membrane', 'bursting-bubble', 'rank-bubble-barrier'],
  'tidal-resonance': ['rank-tidal-volley', 'rank-bubble-barrier'],
  'overload-core': ['energy-return', 'double-crest', 'rank-extreme-tide'],
  'split-tide-arrow': ['rank-tidal-volley', 'tidal-resonance'],
  'reef-piercer': ['rank-tidal-volley', 'tidal-resonance'],
  'returning-volley': ['rank-tidal-volley', 'tidal-resonance'],
  'rainstorm-school': ['tidal-resonance', 'rank-tidal-volley'],
  'bursting-bubble': ['bubble-capacitor', 'tidal-resonance'],
  'reflective-spines': ['bubble-capacitor', 'rank-bubble-barrier'],
  'overflow-membrane': ['bubble-capacitor', 'rank-bubble-barrier'],
  'emergency-trigger': ['bubble-capacitor', 'rank-bubble-barrier'],
  'undertow-eye': ['coral-warhead', 'lingering-vortex'],
  'lingering-vortex': ['undertow-eye', 'overload-core'],
  'energy-return': ['overload-core', 'rank-extreme-tide'],
  'double-crest': ['overload-core', 'undertow-eye'],
  'rank-tidal-volley': ['split-tide-arrow', 'reef-piercer', 'tidal-resonance'],
  'rank-bubble-barrier': ['bubble-capacitor', 'overflow-membrane'],
  'rank-extreme-tide': ['overload-core', 'lingering-vortex'],
};

export function getUpgradeBuildGuide(id: BattleUpgradeId, frame: BattleFrameView): {
  readonly family: BuildFamily;
  readonly familyLabel: string;
  readonly connection: string | null;
} {
  const definition = getBattleUpgradeDefinition(id);
  const family = definition.skillId
    ? SKILL_FAMILIES[definition.skillId]
    : GENERAL_FAMILIES[id as BattleGeneralUpgradeId];
  const connected = CONNECTIONS[id]?.find((candidate) => frame.upgradeLevels[candidate] > 0);
  return {
    family,
    familyLabel: id === 'tidal-resonance' ? '技能循环' : FAMILY_LABELS[family],
    connection: connected ? `搭配已装的「${getBattleUpgradeCopy(connected).name}」` : null,
  };
}
