import {
  CAPTAIN_CATALOG,
  getCaptainDefinition,
  type CaptainId,
} from '../../src/domain/captain/CaptainCatalog';
import type { ProductDefinition } from '../../src/domain/commerce/ProductCatalog';
import type { PermanentStatModifiers } from '../../src/domain/progression/ProgressionTypes';
import type { SkinDefinition, SkinId } from '../../src/domain/skin/SkinCatalog';
import { CHIBI_ART } from '../assets/ChibiArtCatalog';

export interface WardrobeModel {
  readonly selectedCaptainId: CaptainId;
  readonly ownedSkinIds: readonly string[];
  readonly equippedSkinIds: Readonly<Partial<Record<CaptainId, string>>>;
  readonly skins: readonly SkinDefinition[];
  readonly collectionModifiers: PermanentStatModifiers;
  readonly pendingProductId: string | null;
  readonly productBySkinId: Readonly<Partial<Record<SkinId, ProductDefinition>>>;
}

const RARITY_LABELS: Readonly<Record<SkinDefinition['rarity'], string>> = {
  base: '基础',
  common: '常规',
  rare: '稀有',
  epic: '史诗',
  legendary: '典藏',
};

function percent(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`;
}

function formatModifiers(modifiers: PermanentStatModifiers): string[] {
  return [
    modifiers.maxHpFlat ? `生命 +${modifiers.maxHpFlat}` : '',
    modifiers.maxHpPercent ? `生命 +${percent(modifiers.maxHpPercent)}` : '',
    modifiers.damageFlat ? `伤害 +${modifiers.damageFlat}` : '',
    modifiers.damagePercent ? `伤害 +${percent(modifiers.damagePercent)}` : '',
    modifiers.gearsPercent ? `齿轮收益 +${percent(modifiers.gearsPercent)}` : '',
    modifiers.initialMomentum ? `开场动能 +${modifiers.initialMomentum}` : '',
    modifiers.repairFlat ? `维修 +${modifiers.repairFlat}` : '',
  ].filter(Boolean);
}

export function renderWardrobe(model: WardrobeModel): string {
  const selectedCaptain = getCaptainDefinition(model.selectedCaptainId);
  const equippedSkinId = (model.equippedSkinIds[model.selectedCaptainId] ?? 'skin-tide-base') as SkinId;
  const currentArt = CHIBI_ART.captains[model.selectedCaptainId][equippedSkinId];
  const otherCaptain = CAPTAIN_CATALOG.find((captain) => captain.id !== model.selectedCaptainId);
  if (!otherCaptain) throw new Error('Alternate captain missing');
  const collectionStats = formatModifiers(model.collectionModifiers);

  const cards = model.skins.map((skin) => {
    const owned = model.ownedSkinIds.includes(skin.id);
    const equipped = equippedSkinId === skin.id;
    const product = model.productBySkinId[skin.id];
    const pending = product?.id === model.pendingProductId;
    const modifiers = formatModifiers(skin.modifiers);
    const action = owned
      ? `<button class="secondary" data-action="equip-skin" data-skin-id="${skin.id}" ${equipped ? 'disabled' : ''}>${equipped ? '当前穿戴' : '穿戴此皮肤'}</button>`
      : product
        ? `<button class="primary" data-skin-id="${skin.id}" data-action="purchase-product" data-product-id="${product.id}" ${pending ? 'disabled' : ''}>${pending ? '验单中…' : `${product.displayPrice} 固定解锁`}</button>`
        : '<button class="secondary" disabled>开服活动获取</button>';

    return `<article class="skin-card ${owned ? 'is-owned' : ''}" data-skin-id="${skin.id}">
      <div class="skin-card__variants" aria-label="${skin.name} 男女款式">
        <img src="${CHIBI_ART.captains['captain-tide-female'][skin.id]}" alt="${skin.name}女款" loading="lazy" decoding="async" />
        <img src="${CHIBI_ART.captains['captain-tide-male'][skin.id]}" alt="${skin.name}男款" loading="lazy" decoding="async" />
      </div>
      <small>${RARITY_LABELS[skin.rarity]} · 男女款式</small>
      <h3>${skin.name}</h3>
      <p>${modifiers.length > 0 ? modifiers.join(' · ') : '基础制服不提供额外属性'}</p>
      <span class="skin-stack-note">${owned ? '已计入账户永久叠加' : '解锁后永久叠加，无上限'}</span>
      ${action}
    </article>`;
  }).join('');

  return `<section class="wardrobe scene">
    <div class="run-heading">
      <div><span class="eyebrow">CAPTAIN WARDROBE</span><h1>列车长衣柜</h1><p>皮肤用于形象与成长。所有已拥有皮肤的固定属性都会永久叠加，无公平模式归一化。</p></div>
      <button class="secondary" data-action="switch-captain" data-captain-id="${otherCaptain.id}">切换为${otherCaptain.pronounLabel}</button>
    </div>
    <div class="wardrobe-layout">
      <aside class="wardrobe-preview">
        <img src="${currentArt}" alt="${selectedCaptain.name}当前穿搭" />
        <div><small>当前列车长</small><h2>${selectedCaptain.name}</h2><p>${equippedSkinId === 'skin-tide-base' ? '潮汐制服' : model.skins.find((skin) => skin.id === equippedSkinId)?.name ?? '已穿戴皮肤'}</p></div>
        <div class="collection-stats">
          <span class="eyebrow">ACCOUNT BONUS</span>
          <h3>累计收藏属性</h3>
          <p>${collectionStats.length > 0 ? collectionStats.join(' · ') : '当前暂无额外属性'}</p>
          <small>每个皮肤 ID 仅计入一次，男女款式共用同一收藏。</small>
        </div>
        <button class="chip" data-action="open-hub" data-hub-view="equipment">进入装备舱</button>
      </aside>
      <div class="skin-grid">${cards}</div>
    </div>
  </section>`;
}
