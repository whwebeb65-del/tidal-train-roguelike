import { getPrototypeCatalog } from '../../content/PrototypeCatalog';
import type { RewardOption } from './RouteTypes';

const temporaryRewards = ['speed-boost', 'shield-burst', 'reroll-token'];
const gearRewards = ['20', '30', '45'];

function hashNode(seed: number, nodeId: string): number {
  let value = seed >>> 0;
  for (const character of nodeId) {
    value = Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return value >>> 0;
}

export function createRewardOptions(seed: number, nodeId: string, offset = 0): readonly RewardOption[] {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('Reward offset must be a non-negative integer');
  }
  const catalog = getPrototypeCatalog();
  const candidates: RewardOption[] = [
    ...catalog.passengers.map((item) => ({ id: `passenger:${item.id}`, kind: 'passenger' as const, contentId: item.id })),
    ...catalog.modules.map((item) => ({ id: `module:${item.id}`, kind: 'module' as const, contentId: item.id })),
    ...temporaryRewards.map((contentId) => ({ id: `temporary:${contentId}`, kind: 'temporary' as const, contentId })),
    ...gearRewards.map((contentId) => ({ id: `gear:${contentId}`, kind: 'gear' as const, contentId })),
  ];

  const start = (hashNode(seed, nodeId) + offset * 3) % (candidates.length - 2);
  return [candidates[start], candidates[start + 1], candidates[start + 2]];
}
