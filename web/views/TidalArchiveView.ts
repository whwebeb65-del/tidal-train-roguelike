import type {
  TidalArchiveEntryKey,
  TidalArchiveState,
} from '../../src/domain/collection/TidalArchiveSystem';
import type { EquipmentInstance } from '../../src/domain/equipment/EquipmentSystem';
import type { SkillMasteryXp } from '../../src/domain/progression/SkillMasterySystem';
import {
  TIDAL_ARCHIVE_ENEMIES,
  buildTidalArchiveEquipmentCards,
  buildTidalArchiveMasteryRows,
  buildTidalArchiveVariantCards,
  type TidalArchiveEnemyCard,
  type TidalArchiveEquipmentCard,
  type TidalArchiveMasteryRow,
  type TidalArchiveVariantCard,
} from './TidalArchiveCatalog';

export interface TidalArchiveViewModel {
  readonly enemySummary: { readonly discovered: number; readonly total: 8 };
  readonly variantSummary: { readonly discovered: number; readonly total: 12 };
  readonly equipmentSummary: { readonly discovered: number; readonly total: 8 };
  readonly enemies: readonly (TidalArchiveEnemyCard & { readonly isNew: boolean })[];
  readonly variants: readonly (TidalArchiveVariantCard & { readonly isNew: boolean })[];
  readonly equipment: readonly TidalArchiveEquipmentCard[];
  readonly mastery: readonly TidalArchiveMasteryRow[];
}

export interface TidalArchiveViewModelInput {
  readonly archive: TidalArchiveState;
  readonly equipmentInventory: readonly EquipmentInstance[];
  readonly skillMasteryXp: Readonly<SkillMasteryXp>;
  readonly newEntryKeys?: readonly TidalArchiveEntryKey[];
}

export function buildTidalArchiveViewModel(
  input: TidalArchiveViewModelInput,
): TidalArchiveViewModel {
  const discoveredEnemies = new Set(input.archive.discoveredEnemyKinds);
  const newEntryKeys = new Set(input.newEntryKeys ?? []);
  const enemies = TIDAL_ARCHIVE_ENEMIES.map((entry) => {
    const discovered = discoveredEnemies.has(entry.id);
    return {
      ...entry,
      discovered,
      isNew: newEntryKeys.has(`enemy:${entry.id}`),
      name: discovered ? entry.name : '未记录潮兽',
      role: discovered ? entry.role : '战场记录尚未解密',
      counter: discovered ? entry.counter : '应对记录尚未解密',
    };
  });
  const variants = buildTidalArchiveVariantCards(
    input.archive.discoveredSkillVariantIds,
    input.skillMasteryXp,
  ).map((entry) => ({
    ...entry,
    isNew: newEntryKeys.has(`skill-variant:${entry.id}`),
  }));
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
    mastery: buildTidalArchiveMasteryRows(input.skillMasteryXp),
  };
}

function archiveImage(
  artUrl: string,
  name: string,
  discovered: boolean,
): string {
  return `<img src="${artUrl}" alt="${discovered ? name : ''}" ${discovered ? '' : 'aria-hidden="true"'} loading="lazy" />`;
}

function renderEnemyCard(
  entry: TidalArchiveEnemyCard & { readonly isNew: boolean },
): string {
  return `<article class="archive-card archive-card--enemy ${entry.discovered ? 'is-discovered' : 'is-locked'}${entry.isNew ? ' is-new' : ''}" data-archive-enemy="${entry.id}">
    ${archiveImage(entry.artUrl, entry.name, entry.discovered)}
    <div class="archive-card__copy">${entry.isNew ? '<span class="archive-new-stamp" aria-label="新档案">NEW</span>' : ''}<small>${entry.source}</small><h3>${entry.name}</h3><p>${entry.role}</p><p>${entry.counter}</p></div>
  </article>`;
}

function renderVariantCard(
  entry: TidalArchiveVariantCard & { readonly isNew: boolean },
): string {
  const availability = entry.discovered ? 'discovered' : entry.inCandidatePool ? 'candidate' : 'locked';
  const status = entry.discovered
    ? '已发现'
    : entry.inCandidatePool
      ? `已入候选池 · 局内潮阶 ${entry.requiredRank} 后可能出现`
      : `未入候选池 · 精通 Lv.${entry.requiredMasteryLevel} 解锁`;
  return `<article class="archive-card archive-card--variant ${entry.discovered ? 'is-discovered' : 'is-locked'}${entry.isNew ? ' is-new' : ''}" data-archive-variant="${entry.id}">
    ${archiveImage(entry.artUrl, entry.name, entry.discovered)}
    <div class="archive-card__copy">${entry.isNew ? '<span class="archive-new-stamp" aria-label="新档案">NEW</span>' : ''}<small>${entry.skillName} · 精通 Lv.${entry.requiredMasteryLevel}</small><h3>${entry.name}</h3><p>${entry.effect}</p><p>${entry.synergy}</p><p class="archive-card__source">来源：${entry.source}</p><small class="archive-variant-status" data-variant-availability="${availability}">${status}</small></div>
  </article>`;
}

function renderMasteryRow(row: TidalArchiveMasteryRow): string {
  const progress = row.nextLevelXp === null
    ? '<p class="archive-mastery__progress-text">精通已满级</p>'
    : `<p class="archive-mastery__progress-text">下一级：${row.levelXp} / ${row.nextLevelXp} XP</p>
      <progress value="${row.levelXp}" max="${row.nextLevelXp}" aria-label="${row.name}下一精通等级进度"></progress>`;
  const next = row.nextVariant === null
    ? '全部进化已入候选池'
    : `Lv.${row.nextVariant.level} 可解锁「${row.nextVariant.name}」`;
  return `<li class="archive-mastery__row" data-mastery-skill="${row.id}">
    <img src="${row.artUrl}" alt="" width="45" height="45" loading="lazy" />
    <div>
      <h4>${row.name} <span>Lv.${row.level}</span></h4>
      ${progress}
      <p class="archive-mastery__pool">候选池 ${row.poolCount} / ${row.variantCount} · ${next}</p>
    </div>
  </li>`;
}

function renderMastery(rows: readonly TidalArchiveMasteryRow[]): string {
  return `<section class="archive-mastery" data-archive-mastery tabindex="-1" aria-labelledby="archive-mastery-title">
    <h3 id="archive-mastery-title">技能精通进度</h3>
    <p>普通航线中施放技能，结算后积累该技能的精通 XP。达到门槛会扩充候选池；局内达到所需潮阶并实际选中进化，才会记入档案。</p>
    <ul class="archive-mastery__rows">${rows.map(renderMasteryRow).join('')}</ul>
  </section>`;
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
      ${renderMastery(model.mastery)}
      <div class="archive-card-grid">${model.variants.map(renderVariantCard).join('')}</div>
    </section>
    <section class="archive-ledger archive-ledger--equipment">
      <header><span>LEDGER III</span><h2>装备蓝图册</h2></header>
      <div class="archive-card-grid">${model.equipment.map(renderEquipmentCard).join('')}</div>
    </section>
  </section>`;
}
