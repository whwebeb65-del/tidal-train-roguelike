import { CAPTAIN_CATALOG } from '../../src/domain/captain/CaptainCatalog';
import { CHIBI_ART } from '../assets/ChibiArtCatalog';

export function renderCaptainSelection(): string {
  const cards = CAPTAIN_CATALOG.map((captain) => {
    const art = CHIBI_ART.captains[captain.id]['skin-tide-base'];
    return `<button class="captain-choice-card" data-action="select-captain" data-captain-id="${captain.id}">
      <img src="${art}" alt="${captain.pronounLabel} ${captain.name}" />
      <span>
        <small>基础能力一致</small>
        <b>${captain.pronounLabel}</b>
        <em>${captain.name} · 形象与技能演出不同</em>
      </span>
    </button>`;
  }).join('');

  return `<section class="captain-select scene">
    <span class="eyebrow">FIRST DEPARTURE</span>
    <h1>选择你的列车长</h1>
    <p>选择只影响形象与技能演出，基础能力完全一致。之后可在车站随时切换，并为每位列车长收集可叠加属性的皮肤。</p>
    <div class="captain-choice-grid">${cards}</div>
  </section>`;
}
