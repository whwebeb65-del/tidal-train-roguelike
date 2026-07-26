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
    endMs: 55_000,
    counts: { 'bubble-fin': 25, 'needle-jelly': 0, 'reef-crab': 0 },
  },
  {
    wave: 2,
    startMs: 58_000,
    endMs: 113_000,
    counts: { 'bubble-fin': 25, 'needle-jelly': 15, 'reef-crab': 0 },
  },
  {
    wave: 3,
    startMs: 116_000,
    endMs: 171_000,
    counts: { 'bubble-fin': 20, 'needle-jelly': 20, 'reef-crab': 10 },
  },
  {
    wave: 4,
    startMs: 174_000,
    endMs: 229_000,
    counts: { 'bubble-fin': 24, 'needle-jelly': 20, 'reef-crab': 15 },
  },
  {
    wave: 5,
    startMs: 232_000,
    endMs: 287_000,
    counts: { 'bubble-fin': 28, 'needle-jelly': 24, 'reef-crab': 18 },
  },
  {
    wave: 6,
    startMs: 290_000,
    endMs: 344_999,
    counts: { 'bubble-fin': 30, 'needle-jelly': 24, 'reef-crab': 20 },
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
  if (elapsedMs < 58_000) return 1;
  if (elapsedMs < 116_000) return 2;
  if (elapsedMs < 174_000) return 3;
  if (elapsedMs < 232_000) return 4;
  if (elapsedMs < 290_000) return 5;
  if (elapsedMs < 345_000) return 6;
  return 7;
}
