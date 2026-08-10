import type { MapId } from '../../src/domain/station/MapProgression';
import {
  getMapCombatProfile,
  type ScheduledEnemyKind,
} from './MapCombatProfiles';
import { SeededRandom } from './SeededRandom';

export type BattleSegment = 1 | 3 | 4 | 6 | 7 | 8 | 9;

export interface SpawnInstruction {
  readonly spawnAtMs: number;
  readonly wave: number;
  readonly segment: BattleSegment;
  readonly kind: ScheduledEnemyKind;
  readonly lane: 0 | 1 | 2;
  readonly xOffset: number;
}

type Composition = Readonly<Record<ScheduledEnemyKind, number>>;

const ACTIVE_SEGMENTS: readonly {
  readonly segment: BattleSegment;
  readonly wave: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly counts: Composition;
}[] = [
  { segment: 1, wave: 1, startMs: 0, endMs: 45_000, counts: {
    'bubble-fin': 18, 'needle-jelly': 0, 'reef-crab': 0,
    'tide-shell-hatchling': 7, 'lantern-ray': 0, 'tide-parasite-snail': 0,
  } },
  { segment: 3, wave: 2, startMs: 51_000, endMs: 110_000, counts: {
    'bubble-fin': 20, 'needle-jelly': 12, 'reef-crab': 0,
    'tide-shell-hatchling': 8, 'lantern-ray': 0, 'tide-parasite-snail': 0,
  } },
  { segment: 4, wave: 3, startMs: 116_000, endMs: 165_000, counts: {
    'bubble-fin': 16, 'needle-jelly': 16, 'reef-crab': 6,
    'tide-shell-hatchling': 8, 'lantern-ray': 5, 'tide-parasite-snail': 0,
  } },
  { segment: 6, wave: 4, startMs: 166_000, endMs: 231_000, counts: {
    'bubble-fin': 18, 'needle-jelly': 15, 'reef-crab': 12,
    'tide-shell-hatchling': 8, 'lantern-ray': 6, 'tide-parasite-snail': 0,
  } },
  { segment: 7, wave: 5, startMs: 232_000, endMs: 274_000, counts: {
    'bubble-fin': 18, 'needle-jelly': 18, 'reef-crab': 15,
    'tide-shell-hatchling': 8, 'lantern-ray': 6, 'tide-parasite-snail': 5,
  } },
  { segment: 8, wave: 6, startMs: 275_000, endMs: 319_000, counts: {
    'bubble-fin': 16, 'needle-jelly': 14, 'reef-crab': 13,
    'tide-shell-hatchling': 6, 'lantern-ray': 5, 'tide-parasite-snail': 4,
  } },
  { segment: 9, wave: 7, startMs: 320_000, endMs: 344_999, counts: {
    'bubble-fin': 4, 'needle-jelly': 4, 'reef-crab': 3,
    'tide-shell-hatchling': 2, 'lantern-ray': 2, 'tide-parasite-snail': 1,
  } },
] as const;

export function createWaveSchedule(
  seed: number,
  mapId: MapId = 'drift-suburb',
): readonly SpawnInstruction[] {
  const random = new SeededRandom(seed ^ 0x54_49_44_45);
  const scale = getMapCombatProfile(mapId).compositionScale;
  const result: SpawnInstruction[] = [];

  for (const segment of ACTIVE_SEGMENTS) {
    const kinds = Object.entries(segment.counts).flatMap(([kind, count]) => (
      Array.from(
        { length: Math.max(0, Math.round(count * scale[kind as ScheduledEnemyKind])) },
        () => kind as ScheduledEnemyKind,
      )
    ));
    for (let index = kinds.length - 1; index > 0; index -= 1) {
      const swap = random.int(0, index);
      [kinds[index], kinds[swap]] = [kinds[swap]!, kinds[index]!];
    }
    const spacing = (segment.endMs - segment.startMs)
      / Math.max(1, kinds.length - 1);
    kinds.forEach((kind, index) => result.push({
      spawnAtMs: Math.round(segment.startMs + spacing * index),
      wave: segment.wave,
      segment: segment.segment,
      kind,
      lane: random.int(0, 2) as 0 | 1 | 2,
      xOffset: random.int(-14, 14),
    }));
  }

  return result.sort((left, right) => left.spawnAtMs - right.spawnAtMs);
}

export function getWaveAtTime(elapsedMs: number): number {
  if (elapsedMs < 51_000) return 1;
  if (elapsedMs < 116_000) return 2;
  if (elapsedMs < 166_000) return 3;
  if (elapsedMs < 232_000) return 4;
  if (elapsedMs < 275_000) return 5;
  if (elapsedMs < 320_000) return 6;
  return 7;
}
