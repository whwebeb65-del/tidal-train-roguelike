export interface PlayerSave {
  readonly version: 1;
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
  readonly stationLevel: number;
  readonly unlockedPassengerIds: readonly string[];
  readonly unlockedModuleIds: readonly string[];
  readonly unlockedMapIds: readonly string[];
  readonly firstClearMapIds: readonly string[];
  readonly claimedInteractionIds: readonly string[];
}

export interface SaveRepository {
  load(): PlayerSave;
  save(next: PlayerSave): void;
}

export function defaultSave(): PlayerSave {
  return {
    version: 1,
    gears: 0,
    routeMarks: 0,
    starTickets: 0,
    stationLevel: 1,
    unlockedPassengerIds: [],
    unlockedModuleIds: [],
    unlockedMapIds: ['drift-suburb'],
    firstClearMapIds: [],
    claimedInteractionIds: [],
  };
}

function cloneSave(save: PlayerSave): PlayerSave {
  return {
    version: 1,
    gears: save.gears,
    routeMarks: save.routeMarks,
    starTickets: save.starTickets,
    stationLevel: save.stationLevel,
    unlockedPassengerIds: [...save.unlockedPassengerIds],
    unlockedModuleIds: [...save.unlockedModuleIds],
    unlockedMapIds: [...save.unlockedMapIds],
    firstClearMapIds: [...save.firstClearMapIds],
    claimedInteractionIds: [...save.claimedInteractionIds],
  };
}

function validateSave(save: PlayerSave): void {
  if (save.version !== 1) {
    throw new Error('Unsupported save version');
  }
  if (!Number.isFinite(save.gears) || save.gears < 0) {
    throw new Error('Gears cannot be negative');
  }
  if (!Number.isFinite(save.routeMarks) || save.routeMarks < 0) {
    throw new Error('Route marks cannot be negative');
  }
  if (!Number.isFinite(save.starTickets) || save.starTickets < 0) {
    throw new Error('Star tickets cannot be negative');
  }
  if (!Number.isInteger(save.stationLevel) || save.stationLevel < 1) {
    throw new Error('Station level must be a positive integer');
  }
  if (!save.unlockedPassengerIds.every((id) => typeof id === 'string')) {
    throw new Error('Passenger IDs must be strings');
  }
  if (!save.unlockedModuleIds.every((id) => typeof id === 'string')) {
    throw new Error('Module IDs must be strings');
  }
  if (!save.unlockedMapIds.every((id) => typeof id === 'string')) {
    throw new Error('Map IDs must be strings');
  }
  if (!save.firstClearMapIds.every((id) => typeof id === 'string')) {
    throw new Error('First-clear map IDs must be strings');
  }
  if (!save.claimedInteractionIds.every((id) => typeof id === 'string')) {
    throw new Error('Interaction claim IDs must be strings');
  }
}

export function createMemorySaveRepository(initial: PlayerSave = defaultSave()): SaveRepository {
  validateSave(initial);
  let current = cloneSave(initial);
  return {
    load(): PlayerSave {
      return cloneSave(current);
    },
    save(next: PlayerSave): void {
      validateSave(next);
      current = cloneSave(next);
    },
  };
}
