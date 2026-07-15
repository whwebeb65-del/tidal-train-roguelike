export interface Combatant {
  readonly id: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly shield: number;
}

export interface DamageResult {
  readonly target: Combatant;
  readonly absorbedByShield: number;
  readonly hpLost: number;
  readonly defeated: boolean;
}

export interface EnemySpawn {
  readonly id: string;
  readonly hp: number;
  readonly speed: number;
}
