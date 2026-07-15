import type { EnemySpawn } from './CombatTypes';

function createRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function createWave(seed: number, waveIndex: number): readonly EnemySpawn[] {
  if (!Number.isInteger(waveIndex) || waveIndex < 0) {
    throw new Error('Wave index must be a non-negative integer');
  }

  const random = createRandom((seed ^ Math.imul(waveIndex + 1, 0x9e3779b9)) >>> 0);
  const count = 3 + Math.floor(random() * 3);

  return Array.from({ length: count }, (_, index) => ({
    id: `wave-${waveIndex}-enemy-${index}`,
    hp: 30 + waveIndex * 10 + Math.floor(random() * 11),
    speed: Number((40 + random() * 20).toFixed(2)),
  }));
}
