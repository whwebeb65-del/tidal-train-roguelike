export type BossPattern = 'wave' | 'charge' | 'flood';

export interface BossState {
  readonly id: 'tidal-beast';
  readonly hp: number;
  readonly maxHp: number;
  readonly pattern: BossPattern;
  readonly patternIndex: number;
}

export function createBoss(): BossState {
  return {
    id: 'tidal-beast',
    hp: 500,
    maxHp: 500,
    pattern: 'wave',
    patternIndex: 0,
  };
}

export function advanceBoss(state: BossState, elapsedSeconds: number): BossState {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error('Elapsed seconds must be a finite non-negative number');
  }

  const patternIndex = Math.floor(elapsedSeconds / 10) % 3;
  const patterns: readonly BossPattern[] = ['wave', 'charge', 'flood'];
  return {
    ...state,
    pattern: patterns[patternIndex],
    patternIndex,
  };
}
