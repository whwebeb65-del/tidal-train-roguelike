import type { TidalArchiveState } from '../../src/domain/collection/TidalArchiveSystem';
import type { EquipmentInstance } from '../../src/domain/equipment/EquipmentSystem';
import type { SkillMasteryXp } from '../../src/domain/progression/SkillMasterySystem';
import {
  TIDAL_ARCHIVE_ENEMIES,
  buildTidalArchiveEquipmentCards,
  buildTidalArchiveVariantCards,
  type TidalArchiveEnemyCard,
  type TidalArchiveEquipmentCard,
  type TidalArchiveVariantCard,
} from './TidalArchiveCatalog';

export interface TidalArchiveViewModel {
  readonly enemySummary: { readonly discovered: number; readonly total: 8 };
  readonly variantSummary: { readonly discovered: number; readonly total: 12 };
  readonly equipmentSummary: { readonly discovered: number; readonly total: 8 };
  readonly enemies: readonly TidalArchiveEnemyCard[];
  readonly variants: readonly TidalArchiveVariantCard[];
  readonly equipment: readonly TidalArchiveEquipmentCard[];
}

export interface TidalArchiveViewModelInput {
  readonly archive: TidalArchiveState;
  readonly equipmentInventory: readonly EquipmentInstance[];
  readonly skillMasteryXp: Readonly<SkillMasteryXp>;
}

export function buildTidalArchiveViewModel(
  input: TidalArchiveViewModelInput,
): TidalArchiveViewModel {
  const discoveredEnemies = new Set(input.archive.discoveredEnemyKinds);
  const enemies = TIDAL_ARCHIVE_ENEMIES.map((entry) => {
    const discovered = discoveredEnemies.has(entry.id);
    return {
      ...entry,
      discovered,
      name: discovered ? entry.name : '未记录潮兽',
      role: discovered ? entry.role : '战场记录尚未解密',
      counter: discovered ? entry.counter : '应对记录尚未解密',
    };
  });
  const variants = buildTidalArchiveVariantCards(
    input.archive.discoveredSkillVariantIds,
    input.skillMasteryXp,
  );
  const equipment = buildTidalArchiveEquipmentCards(input.equipmentInventory);

  return {
    enemySummary: {
      discovered: enemies.filter((entry) => entry.discovered).length,
      total: 8,
    },
    variantSummary: {
      discovered: variants.filter((entry) => entry.discovered).length,
      total: 12,
    },
    equipmentSummary: {
      discovered: equipment.filter((entry) => entry.discovered).length,
      total: 8,
    },
    enemies,
    variants,
    equipment,
  };
}

function archiveImage(
  artUrl: string,
  name: string,
  discovered: boolean,
): string {
  return `<img src="${artUrl}" alt="${discovered ? name : ''}" ${discovered ? '' : 'aria-hidden="true"'} loading="lazy" />`;
}

function renderEnemyCard(entry: TidalArchiveEnemyCard): string {
  return `<article class="archive-card archive-card--enemy ${entry.discovered ? 'is-discovered' : 'is-locked'}" data-archive-enemy="${entry.id}">
    ${archiveImage(entry.artUrl, entry.name, entry.discovered)}
    <div class="archive-card__copy"><small>${entry.source}</small><h3>${entry.name}</h3><p>${entry.role}</p><p>${entry.counter}</p></div>
  </article>`;
}

function renderVariantCard(entry: TidalArchiveVariantCard): string {
  return `<article class="archive-card archive-card--variant ${entry.discovered ? 'is-discovered' : 'is-locked'}" data-archive-variant="${entry.id}">
    ${archiveImage(entry.artUrl, entry.name, entry.discovered)}
    <div class="archive-card__copy"><small>${entry.skillName} · 精通 Lv.${entry.requiredMasteryLevel}</small><h3>${entry.name}</h3><p>${entry.effect}</p><p>${entry.synergy}</p><p class="archive-card__source">来源：${entry.source}</p></div>
  </article>`;
}

function renderEquipmentCard(entry: TidalArchiveEquipmentCard): string {
  return `<article class="archive-card archive-card--equipment ${entry.discovered ? 'is-discovered' : 'is-locked'}" data-archive-equipment="${entry.id}">
    <div class="archive-blueprint-mark" aria-hidden="true">⌁</div>
    <div class="archive-card__copy"><small>${entry.slotName} · ${entry.setName}</small><h3>${entry.name}</h3><p>${entry.rarityName} · ${entry.effect}</p><p class="archive-card__source">来源：${entry.source}</p></div>
  </article>`;
}

export function renderTidalArchive(model: TidalArchiveViewModel): string {
  return `<section class="tidal-archive-carriage living-zone">
    <header class="archive-manifest">
      <span class="eyebrow">TIDAL ARCHIVE CARRIAGE</span>
      <h2>潮汐档案总表</h2>
      <div class="archive-manifest__counts">
        <span>潮兽 <b>${model.enemySummary.discovered} / ${model.enemySummary.total}</b></span>
        <span>技能进化 <b>${model.variantSummary.discovered} / ${model.variantSummary.total}</b></span>
        <span>装备蓝图 <b>${model.equipmentSummary.discovered} / ${model.equipmentSummary.total}</b></span>
      </div>
      <p>记录来自真实遭遇、真实进化选择与当前装备库存。</p>
    </header>
    <section class="archive-ledger archive-ledger--beasts">
      <header><span>LEDGER I</span><h2>潮兽观察册</h2></header>
      <div class="archive-card-grid">${model.enemies.map(renderEnemyCard).join('')}</div>
    </section>
    <section class="archive-ledger archive-ledger--variants">
      <header><span>LEDGER II</span><h2>技能进化标本册</h2></header>
      <div class="archive-card-grid">${model.variants.map(renderVariantCard).join('')}</div>
    </section>
    <section class="archive-ledger archive-ledger--equipment">
      <header><span>LEDGER III</span><h2>装备蓝图册</h2></header>
      <div class="archive-card-grid">${model.equipment.map(renderEquipmentCard).join('')}</div>
    </section>
  </section>`;
}
