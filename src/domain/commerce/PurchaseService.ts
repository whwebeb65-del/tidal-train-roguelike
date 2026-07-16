import type { PurchaseResult } from '../../platform/PlatformContracts';
import { createMemorySaveRepository, type PlayerSave } from '../../save/SaveRepository';
import { getEquipmentDefinition } from '../equipment/EquipmentCatalog';
import type { EquipmentInstance } from '../equipment/EquipmentSystem';
import { normalizeOwnedSkinIds } from '../skin/SkinCollectionSystem';
import { getProductDefinition, type ProductReward } from './ProductCatalog';

export type PurchaseFailureReason =
  | 'cancelled'
  | 'failed'
  | 'unknown-product'
  | 'duplicate-transaction'
  | 'already-owned';

export interface PurchaseSettlement {
  readonly accepted: boolean;
  readonly reason?: PurchaseFailureReason;
  readonly save: PlayerSave;
  readonly reward: ProductReward;
}

const EMPTY_REWARD: ProductReward = {
  gears: 0,
  routeMarks: 0,
  starTickets: 0,
  cosmeticIds: [],
  skinIds: [],
  equipmentDefinitionIds: [],
  equipmentFragments: {},
};

function cloneSave(save: PlayerSave): PlayerSave {
  return createMemorySaveRepository(save).load();
}

function reject(save: PlayerSave, reason: PurchaseFailureReason): PurchaseSettlement {
  return {
    accepted: false,
    reason,
    save: cloneSave(save),
    reward: cloneReward(EMPTY_REWARD),
  };
}

function cloneReward(reward: ProductReward): ProductReward {
  return {
    ...reward,
    cosmeticIds: [...reward.cosmeticIds],
    skinIds: [...reward.skinIds],
    equipmentDefinitionIds: [...reward.equipmentDefinitionIds],
    equipmentFragments: { ...reward.equipmentFragments },
  };
}

export function settlePurchase(save: PlayerSave, input: {
  readonly productId: string;
  readonly result: PurchaseResult;
}): PurchaseSettlement {
  if (input.result.status !== 'verified') {
    return reject(save, input.result.status);
  }

  const transactionId = input.result.transactionId.trim();
  if (!transactionId) {
    throw new Error('Verified purchases require a transaction ID');
  }

  const product = getProductDefinition(input.productId);
  if (!product) {
    return reject(save, 'unknown-product');
  }
  if (save.processedTransactionIds.includes(transactionId)) {
    return reject(save, 'duplicate-transaction');
  }
  if (product.oneTime && save.purchasedProductIds.includes(product.id)) {
    return reject(save, 'already-owned');
  }

  const ownedCosmeticIds = [
    ...new Set([...save.ownedCosmeticIds, ...product.reward.cosmeticIds]),
  ];
  const ownedSkinIds = [
    ...normalizeOwnedSkinIds([...save.ownedSkinIds, ...product.reward.skinIds]),
  ];
  const equipmentDefinitionIds = [...new Set(product.reward.equipmentDefinitionIds)];
  const grantedEquipment: EquipmentInstance[] = equipmentDefinitionIds.map(
    (definitionId) => {
      getEquipmentDefinition(definitionId);
      return {
        instanceId: `${transactionId}:${definitionId}`,
        definitionId,
        level: 1,
        stars: 0,
        affixes: [],
      };
    },
  );
  const equipmentFragments = { ...save.equipmentFragments };
  for (const [definitionId, amount] of Object.entries(
    product.reward.equipmentFragments,
  )) {
    getEquipmentDefinition(definitionId);
    equipmentFragments[definitionId] =
      (equipmentFragments[definitionId] ?? 0) + amount;
  }
  const nextSave: PlayerSave = {
    ...save,
    gears: save.gears + product.reward.gears,
    routeMarks: save.routeMarks + product.reward.routeMarks,
    starTickets: save.starTickets + product.reward.starTickets,
    purchasedProductIds: [...save.purchasedProductIds, product.id],
    processedTransactionIds: [...save.processedTransactionIds, transactionId],
    ownedCosmeticIds,
    ownedSkinIds,
    equipmentInventory: [
      ...save.equipmentInventory,
      ...grantedEquipment,
    ],
    equipmentFragments,
  };

  return {
    accepted: true,
    save: cloneSave(nextSave),
    reward: cloneReward(product.reward),
  };
}
