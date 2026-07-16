import {
  CAPTAIN_CATALOG,
  getCaptainDefinition,
  type CaptainId,
} from '../domain/captain/CaptainCatalog';
import { createCaptainProfileState } from '../domain/captain/CaptainProfileSystem';
import {
  getEquipmentDefinition,
  type EquipmentAffixId,
  type EquipmentSlot,
} from '../domain/equipment/EquipmentCatalog';
import {
  createStarterEquipmentState,
  type EquipmentInstance,
} from '../domain/equipment/EquipmentSystem';
import { normalizeOwnedSkinIds } from '../domain/skin/SkinCollectionSystem';
import { getSkinDefinition } from '../domain/skin/SkinCatalog';

export interface PlayerSave {
  readonly version: 3;
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
  readonly selectedCaptainId: CaptainId | null;
  readonly ownedSkinIds: string[];
  readonly equippedSkinIds: Partial<Record<CaptainId, string>>;
  readonly equipmentInventory: EquipmentInstance[];
  readonly equippedEquipmentIds: Record<EquipmentSlot, string | null>;
  readonly equipmentFragments: Record<string, number>;
}

export interface SaveRepository {
  load(): PlayerSave;
  save(next: PlayerSave): void;
}

const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = [
  'cannon',
  'carriage',
  'core',
  'instrument',
];
const EQUIPMENT_AFFIX_IDS: readonly EquipmentAffixId[] = [
  'max-hp-percent',
  'damage-percent',
  'gears-percent',
  'initial-momentum',
  'repair-flat',
];

function cloneEquipmentInstance(instance: EquipmentInstance): EquipmentInstance {
  return {
    ...instance,
    affixes: instance.affixes.map((affix) => ({ ...affix })),
  };
}

export function defaultSave(): PlayerSave {
  const captainProfile = createCaptainProfileState();
  const equipment = createStarterEquipmentState();
  return {
    version: 3,
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
    selectedCaptainId: captainProfile.selectedCaptainId,
    ownedSkinIds: ['skin-tide-base'],
    equippedSkinIds: { ...captainProfile.equippedSkinIds },
    equipmentInventory: equipment.inventory.map(cloneEquipmentInstance),
    equippedEquipmentIds: { ...equipment.equippedEquipmentIds },
    equipmentFragments: {},
  };
}

