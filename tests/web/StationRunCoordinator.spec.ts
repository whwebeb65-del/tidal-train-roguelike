import { describe, expect, it } from 'vitest';
import {
  StationRunCoordinator,
  type StationRunCoordinatorDependencies,
  type StationRunTask,
} from '../../web/app/StationRunCoordinator';

class Deferred<T> {
  public readonly promise: Promise<T>;
  private resolvePromise!: (value: T) => void;
  private rejectPromise!: (reason?: unknown) => void;

  public constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  public resolve(value: T): void {
    this.resolvePromise(value);
  }

  public reject(reason: unknown): void {
    this.rejectPromise(reason);
  }
}

interface TestAssets {
  readonly id: 'battle-assets';
}

const BATTLE_ASSETS: TestAssets = { id: 'battle-assets' };

interface TaskOptions {
  readonly beginCharging?: () => boolean;
  readonly loadAssets?: () => Promise<TestAssets>;
  readonly playDeparture?: () => Promise<boolean>;
}

interface FixtureOptions {
  readonly unlockAudio?: () => Promise<boolean>;
  readonly task?: TaskOptions;
  readonly phase?: 'station' | 'combat';
  readonly hidden?: boolean;
}

interface Fixture {
  readonly coordinator: StationRunCoordinator<TestAssets>;
  readonly task: StationRunTask<TestAssets>;
  readonly events: string[];
  readonly failures: unknown[];
  readonly state: {
    phase: 'station' | 'combat';
    hidden: boolean;
  };
  createTask(options?: TaskOptions, label?: string): StationRunTask<TestAssets>;
}

function createTask(
  events: string[],
  options: TaskOptions = {},
  label = '',
): StationRunTask<TestAssets> {
  const eventName = (event: string): string => (
    label.length > 0 ? `${label}:${event}` : event
  );
  return {
    beginCharging: () => {
      events.push(eventName('begin-charging'));
      return options.beginCharging?.() ?? true;
    },
    loadAssets: async () => {
      events.push(eventName('load-assets'));
      return options.loadAssets?.() ?? BATTLE_ASSETS;
    },
    playDeparture: async () => {
      events.push(eventName('play-departure'));
      return options.playDeparture?.() ?? true;
    },
    cancelDeparture: () => events.push(eventName('cancel-departure')),
  };
}

function createFixture(options: FixtureOptions = {}): Fixture {
  const events: string[] = [];
  const failures: unknown[] = [];
  const state = {
    phase: options.phase ?? 'station' as const,
    hidden: options.hidden ?? false,
  };
  const dependencies: StationRunCoordinatorDependencies = {
    unlockAudio: () => {
      events.push('unlock');
      return options.unlockAudio?.() ?? Promise.resolve(true);
    },
    playSound: (cue) => events.push(`sound:${cue}`),
    showLoadingNotice: (audioReady) => {
      events.push(`notice:${audioReady ? 'audio-ready' : 'audio-unavailable'}`);
    },
    pauseAmbient: () => events.push('pause-ambient'),
    setChargeMotion: () => events.push('motion:charge'),
    setDepartureMotion: () => events.push('motion:depart'),
    setIdleMotion: () => events.push('motion:idle'),
    isVisibleStation: () => state.phase === 'station' && !state.hidden,
    resumeAmbient: () => events.push('resume-ambient'),
    reportFailure: (error) => {
      failures.push(error);
      events.push('report-failure');
    },
  };
  const buildTask = (
    taskOptions: TaskOptions = {},
    label = '',
  ): StationRunTask<TestAssets> => createTask(events, taskOptions, label);
  return {
    coordinator: new StationRunCoordinator<TestAssets>(dependencies),
    task: buildTask(options.task),
    events,
    failures,
    state,
    createTask: buildTask,
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
  }
}

