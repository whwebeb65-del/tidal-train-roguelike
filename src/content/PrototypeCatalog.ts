import type { ModuleDefinition, PassengerDefinition, PrototypeCatalog } from './ContentTypes';

const passengers: readonly PassengerDefinition[] = [
  {
    id: 'mechanic',
    displayName: '机械师',
    tags: ['mechanic'],
    baseEffectId: 'repair-turret',
    upgradeEffectId: 'repair-turret-plus',
    synergyIds: ['repair-drone'],
  },
  {
    id: 'firefighter',
    displayName: '消防员',
    tags: ['fire', 'defense'],
    baseEffectId: 'steam-shield',
    upgradeEffectId: 'steam-shield-plus',
    synergyIds: ['steam-fire'],
  },
  {
    id: 'chef',
    displayName: '蒸汽厨师',
    tags: ['fire', 'healing'],
    baseEffectId: 'hot-soup',
    upgradeEffectId: 'hot-soup-plus',
    synergyIds: ['steam-fire'],
  },
  {
    id: 'doctor',
    displayName: '夜班医生',
    tags: ['healing', 'defense'],
    baseEffectId: 'field-care',
    upgradeEffectId: 'field-care-plus',
    synergyIds: ['repair-drone'],
  },
  {
    id: 'violinist',
    displayName: '小提琴手',
    tags: ['sound', 'healing'],
    baseEffectId: 'sonic-wave',
    upgradeEffectId: 'sonic-wave-plus',
    synergyIds: ['sound-copy'],
  },
  {
    id: 'magician',
    displayName: '街头魔术师',
    tags: ['illusion', 'sound'],
    baseEffectId: 'mirror-decoy',
    upgradeEffectId: 'mirror-decoy-plus',
    synergyIds: ['sound-copy'],
  },
  {
    id: 'repairer',
    displayName: '轨道维修工',
    tags: ['mechanic', 'healing'],
    baseEffectId: 'quick-repair',
    upgradeEffectId: 'quick-repair-plus',
    synergyIds: ['repair-drone'],
  },
  {
    id: 'poet',
    displayName: '失眠诗人',
    tags: ['sound', 'illusion'],
    baseEffectId: 'echo-verse',
    upgradeEffectId: 'echo-verse-plus',
    synergyIds: ['sound-copy'],
  },
];

const modules: readonly ModuleDefinition[] = [
  { id: 'steam-cannon', displayName: '蒸汽炮', category: 'attack', effectId: 'steam-cannon', tags: ['fire', 'mechanic'] },
  { id: 'sound-mirror', displayName: '回声镜', category: 'special', effectId: 'sound-mirror', tags: ['sound', 'illusion'] },
  { id: 'repair-drone', displayName: '维修无人机', category: 'repair', effectId: 'repair-drone', tags: ['mechanic', 'healing'] },
  { id: 'shield-plating', displayName: '护盾装甲', category: 'defense', effectId: 'shield-plating', tags: ['defense'] },
  { id: 'med-kit', displayName: '车厢急救包', category: 'repair', effectId: 'med-kit', tags: ['healing'] },
  { id: 'fire-sprinkler', displayName: '火焰喷淋器', category: 'control', effectId: 'fire-sprinkler', tags: ['fire', 'defense'] },
  { id: 'echo-horn', displayName: '回声号角', category: 'control', effectId: 'echo-horn', tags: ['sound'] },
  { id: 'decoy-car', displayName: '幻象车厢', category: 'special', effectId: 'decoy-car', tags: ['illusion'] },
  { id: 'magnet-crane', displayName: '磁力吊机', category: 'special', effectId: 'magnet-crane', tags: ['mechanic'] },
  { id: 'water-saw', displayName: '潮水锯', category: 'attack', effectId: 'water-saw', tags: ['mechanic', 'fire'] },
  { id: 'foam-wall', displayName: '泡沫墙', category: 'defense', effectId: 'foam-wall', tags: ['defense', 'healing'] },
  { id: 'signal-lamp', displayName: '信号灯', category: 'control', effectId: 'signal-lamp', tags: ['sound', 'defense'] },
];

export function getPrototypeCatalog(): PrototypeCatalog {
  return {
    passengers: passengers.map((item) => ({ ...item, tags: [...item.tags], synergyIds: [...item.synergyIds] })),
    modules: modules.map((item) => ({ ...item, tags: [...item.tags] })),
  };
}
