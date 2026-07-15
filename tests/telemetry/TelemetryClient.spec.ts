import { describe, expect, it } from 'vitest';
import { createMemoryTelemetry } from '../../src/telemetry/TelemetryClient';

describe('TelemetryClient', () => {
  it('records event name and run id', () => {
    const telemetry = createMemoryTelemetry();
    telemetry.track({ name: 'run_start', runId: 'r1', timestampMs: 1, payload: { seed: 7 } });
    expect(telemetry.flush()).toHaveLength(1);
  });

  it('flush returns a copy and clears buffered events', () => {
    const telemetry = createMemoryTelemetry();
    telemetry.track({ name: 'run_restart', runId: 'r1', timestampMs: 2, payload: {} });
    const events = telemetry.flush();
    expect(events).toHaveLength(1);
    expect(telemetry.flush()).toHaveLength(0);
  });

  it('copies event payloads at track time', () => {
    const telemetry = createMemoryTelemetry();
    const payload: Record<string, string | number | boolean> = { source: 'button' };
    telemetry.track({ name: 'first_action', runId: 'r1', timestampMs: 3, payload });
    payload.source = 'mutated';
    expect(telemetry.flush()[0]?.payload.source).toBe('button');
  });
});