describe('StationRunCoordinator', () => {
  it('prepares a run in the exact successful presentation order', async () => {
    const fixture = createFixture();

    await expect(fixture.coordinator.prepare(fixture.task)).resolves.toEqual({
      status: 'ready',
      assets: BATTLE_ASSETS,
    });
    expect(fixture.events).toEqual([
      'unlock',
      'sound:ticket-stamp',
      'notice:audio-ready',
      'begin-charging',
      'pause-ambient',
      'motion:charge',
      'sound:train-charge',
      'load-assets',
      'motion:depart',
      'sound:train-depart',
      'play-departure',
    ]);
    expect(fixture.failures).toEqual([]);
  });

  it('continues without a ticket stamp when audio is unavailable', async () => {
    const fixture = createFixture({
      unlockAudio: async () => false,
    });

    await expect(fixture.coordinator.prepare(fixture.task)).resolves.toEqual({
      status: 'ready',
      assets: BATTLE_ASSETS,
    });
    expect(fixture.events).toEqual([
      'unlock',
      'notice:audio-unavailable',
      'begin-charging',
      'pause-ambient',
      'motion:charge',
      'sound:train-charge',
      'load-assets',
      'motion:depart',
      'sound:train-depart',
      'play-departure',
    ]);
  });

  it('silently stops when a pending unlock resolves after cancellation', async () => {
    const unlock = new Deferred<boolean>();
    const fixture = createFixture({ unlockAudio: () => unlock.promise });

    const run = fixture.coordinator.prepare(fixture.task);
    expect(fixture.events).toEqual(['unlock']);

    expect(fixture.coordinator.cancel()).toBe(true);
    const eventsAfterCancel = [...fixture.events];
    unlock.resolve(true);

    await expect(run).resolves.toEqual({ status: 'stale-cancel' });
    expect(fixture.events).toEqual(eventsAfterCancel);
    expect(fixture.failures).toEqual([]);
  });

  it('treats a rejected stale unlock as cancellation instead of failure', async () => {
    const unlock = new Deferred<boolean>();
    const fixture = createFixture({ unlockAudio: () => unlock.promise });

    const run = fixture.coordinator.prepare(fixture.task);
    expect(fixture.coordinator.cancel()).toBe(true);
    const eventsAfterCancel = [...fixture.events];
    unlock.reject(new Error('late unlock rejection'));

    await expect(run).resolves.toEqual({ status: 'stale-cancel' });
    expect(fixture.events).toEqual(eventsAfterCancel);
    expect(fixture.failures).toEqual([]);
  });

  it('cancels pending assets without departure effects or duplicate restore', async () => {
    const assets = new Deferred<TestAssets>();
    const fixture = createFixture({
      task: { loadAssets: () => assets.promise },
    });

    const run = fixture.coordinator.prepare(fixture.task);
    await flushMicrotasks();
    expect(fixture.events.at(-1)).toBe('load-assets');

    expect(fixture.coordinator.cancel()).toBe(true);
    expect(fixture.coordinator.cancel()).toBe(false);
    assets.resolve(BATTLE_ASSETS);

    await expect(run).resolves.toEqual({ status: 'stale-cancel' });
    expect(fixture.events).not.toContain('motion:depart');
    expect(fixture.events).not.toContain('sound:train-depart');
    expect(fixture.events).not.toContain('play-departure');
    expect(fixture.events.filter((event) => event === 'motion:idle')).toHaveLength(1);
    expect(fixture.events.filter((event) => event === 'resume-ambient')).toHaveLength(1);
    expect(fixture.failures).toEqual([]);
  });

  it('restores and reports a current asset failure exactly once', async () => {
    const error = new Error('asset load failed');
    const fixture = createFixture({
      task: { loadAssets: async () => { throw error; } },
    });

    await expect(fixture.coordinator.prepare(fixture.task)).resolves.toEqual({
      status: 'failure',
      error,
    });
    expect(fixture.events.slice(-4)).toEqual([
      'cancel-departure',
      'motion:idle',
      'resume-ambient',
      'report-failure',
    ]);
    expect(fixture.events.filter((event) => event === 'motion:idle')).toHaveLength(1);
    expect(fixture.failures).toEqual([error]);
  });

  it('locally aborts and restores when current departure returns false', async () => {
    const fixture = createFixture({
      task: { playDeparture: async () => false },
    });

    await expect(fixture.coordinator.prepare(fixture.task)).resolves.toEqual({
      status: 'local-abort',
    });
    expect(fixture.events.slice(-4)).toEqual([
      'play-departure',
      'cancel-departure',
      'motion:idle',
      'resume-ambient',
    ]);
    expect(fixture.failures).toEqual([]);
  });

  it('restores and reports when current departure throws', async () => {
    const error = new Error('departure failed');
    const fixture = createFixture({
      task: { playDeparture: async () => { throw error; } },
    });

    await expect(fixture.coordinator.prepare(fixture.task)).resolves.toEqual({
      status: 'failure',
      error,
    });
    expect(fixture.events.slice(-4)).toEqual([
      'cancel-departure',
      'motion:idle',
      'resume-ambient',
      'report-failure',
    ]);
    expect(fixture.failures).toEqual([error]);
  });

  it('does not restore twice when a pending departure becomes stale', async () => {
    const departure = new Deferred<boolean>();
    const fixture = createFixture({
      task: { playDeparture: () => departure.promise },
    });

    const run = fixture.coordinator.prepare(fixture.task);
    await flushMicrotasks();
    expect(fixture.events.at(-1)).toBe('play-departure');
    expect(fixture.coordinator.cancel()).toBe(true);
    departure.resolve(false);

    await expect(run).resolves.toEqual({ status: 'stale-cancel' });
    expect(fixture.events.filter((event) => event === 'motion:idle')).toHaveLength(1);
    expect(fixture.events.filter((event) => event === 'resume-ambient')).toHaveLength(1);
    expect(fixture.failures).toEqual([]);
  });

  it.each([
    {
      name: 'visible station',
      phase: 'station' as const,
      hidden: false,
      expectedResumeCount: 1,
    },
    {
      name: 'hidden station',
      phase: 'station' as const,
      hidden: true,
      expectedResumeCount: 0,
    },
    {
      name: 'non-station phase',
      phase: 'combat' as const,
      hidden: false,
      expectedResumeCount: 0,
    },
  ])('restores a $name abort with the correct ambient visibility', async ({
    phase,
    hidden,
    expectedResumeCount,
  }) => {
    const fixture = createFixture({
      phase,
      hidden,
      task: { beginCharging: () => false },
    });

    await expect(fixture.coordinator.prepare(fixture.task)).resolves.toEqual({
      status: 'local-abort',
    });
    expect(fixture.events.filter((event) => event === 'motion:idle')).toHaveLength(1);
    expect(fixture.events.filter((event) => event === 'resume-ambient')).toHaveLength(
      expectedResumeCount,
    );
  });

  it('keeps a stale task from overwriting a newer successful task', async () => {
    const firstUnlock = new Deferred<boolean>();
    let unlockCount = 0;
    const fixture = createFixture({
      unlockAudio: () => {
        unlockCount += 1;
        return unlockCount === 1 ? firstUnlock.promise : Promise.resolve(true);
      },
    });
    const firstTask = fixture.createTask({}, 'first');
    const secondTask = fixture.createTask({}, 'second');

    const firstRun = fixture.coordinator.prepare(firstTask);
    expect(fixture.coordinator.cancel()).toBe(true);
    await expect(fixture.coordinator.prepare(secondTask)).resolves.toEqual({
      status: 'ready',
      assets: BATTLE_ASSETS,
    });
    const eventsAfterNewerTask = [...fixture.events];
    firstUnlock.resolve(true);

    await expect(firstRun).resolves.toEqual({ status: 'stale-cancel' });
    expect(fixture.events).toEqual(eventsAfterNewerTask);
    expect(fixture.events.filter((event) => event === 'sound:ticket-stamp')).toHaveLength(1);
    expect(fixture.events.filter((event) => event.startsWith('notice:'))).toHaveLength(1);
    expect(fixture.events.filter((event) => event === 'motion:idle')).toHaveLength(1);
    expect(fixture.failures).toEqual([]);
  });

  it('rejects repeated preparation while the current unlock is pending', async () => {
    const unlock = new Deferred<boolean>();
    const fixture = createFixture({ unlockAudio: () => unlock.promise });

    const firstRun = fixture.coordinator.prepare(fixture.task);
    await expect(
      fixture.coordinator.prepare(fixture.createTask({}, 'repeated')),
    ).resolves.toEqual({ status: 'busy' });
    expect(fixture.events).toEqual(['unlock']);

    expect(fixture.coordinator.cancel()).toBe(true);
    unlock.resolve(true);
    await expect(firstRun).resolves.toEqual({ status: 'stale-cancel' });
  });
});
