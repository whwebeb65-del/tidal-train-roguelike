import type { EnemyKind } from './BattleTypes';

export const HUD_SAFE_BOTTOM_Y = 108;
export const ENEMY_HUD_GAP = 12;

export const ENEMY_GEOMETRY: Readonly<Record<EnemyKind, {
  readonly width: number;
  readonly height: number;
  readonly fallback: string;
}>> = {
  'bubble-fin': { width: 78, height: 78, fallback: '#7bd4de' },
  'needle-jelly': { width: 72, height: 84, fallback: '#77cbe9' },
  'reef-crab': { width: 84, height: 72, fallback: '#77cbd2' },
  'storm-ray-elite': { width: 158, height: 114, fallback: '#516ec7' },
  'deep-echo-boss': { width: 238, height: 178, fallback: '#304f9a' },
};

export const ENEMY_LABELS: Readonly<Record<EnemyKind, string>> = {
  'bubble-fin': '泡鳍怪',
  'needle-jelly': '针水母',
  'reef-crab': '礁蟹',
  'storm-ray-elite': '雷鳐督军',
  'deep-echo-boss': '深海回响',
};

export function enemySpawnY(
  kind: EnemyKind,
  hudBottomY = HUD_SAFE_BOTTOM_Y,
): number {
  return Math.ceil(
    hudBottomY + ENEMY_HUD_GAP + ENEMY_GEOMETRY[kind].height * 0.52,
  );
}
