import {
  canUnlockMap,
  isMapUnlocked,
  MAP_PROGRESSION,
  stationUpgradeGearCost,
  type MapId,
} from '../../src/domain/station/MapProgression';
import { DAILY_TRIAL_MIN_STATION_LEVEL } from '../../src/domain/challenge/DailyTrialSystem';
import type { PlayerSave } from '../../src/save/SaveRepository';

export function renderStationRouteYard(
  save: PlayerSave,
  selectedMapId: MapId,
): string {
  let unlockedCount = 0;
  const cards = MAP_PROGRESSION.map((map, index) => {
    const unlocked = isMapUnlocked(save, map.id);
    const selected = unlocked && selectedMapId === map.id;
    const firstCleared = unlocked && save.firstClearMapIds.includes(map.id);
    if (unlocked) unlockedCount += 1;
    const action = unlocked
      ? `<button class="chip${selected ? ' selected' : ''}" data-action="select-map" data-map-id="${map.id}" aria-pressed="${selected}">${selected ? '当前路线' : '选择路线'}</button>`
      : canUnlockMap(save, map.id)
        ? `<button class="chip" data-action="unlock-map" data-map-id="${map.id}">解锁地图</button>`
        : `<span class="locked">车站 Lv.${map.minStationLevel} 开放</span>`;
    const record = unlocked
      ? `<span class="route-sign__stamp${firstCleared ? ' is-cleared' : ''}">${firstCleared ? '已首通' : '待首通'}</span>`
      : '';
    return `<article class="route-sign ${unlocked ? 'is-open' : 'is-locked'}${selected ? ' is-current' : ''}" data-route-id="${map.id}">
      <div class="route-sign__lamp" aria-hidden="true"></div>
      <div class="map-copy">
        <div class="route-sign__record"><small>航线 ${String(index + 1).padStart(2, '0')}</small>${record}</div>
        <h3>${map.name}</h3><p>${map.feature}</p>
      </div>
      ${action}
    </article>`;
  }).join('');
  return `<div class="station-route-yard living-zone">
    <div class="station-route-yard__heading"><h2>航线发车牌</h2><span>已开放 ${unlockedCount}/${MAP_PROGRESSION.length}</span></div>
    <div class="map-grid">${cards}</div>
  </div>`;
}

export function renderStationWorkOrder(save: PlayerSave): string {
  const nextLevel = save.stationLevel + 1;
  const cost = stationUpgradeGearCost(save.stationLevel);
  const shortage = Math.max(0, cost - save.gears);
  const nextRoute = MAP_PROGRESSION.find((map) => !isMapUnlocked(save, map.id));
  const nextRouteText = !nextRoute
    ? '航线已全部开放'
    : canUnlockMap(save, nextRoute.id)
      ? `下一条航线：${nextRoute.name} · 已达条件，可在发车牌解锁`
      : `下一条航线：${nextRoute.name} · 车站 Lv.${nextRoute.minStationLevel} 开放`;
  const trialText = nextLevel === DAILY_TRIAL_MIN_STATION_LEVEL
    ? `<small>升至 Lv.${DAILY_TRIAL_MIN_STATION_LEVEL} 即可开启每日潮汐试炼</small>`
    : '';
  return `<div class="station-work-order station-prop">
    <div>
      <span class="station-stamp">站务维修</span>
      <b>车站 Lv.${save.stationLevel} → Lv.${nextLevel}</b>
      <p class="station-work-order__funds" id="station-upgrade-funds">本次需要 ${cost} 齿轮 · 现有 ${save.gears} 齿轮</p>
      <small id="station-upgrade-availability" class="station-work-order__availability${shortage ? ' is-short' : ''}">${shortage ? `还差 ${shortage} 齿轮` : '齿轮已备齐'}</small>
      <small class="station-work-order__next-route">${nextRouteText}</small>
      ${trialText}
    </div>
    <button class="secondary" data-action="upgrade-station" aria-describedby="station-upgrade-funds station-upgrade-availability"${shortage ? ' disabled' : ''}>提交升级工单</button>
  </div>`;
}
