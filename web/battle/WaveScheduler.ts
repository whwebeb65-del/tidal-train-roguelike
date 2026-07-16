import type { EnemyKind } from './BattleTypes';
import { SeededRandom } from './SeededRandom';

export interface SpawnInstruction {
  readonly spawnAtMs: number;
  readonly wave: number;
  readonly kind: Exclude<
    EnemyKind,
    'storm-ray-elite' | 'deep-echo-boss'
  >;
  readonly lane: 0 | 1 | 2;
  readonly xOffset: number;
}

const WAVES = [
  {
    wave: 1,
    startMs: 0,
    endMs: 27_000,
    counts: { 'bubble-fin': 18, 'needle-jelly': 0, 'reef-crab': 0 },
  },
  {
    wave: 2,
    startMs: 30_000,
    endMs: 59_000,
    counts: { 'bubble-fin': 14, 'needle-jelly': 8, 'reef-crab': 0 },
  },
  {
    wave: 3,
    startMs: 62_000,
    endMs: 92_000,
    counts: { 'bubble-fin': 12, 'needle-jelly': 8, 'reef-crab': 6 },
  },
  {
    wave: 4,
    startMs: 95_000,
    endMs: 127_000,
    counts: { 'bubble-fin': 16, 'needle-jelly': 12, 'reef-crab': 6 },
  },
] as const;

export function createWaveSchedule(
  seed: number,
): readonly SpawnInstruction[] {
  const random = new SeededRandom(seed ^ 0x54_49_44_45);
  const result: SpawnInstruction[] = [];

  for (const wave of WAVES) {
    const kinds = Object.entries(wave.counts).flatMap(([kind, count]) =>
      Array.from(
        { length: count },
        () => kind as SpawnInstruction['kind'],
      ),
    );

    for (let index = kinds.length - 1; index > 0; index -= 1) {
      const swap = random.int(0, index);
      const current = kinds[index] as SpawnInstruction['kind'];
      kinds[index] = kinds[swap] as SpawnInstruction['kind'];
      kinds[swap] = current;
    }

    const spacing = (wave.endMs - wave.startMs)
      / Math.max(1, kinds.length - 1);
    kinds.forEach((kind, index) => {
      result.push({
        spawnAtMs: Math.round(wave.startMs + spacing * index),
        wave: wave.wave,
        kind,
        lane: random.int(0, 2) as 0 | 1 | 2,
        xOffset: random.int(-14, 14),
      });
    });
  }

  return result.sort((left, right) => left.spawnAtMs - right.spawnAtMs);
}

export function getWaveAtTime(elapsedMs: number): number {
  if (elapsedMs < 30_000) return 1;
  if (elapsedMs < 62_000) return 2;
  if (elapsedMs < 95_000) return 3;
  if (elapsedMs < 130_000) return 4;
  return 5;
}
