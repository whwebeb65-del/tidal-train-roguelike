import {
  getCaptainDefinition,
  type CaptainId,
} from '../../src/domain/captain/CaptainCatalog';
import {
  getSkinDefinition,
  type SkinId,
} from '../../src/domain/skin/SkinCatalog';
import { CHIBI_ART } from '../assets/ChibiArtCatalog';

export interface StationHeroModel {
  readonly captainId: CaptainId;
  readonly skinId: SkinId;
  readonly mapName: string;
  readonly stationLevel: number;
  readonly maxHp: number;
  readonly damagePercent: number;
}

export function renderStationHero(model: StationHeroModel): string {
  const captain = getCaptainDefinition(model.captainId);
  const skin = getSkinDefinition(model.skinId);
  if (!skin) throw new Error(`Unknown skin: ${model.skinId}`);
  const captainArt = CHIBI_ART.captains[model.captainId][model.skinId];

  return `<section class="station-hero" aria-labelledby="station-hero-title">
    <img class="station-hero__background" src="${CHIBI_ART.stationBackground}" alt="" aria-hidden="true" />
    <div class="station-hero__copy">
      <span class="eyebrow">STATION ${model.stationLevel} · READY</span>
      <h1 id="station-hero-title">潮汐列车，准备启航</h1>
      <p>选择路线，带上本局构筑，在潮位改变前抵达下一座车站。</p>
      <div class="station-hero__chips">
        <span class="chip">当前航线 · ${model.mapName}</span>
        <span class="chip">生命 ${model.maxHp}</span>
        <span class="chip">永久伤害 +${model.damagePercent}%</span>
      </div>
      <button class="primary station-hero__start" data-action="start-run">驾驶泡泡列车出发</button>
    </div>
    <img class="station-hero__train" src="${CHIBI_ART.train}" alt="泡泡列车" />
    <img class="captain-art station-hero__captain" src="${captainArt}" alt="${captain.name} · ${skin.name}" />
    <img class="companion-art station-hero__otter" src="${CHIBI_ART.otter}" alt="" aria-hidden="true" />
    <img class="companion-art station-hero__jellyfish" src="${CHIBI_ART.jellyfish}" alt="" aria-hidden="true" />
  </section>`;
}
