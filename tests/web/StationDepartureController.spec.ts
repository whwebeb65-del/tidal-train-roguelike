import { describe, expect, it } from 'vitest';
import {
  StationDepartureController,
  type DepartureTimerScheduler,
} from '../../web/app/StationDepartureController';

class FakeHero {
  public readonly dataset: DOMStringMap = {};
  private readonly attributes = new Map<string, string>();

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
}

class ManualTimer implements DepartureTimerScheduler {
  public readonly delays: number[] = [];
  public readonly cleared: ReturnType<typeof setTimeout>[] = [];
  private nextId = 0;
  private readonly callbacks = new Map<
    ReturnType<typeof setTimeout>,
    () => void
  >();

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
    this.cleared.push(id);
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
    const next = this.callbacks.values().next().value as (() => void) | undefined;
    if (!next) throw new Error('No pending timer');
    return next;
  }
}

function createFixture(reducedMotion = false): {
  readonly controller: StationDepartureController;
  readonly hero: FakeHero;
  readonly buttons: readonly HTMLButtonElement[];
  readonly timer: ManualTimer;
} {
  const hero = new FakeHero();
  const buttons = [
    { disabled: false },
    { disabled: false },
  ] as HTMLButtonElement[];
  const host = {
    querySelector(selector: string) {
      return selector === '.station-hero' ? hero : null;
    },
    querySelectorAll(selector: string) {
      return selector.includes('start-run') ? buttons : [];
    },
  } as unknown as ParentNode;
  const timer = new ManualTimer();
  return {
    controller: new StationDepartureController(host, reducedMotion, timer),
    hero,
    buttons,
    timer,
  };
}

describe('StationDepartureController', () => {
  it('marks charging busy and disables both departure buttons', () => {
    const { controller, hero, buttons } = createFixture();

    expect(controller.beginCharging()).toBe(true);

    expect(hero.dataset.departureState).toBe('charging');
    expect(hero.getAttribute('aria-busy')).toBe('true');
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it('plays a normal departure for exactly 700 ms and resolves true', async () => {
    const { controller, hero, timer } = createFixture();
    controller.beginCharging();

    const departure = controller.playDeparture();
    let settled = false;
    void departure.then(() => { settled = true; });
    await Promise.resolve();

    expect(hero.dataset.departureState).toBe('departing');
    expect(timer.delays).toEqual([700]);
    expect(settled).toBe(false);

    timer.fireNext();
    await expect(departure).resolves.toBe(true);
  });

  it('uses an 80 ms opacity-only window for reduced motion', async () => {
    const { controller, timer } = createFixture(true);
    controller.beginCharging();

    const departure = controller.playDeparture();

    expect(timer.delays).toEqual([80]);
    timer.fireNext();
    await expect(departure).resolves.toBe(true);
  });

  it('cancels a pending departure, restores aria and buttons, and resolves false', async () => {
    const { controller, hero, buttons, timer } = createFixture();
    controller.beginCharging();
    const departure = controller.playDeparture();

    controller.cancel();

    await expect(departure).resolves.toBe(false);
    expect(timer.cleared).toHaveLength(1);
    expect(hero.dataset.departureState).toBeUndefined();
    expect(hero.getAttribute('aria-busy')).toBeNull();
    expect(buttons.every((button) => !button.disabled)).toBe(true);
  });

  it('preserves a pre-disabled button through cancel and dispose', () => {
    const { controller, buttons } = createFixture();
    buttons[1].disabled = true;
    controller.beginCharging();

    controller.cancel();

    expect(buttons.map((button) => button.disabled)).toEqual([false, true]);

    controller.beginCharging();
    controller.dispose();

    expect(buttons.map((button) => button.disabled)).toEqual([false, true]);
  });

  it('shares one pending promise and timer across repeated departure calls', async () => {
    const { controller, timer } = createFixture();
    controller.beginCharging();

    const first = controller.playDeparture();
    const second = controller.playDeparture();

    expect(second).toBe(first);
    expect(timer.delays).toEqual([700]);
    timer.fireNext();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('ignores a stale timer after cancellation and supports a fresh cycle', async () => {
    const { controller, hero, timer } = createFixture();
    controller.beginCharging();
    const first = controller.playDeparture();
    const staleCompletion = timer.captureNext();
    controller.cancel();

    expect(controller.beginCharging()).toBe(true);
    const second = controller.playDeparture();
    staleCompletion();

    await expect(first).resolves.toBe(false);
    expect(hero.dataset.departureState).toBe('departing');
    timer.fireNext();
    await expect(second).resolves.toBe(true);
  });

  it('disposes idempotently without leaving a pending promise', async () => {
    const { controller, hero, buttons } = createFixture();
    controller.beginCharging();
    const departure = controller.playDeparture();

    controller.dispose();
    controller.dispose();

    await expect(departure).resolves.toBe(false);
    expect(controller.beginCharging()).toBe(false);
    await expect(controller.playDeparture()).resolves.toBe(false);
    expect(hero.getAttribute('aria-busy')).toBeNull();
    expect(buttons.every((button) => !button.disabled)).toBe(true);
  });
});
