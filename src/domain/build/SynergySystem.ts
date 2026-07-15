import type { BuildTag, ModuleDefinition, PassengerDefinition } from '../../content/ContentTypes';
import type { BuildState, SynergyEffect } from './BuildTypes';

interface SynergyRule {
  readonly requiredTags: readonly BuildTag[];
  readonly requiredModuleIds: readonly string[];
  readonly effect: SynergyEffect;
}

const synergyRules: readonly SynergyRule[] = [
  {
    requiredTags: ['fire'],
    requiredModuleIds: ['steam-cannon'],
    effect: {
      id: 'steam-fire',
      displayName: '蒸汽火焰',
      description: '火焰乘客让蒸汽炮在命中时留下灼热区域。',
      power: 1,
    },
  },
  {
    requiredTags: ['sound'],
    requiredModuleIds: ['sound-mirror'],
    effect: {
      id: 'sound-copy',
      displayName: '声波复制',
      description: '声波技能命中后复制一次较弱的回声攻击。',
      power: 1,
    },
  },
  {
    requiredTags: ['mechanic', 'healing'],
    requiredModuleIds: ['repair-drone'],
    effect: {
      id: 'repair-drone',
      displayName: '维修无人机',
      description: '机械与治疗乘客会把维修效果转化为跟随无人机。',
      power: 1,
    },
  },
];

function recomputeTags(passengers: readonly PassengerDefinition[], modules: readonly ModuleDefinition[]): readonly BuildTag[] {
  return [...new Set([
    ...passengers.flatMap((item) => item.tags),
    ...modules.flatMap((item) => item.tags),
  ])];
}

export function addPassenger(build: BuildState, passenger: PassengerDefinition): BuildState {
  if (build.passengers.some((item) => item.id === passenger.id)) {
    return build;
  }

  const passengers = [...build.passengers, passenger];
  return {
    passengers,
    modules: [...build.modules],
    activeTags: recomputeTags(passengers, build.modules),
  };
}

export function addModule(build: BuildState, module: ModuleDefinition): BuildState {
  if (build.modules.some((item) => item.id === module.id)) {
    return build;
  }

  const modules = [...build.modules, module];
  return {
    passengers: [...build.passengers],
    modules,
    activeTags: recomputeTags(build.passengers, modules),
  };
}

export function getActiveSynergies(build: BuildState): readonly SynergyEffect[] {
  const tags = new Set(build.activeTags);
  const moduleIds = new Set(build.modules.map((item) => item.id));
  return synergyRules
    .filter((rule) => rule.requiredTags.every((tag) => tags.has(tag)))
    .filter((rule) => rule.requiredModuleIds.every((id) => moduleIds.has(id)))
    .map((rule) => rule.effect);
}
