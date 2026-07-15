import { describe, expect, it } from 'vitest';
import { createWave } from '../../../src/domain/combat/EnemySpawner';

describe('EnemySpawner', () => {
  it('recreates the same wave from the same seed', () => {
    expect(createWave(12, 2)).toEqual(createWave(12, 2));
  });

  it('changes the wave when the seed changes', () => {
    expect(createWave(12, 2)).not.toEqual(createWave(13, 2));
  });

  it('creates a non-empty wave with valid values', () => {
    const wave = createWave(12, 0);
    expect(wave.length).toBeGreaterThan(0);
    expect(wave.every((enemy) => enemy.hp > 0 && enemy.speed > 0)).toBe(true);
  });
});
