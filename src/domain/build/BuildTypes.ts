import type { BuildTag, ModuleDefinition, PassengerDefinition } from '../../content/ContentTypes';

export interface BuildState {
  readonly passengers: readonly PassengerDefinition[];
  readonly modules: readonly ModuleDefinition[];
  readonly activeTags: readonly BuildTag[];
}

export interface SynergyEffect {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly power: number;
}
