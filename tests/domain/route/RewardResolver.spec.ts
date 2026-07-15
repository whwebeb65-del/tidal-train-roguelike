import { describe, expect, it } from 'vitest';
import { createRewardOptions } from '../../../src/domain/route/RewardResolver';

describe('RewardResolver', () => {
  it('creates three unique choices', () => {
    const options = createRewardOptions(17, 'node-2');
    expect(options).toHaveLength(3);
    expect(new Set(options.map((option) => option.id)).size).toBe(3);
  });

  it('recreates the same rewards from the same seed and node', () => {
    expect(createRewardOptions(17, 'node-2')).toEqual(createRewardOptions(17, 'node-2'));
    expect(createRewardOptions(17, 'node-2')).not.toEqual(createRewardOptions(18, 'node-2'));
  });

  it('creates a different deterministic set for the one-time reroll offset', () => {
    const original = createRewardOptions(17, 'node-2', 0);
    const rerolled = createRewardOptions(17, 'node-2', 1);

    expect(rerolled).toEqual(createRewardOptions(17, 'node-2', 1));
    expect(rerolled).not.toEqual(original);
    expect(new Set(rerolled.map((option) => option.id)).size).toBe(3);
  });

  it('rejects invalid reroll offsets', () => {
    expect(() => createRewardOptions(17, 'node-2', -1)).toThrow('Reward offset must be a non-negative integer');
    expect(() => createRewardOptions(17, 'node-2', 1.5)).toThrow('Reward offset must be a non-negative integer');
  });
});
