import {
  getCaptainDefinition,
  type CaptainId,
} from '../../src/domain/captain/CaptainCatalog';
import {
  getSkinDefinition,
  type SkinId,
} from '../../src/domain/skin/SkinCatalog';
import { CHIBI_ART } from '../assets/ChibiArtCatalog';

export interface CombatSceneModel {
  readonly captainId: CaptainId;
  readonly skinId: SkinId;
  readonly boss: boolean;
  readonly enemyHp: number;
  readonly enemyMaxHp: number;
  readonly playerHp: number;
  readonly playerMaxHp: number;
  readonly skillCharges: number;
  readonly attackDamage: number;
  readonly skillDamage: number;
  readonly repairAmount: number;
  readonly burstDamage: number;
  readonly burstReady: boolean;
  readonly repairReady: boolean;
}

function percent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

export function renderCombatScene(model: CombatSceneModel): string {
  const captain = getCaptainDefinition(model.captainId);
  const skin = getSkinDefinition(model.skinId);
  if (!skin) throw new Error(`Unknown skin: ${model.skinId}`);
  const captainArt = CHIBI_ART.captains[model.captainId][model.skinId];
  const enemyArt = model.boss ? CHIBI_ART.tidalBoss : CHIBI_ART.pufferDragon;
  const enemyName = model.boss ? '潮汐巨兽 · 深海回响' : '鼓浪刺豚';
  const minions = model.boss
    ? ''
    : `<img class="combat-minion combat-minion--left" src="${CHIBI_ART.crystalCrab}" alt="" aria-hidden="true" />
       <img class="combat-minion combat-minion--right" src="${CHIBI_ART.crystalCrab}" alt="" aria-hidden="true" />`;

  return `<div class="combat-scene">
    <div class="combat-stage">
      <img class="station-hero__background" src="${CHIBI_ART.stationBackground}" alt="" aria-hidden="true" />
      <div class="combat-stage__party">
        <img class="combat-train" src="${CHIBI_ART.train}" alt="泡泡列车" />
        <img class="captain-art combat-captain" src="${captainArt}" alt="${captain.name} · ${skin.name}" />
        <img class="companion-art combat-companion" src="${CHIBI_ART.jellyfish}" alt="" aria-hidden="true" />
      </div>
      <div class="combat-stage__enemy ${model.enemyHp <= 0 ? 'is-defeated' : ''}">
        ${minions}
        <img class="combat-enemy-art" src="${enemyArt}" alt="${enemyName}" />
      </div>
    </div>
    <div class="combat-vitals">
      <div class="hp-line">
        <div><span>${model.boss ? 'Boss 生命' : '潮兽护甲'}</span><b>${model.enemyHp} / ${model.enemyMaxHp}</b></div>
        <div class="progress ${model.boss ? 'danger' : ''}"><i style="width:${percent(model.enemyHp, model.enemyMaxHp)}%"></i></div>
      </div>
      <div class="hp-line player-hp">
        <div><span>列车生命</span><b>${model.playerHp} / ${model.playerMaxHp}</b></div>
        <div class="progress"><i style="width:${percent(model.playerHp, model.playerMaxHp)}%"></i></div>
      </div>
    </div>
    <div class="skill-meter"><span>技能充能 ${model.skillCharges}/1</span><small>${model.skillCharges > 0 ? '汽笛共鸣已就绪' : '可通过广告立即刷新'}</small></div>
    <div class="battle-actions action-row">
      <button class="primary battle-action" data-action="combat-action" data-combat-action="attack">${model.boss ? '集中火力' : '自动开炮'} · -${model.attackDamage}</button>
      <button class="secondary battle-action" data-action="combat-action" data-combat-action="skill" ${model.skillCharges <= 0 || model.enemyHp <= 0 ? 'disabled' : ''}>汽笛共鸣 · -${model.skillDamage}</button>
      <button class="secondary battle-action repair-action" data-action="combat-action" data-combat-action="repair" ${!model.repairReady ? 'disabled' : ''}>维修车厢 · +${model.repairAmount}</button>
      <button class="burst-action ${model.burstReady ? 'burst-ready' : ''}" data-action="combat-action" data-combat-action="burst" ${!model.burstReady ? 'disabled' : ''}>潮汐爆发 · -${model.burstDamage}</button>
      <button class="debug-hit" data-action="damage">模拟受击 · -35</button>
    </div>
  </div>`;
}
