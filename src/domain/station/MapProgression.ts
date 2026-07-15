import type { PlayerSave } from '../../save/SaveRepository';

export type MapId = 'drift-suburb' | 'old-port' | 'glass-city' | 'deep-tunnel';

export interface MapDefinition {
  readonly id: MapId;
  readonly name: string;
  readonly minStationLevel: number;
  readonly feature: string;
}

export const MAP_PROGRESSION: readonly MapDefinition[] = [
  {
    id: 'drift-suburb',
    name: '漂流郊区',
    minStationLevel: 1,
    feature: '基础列车与自动战斗',
  },
  {
    id: 'old-port',
    name: '旧港口',
    minStationLevel: 3,
    feature: '维修工坊与第二条航线',
  },
  {
    id: 'glass-city',
    name: '玻璃城',
    minStationLevel: 5,
    feature: '乘客休息舱与固定种子挑战',
  },
  {
    id: 'deep-tunnel',
    name: '深海隧道',
    minStationLevel: 8,
    feature: '赛季挑战与高风险 Boss',
  },
];

function cloneSave(save: PlayerSave): PlayerSave {
  return {
    ...save,
    unlockedPassengerIds: [...save.unlockedPassengerIds],
    unlockedModuleIds: [...save.unlockedModuleIds],
    unlockedMapIds: [...save.unlockedMapIds],
    firstClearMapIds: [...save.firstClearMapIds],
    claimedInteractionIds: [...save.claimedInteractionIds],
  };
}

function hasId(ids: readonly string[], id: string): boolean {
  return ids.includes(id);
}

function getMapOrThrow(mapId: MapId): MapDefinition {
  const definition = MAP_PROGRESSION.find((map) => map.id === mapId);
  if (!definition) {
    throw new Error(`Unknown map: ${mapId}`);
  }
  return definition;
}

export function getMapDefinition(mapId: MapId): MapDefinition {
  return getMapOrThrow(mapId);
}

export function isMapUnlocked(save: PlayerSave, mapId: MapId): boolean {
  return hasId(save.unlockedMapIds, mapId);
}

export function canUnlockMap(save: PlayerSave, mapId: MapId): boolean {
  const map = getMapOrThrow(mapId);
  return save.stationLevel >= map.minStationLevel && !isMapUnlocked(save, mapId);
}

export function unlockMap(save: PlayerSave, mapId: MapId): PlayerSave {
  if (isMapUnlocked(save, mapId)) {
    return cloneSave(save);
  }
  if (!canUnlockMap(save, mapId)) {
    throw new Error(`Station level is too low to unlock ${mapId}`);
  }
  return {
    ...cloneSave(save),
    unlockedMapIds: [...save.unlockedMapIds, mapId],
  };
}

export function unlockPassenger(save: PlayerSave, passengerId: string): PlayerSave {
  if (hasId(save.unlockedPassengerIds, passengerId)) {
    return cloneSave(save);
  }
  return {
    ...cloneSave(save),
    unlockedPassengerIds: [...save.unlockedPassengerIds, passengerId],
  };
}

export function unlockModule(save: PlayerSave, moduleId: string): PlayerSave {
  if (hasId(save.unlockedModuleIds, moduleId)) {
    return cloneSave(save);
  }
  return {
    ...cloneSave(save),
    unlockedModuleIds: [...save.unlockedModuleIds, moduleId],
  };
}

export function upgradeStation(save: PlayerSave, nextLevel = save.stationLevel + 1): PlayerSave {
  if (!Number.isInteger(nextLevel) || nextLevel <= save.stationLevel) {
    throw new Error('Station level must increase by a positive integer');
  }
  return {
    ...cloneSave(save),
    stationLevel: nextLevel,
  };
}