function cloneSave(save: PlayerSave): PlayerSave {
  return {
    version: 3,
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
    selectedCaptainId: save.selectedCaptainId,
    ownedSkinIds: [...save.ownedSkinIds],
    equippedSkinIds: { ...save.equippedSkinIds },
    equipmentInventory: save.equipmentInventory.map(cloneEquipmentInstance),
    equippedEquipmentIds: { ...save.equippedEquipmentIds },
    equipmentFragments: { ...save.equipmentFragments },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertStringArray(value: unknown, error: string): asserts value is string[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) {
    throw new Error(error);
  }
}

function validateEquipmentInventory(
  inventory: unknown,
): asserts inventory is EquipmentInstance[] {
  if (!Array.isArray(inventory)) {
    throw new Error('Equipment inventory must be an array');
  }
  const instanceIds = new Set<string>();
  for (const candidate of inventory) {
    if (!isRecord(candidate)) {
      throw new Error('Equipment instances must be objects');
    }
    const {
      instanceId,
      definitionId,
      level,
      stars,
      affixes,
    } = candidate;
    if (typeof instanceId !== 'string' || instanceId.length === 0) {
      throw new Error('Equipment instance IDs must be non-empty strings');
    }
    if (instanceIds.has(instanceId)) {
      throw new Error(`Duplicate equipment instance ID: ${instanceId}`);
    }
    instanceIds.add(instanceId);
    if (typeof definitionId !== 'string') {
      throw new Error('Equipment definition IDs must be strings');
    }
    getEquipmentDefinition(definitionId);
    if (!Number.isInteger(level) || (level as number) < 1 || (level as number) > 20) {
      throw new Error('Equipment level must be between 1 and 20');
    }
    if (!Number.isInteger(stars) || (stars as number) < 0 || (stars as number) > 5) {
      throw new Error('Equipment stars must be between 0 and 5');
    }
    if (!Array.isArray(affixes) || affixes.length > 2) {
      throw new Error('Equipment affixes must contain at most two entries');
    }
    for (const affix of affixes) {
      if (
        !isRecord(affix)
        || !EQUIPMENT_AFFIX_IDS.includes(affix.id as EquipmentAffixId)
        || !Number.isFinite(affix.value)
        || (affix.value as number) <= 0
      ) {
        throw new Error('Equipment affixes are invalid');
      }
    }
  }
}

function validateEquippedEquipment(
  value: unknown,
  inventory: readonly EquipmentInstance[],
): asserts value is Record<EquipmentSlot, string | null> {
  if (!isRecord(value)) {
    throw new Error('Equipped equipment must be an object');
  }
  for (const slot of EQUIPMENT_SLOTS) {
    const instanceId = value[slot];
    if (instanceId !== null && typeof instanceId !== 'string') {
      throw new Error(`Equipped ${slot} ID must be a string or null`);
    }
    if (typeof instanceId === 'string') {
      const instance = inventory.find((item) => item.instanceId === instanceId);
      if (!instance) {
        throw new Error(`Equipped equipment instance not found: ${instanceId}`);
      }
      if (getEquipmentDefinition(instance.definitionId).slot !== slot) {
        throw new Error(`Equipment slot mismatch: ${instanceId}`);
      }
    }
  }
}

function validateFragments(
  value: unknown,
): asserts value is Record<string, number> {
  if (!isRecord(value)) {
    throw new Error('Equipment fragments must be an object');
  }
  for (const amount of Object.values(value)) {
    if (!Number.isFinite(amount) || (amount as number) < 0) {
      throw new Error('Equipment fragments cannot be negative');
    }
  }
}

function validateSave(save: PlayerSave): void {
  if (save.version !== 3) {
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
  assertStringArray(save.unlockedPassengerIds, 'Passenger IDs must be strings');
  assertStringArray(save.unlockedModuleIds, 'Module IDs must be strings');
  assertStringArray(save.unlockedMapIds, 'Map IDs must be strings');
  assertStringArray(save.firstClearMapIds, 'First-clear map IDs must be strings');
  assertStringArray(save.claimedInteractionIds, 'Interaction claim IDs must be strings');
  assertStringArray(save.purchasedProductIds, 'Purchased product IDs must be strings');
  assertStringArray(save.processedTransactionIds, 'Processed transaction IDs must be strings');
  assertStringArray(save.ownedCosmeticIds, 'Owned cosmetic IDs must be strings');
  assertStringArray(save.ownedSkinIds, 'Owned skin IDs must be strings');
  if (save.selectedCaptainId !== null) {
    getCaptainDefinition(save.selectedCaptainId);
  }
  if (!isRecord(save.equippedSkinIds)) {
    throw new Error('Equipped skin IDs must be an object');
  }
  validateEquipmentInventory(save.equipmentInventory);
  validateEquippedEquipment(save.equippedEquipmentIds, save.equipmentInventory);
  validateFragments(save.equipmentFragments);
}

function normalizeEquippedSkinIds(
  candidate: unknown,
  ownedSkinIds: readonly string[],
): Partial<Record<CaptainId, string>> {
  const raw = isRecord(candidate) ? candidate : {};
  return Object.fromEntries(CAPTAIN_CATALOG.map((captain) => {
    const skinId = raw[captain.id];
    const skin = typeof skinId === 'string' ? getSkinDefinition(skinId) : undefined;
    const valid = skin
      && ownedSkinIds.includes(skin.id)
      && skin.wearableBy.includes(captain.id);
    return [captain.id, valid ? skin.id : captain.baseSkinId];
  }));
}

export function normalizePlayerSave(candidate: unknown): PlayerSave {
  if (!isRecord(candidate)) {
    throw new Error('Save must be an object');
  }
  const raw = candidate;
  if (raw.version !== 1 && raw.version !== 2 && raw.version !== 3) {
    throw new Error('Unsupported save version');
  }

  const commerceFields = raw.version === 1
    ? {
        purchasedProductIds: [],
        processedTransactionIds: [],
        ownedCosmeticIds: [],
      }
    : {
        purchasedProductIds: raw.purchasedProductIds,
        processedTransactionIds: raw.processedTransactionIds,
        ownedCosmeticIds: raw.ownedCosmeticIds,
      };
  const starterEquipment = createStarterEquipmentState();
  const isVersion3 = raw.version === 3;
  const rawSkinIds = isVersion3 ? raw.ownedSkinIds : ['skin-tide-base'];
  assertStringArray(rawSkinIds, 'Owned skin IDs must be strings');
  const ownedSkinIds = [...normalizeOwnedSkinIds(rawSkinIds)];
  const equipmentInventory = isVersion3
    ? raw.equipmentInventory
    : starterEquipment.inventory;
  validateEquipmentInventory(equipmentInventory);
  const equippedEquipmentIds = isVersion3
    ? raw.equippedEquipmentIds
    : starterEquipment.equippedEquipmentIds;
  validateEquippedEquipment(equippedEquipmentIds, equipmentInventory);
  const equipmentFragments = isVersion3 ? raw.equipmentFragments : {};
  validateFragments(equipmentFragments);

  const selectedCaptainId = isVersion3
    ? (raw.selectedCaptainId ?? null)
    : null;
  if (selectedCaptainId !== null) {
    if (typeof selectedCaptainId !== 'string') {
      throw new Error('Selected captain ID must be a string or null');
    }
    getCaptainDefinition(selectedCaptainId as CaptainId);
  }

  const normalized = {
    version: 3 as const,
    gears: raw.gears,
    routeMarks: raw.routeMarks,
    starTickets: raw.starTickets,
    stationLevel: raw.stationLevel,
    unlockedPassengerIds: raw.unlockedPassengerIds,
    unlockedModuleIds: raw.unlockedModuleIds,
    unlockedMapIds: raw.unlockedMapIds,
    firstClearMapIds: raw.firstClearMapIds,
    claimedInteractionIds: raw.claimedInteractionIds,
    ...commerceFields,
    selectedCaptainId: selectedCaptainId as CaptainId | null,
    ownedSkinIds,
    equippedSkinIds: isVersion3
      ? normalizeEquippedSkinIds(raw.equippedSkinIds, ownedSkinIds)
      : { ...createCaptainProfileState().equippedSkinIds },
    equipmentInventory,
    equippedEquipmentIds,
    equipmentFragments,
  } as unknown as PlayerSave;
  validateSave(normalized);
  return cloneSave(normalized);
}

export function createMemorySaveRepository(
  initial: unknown = defaultSave(),
): SaveRepository {
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
