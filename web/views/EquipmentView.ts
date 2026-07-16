import {
  EQUIPMENT_SET_BONUSES,
  getEquipmentDefinition,
  type EquipmentAffix,
  type EquipmentAffixId,
  type EquipmentSetId,
  type EquipmentSlot,
} from '../../src/domain/equipment/EquipmentCatalog';
import type { EquipmentInstance, EquipmentState } from '../../src/domain/equipment/EquipmentSystem';
import type { PermanentStatModifiers } from '../../src/domain/progression/ProgressionTypes';

export const PROTOTYPE_REROLL = {
  cannon: [{ id: 'damage-percent', value: 0.01 }],
  carriage: [{ id: 'max-hp-percent', value: 0.01 }],
  core: [{ id: 'initial-momentum', value: 3 }],
  instrument: [{ id: 'gears-percent', value: 0.01 }],
} as const satisfies Readonly<Record<EquipmentSlot, readonly EquipmentAffix[]>>;

export interface EquipmentViewModel {
  readonly state: EquipmentState;
}

const SLOTS: readonly EquipmentSlot[] = ['cannon', 'carriage', 'core', 'instrument'];
const SLOT_LABELS: Readonly<Record<EquipmentSlot, string>> = {
  cannon: '主炮',
  carriage: '车体',
  core: '动力核',
  instrument: '潮汐仪',
};
const SET_LABELS: Readonly<Record<EquipmentSetId, string>> = {
  'tide-guard': '潮泡守望',
  'coral-assault': '珊瑚突击',
};
const AFFIX_LABELS: Readonly<Record<EquipmentAffixId, string>> = {
  'max-hp-percent': '生命',
  'damage-percent': '伤害',
  'gears-percent': '齿轮收益',
  'initial-momentum': '开场动能',
  'repair-flat': '维修',
};

function modifierSummary(modifiers: PermanentStatModifiers): string {
  return [
    modifiers.maxHpFlat ? `生命 +${modifiers.maxHpFlat}` : '',
    modifiers.maxHpPercent ? `生命 +${modifiers.maxHpPercent * 100}%` : '',
    modifiers.damageFlat ? `伤害 +${modifiers.damageFlat}` : '',
    modifiers.damagePercent ? `伤害 +${modifiers.damagePercent * 100}%` : '',
    modifiers.gearsPercent ? `齿轮 +${modifiers.gearsPercent * 100}%` : '',
    modifiers.initialMomentum ? `动能 +${modifiers.initialMomentum}` : '',
    modifiers.repairFlat ? `维修 +${modifiers.repairFlat}` : '',
  ].filter(Boolean).join(' · ');
}

function affixLabel(affix: EquipmentAffix): string {
  const percentage = affix.id.endsWith('percent');
  return `${AFFIX_LABELS[affix.id]} +${percentage ? `${affix.value * 100}%` : affix.value}`;
}

function renderEquipmentCard(instance: EquipmentInstance, state: EquipmentState): string {
  const definition = getEquipmentDefinition(instance.definitionId);
  const equipped = state.equippedEquipmentIds[definition.slot] === instance.instanceId;
  const upgradeCost = instance.level * 20;
  const starCost = (instance.stars + 1) * 10;
  const fragments = state.fragments[instance.definitionId] ?? 0;
  const rerollPreview = PROTOTYPE_REROLL[definition.slot].map(affixLabel).join(' · ');

  return `<article class="equipment-card ${equipped ? 'is-equipped' : ''}">
    <div class="equipment-card__heading"><small>${SLOT_LABELS[definition.slot]} · ${SET_LABELS[definition.setId]}</small><span>${'★'.repeat(instance.stars)}${'☆'.repeat(5 - instance.stars)}</span></div>
    <h3>${definition.name}</h3>
    <p>Lv.${instance.level} · ${modifierSummary(definition.baseModifiers)}</p>
    <p>词条：${instance.affixes.length > 0 ? instance.affixes.map(affixLabel).join(' · ') : '暂无'}</p>
    <div class="equipment-actions">
      <button class="secondary" data-action="equip-equipment" data-instance-id="${instance.instanceId}" ${equipped ? 'disabled' : ''}>${equipped ? '已装备' : '装备'}</button>
      <button class="chip" data-action="upgrade-equipment" data-instance-id="${instance.instanceId}" ${instance.level >= 20 ? 'disabled' : ''}>强化 · ${upgradeCost} 齿轮</button>
      <button class="chip" data-action="star-equipment" data-instance-id="${instance.instanceId}" ${instance.stars >= 5 ? 'disabled' : ''}>升星 · ${starCost} 碎片（${fragments}）</button>
      <button class="chip" data-action="reroll-equipment" data-instance-id="${instance.instanceId}">定向重铸 · 50 齿轮<br /><small>${rerollPreview}</small></button>
    </div>
  </article>`;
}

export function renderEquipment(model: EquipmentViewModel): string {
  const { state } = model;
  const equippedInstances = new Set(Object.values(state.equippedEquipmentIds).filter(Boolean));
  const setCounts = new Map<EquipmentSetId, number>();
  for (const instance of state.inventory) {
    if (!equippedInstances.has(instance.instanceId)) continue;
    const setId = getEquipmentDefinition(instance.definitionId).setId;
    setCounts.set(setId, (setCounts.get(setId) ?? 0) + 1);
  }

  const slots = SLOTS.map((slot) => {
    const instanceId = state.equippedEquipmentIds[slot];
    const instance = state.inventory.find((item) => item.instanceId === instanceId);
    const name = instance ? getEquipmentDefinition(instance.definitionId).name : '未装备';
    return `<div class="equipment-slot" data-slot="${slot}"><small>${SLOT_LABELS[slot]}</small><b>${name}</b></div>`;
  }).join('');

  const groups = SLOTS.map((slot) => {
    const cards = state.inventory
      .filter((instance) => getEquipmentDefinition(instance.definitionId).slot === slot)
      .map((instance) => renderEquipmentCard(instance, state))
      .join('');
    return `<section class="equipment-group"><h2>${SLOT_LABELS[slot]}</h2><div class="equipment-grid">${cards || '<p>暂无装备</p>'}</div></section>`;
  }).join('');

  const setBonuses = (Object.keys(EQUIPMENT_SET_BONUSES) as EquipmentSetId[]).map((setId) => {
    const count = setCounts.get(setId) ?? 0;
    const bonus = EQUIPMENT_SET_BONUSES[setId];
    return `<article class="set-bonus ${count >= 2 ? 'is-active' : ''}">
      <h3>${SET_LABELS[setId]} · ${count}/4</h3>
      <p>2 件：${modifierSummary(bonus.twoPiece)} ${count >= 2 ? '· 已激活' : ''}</p>
      <p>4 件：${modifierSummary(bonus.fourPiece)} ${count >= 4 ? '· 已激活' : ''}</p>
    </article>`;
  }).join('');

  return `<section class="equipment scene">
    <div class="run-heading"><div><span class="eyebrow">TRAIN EQUIPMENT</span><h1>四槽装备舱</h1><p>装备、强化、升星和定向重铸都会保留。付费装备与免费装备遵循同一套成长规则。</p></div><button class="secondary" data-nav-scene="captain">返回角色</button></div>
    <div class="equipment-layout">
      <aside>
        <div class="equipment-loadout">${slots}</div>
        <div class="equipment-wallet"><span>可用齿轮</span><b>${state.gears}</b></div>
        <div class="set-bonus-list">${setBonuses}</div>
      </aside>
      <div class="equipment-inventory">${groups}</div>
    </div>
  </section>`;
}
