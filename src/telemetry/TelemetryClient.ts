import type { PrototypeEvent } from './TelemetryEvents';

export interface TelemetryClient {
  track(event: PrototypeEvent): void;
  flush(): readonly PrototypeEvent[];
}

function cloneEvent(event: PrototypeEvent): PrototypeEvent {
  return {
    name: event.name,
    runId: event.runId,
    timestampMs: event.timestampMs,
    payload: { ...event.payload },
  };
}

export function createMemoryTelemetry(): TelemetryClient {
  let buffered: PrototypeEvent[] = [];
  return {
    track(event): void {
      if (!event.runId) {
        throw new Error('Telemetry events require a run ID');
      }
      if (!Number.isFinite(event.timestampMs)) {
        throw new Error('Telemetry events require a finite timestamp');
      }
      buffered.push(cloneEvent(event));
    },
    flush(): readonly PrototypeEvent[] {
      const events = buffered.map(cloneEvent);
      buffered = [];
      return events;
    },
  };
}

