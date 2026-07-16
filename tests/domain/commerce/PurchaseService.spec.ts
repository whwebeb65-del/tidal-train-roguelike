import { describe, expect, it } from 'vitest';
import { settlePurchase } from '../../../src/domain/commerce/PurchaseService';
import { defaultSave } from '../../../src/save/SaveRepository';

describe('PurchaseService', () => {
  it('grants a verified deterministic starter pack once', () => {
    const result = settlePurchase(defaultSave(), {
      productId: 'starter-star-ticket-pack',
      result: { status: 'verified', transactionId: 'tx-1' },
    });

    expect(result.accepted).toBe(true);
    expect(result.save.starTickets).toBe(60);
    expect(result.save.purchasedProductIds).toEqual(['starter-star-ticket-pack']);
    expect(result.save.processedTransactionIds).toEqual(['tx-1']);
  });

  it('grants the cosmetic without combat stats', () => {
    const result = settlePurchase(defaultSave(), {
      productId: 'abyssal-engine-cosmetic',
      result: { status: 'verified', transactionId: 'tx-cosmetic' },
    });

    expect(result.accepted).toBe(true);
    expect(result.save.ownedCosmeticIds).toEqual(['deep-sea-engine']);
    expect(result.save.gears).toBe(0);
    expect(result.save.routeMarks).toBe(0);
  });

  it('grants both captain variants through one unique skin ID', () => {
    const result = settlePurchase(defaultSave(), {
      productId: 'aurora-whale-song-skin',
      result: { status: 'verified', transactionId: 'tx-skin' },
    });

    expect(result.accepted).toBe(true);
    expect(result.save.ownedSkinIds).toContain('skin-aurora-whale-song');
    expect(result.reward.skinIds).toEqual(['skin-aurora-whale-song']);
  });

  it('does not duplicate skin ownership after a duplicate callback', () => {
    const first = settlePurchase(defaultSave(), {
      productId: 'aurora-whale-song-skin',
      result: { status: 'verified', transactionId: 'tx-skin' },
    });
    const duplicate = settlePurchase(first.save, {
      productId: 'aurora-whale-song-skin',
      result: { status: 'verified', transactionId: 'tx-skin' },
    });

    expect(duplicate.accepted).toBe(false);
    expect(duplicate.save.ownedSkinIds.filter(
      (id) => id === 'skin-aurora-whale-song',
    )).toHaveLength(1);
  });

  it('grants deterministic equipment instances with stable transaction IDs', () => {
    const result = settlePurchase(defaultSave(), {
      productId: 'coral-assault-equipment-pack',
      result: { status: 'verified', transactionId: 'tx-equipment' },
    });

    expect(result.accepted).toBe(true);
    expect(result.save.equipmentInventory.filter(
      (item) => item.instanceId.startsWith('tx-equipment:'),
    )).toHaveLength(4);
  });

  it.each(['cancelled', 'failed'] as const)('does not grant a %s purchase', (status) => {
    const result = settlePurchase(defaultSave(), {
      productId: 'starter-star-ticket-pack',
      result: { status },
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(status);
    expect(result.save).toEqual(defaultSave());
  });

  it('rejects duplicate transactions and repeated one-time products', () => {
    const first = settlePurchase(defaultSave(), {
      productId: 'starter-star-ticket-pack',
      result: { status: 'verified', transactionId: 'tx-1' },
    });
    const duplicateTransaction = settlePurchase(first.save, {
      productId: 'starter-star-ticket-pack',
      result: { status: 'verified', transactionId: 'tx-1' },
    });
    const repeatedProduct = settlePurchase(first.save, {
      productId: 'starter-star-ticket-pack',
      result: { status: 'verified', transactionId: 'tx-2' },
    });

    expect(duplicateTransaction.reason).toBe('duplicate-transaction');
    expect(repeatedProduct.reason).toBe('already-owned');
    expect(repeatedProduct.save.starTickets).toBe(60);
  });

  it('rejects unknown products and blank transaction IDs', () => {
    expect(settlePurchase(defaultSave(), {
      productId: 'unknown',
      result: { status: 'verified', transactionId: 'tx-unknown' },
    }).reason).toBe('unknown-product');
    expect(() => settlePurchase(defaultSave(), {
      productId: 'starter-star-ticket-pack',
      result: { status: 'verified', transactionId: ' ' },
    })).toThrow('Verified purchases require a transaction ID');
  });
});
