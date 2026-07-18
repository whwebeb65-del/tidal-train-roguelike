import { describe, expect, it } from 'vitest';
import {
  StationAmbientDirector,
  type StationAmbientTimer,
} from '../../../web/station/StationAmbientDirector';

class ManualTimer implements StationAmbientTimer {
  public readonly delays: number[] = [];
  private nextId = 0;
  private readonly callbacks = new Map<
    ReturnType<typeof setTimeout>,
    () => void
  >();

  public get pendingCount(): number {
    return this.callbacks.size;
  }

  public set(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setTimeout> {
    const id = ++this.nextId as unknown as ReturnType<typeof setTimeout>;
    this.delays.push(delayMs);
    this.callbacks.set(id, callback);
    return id;
  }

  public clear(id: ReturnType<typeof setTimeout>): void {
    this.callbacks.delete(id);
  }

  public fireNext(): void {
    const next = this.callbacks.entries().next().value as
      | [ReturnType<typeof setTimeout>, () => void]
      | undefined;
    if (!next) throw new Error('No pending timer');
    this.callbacks.delete(next[0]);
    next[1]();
  }
}

function createFixture(
  randomValues: number[],
  reducedMotion = false,
  throwOnEvent = false,
): {
  readonly director: StationAmbientDirector;
  readonly events: string[];
  readonly lines: string[];
  readonly root: HTMLElement;
  readonly timer: ManualTimer;
} {
  const root = { dataset: {} } as HTMLElement;
  const timer = new ManualTimer();
  const events: string[] = [];
  const lines: string[] = [];
  const random = (): number => randomValues.shift() ?? 0;
  const director = new StationAmbientDirector(root, {
    reducedMotion,
    timer,
    random,
    announce: (message) => lines.push(message),
    onEvent: (eventId) => {
      events.push(eventId);
      if (throwOnEvent) throw new Error('presentation failed');
    },
  });

  return { director, events, lines, root, timer };
}

describe('StationAmbientDirector', () => {
  it('starts in 2..4 seconds and schedules the next event 5..8 seconds after completion', () => {
    const fixture = createFixture([0.5, 0.5, 0.5]);
    fixture.director.start();
    expect(fixture.timer.delays).toEqual([3000]);

    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).toBe('mail-drop');
    expect(fixture.events).toEqual(['mail-drop']);

    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).toBeUndefined();
    expect(fixture.timer.delays.at(-1)).toBe(6500);
  });

  it('never selects the same automatic event twice in a row', () => {
    const fixture = createFixture([0, 0, 0, 0]);
    fixture.director.start();
    fixture.timer.fireNext();
    const first = fixture.root.dataset.ambientEvent;
    fixture.timer.fireNext();
    fixture.timer.fireNext();
    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).not.toBe(first);
  });

  it('clears timers and active state on pause and dispose', () => {
    const fixture = createFixture([0.5]);
    fixture.director.start();
    fixture.director.pause();
    expect(fixture.timer.pendingCount).toBe(0);
    expect(fixture.root.dataset.ambientEvent).toBeUndefined();
    fixture.director.dispose();
    fixture.director.resume();
    expect(fixture.timer.pendingCount).toBe(0);
  });

  it('does not auto-schedule when reduced motion is enabled but still announces a manual greeting', () => {
    const fixture = createFixture([0.5], true);
    fixture.director.start();
    expect(fixture.timer.pendingCount).toBe(0);
    expect(fixture.director.requestCaptainGreeting()).toBe(true);
    expect(fixture.lines.at(-1)).toContain('末班车');
  });

  it('recovers from presentation callback errors and continues scheduling', () => {
    const fixture = createFixture([0.5, 0.5, 0.5], false, true);
    fixture.director.start();
    expect(() => fixture.timer.fireNext()).not.toThrow();
    fixture.timer.fireNext();
    expect(fixture.timer.pendingCount).toBe(1);
  });
});
