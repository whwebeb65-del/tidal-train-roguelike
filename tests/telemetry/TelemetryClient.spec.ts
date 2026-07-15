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

  it('records recovery and share-card events', () => {
    const telemetry = createMemoryTelemetry();
    telemetry.track({ name: 'revive_result', runId: 'r1', timestampMs: 4, payload: { type: 'share', hpRestored: 50 } });
    telemetry.track({ name: 'skill_refresh_result', runId: 'r1', timestampMs: 5, payload: { chargesGranted: 1 } });
    telemetry.track({ name: 'share_card_created', runId: 'r1', timestampMs: 6, payload: { depth: 3 } });
    expect(telemetry.flush().map((event) => event.name)).toEqual([
      'revive_result',
      'skill_refresh_result',
      'share_card_created',
    ]);
  });

  it('records launch campaign events without raw gift-code input', () => {
    const telemetry = createMemoryTelemetry();
    telemetry.track({ name: 'beta_application_result', runId: 'station', timestampMs: 7, payload: { result: 'qualified' } });
    telemetry.track({ name: 'campaign_reward_claimed', runId: 'station', timestampMs: 8, payload: { campaignReward: 'launch', gears: 188 } });
    telemetry.track({ name: 'gift_code_redeem_result', runId: 'station', timestampMs: 9, payload: { result: 'unknown-code', codeId: 'unknown' } });

    const events = telemetry.flush();
    expect(events.map((event) => event.name)).toEqual([
      'beta_application_result',
      'campaign_reward_claimed',
      'gift_code_redeem_result',
    ]);
    expect(events[2]?.payload).toEqual({ result: 'unknown-code', codeId: 'unknown' });
  });

  it('records the complete daily trial lifecycle', () => {
    const telemetry = createMemoryTelemetry();
    telemetry.track({ name: 'daily_trial_started', runId: 'daily-1', timestampMs: 10, payload: { seed: 42 } });
    telemetry.track({ name: 'daily_trial_submitted', runId: 'daily-1', timestampMs: 11, payload: { score: 20, assisted: false } });
    telemetry.track({ name: 'daily_trial_reward_claimed', runId: 'station', timestampMs: 12, payload: { milestoneId: 'participation' } });
    telemetry.track({ name: 'daily_trial_shared', runId: 'daily-1', timestampMs: 13, payload: { result: 'completed' } });

    expect(telemetry.flush().map((event) => event.name)).toEqual([
      'daily_trial_started',
      'daily_trial_submitted',
      'daily_trial_reward_claimed',
      'daily_trial_shared',
    ]);
  });
});
