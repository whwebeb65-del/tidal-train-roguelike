import { describe, expect, it } from 'vitest';
import { ENEMY_CONFIG } from '../../../web/battle/BattleConfig';
import {
  ENEMY_GEOMETRY,
  ENEMY_HUD_GAP,
  ENEMY_LABELS,
  HUD_SAFE_BOTTOM_Y,
  enemySpawnY,
} from '../../../web/battle/EnemyGeometry';
import type { EnemyKind } from '../../../web/battle/BattleTypes';

describe('EnemyGeometry', () => {
  it('gives every drift-suburb role distinct readable geometry and tuning', () => {
    const kinds = [
      'tide-shell-hatchling',
      'lantern-ray',
      'tide-parasite-snail',
    ] as const satisfies readonly EnemyKind[];

    expect(new Set(kinds.map((kind) => ENEMY_LABELS[kind])).size).toBe(3);
    expect(new Set(kinds.map((kind) => (
      `${ENEMY_GEOMETRY[kind].width}x${ENEMY_GEOMETRY[kind].height}`
    ))).size).toBe(3);

    for (const kind of kinds) {
      expect(ENEMY_CONFIG[kind].hp).toBeGreaterThan(0);
      expect(ENEMY_CONFIG[kind].experience).toBeGreaterThan(0);
      const spriteTop = enemySpawnY(kind) - ENEMY_GEOMETRY[kind].height * 0.55;
      expect(spriteTop).toBeGreaterThanOrEqual(HUD_SAFE_BOTTOM_Y + ENEMY_HUD_GAP);
    }
  });
});
