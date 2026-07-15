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
});
