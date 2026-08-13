import type { EnemyState } from './BattleTypes';
import type { RenderBudget } from './QualityMonitor';

export type BossTelegraphPhase = 'summon' | 'tide' | 'enraged';

export interface BossTelegraphView {
  readonly phase: BossTelegraphPhase;
  readonly detail: 1 | 2 | 3;
  readonly progress: number;
  readonly motionPhase: number;
  readonly safeLane: 0 | 1 | 2;
  readonly tideWarning: boolean;
  readonly weakPointOpen: boolean;
}

export interface BossTelegraphInput {
  readonly enemy: EnemyState;
  readonly timeMs: number;
  readonly reducedMotion: boolean;
  readonly backgroundLayers: RenderBudget['backgroundLayers'];
}

export function createBossTelegraphView(input: BossTelegraphInput): BossTelegraphView | null {
  const behaviour = input.enemy.behaviour;
  if (!input.enemy.alive || input.enemy.kind !== 'deep-echo-boss' || !behaviour) return null;
  const phase = behaviour.phase === 'boss-summon'
    ? 'summon'
    : behaviour.phase === 'boss-tide'
      ? 'tide'
      : behaviour.phase === 'boss-enraged'
        ? 'enraged'
        : null;
  if (!phase) return null;
  const tideWarning = phase === 'tide' && behaviour.phaseRemainingMs <= 1200;
  const durationMs = phase === 'summon'
    ? 8000
    : phase === 'tide'
      ? tideWarning ? 1200 : 3600
      : behaviour.weakPointOpen ? 1400 : 1800;
  const remainingMs = Number.isFinite(behaviour.phaseRemainingMs)
    ? Math.max(0, behaviour.phaseRemainingMs)
    : durationMs;
  const progress = Math.min(1, Math.max(0, 1 - remainingMs / durationMs));
  const safeTimeMs = Number.isFinite(input.timeMs) ? input.timeMs : 0;
  return Object.freeze({
    phase,
    detail: input.backgroundLayers === 4 ? 3 : input.backgroundLayers === 3 ? 2 : 1,
    progress,
    motionPhase: input.reducedMotion ? 0 : ((safeTimeMs / 1800) % 1 + 1) % 1,
    safeLane: behaviour.safeLane,
    tideWarning,
    weakPointOpen: behaviour.weakPointOpen,
  });
}
