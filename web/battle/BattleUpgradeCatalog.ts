import type {
  BattleSkillId,
  BattleUpgradeId,
} from './BattleTypes';

export interface BattleUpgradeDefinition {
  readonly id: BattleUpgradeId;
  readonly kind: 'general' | 'skill-rank' | 'skill-variant';
  readonly skillId?: BattleSkillId;
  readonly maxLevel: number;
  readonly requiredRank?: number;
}

const definitions: readonly BattleUpgradeDefinition[] = [
  { id: 'multi-barrel', kind: 'general', maxLevel: 3 },
  { id: 'rapid-reload', kind: 'general', maxLevel: 3 },
  { id: 'coral-warhead', kind: 'general', maxLevel: 3 },
  { id: 'echo-chain', kind: 'general', maxLevel: 3 },
  { id: 'precision-lens', kind: 'general', maxLevel: 3 },
  { id: 'bubble-capacitor', kind: 'general', maxLevel: 3 },
  { id: 'tidal-resonance', kind: 'general', maxLevel: 3 },
  { id: 'magnetic-salvage', kind: 'general', maxLevel: 3 },
  { id: 'overload-core', kind: 'general', maxLevel: 3 },
  { id: 'rank-tidal-volley', kind: 'skill-rank', skillId: 'tidal-volley', maxLevel: 4 },
  { id: 'rank-bubble-barrier', kind: 'skill-rank', skillId: 'bubble-barrier', maxLevel: 4 },
  { id: 'rank-extreme-tide', kind: 'skill-rank', skillId: 'extreme-tide', maxLevel: 4 },
  { id: 'split-tide-arrow', kind: 'skill-variant', skillId: 'tidal-volley', maxLevel: 1, requiredRank: 2 },
  { id: 'reef-piercer', kind: 'skill-variant', skillId: 'tidal-volley', maxLevel: 1, requiredRank: 2 },
  { id: 'returning-volley', kind: 'skill-variant', skillId: 'tidal-volley', maxLevel: 1, requiredRank: 2 },
  { id: 'rainstorm-school', kind: 'skill-variant', skillId: 'tidal-volley', maxLevel: 1, requiredRank: 2 },
  { id: 'bursting-bubble', kind: 'skill-variant', skillId: 'bubble-barrier', maxLevel: 1, requiredRank: 2 },
  { id: 'reflective-spines', kind: 'skill-variant', skillId: 'bubble-barrier', maxLevel: 1, requiredRank: 2 },
  { id: 'overflow-membrane', kind: 'skill-variant', skillId: 'bubble-barrier', maxLevel: 1, requiredRank: 2 },
  { id: 'emergency-trigger', kind: 'skill-variant', skillId: 'bubble-barrier', maxLevel: 1, requiredRank: 2 },
  { id: 'undertow-eye', kind: 'skill-variant', skillId: 'extreme-tide', maxLevel: 1, requiredRank: 2 },
  { id: 'lingering-vortex', kind: 'skill-variant', skillId: 'extreme-tide', maxLevel: 1, requiredRank: 2 },
  { id: 'energy-return', kind: 'skill-variant', skillId: 'extreme-tide', maxLevel: 1, requiredRank: 2 },
  { id: 'double-crest', kind: 'skill-variant', skillId: 'extreme-tide', maxLevel: 1, requiredRank: 2 },
];

export const BATTLE_UPGRADE_DEFINITIONS = Object.fromEntries(
  definitions.map((definition) => [definition.id, definition]),
) as Readonly<Record<BattleUpgradeId, BattleUpgradeDefinition>>;

export function getBattleUpgradeDefinition(
  id: BattleUpgradeId,
): BattleUpgradeDefinition {
  return BATTLE_UPGRADE_DEFINITIONS[id];
}
