import { describe, expect, it } from 'vitest';
import { PageLifecycleController } from '../../web/app/PageLifecycleController';

describe('PageLifecycleController', () => {
  it('pauses immediately when hidden and requires explicit resume when visible', () => {
    const calls: string[] = [];
    const listeners = new Set<() => void>();
    let hidden = false;
    const page = {
      get hidden() {
        return hidden;
      },
      addEventListener(
        _name: 'visibilitychange',
        listener: () => void,
      ) {
        listeners.add(listener);
      },
      removeEventListener(
        _name: 'visibilitychange',
        listener: () => void,
      ) {
        listeners.delete(listener);
      },
      setHidden(value: boolean) {
        hidden = value;
        for (const listener of listeners) listener();
      },
      listenerCount() {
        return listeners.size;
      },
    };
    const controller = new PageLifecycleController(page, {
      onHidden: () => calls.push('hidden'),
      onVisible: () => calls.push('visible-awaiting-user'),
    });
    controller.start();
    controller.start();

    page.setHidden(true);
    page.setHidden(false);

    expect(calls).toEqual(['hidden', 'visible-awaiting-user']);
    controller.dispose();
    controller.dispose();
    expect(page.listenerCount()).toBe(0);
  });

  it('pauses immediately when the app starts while already hidden', () => {
    let hiddenCalls = 0;
    const page = {
      hidden: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    const controller = new PageLifecycleController(page, {
      onHidden: () => {
        hiddenCalls += 1;
      },
      onVisible: () => undefined,
    });

    controller.start();

    expect(hiddenCalls).toBe(1);
  });
});
