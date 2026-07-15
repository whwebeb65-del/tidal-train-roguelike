import { beforeEach, describe, expect, it } from 'vitest';
import { advanceBoss, createBoss } from '../../../src/domain/boss/TidalBeastBoss';
import { resetSettlements, settleRun } from '../../../src/domain/settlement/SettlementService';

describe('Boss and SettlementService', () => {
  beforeEach(() => {
    resetSettlements();
  });

  it('changes boss pattern after a charge interval', () => {
    const next = advanceBoss(createBoss(), 12);
    expect(next.pattern).toBe('charge');
  });

  it('cycles to flood after the second interval', () => {
    const next = advanceBoss(createBoss(), 22);
    expect(next.pattern).toBe('flood');
  });

  it('does not grant rewards twice for one run id', () => {
    const input = { runId: 'run-1', outcome: 'victory' as const, gears: 40 };
    expect(settleRun(input).gearsGranted).toBe(40);
    const retry = settleRun(input);
    expect(retry.alreadySettled).toBe(true);
    expect(retry.gearsGranted).toBe(0);
  });

  it('rewards victory more than extraction and extraction more than defeat', () => {
    expect(settleRun({ runId: 'win', outcome: 'victory', gears: 40 }).gearsGranted).toBeGreaterThan(
      settleRun({ runId: 'extract', outcome: 'extract', gears: 40 }).gearsGranted,
    );
    expect(settleRun({ runId: 'extract-2', outcome: 'extract', gears: 40 }).gearsGranted).toBeGreaterThan(
      settleRun({ runId: 'defeat', outcome: 'defeat', gears: 40 }).gearsGranted,
    );
  });
});
