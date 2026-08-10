import type { BattleFrameView } from './BattleTypes';
import type { MapId } from '../../src/domain/station/MapProgression';

export interface BattleAtmosphereView {
  readonly wash: string;
  readonly horizonGlow: string;
  readonly vignette: number;
  readonly danger: number;
  readonly boss: number;
}

const MAP_WASH = {
  'drift-suburb': '#0d7f88',
  'old-port': '#177f86',
  'glass-city': '#356a83',
  'deep-tunnel': '#3d527c',
} as const satisfies Readonly<Record<MapId, string>>;

export function getBattleAtmosphere(
  frame: BattleFrameView,
): BattleAtmosphereView {
  const boss = frame.status === 'boss-intro' || frame.enemies.some(
    (enemy) => enemy.alive && enemy.kind === 'deep-echo-boss',
  ) ? 1 : 0;
  const hpRatio = frame.trainHp / Math.max(1, frame.maxTrainHp);
  const hpDanger = hpRatio < 0.35 ? 1 - hpRatio : 0;
  const danger = Math.min(1, Math.max(boss * 0.72, hpDanger));
  const baseWash = MAP_WASH[frame.mapId];

  return {
    wash: danger > 0 ? (boss ? '#28366f' : '#75546e') : baseWash,
    horizonGlow: boss ? '#ff7b72' : '#ffe49a',
    vignette: 0.12 + danger * 0.22,
    danger,
    boss,
  };
}
