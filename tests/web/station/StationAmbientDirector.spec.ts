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

  public captureNext(): () => void {
    const callback = this.callbacks.values().next().value as
      | (() => void)
      | undefined;
    if (!callback) throw new Error('No pending timer');
    return callback;
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

  it('starts only once without replacing its timer or consuming extra random values', () => {
    const fixture = createFixture([0.25, 0.75]);

    fixture.director.start();
    fixture.director.start();
    fixture.director.start();
    expect(fixture.timer.delays).toEqual([2500]);
    expect(fixture.timer.pendingCount).toBe(1);

    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).toBe('distant-train');
    expect(fixture.events).toEqual(['distant-train']);
    expect(fixture.timer.delays.at(-1)).toBe(2200);
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

  it('resumes only once after a pause without disrupting an active event', () => {
    const fixture = createFixture([0.5, 0.5, 0.5, 0.5]);
    fixture.director.start();
    fixture.director.pause();

    fixture.director.resume();
    fixture.director.resume();
    expect(fixture.timer.delays).toEqual([3000, 3000]);

    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).toBe('mail-drop');
    fixture.director.resume();
    expect(fixture.timer.pendingCount).toBe(1);

    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).toBeUndefined();
    expect(fixture.timer.delays).toEqual([3000, 3000, 1700, 6500]);
  });

  it('does not auto-schedule when reduced motion is enabled but still announces a manual greeting', () => {
    const fixture = createFixture([0.5], true);
    fixture.director.start();
    expect(fixture.timer.pendingCount).toBe(0);
    expect(fixture.director.requestCaptainGreeting()).toBe(true);
    expect(fixture.lines.at(-1)).toContain('末班车');
  });

  it('preserves the random sequence when start is suppressed by reduced motion', () => {
    const fixture = createFixture([0.25, 0.75], true);

    fixture.director.start();
    expect(fixture.timer.delays).toEqual([]);
    expect(fixture.timer.pendingCount).toBe(0);

    fixture.director.setReducedMotion(false);
    expect(fixture.timer.delays).toEqual([2500]);
    expect(fixture.timer.pendingCount).toBe(1);

    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).toBe('distant-train');
    expect(fixture.events).toEqual(['distant-train']);
  });

  it('preserves the random sequence when resume is suppressed by reduced motion', () => {
    const fixture = createFixture([0.5, 0.25, 0.75]);
    fixture.director.start();
    fixture.director.pause();
    fixture.director.setReducedMotion(true);

    fixture.director.resume();
    expect(fixture.timer.delays).toEqual([3000]);
    expect(fixture.timer.pendingCount).toBe(0);

    fixture.director.setReducedMotion(false);
    expect(fixture.timer.delays).toEqual([3000, 2500]);
    expect(fixture.timer.pendingCount).toBe(1);

    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).toBe('distant-train');
    expect(fixture.events).toEqual(['distant-train']);
  });

  it('rejects a second captain greeting without replacing the active greeting', () => {
    const fixture = createFixture([0.5], true);

    expect(fixture.director.requestCaptainGreeting()).toBe(true);
    expect(fixture.director.requestCaptainGreeting()).toBe(false);
    expect(fixture.root.dataset.ambientEvent).toBe('captain-greeting');
    expect(fixture.events).toEqual(['captain-greeting']);
    expect(fixture.lines).toHaveLength(1);
    expect(fixture.timer.delays).toEqual([1200]);
    expect(fixture.timer.pendingCount).toBe(1);

    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).toBeUndefined();
    expect(fixture.timer.pendingCount).toBe(0);
  });

  it('applies each reduced-motion transition only once while running', () => {
    const fixture = createFixture([0.25, 0.75, 0.5]);
    fixture.director.start();
    expect(fixture.timer.delays).toEqual([2500]);

    fixture.director.setReducedMotion(true);
    fixture.director.setReducedMotion(true);
    expect(fixture.timer.delays).toEqual([2500]);
    expect(fixture.timer.pendingCount).toBe(0);

    fixture.director.setReducedMotion(false);
    fixture.director.setReducedMotion(false);
    expect(fixture.timer.delays).toEqual([2500, 3500]);
    expect(fixture.timer.pendingCount).toBe(1);

    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).toBe('mail-drop');
  });

  it('waits until start after reduced motion is disabled before start', () => {
    const fixture = createFixture([0.25], true);

    fixture.director.setReducedMotion(false);
    expect(fixture.timer.delays).toEqual([]);
    expect(fixture.timer.pendingCount).toBe(0);

    fixture.director.start();
    expect(fixture.timer.delays).toEqual([2500]);
    expect(fixture.timer.pendingCount).toBe(1);
  });

  it('waits until resume after reduced motion is disabled while paused', () => {
    const fixture = createFixture([0.25, 0.75]);
    fixture.director.start();
    fixture.director.pause();

    fixture.director.setReducedMotion(true);
    fixture.director.setReducedMotion(false);
    expect(fixture.timer.delays).toEqual([2500]);
    expect(fixture.timer.pendingCount).toBe(0);

    fixture.director.resume();
    expect(fixture.timer.delays).toEqual([2500, 3500]);
    expect(fixture.timer.pendingCount).toBe(1);
  });

  it('recovers from presentation callback errors and continues scheduling', () => {
    const fixture = createFixture([0.5, 0.5, 0.5], false, true);
    fixture.director.start();
    expect(() => fixture.timer.fireNext()).not.toThrow();
    fixture.timer.fireNext();
    expect(fixture.timer.pendingCount).toBe(1);
  });

  it('ignores a scheduled event callback delivered after pause', () => {
    const fixture = createFixture([0.5, 0.5]);
    fixture.director.start();
    const staleEvent = fixture.timer.captureNext();

    fixture.director.pause();
    staleEvent();

    expect(fixture.events).toEqual([]);
    expect(fixture.root.dataset.ambientEvent).toBeUndefined();
    expect(fixture.timer.pendingCount).toBe(0);
  });

  it('ignores a scheduled event callback delivered after dispose', () => {
    const fixture = createFixture([0.5, 0.5]);
    fixture.director.start();
    const staleEvent = fixture.timer.captureNext();

    fixture.director.dispose();
    staleEvent();

    expect(fixture.events).toEqual([]);
    expect(fixture.root.dataset.ambientEvent).toBeUndefined();
    expect(fixture.timer.pendingCount).toBe(0);
  });

  it('ignores an active completion callback delivered after pause', () => {
    const fixture = createFixture([0.5, 0.5, 0.5]);
    fixture.director.start();
    fixture.timer.fireNext();
    const staleCompletion = fixture.timer.captureNext();

    fixture.director.pause();
    expect(fixture.root.dataset.ambientEvent).toBeUndefined();
    expect(fixture.timer.pendingCount).toBe(0);

    staleCompletion();
    expect(fixture.root.dataset.ambientEvent).toBeUndefined();
    expect(fixture.timer.pendingCount).toBe(0);
  });

  it('ignores an active completion callback delivered after dispose', () => {
    const fixture = createFixture([0.5, 0.5, 0.5]);
    fixture.director.start();
    fixture.timer.fireNext();
    const staleCompletion = fixture.timer.captureNext();

    fixture.director.dispose();
    expect(fixture.root.dataset.ambientEvent).toBeUndefined();
    expect(fixture.timer.pendingCount).toBe(0);

    staleCompletion();
    expect(fixture.root.dataset.ambientEvent).toBeUndefined();
    expect(fixture.timer.pendingCount).toBe(0);
  });

  it('keeps a captain greeting active when a preempted completion arrives late', () => {
    const fixture = createFixture([0.5, 0.5, 0.5]);
    fixture.director.start();
    fixture.timer.fireNext();
    const staleCompletion = fixture.timer.captureNext();

    expect(fixture.director.requestCaptainGreeting()).toBe(true);
    expect(fixture.root.dataset.ambientEvent).toBe('captain-greeting');
    staleCompletion();
    expect(fixture.root.dataset.ambientEvent).toBe('captain-greeting');
    expect(fixture.timer.pendingCount).toBe(1);

    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).toBeUndefined();
    expect(fixture.timer.delays.at(-1)).toBe(6500);
  });

  it('contains a playSound exception and still completes the event', () => {
    const root = { dataset: {} } as HTMLElement;
    const timer = new ManualTimer();
    const randomValues = [0.5, 0.5, 0.5];
    const director = new StationAmbientDirector(root, {
      reducedMotion: false,
      timer,
      random: () => randomValues.shift() ?? 0,
      playSound: () => {
        throw new Error('sound failed');
      },
    });

    director.start();
    expect(() => timer.fireNext()).not.toThrow();
    expect(root.dataset.ambientEvent).toBe('mail-drop');
    expect(timer.delays.at(-1)).toBe(1700);

    timer.fireNext();
    expect(root.dataset.ambientEvent).toBeUndefined();
    expect(timer.delays.at(-1)).toBe(6500);
  });

  it('contains an announce exception and still completes the greeting', () => {
    const root = { dataset: {} } as HTMLElement;
    const timer = new ManualTimer();
    const director = new StationAmbientDirector(root, {
      reducedMotion: true,
      timer,
      announce: () => {
        throw new Error('announcement failed');
      },
    });

    expect(() => director.requestCaptainGreeting()).not.toThrow();
    expect(root.dataset.ambientEvent).toBe('captain-greeting');
    expect(timer.delays).toEqual([1200]);

    timer.fireNext();
    expect(root.dataset.ambientEvent).toBeUndefined();
    expect(timer.pendingCount).toBe(0);
  });

  it('uses the upper delay and final event at random boundary 1', () => {
    const fixture = createFixture([1, 1, 1]);
    fixture.director.start();
    expect(fixture.timer.delays).toEqual([4000]);

    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).toBe('captain-idle');
    expect(fixture.timer.delays.at(-1)).toBe(1400);

    fixture.timer.fireNext();
    expect(fixture.root.dataset.ambientEvent).toBeUndefined();
    expect(fixture.timer.delays.at(-1)).toBe(8000);
  });
});
