export const BATTLE_SKILL_IDS = [
  'tidal-volley',
  'bubble-barrier',
  'extreme-tide',
] as const;
export type BattleSkillId = (typeof BATTLE_SKILL_IDS)[number];

export const SKILL_VARIANTS_BY_SKILL = {
  'tidal-volley': [
    'split-tide-arrow',
    'reef-piercer',
    'returning-volley',
    'rainstorm-school',
  ],
  'bubble-barrier': [
    'bursting-bubble',
    'reflective-spines',
    'overflow-membrane',
    'emergency-trigger',
  ],
  'extreme-tide': [
    'undertow-eye',
    'lingering-vortex',
    'energy-return',
    'double-crest',
  ],
} as const satisfies Readonly<Record<BattleSkillId, readonly string[]>>;

export const SKILL_VARIANT_IDS = [
  ...SKILL_VARIANTS_BY_SKILL['tidal-volley'],
  ...SKILL_VARIANTS_BY_SKILL['bubble-barrier'],
  ...SKILL_VARIANTS_BY_SKILL['extreme-tide'],
] as const;
export type SkillVariantId = (typeof SKILL_VARIANT_IDS)[number];
