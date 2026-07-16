import type { ProductDefinition } from '../../src/domain/commerce/ProductCatalog';

export interface CommerceStoreModel {
  readonly products: readonly ProductDefinition[];
  readonly purchasedProductIds: readonly string[];
  readonly pendingProductId: string | null;
}

function formatReward(product: ProductDefinition): string {
  const equipmentFragmentCount = Object.values(
    product.reward.equipmentFragments,
  ).reduce((total, amount) => total + amount, 0);
  return [
    product.reward.gears > 0 ? `${product.reward.gears} 齿轮` : '',
    product.reward.routeMarks > 0 ? `${product.reward.routeMarks} 航线徽记` : '',
    product.reward.starTickets > 0 ? `${product.reward.starTickets} 星票` : '',
    ...product.reward.cosmeticIds.map(() => '非战力外观'),
    product.reward.skinIds.length > 0 ? '男女列车长皮肤' : '',
    product.reward.equipmentDefinitionIds.length > 0
      ? `确定性装备 × ${product.reward.equipmentDefinitionIds.length}`
      : '',
    equipmentFragmentCount > 0
      ? `装备碎片 × ${equipmentFragmentCount}`
      : '',
  ].filter(Boolean).join(' · ');
}

export function renderCommerceStore(model: CommerceStoreModel): string {
  const cards = model.products.map((product) => {
    const owned = model.purchasedProductIds.includes(product.id);
    const pending = model.pendingProductId === product.id;
    const label = owned ? '已拥有' : pending ? '验单中…' : `模拟购买 · ${product.displayPrice}`;
    return `<article class="system-card__item commerce-card ${owned ? 'owned' : ''}">
      <div class="commerce-card-heading"><span class="commerce-price">${product.displayPrice}</span><small>${product.oneTime ? '一次性商品' : '可重复购买'}</small></div>
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      <div class="commerce-reward">固定内容：${formatReward(product)}</div>
      <button class="chip" data-action="purchase-product" data-product-id="${product.id}" ${owned || pending ? 'disabled' : ''}>${label}</button>
    </article>`;
  }).join('');

  return `<section class="system-card system-card--commerce deferred-section commerce-store">
    <div class="system-card__heading commerce-heading"><div><span class="eyebrow">SUPPLY / VERIFIED</span><h2>航线补给站</h2><p>内容与价格购买前完整展示；当前为 Mock 验单，不发生真实扣款。</p></div><span class="system-card__badge">确定性内容 · 属性购买前完整展示</span></div>
    <div class="system-card__grid commerce-grid">${cards}</div>
    <div class="note">正式服只在平台服务端验单成功后发货，客户端回调不能直接修改资产。</div>
  </section>`;
}
