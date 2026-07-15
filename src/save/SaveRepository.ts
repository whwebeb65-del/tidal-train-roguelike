export interface PlayerSave {
  readonly version: 1;
  readonly gears: number;
  readonly unlockedPassengerIds: readonly string[];
  readonly unlockedModuleIds: readonly string[];
}

export interface SaveRepository {
  load(): PlayerSave;
  save(next: PlayerSave): void;
}

export function defaultSave(): PlayerSave {
  return {
    version: 1,
    gears: 0,
    unlockedPassengerIds: [],
    unlockedModuleIds: [],
  };
}

function cloneSave(save: PlayerSave): PlayerSave {
  return {
    version: 1,
    gears: save.gears,
    unlockedPassengerIds: [...save.unlockedPassengerIds],
    unlockedModuleIds: [...save.unlockedModuleIds],
  };
}

function validateSave(save: PlayerSave): void {
  if (save.version !== 1) {
    throw new Error('Unsupported save version');
  }
  if (!Number.isFinite(save.gears) || save.gears < 0) {
    throw new Error('Gears cannot be negative');
  }
  if (!save.unlockedPassengerIds.every((id) => typeof id === 'string')) {
    throw new Error('Passenger IDs must be strings');
  }
  if (!save.unlockedModuleIds.every((id) => typeof id === 'string')) {
    throw new Error('Module IDs must be strings');
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
