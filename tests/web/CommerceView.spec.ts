import { describe, expect, it } from 'vitest';
import { PRODUCT_CATALOG } from '../../src/domain/commerce/ProductCatalog';
import { renderCommerceStore } from '../../web/views/CommerceView';

describe('CommerceView', () => {
  it('shows deterministic content and prices', () => {
    const html = renderCommerceStore({
      products: PRODUCT_CATALOG,
      purchasedProductIds: [],
      pendingProductId: null,
    });

    expect(html).toContain('首航星票补给');
    expect(html).toContain('¥6');
    expect(html).toContain('固定获得 60 星票');
    expect(html).toContain('深海引擎涂装');
    expect(html).toContain('极光鲸歌列车长套装');
    expect(html).toContain('男女列车长皮肤');
    expect(html).toContain('确定性装备 × 4');
    expect(html).toContain('确定性内容 · 属性购买前完整展示');
    expect(html).not.toContain('不卖随机胜率');
    expect(html).not.toContain('概率');
  });

  it('disables owned and pending products', () => {
    const html = renderCommerceStore({
      products: PRODUCT_CATALOG,
      purchasedProductIds: ['starter-star-ticket-pack'],
      pendingProductId: 'abyssal-engine-cosmetic',
    });

    expect(html).toContain('已拥有');
    expect(html).toContain('验单中…');
    expect(html.match(/disabled/g)).toHaveLength(2);
  });
});
