import {
  SKILL_VARIANT_IDS,
  type BattleSkillId,
  type SkillVariantId,
} from '../../src/domain/skill/SkillProgressionTypes';

export type SkillEvolutionParticleKind =
  | 'split-chevron'
  | 'coral-pierce'
  | 'returning-arc'
  | 'rainstorm-fin'
  | 'bubble-fracture'
  | 'reflection'
  | 'overflow-droplet'
  | 'emergency-beacon'
  | 'undertow-eye'
  | 'extreme-vortex'
  | 'energy-return'
  | 'second-crest';

export interface SkillEvolutionVisualSignature {
  readonly id: SkillVariantId;
  readonly skillId: BattleSkillId;
  readonly primary: string;
  readonly secondary: string;
  readonly particleKind: SkillEvolutionParticleKind;
  readonly reducedMotionRingKind: 'static-skill-silhouette';
}

const REDUCED_MOTION_RING_KIND = 'static-skill-silhouette' as const;

const INPUT = {
  'split-tide-arrow': ['tidal-volley', '#59e9ff', '#f1ffff', 'split-chevron'],
  'reef-piercer': ['tidal-volley', '#ff8d73', '#ffe6ad', 'coral-pierce'],
  'returning-volley': ['tidal-volley', '#746fff', '#9df6ff', 'returning-arc'],
  'rainstorm-school': ['tidal-volley', '#4ecfff', '#d9fbff', 'rainstorm-fin'],
  'bursting-bubble': ['bubble-barrier', '#ff735f', '#ffd58a', 'bubble-fracture'],
  'reflective-spines': ['bubble-barrier', '#f5d77b', '#fff5bd', 'reflection'],
  'overflow-membrane': ['bubble-barrier', '#67efc3', '#f0ffe0', 'overflow-droplet'],
  'emergency-trigger': ['bubble-barrier', '#ff6f68', '#fff1a4', 'emergency-beacon'],
  'undertow-eye': ['extreme-tide', '#456fe8', '#78e8ff', 'undertow-eye'],
  'lingering-vortex': ['extreme-tide', '#9877ff', '#d8c6ff', 'extreme-vortex'],
  'energy-return': ['extreme-tide', '#71f3c0', '#eaffc8', 'energy-return'],
  'double-crest': ['extreme-tide', '#ffb77d', '#fff0a8', 'second-crest'],
} as const satisfies Readonly<Record<
  SkillVariantId,
  readonly [BattleSkillId, string, string, SkillEvolutionParticleKind]
>>;

export const SKILL_EVOLUTION_VISUAL_SIGNATURES: Readonly<Record<
  SkillVariantId,
  SkillEvolutionVisualSignature
>> = Object.freeze(
  Object.fromEntries(SKILL_VARIANT_IDS.map((id) => {
    const input = INPUT[id];
    if (input === undefined) {
      throw new Error(`Missing visual signature for evolution: ${id}`);
    }
    const [skillId, primary, secondary, particleKind] = input;
    return [id, Object.freeze({
      id,
      skillId,
      primary,
      secondary,
      particleKind,
      reducedMotionRingKind: REDUCED_MOTION_RING_KIND,
    })];
  })) as Record<SkillVariantId, SkillEvolutionVisualSignature>,
);

export function getSkillEvolutionVisualSignature(
  id: SkillVariantId,
): SkillEvolutionVisualSignature {
  return SKILL_EVOLUTION_VISUAL_SIGNATURES[id];
}
