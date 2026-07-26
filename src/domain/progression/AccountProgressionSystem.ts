export type BattleSpeed = 1 | 1.5 | 2 | 3;

export interface AccountProgress {
  readonly level: number;
  readonly xp: number;
}

export interface AccountProgressResult extends AccountProgress {
  readonly levelsGained: number;
}

export interface BattleAccountXpInput {
  readonly normalKills: number;
  readonly eliteKills: number;
  readonly bossKills: number;
  readonly firstClear: boolean;
  readonly staminaSpent: number;
}

export function accountXpToNextLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return safe < 10
    ? 80 + 10 * (safe - 1)
    : 170 + 20 * (safe - 10);
}

export function grantAccountXp(
  current: AccountProgress,
  amount: number,
): AccountProgressResult {
  let level = Math.max(1, Math.floor(current.level));
  let xp = Math.max(0, Math.floor(current.xp))
    + Math.max(0, Math.floor(amount));
  let levelsGained = 0;

  while (xp >= accountXpToNextLevel(level)) {
    xp -= accountXpToNextLevel(level);
    level += 1;
    levelsGained += 1;
  }

  return { level, xp, levelsGained };
}

export function calculateBattleAccountXp(
  input: BattleAccountXpInput,
): Readonly<Record<keyof BattleAccountXpInput | 'total', number>> {
  const result = {
    normalKills: Math.max(0, Math.floor(input.normalKills)),
    eliteKills: Math.max(0, Math.floor(input.eliteKills)) * 15,
    bossKills: Math.max(0, Math.floor(input.bossKills)) * 30,
    firstClear: input.firstClear ? 120 : 0,
    staminaSpent: Math.max(0, Math.floor(input.staminaSpent)) * 10,
  };

  return {
    ...result,
    total: Object.values(result).reduce((total, value) => total + value, 0),
  };
}

export function availableBattleSpeeds(level: number): readonly BattleSpeed[] {
  if (level >= 30) return [1, 1.5, 2, 3];
  if (level >= 20) return [1, 1.5, 2];
  if (level >= 10) return [1, 1.5];
  return [1];
}

export function maximumBattleSpeed(level: number): BattleSpeed {
  return availableBattleSpeeds(level).at(-1) ?? 1;
}
