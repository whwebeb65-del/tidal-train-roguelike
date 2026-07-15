export type BuildTag = 'mechanic' | 'fire' | 'healing' | 'sound' | 'illusion' | 'defense';

export interface PassengerDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly tags: readonly BuildTag[];
  readonly baseEffectId: string;
  readonly upgradeEffectId: string;
  readonly synergyIds: readonly string[];
}

export interface ModuleDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly category: 'attack' | 'defense' | 'repair' | 'control' | 'special';
  readonly effectId: string;
  readonly tags: readonly BuildTag[];
}

export interface PrototypeCatalog {
  readonly passengers: readonly PassengerDefinition[];
  readonly modules: readonly ModuleDefinition[];
}
