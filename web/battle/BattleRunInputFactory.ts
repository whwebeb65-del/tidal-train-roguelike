import type {
  DailyTrialDefinition,
} from '../../src/domain/challenge/DailyTrialSystem';
import type {
  ProgressionSnapshot,
} from '../../src/domain/progression/ProgressionStatService';
import {
  getSquadBonuses,
  type SocialExpeditionState,
} from '../../src/domain/social/SocialExpeditionSystem';
import type { MapId } from '../../src/domain/station/MapProgression';
import type { RunMode } from '../app/AppTypes';
import type { BattleRunInput } from './BattleTypes';

const MAP_DIFFICULTY: Readonly<Record<MapId, {
  readonly hp: number;
  readonly damage: number;
}>> = {
  'drift-suburb': { hp: 0.85, damage: 0.72 },
  'old-port': { hp: 1.12, damage: 1.08 },
  'glass-city': { hp: 1.28, damage: 1.16 },
  'deep-tunnel': { hp: 1.48, damage: 1.25 },
};

export function createBattleRunInput(input: {
  readonly battleId: string;
  readonly seed: number;
  readonly mode: RunMode;
  readonly mapId: MapId;
  readonly progression: ProgressionSnapshot;
  readonly social: SocialExpeditionState;
  readonly dailyTrial: DailyTrialDefinition | null;
}): BattleRunInput {
  const squad = getSquadBonuses(input.social);
  const rule = input.dailyTrial?.rule;
  const difficulty = MAP_DIFFICULTY[input.mapId];

  return {
    battleId: input.battleId,
    seed: input.seed,
    mode: input.mode,
    mapId: input.mapId,
    maxTrainHp: Math.max(
      1,
      input.progression.maxPlayerHp
        + squad.maxPlayerHpBonus
        + (rule?.maxPlayerHpDelta ?? 0),
    ),
    mainCannonDamage: Math.max(
      0,
      Math.floor(
        (
          25
            + input.progression.damageFlat
            + squad.damageBonus
            + (rule?.damageBonus ?? 0)
        ) * input.progression.damageMultiplier,
      ),
    ),
    initialEnergy: Math.max(
      0,
      Math.min(
        100,
        input.progression.initialMomentum
          + squad.initialMomentum
          + (rule?.initialMomentumBonus ?? 0),
      ),
    ),
    repairBonus: input.progression.repairBonus,
    enemyHpFlatBonus: rule?.enemyHpBonus ?? 0,
    enemyHpMultiplier: difficulty.hp,
    enemyDamageMultiplier: difficulty.damage,
  };
}
