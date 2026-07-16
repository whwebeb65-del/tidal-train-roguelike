import type { RewardCurrency } from '../../src/domain/reward/InteractionRewardService';
import type { RunMode } from '../app/AppTypes';

export type BattleInteractionActionId =
  | 'salvage-a'
  | 'aid-b'
  | 'signal-c';

export interface BattleInteractionDefinition {
  readonly actionId: BattleInteractionActionId;
  readonly label: string;
  readonly currency: RewardCurrency;
  readonly currencyLabel: string;
  readonly amount: number;
  readonly maxClaims: number;
  readonly visibleFromMs: number;
  readonly visibleUntilMs: number;
}

export interface AvailableBattleInteraction
  extends BattleInteractionDefinition {
  readonly attempt: number;
}

export type BattleInteractionClaims = Readonly<
  Partial<Record<BattleInteractionActionId, number>>
>;

export const BATTLE_INTERACTIONS:
readonly BattleInteractionDefinition[] = [
  {
    actionId: 'salvage-a',
    label: '打捞漂流信标',
    currency: 'gears',
    currencyLabel: '齿轮',
    amount: 8,
    maxClaims: 2,
    visibleFromMs: 18_000,
    visibleUntilMs: 80_000,
  },
  {
    actionId: 'aid-b',
    label: '援助漂流者',
    currency: 'routeMarks',
    currencyLabel: '航线徽记',
    amount: 1,
    maxClaims: 1,
    visibleFromMs: 70_000,
    visibleUntilMs: 115_000,
  },
  {
    actionId: 'signal-c',
    label: '点亮潮汐信号',
    currency: 'gears',
    currencyLabel: '齿轮',
    amount: 12,
    maxClaims: 1,
    visibleFromMs: 110_000,
    visibleUntilMs: 150_000,
  },
];

export function getAvailableBattleInteractions(
  elapsedMs: number,
  claims: BattleInteractionClaims,
  mode: RunMode,
): readonly AvailableBattleInteraction[] {
  if (mode !== 'normal' || !Number.isFinite(elapsedMs)) return [];

  for (const definition of BATTLE_INTERACTIONS) {
    const attempt = Math.max(
      0,
      Math.floor(claims[definition.actionId] ?? 0),
    );
    if (
      elapsedMs < definition.visibleFromMs
      || elapsedMs > definition.visibleUntilMs
      || attempt >= definition.maxClaims
    ) {
      continue;
    }
    return [{ ...definition, attempt }];
  }
  return [];
}
