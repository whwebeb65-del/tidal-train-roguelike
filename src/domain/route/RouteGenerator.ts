import type { RouteNode } from './RouteTypes';

function createRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function createRoute(seed: number): readonly RouteNode[] {
  const random = createRandom(seed);
  const firstBranchIsShop = random() >= 0.5;
  const rootRisk = Number((0.1 + random() * 0.1).toFixed(2));
  const secondRisk = Number((0.2 + random() * 0.15).toFixed(2));
  const thirdRisk = Number((0.35 + random() * 0.2).toFixed(2));

  const firstA: RouteNode = {
    id: 'node-1-a',
    depth: 1,
    type: firstBranchIsShop ? 'shop' : 'rescue',
    nextNodeIds: ['node-2'],
    risk: secondRisk,
  };
  const firstB: RouteNode = {
    id: 'node-1-b',
    depth: 1,
    type: firstBranchIsShop ? 'rescue' : 'shop',
    nextNodeIds: ['node-2'],
    risk: secondRisk + 0.05,
  };

  return [
    {
      id: 'node-0',
      depth: 0,
      type: 'combat',
      nextNodeIds: ['node-1-a', 'node-1-b'],
      risk: rootRisk,
    },
    firstA,
    firstB,
    {
      id: 'node-2',
      depth: 2,
      type: 'event',
      nextNodeIds: ['node-3-a', 'node-3-b'],
      risk: thirdRisk,
    },
    {
      id: 'node-3-a',
      depth: 3,
      type: 'repair',
      nextNodeIds: ['node-4-boss'],
      risk: thirdRisk + 0.05,
    },
    {
      id: 'node-3-b',
      depth: 3,
      type: 'combat',
      nextNodeIds: ['node-4-boss'],
      risk: thirdRisk + 0.15,
    },
    {
      id: 'node-4-boss',
      depth: 4,
      type: 'boss',
      nextNodeIds: [],
      risk: 0.9,
    },
  ];
}
