export interface SettlementInput {
  readonly runId: string;
  readonly outcome: 'victory' | 'defeat' | 'extract';
  readonly gears: number;
}

export interface SettlementResult {
  readonly runId: string;
  readonly outcome: SettlementInput['outcome'];
  readonly gearsGranted: number;
  readonly alreadySettled: boolean;
}

const settledRunIds = new Set<string>();

function validateInput(input: SettlementInput): void {
  if (input.runId.trim().length === 0) {
    throw new Error('Run id is required');
  }
  if (!Number.isFinite(input.gears) || input.gears < 0) {
    throw new Error('Gears must be a finite non-negative number');
  }
}

function calculateReward(input: SettlementInput): number {
  switch (input.outcome) {
    case 'victory':
      return Math.floor(input.gears);
    case 'extract':
      return Math.max(1, Math.floor(input.gears * 0.7));
    case 'defeat':
      return Math.max(1, Math.floor(input.gears * 0.25));
  }
}

export function settleRun(input: SettlementInput): SettlementResult {
  validateInput(input);
  if (settledRunIds.has(input.runId)) {
    return {
      runId: input.runId,
      outcome: input.outcome,
      gearsGranted: 0,
      alreadySettled: true,
    };
  }

  settledRunIds.add(input.runId);
  return {
    runId: input.runId,
    outcome: input.outcome,
    gearsGranted: calculateReward(input),
    alreadySettled: false,
  };
}

export function resetSettlements(): void {
  settledRunIds.clear();
}
