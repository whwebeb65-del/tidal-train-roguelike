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
  readonly reducedMotion: boolean;
}

export function renderStationHero(model: StationHeroModel): string {
  const captain = getCaptainDefinition(model.captainId);
  const skin = getSkinDefinition(model.skinId);
  if (!skin) throw new Error(`Unknown skin: ${model.skinId}`);
  const captainArt = CHIBI_ART.captains[model.captainId][model.skinId];

  return `<section class="station-hero" data-reduced-motion="${model.reducedMotion}" aria-labelledby="station-hero-title">
    <div class="station-hero__world" data-motion-role="background" aria-hidden="true">
      <img class="station-layer station-layer--sky" data-station-layer="sky" data-station-art src="${CHIBI_ART.station.sky}" alt="" />
      <img class="station-layer station-layer--horizon" data-station-layer="horizon" data-station-art src="${CHIBI_ART.station.horizon}" alt="" />
      <img class="station-layer station-layer--platform" data-station-layer="platform" data-station-art src="${CHIBI_ART.station.platform}" alt="" />
      <img class="station-layer station-layer--foreground" data-station-layer="foreground" data-station-art src="${CHIBI_ART.station.foreground}" alt="" />
      <span class="station-lamp station-lamp--left" data-ambient-role="lamp-left"></span>
      <span class="station-lamp station-lamp--right" data-ambient-role="lamp-right"></span>
      <img class="station-ambient station-ambient--distant-train" data-ambient-role="distant-train" data-station-art src="${CHIBI_ART.station.distantTrain}" alt="" />
      <img class="station-ambient station-ambient--mail-fish" data-ambient-role="mail-fish" data-station-art src="${CHIBI_ART.station.mailFish}" alt="" />
    </div>
    <div class="station-ticket">
      <span class="station-ticket__stamp">STATION ${model.stationLevel}</span>
      <h1 id="station-hero-title">潮汐末班站</h1>
      <p>夕潮将落，带上本局构筑前往下一站。</p>
      <div class="station-ticket__facts">
        <span>航线 ${model.mapName}</span>
        <span>生命 ${model.maxHp}</span>
        <span>永久伤害 +${model.damagePercent}%</span>
      </div>
      <button class="station-departure" data-action="start-run">检票出发</button>
    </div>
    <div class="station-hero__vehicle" data-motion-role="vehicle">
      <div class="station-hero__wake" data-motion-role="wake" aria-hidden="true"><i></i><i></i><i></i></div>
      <span class="station-hero__engine-glow" data-motion-role="engine" aria-hidden="true"></span>
      <span class="station-service-hatch" data-ambient-role="service-hatch" aria-hidden="true"></span>
      <span class="station-art-fallback station-art-fallback--train" aria-hidden="true"></span>
      <img class="station-hero__train" data-motion-role="train" data-station-art src="${CHIBI_ART.train}" alt="泡泡列车" />
      <button class="station-hero__captain-button" data-action="captain-greeting" aria-label="和列车长打招呼">
        <span class="station-art-fallback station-art-fallback--captain" aria-hidden="true"></span>
        <img class="captain-art station-hero__captain" data-motion-role="captain" data-ambient-role="captain" data-station-art src="${captainArt}" alt="${captain.name} · ${skin.name}" />
      </button>
      <img class="companion-art station-hero__otter" data-motion-role="otter" data-ambient-role="otter" data-station-art src="${CHIBI_ART.otter}" alt="" aria-hidden="true" />
      <img class="companion-art station-hero__jellyfish" data-motion-role="jellyfish" data-ambient-role="jellyfish" data-station-art src="${CHIBI_ART.jellyfish}" alt="" aria-hidden="true" />
    </div>
    <p class="station-dialogue" data-ambient-role="dialogue" aria-live="polite"></p>
  </section>`;
}
