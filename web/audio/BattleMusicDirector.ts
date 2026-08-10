import type { BattleFrameView, EnemyKind } from '../battle/BattleTypes';

export type BattleMusicIntensity = 0 | 1 | 2 | 3;

const THREAT_WEIGHT: Readonly<Record<EnemyKind, number>> = {
  'bubble-fin': 1,
  'needle-jelly': 1,
  'reef-crab': 2,
  'tide-shell-hatchling': 1,
  'lantern-ray': 2,
  'tide-parasite-snail': 2,
  'storm-ray-elite': 5,
  'deep-echo-boss': 9,
};

export function selectBattleMusicIntensity(
  frame: BattleFrameView,
): BattleMusicIntensity {
  const living = frame.enemies.filter((enemy) => enemy.alive);
  if (living.some((enemy) => enemy.kind === 'deep-echo-boss')) return 3;
  const threat = living.reduce(
    (total, enemy) => total + THREAT_WEIGHT[enemy.kind],
    0,
  );
  const hpRatio = frame.maxTrainHp > 0 ? frame.trainHp / frame.maxTrainHp : 0;
  if (
    living.some((enemy) => enemy.kind === 'storm-ray-elite')
    || hpRatio <= 0.3
    || threat >= 10
  ) return 3;
  if (frame.wave >= 6 || hpRatio <= 0.55 || threat >= 6) return 2;
  if (frame.wave >= 3 || threat >= 3) return 1;
  return 0;
}
