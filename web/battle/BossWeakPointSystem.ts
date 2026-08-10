import { ENEMY_GEOMETRY } from './EnemyGeometry';
import type { EnemyState } from './BattleTypes';

export interface BattlePoint {
  readonly x: number;
  readonly y: number;
}

export interface BossWeakPoint extends BattlePoint {
  readonly radius: number;
}

export function getBossWeakPoint(
  enemy: EnemyState,
): BossWeakPoint | null {
  if (
    !enemy.alive
    || enemy.kind !== 'deep-echo-boss'
    || !enemy.behaviour?.weakPointOpen
  ) {
    return null;
  }
  return {
    x: enemy.x,
    y: enemy.y + ENEMY_GEOMETRY['deep-echo-boss'].height * 0.05,
    radius: 20,
  };
}

export function segmentHitsCircle(
  start: BattlePoint,
  end: BattlePoint,
  circle: BossWeakPoint,
): boolean {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const progress = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, (
      (circle.x - start.x) * deltaX
      + (circle.y - start.y) * deltaY
    ) / lengthSquared));
  const nearestX = start.x + deltaX * progress;
  const nearestY = start.y + deltaY * progress;
  return Math.hypot(circle.x - nearestX, circle.y - nearestY)
    <= circle.radius;
}

