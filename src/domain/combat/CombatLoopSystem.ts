export type CombatAction = 'attack' | 'skill' | 'repair' | 'burst';
export type TideModifier = 'calm-water' | 'surge-current' | 'echo-fog';

export interface CombatLoopState {
  readonly enemyHp: number;
  readonly enemyMaxHp: number;
  readonly playerHp: number;
  readonly maxPlayerHp: number;
  readonly momentum: number;
  readonly combo: number;
  readonly repairUsed: boolean;
  readonly burstUsed: boolean;
  readonly modifier: TideModifier;
}

export interface CombatLoopOptions {
  readonly enemyHp: number;
  readonly maxPlayerHp?: number;
  readonly playerHp?: number;
  readonly modifier?: TideModifier;
  readonly initialMomentum?: number;
  readonly initialCombo?: number;
}

export interface CombatActionOptions {
  readonly skillAvailable: boolean;
  readonly damageBonus?: number;
  readonly damageMultiplier?: number;
  readonly repairBonus?: number;
}

export interface CombatActionResult {
  readonly accepted: boolean;
  readonly reason?: 'enemy-defeated' | 'skill-unavailable' | 'repair-used' | 'momentum-not-ready' | 'burst-used';
  readonly state: CombatLoopState;
  readonly damageDealt: number;
  readonly hpRestored: number;
  readonly momentumGained: number;
  readonly defeated: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function positiveOrThrow(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return value;
}

function rejected(
  state: CombatLoopState,
  reason: NonNullable<CombatActionResult['reason']>,
): CombatActionResult {
  return {
    accepted: false,
    reason,
    state,
    damageDealt: 0,
    hpRestored: 0,
    momentumGained: 0,
    defeated: state.enemyHp <= 0,
  };
}

export function createCombatLoopState(options: CombatLoopOptions): CombatLoopState {
  const enemyMaxHp = positiveOrThrow(options.enemyHp, 'Enemy HP');
  const maxPlayerHp = positiveOrThrow(options.maxPlayerHp ?? 100, 'Max player HP');
  return {
    enemyHp: enemyMaxHp,
    enemyMaxHp,
    playerHp: clamp(options.playerHp ?? maxPlayerHp, 0, maxPlayerHp),
    maxPlayerHp,
    momentum: clamp(options.initialMomentum ?? 0, 0, 100),
    combo: Math.max(0, Math.floor(options.initialCombo ?? 0)),
    repairUsed: false,
    burstUsed: false,
    modifier: options.modifier ?? 'calm-water',
  };
}

export function resolveCombatAction(
  state: CombatLoopState,
  action: CombatAction,
  options: CombatActionOptions,
): CombatActionResult {
  const damageBonus = options.damageBonus ?? 0;
  const damageMultiplier = options.damageMultiplier ?? 1;
  const repairBonus = options.repairBonus ?? 0;
  if (!Number.isFinite(damageBonus) || damageBonus < 0) {
    throw new Error('Damage bonus must be a finite non-negative number');
  }
  if (!Number.isFinite(damageMultiplier) || damageMultiplier < 1) {
    throw new Error('Damage multiplier must be a finite number of at least 1');
  }
  if (!Number.isFinite(repairBonus) || repairBonus < 0) {
    throw new Error('Repair bonus must be a finite non-negative number');
  }
  if (state.enemyHp <= 0) return rejected(state, 'enemy-defeated');
  if (action === 'skill' && !options.skillAvailable) return rejected(state, 'skill-unavailable');
  if (action === 'repair' && state.repairUsed) return rejected(state, 'repair-used');
  if (action === 'burst' && state.burstUsed) return rejected(state, 'burst-used');
  if (action === 'burst' && state.momentum < 100) return rejected(state, 'momentum-not-ready');

  const comboBonus = Math.min(state.combo, 5) * 2;
  let rawDamage = 0;
  let rawHeal = 0;
  let momentumGained = 0;
  let combo = state.combo;
  let repairUsed = state.repairUsed;
  let burstUsed = state.burstUsed;

  if (action === 'attack') {
    rawDamage = (state.modifier === 'surge-current' ? 30 : 25) + comboBonus;
    momentumGained = 25;
    combo = Math.min(20, state.combo + 1);
  }
  if (action === 'skill') {
    rawDamage = (state.modifier === 'echo-fog' ? 60 : 50) + comboBonus;
    momentumGained = 40;
    combo = Math.min(20, state.combo + 2);
  }
  if (action === 'repair') {
    rawHeal = state.modifier === 'calm-water' ? 24 : 18;
    momentumGained = -15;
    combo = 0;
    repairUsed = true;
  }
  if (action === 'burst') {
    rawDamage = 60;
    momentumGained = -state.momentum;
    combo = 0;
    burstUsed = true;
  }

  if (rawDamage > 0) {
    rawDamage = Math.floor((rawDamage + damageBonus) * damageMultiplier);
  }
  if (rawHeal > 0) {
    rawHeal += repairBonus;
  }

  const damageDealt = Math.min(state.enemyHp, rawDamage);
  const hpRestored = Math.min(state.maxPlayerHp - state.playerHp, rawHeal);
  const nextState: CombatLoopState = {
    ...state,
    enemyHp: state.enemyHp - damageDealt,
    playerHp: state.playerHp + hpRestored,
    momentum: clamp(state.momentum + momentumGained, 0, 100),
    combo,
    repairUsed,
    burstUsed,
  };
  return {
    accepted: true,
    state: nextState,
    damageDealt,
    hpRestored,
    momentumGained,
    defeated: nextState.enemyHp <= 0,
  };
}

export function receiveDamage(state: CombatLoopState, amount: number): CombatLoopState {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Damage must be a finite non-negative number');
  }
  return {
    ...state,
    playerHp: clamp(state.playerHp - amount, 0, state.maxPlayerHp),
  };
}

export function getTideModifierLabel(modifier: TideModifier): { readonly name: string; readonly effect: string } {
  if (modifier === 'surge-current') {
    return { name: '急流冲刺', effect: '普通攻击伤害 +5' };
  }
  if (modifier === 'echo-fog') {
    return { name: '回声浓雾', effect: '技能伤害 +10' };
  }
  return { name: '平静水域', effect: '维修恢复 +6' };
}
