import {
  BATTLE_SKILL_IDS,
  SKILL_VARIANTS_BY_SKILL,
  type BattleSkillId,
  type SkillVariantId,
} from '../skill/SkillProgressionTypes';

export type SkillMasteryXp = Record<BattleSkillId, number>;
export type SkillCastCounts = Record<BattleSkillId, number>;

const MAX_LEVEL = 20;
const CAST_XP: Readonly<Record<BattleSkillId, number>> = {
  'tidal-volley': 5,
  'bubble-barrier': 5,
  'extreme-tide': 10,
};
const CAST_XP_CAP = 60;
const FIRST_CLEAR_XP = 40;
const MILESTONES = [1, 5, 10, 15] as const;

export function createSkillMasteryXp(): SkillMasteryXp {
  return Object.fromEntries(
    BATTLE_SKILL_IDS.map((id) => [id, 0]),
  ) as SkillMasteryXp;
}

export function skillMasteryLevelFromXp(totalXp: number): number {
  let remaining = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (level < MAX_LEVEL) {
    const required = 20 + 8 * (level - 1);
    if (remaining < required) break;
    remaining -= required;
    level += 1;
  }
  return level;
}

export function skillMasteryPowerMultiplier(level: number): number {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return 1 + 0.0075 * (safeLevel - 1);
}

export function unlockedSkillVariants(
  skillId: BattleSkillId,
  level: number,
): readonly SkillVariantId[] {
  const count = MILESTONES.filter((milestone) => level >= milestone).length;
  return SKILL_VARIANTS_BY_SKILL[skillId].slice(0, count);
}

export function settleSkillMastery(
  currentXp: Readonly<SkillMasteryXp>,
  input: {
    readonly castCounts: Readonly<SkillCastCounts>;
    readonly firstClear: boolean;
  },
): {
  readonly nextXp: SkillMasteryXp;
  readonly gainedXp: SkillMasteryXp;
} {
  const gainedXp = createSkillMasteryXp();
  const nextXp = createSkillMasteryXp();
  for (const skillId of BATTLE_SKILL_IDS) {
    const casts = Math.max(0, Math.floor(input.castCounts[skillId] ?? 0));
    const castGain = Math.min(CAST_XP_CAP, casts * CAST_XP[skillId]);
    const firstClearGain = input.firstClear && casts > 0 ? FIRST_CLEAR_XP : 0;
    gainedXp[skillId] = castGain + firstClearGain;
    nextXp[skillId] = Math.max(
      0,
      Math.floor(currentXp[skillId] ?? 0),
    ) + gainedXp[skillId];
  }
  return { nextXp, gainedXp };
}
