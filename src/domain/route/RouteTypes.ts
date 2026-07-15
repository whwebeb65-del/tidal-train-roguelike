export type RouteNodeType = 'combat' | 'rescue' | 'shop' | 'repair' | 'event' | 'boss';

export interface RouteNode {
  readonly id: string;
  readonly depth: number;
  readonly type: RouteNodeType;
  readonly nextNodeIds: readonly string[];
  readonly risk: number;
}

export interface RewardOption {
  readonly id: string;
  readonly kind: 'passenger' | 'module' | 'temporary' | 'gear';
  readonly contentId: string;
}
