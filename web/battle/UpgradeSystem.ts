import { UPGRADE_IDS } from './BattleConfig';
import { SeededRandom } from './SeededRandom';
import type {
  BattleModifiers,
  BattleUpgradeId,
} from './BattleTypes';

export interface UpgradeApplyResult {
  readonly accepted: boolean;
  readonly modifiers: BattleModifiers;
  readonly levels: Record<BattleUpgradeId, number>;
}

export function createUpgradeOffer(
  seed: number,
  checkpoint: number,
  levels: Readonly<Record<BattleUpgradeId, number>>,
  roll = 0,
): readonly BattleUpgradeId[] {
  const candidates = UPGRADE_IDS.filter((id) => levels[id] < 3);
  const random = new SeededRandom(
    seed
      ^ Math.imul(checkpoint, 0x9e3779b1)
      ^ Math.imul(roll, 0x85ebca6b),
  );
  const offer: BattleUpgradeId[] = [];
  while (offer.length < 3 && candidates.length > 0) {
    const index = random.int(0, candidates.length - 1);
    offer.push(candidates.splice(index, 1)[0] as BattleUpgradeId);
  }
  return offer;
}

export function applyUpgrade(
  current: BattleModifiers,
  currentLevels: Readonly<Record<BattleUpgradeId, number>>,
  upgradeId: BattleUpgradeId,
): UpgradeApplyResult {
  if (currentLevels[upgradeId] >= 3) {
    return {
      accepted: false,
      modifiers: { ...current },
      levels: { ...currentLevels },
    };
  }

  const modifiers = { ...current };
  if (upgradeId === 'multi-barrel') {
    modifiers.mainProjectileCount += 1;
    modifiers.mainProjectileDamageMultiplier = 0.72;
  }
  if (upgradeId === 'rapid-reload') {
    modifiers.reloadMultiplier -= 0.12;
  }
  if (upgradeId === 'coral-warhead') {
    modifiers.splashRadius = 54;
    modifiers.splashDamageMultiplier += 0.35;
  }
  if (upgradeId === 'echo-chain') {
    modifiers.chainCount += 1;
    modifiers.chainDamageMultiplier = 0.45;
  }
  if (upgradeId === 'precision-lens') {
    modifiers.criticalChance += 0.08;
  }
  if (upgradeId === 'bubble-capacitor') {
    modifiers.barrierShieldMultiplier += 0.25;
    modifiers.barrierHealPercent += 0.04;
  }
  if (upgradeId === 'tidal-resonance') {
    modifiers.activeCooldownMultiplier -= 0.15;
  }
  if (upgradeId === 'magnetic-salvage') {
    modifiers.lootAttractMultiplier += 0.4;
    modifiers.experienceMultiplier += 0.1;
  }
  if (upgradeId === 'overload-core') {
    modifiers.energyGainMultiplier += 0.25;
    modifiers.extremeDamageMultiplier += 0.2;
  }

  return {
    accepted: true,
    modifiers,
    levels: {
      ...currentLevels,
      [upgradeId]: currentLevels[upgradeId] + 1,
    },
  };
}
