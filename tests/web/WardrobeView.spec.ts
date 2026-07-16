import { describe, expect, it } from 'vitest';
import { PRODUCT_CATALOG } from '../../src/domain/commerce/ProductCatalog';
import { getSkinCollectionModifiers } from '../../src/domain/skin/SkinCollectionSystem';
import { SKIN_CATALOG } from '../../src/domain/skin/SkinCatalog';
import { renderWardrobe } from '../../web/views/WardrobeView';

describe('WardrobeView', () => {
  it('shows stacking collection stats, both captain variants and deterministic skin pricing', () => {
    const auroraProduct = PRODUCT_CATALOG.find((product) =>
      product.reward.skinIds.includes('skin-aurora-whale-song'));
    if (!auroraProduct) throw new Error('Aurora product missing');

    const html = renderWardrobe({
      selectedCaptainId: 'captain-tide-female',
      ownedSkinIds: ['skin-tide-base'],
      equippedSkinIds: {
        'captain-tide-female': 'skin-tide-base',
        'captain-tide-male': 'skin-tide-base',
      },
      skins: SKIN_CATALOG,
      collectionModifiers: getSkinCollectionModifiers(['skin-tide-base']),
      pendingProductId: null,
      productBySkinId: {
        'skin-aurora-whale-song': auroraProduct,
      },
    });

    expect(html).toContain('累计收藏属性');
    expect(html).toContain('极光鲸歌');
    expect(html).toContain('男女款式');
    expect(html).toContain('永久叠加');
    expect(html).toContain('data-action="equip-skin"');
    expect(html).toContain('data-action="switch-captain"');
    expect(html).toContain('¥30');
    expect(html).toContain('data-product-id="aurora-whale-song-skin"');
    expect(html).not.toMatch(/data-skin-id="skin-tide-base"[^>]*data-action="purchase-product"/);
  });
});
