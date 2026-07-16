import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../../../web/battle/SeededRandom';

describe('SeededRandom', () => {
  it('replays the same sequence and validates integer ranges', () => {
    const first = new SeededRandom(42);
    const second = new SeededRandom(42);

    expect([
      first.next(),
      first.next(),
      first.int(3, 9),
      first.pick(['a', 'b', 'c']),
    ]).toEqual([
      second.next(),
      second.next(),
      second.int(3, 9),
      second.pick(['a', 'b', 'c']),
    ]);
    expect(() => first.int(5, 4)).toThrow(
      'Random integer range is invalid',
    );
    expect(() => first.pick([])).toThrow(
      'Cannot pick from an empty collection',
    );
  });
});
