export interface PlayerSave {
  readonly version: 2;
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
  readonly stationLevel: number;
  readonly unlockedPassengerIds: readonly string[];
  readonly unlockedModuleIds: readonly string[];
  readonly unlockedMapIds: readonly string[];
  readonly firstClearMapIds: readonly string[];
  readonly claimedInteractionIds: readonly string[];
  readonly purchasedProductIds: readonly string[];
  readonly processedTransactionIds: readonly string[];
  readonly ownedCosmeticIds: readonly string[];
}

export interface SaveRepository {
  load(): PlayerSave;
  save(next: PlayerSave): void;
}

export function defaultSave(): PlayerSave {
  return {
    version: 2,
    gears: 0,
    routeMarks: 0,
    starTickets: 0,
    stationLevel: 1,
    unlockedPassengerIds: [],
    unlockedModuleIds: [],
    unlockedMapIds: ['drift-suburb'],
    firstClearMapIds: [],
    claimedInteractionIds: [],
    purchasedProductIds: [],
    processedTransactionIds: [],
    ownedCosmeticIds: [],
  };
}

function cloneSave(save: PlayerSave): PlayerSave {
  return {
    version: 2,
    gears: save.gears,
    routeMarks: save.routeMarks,
    starTickets: save.starTickets,
    stationLevel: save.stationLevel,
    unlockedPassengerIds: [...save.unlockedPassengerIds],
    unlockedModuleIds: [...save.unlockedModuleIds],
    unlockedMapIds: [...save.unlockedMapIds],
    firstClearMapIds: [...save.firstClearMapIds],
    claimedInteractionIds: [...save.claimedInteractionIds],
    purchasedProductIds: [...save.purchasedProductIds],
    processedTransactionIds: [...save.processedTransactionIds],
    ownedCosmeticIds: [...save.ownedCosmeticIds],
  };
}

function validateSave(save: PlayerSave): void {
  if (save.version !== 2) {
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
  if (!save.purchasedProductIds.every((id) => typeof id === 'string')) {
    throw new Error('Purchased product IDs must be strings');
  }
  if (!save.processedTransactionIds.every((id) => typeof id === 'string')) {
    throw new Error('Processed transaction IDs must be strings');
  }
  if (!save.ownedCosmeticIds.every((id) => typeof id === 'string')) {
    throw new Error('Owned cosmetic IDs must be strings');
  }
}

export function normalizePlayerSave(candidate: unknown): PlayerSave {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Save must be an object');
  }

  const raw = candidate as Record<string, unknown>;
  if (raw.version !== 1 && raw.version !== 2) {
    throw new Error('Unsupported save version');
  }

  const normalized = {
    ...raw,
    version: 2 as const,
    purchasedProductIds: raw.version === 2 ? raw.purchasedProductIds : [],
    processedTransactionIds: raw.version === 2 ? raw.processedTransactionIds : [],
    ownedCosmeticIds: raw.version === 2 ? raw.ownedCosmeticIds : [],
  } as unknown as PlayerSave;
  validateSave(normalized);
  return cloneSave(normalized);
}

export function createMemorySaveRepository(initial: unknown = defaultSave()): SaveRepository {
  let current = normalizePlayerSave(initial);
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
