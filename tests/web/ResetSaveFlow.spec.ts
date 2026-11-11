// @vitest-environment jsdom
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { defaultSave } from '../../src/save/SaveRepository';
import { APP_STORAGE_KEYS } from '../../web/app/AppStateRepository';
import { SETTINGS_STORAGE_KEY, defaultGameSettings } from '../../web/app/SettingsRepository';
import { createLegacyGameRuntime } from '../../web/LegacyGameRuntime';

class ResetTestStorage extends Map<string, string> implements Storage {
  get length(): number { return this.size; }
  getItem(key: string): string | null { return this.get(key) ?? null; }
  key(index: number): string | null { return [...this.keys()][index] ?? null; }
  removeItem(key: string): void { this.delete(key); }
  setItem(key: string, value: string): void { this.set(key, value); }
}

async function setup() {
  const app = document.createElement('div');
  document.body.append(app);
  const storage = new ResetTestStorage();
  for (const key of Object.values(APP_STORAGE_KEYS)) storage.setItem(key, '{}');
  storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify({
    ...defaultSave(),
    selectedCaptainId: 'captain-tide-female',
    gears: 77,
  }));
  const settings = { ...defaultGameSettings(), reducedMotion: true, musicEnabled: false };
  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  storage.setItem('unrelated-site-data', 'keep');
  const reloadAfterSaveReset = vi.fn();
  const audio = new Proxy({}, { get: () => () => undefined }) as never;
  const runtime = createLegacyGameRuntime(app, storage, true, audio, {
    getSettings: () => settings,
    updateSettings: () => settings,
  }, { nowMs: () => 0, reloadAfterSaveReset });
  onTestFinished(() => {
    runtime.destroy();
    app.remove();
  });
  await runtime.start();
  const button = (action: string) => {
    const node = app.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!node) throw new Error(`Missing button: ${action}`);
    return node;
  };
  const dialog = app.querySelector<HTMLDialogElement>('#reset-save-dialog');
  if (!dialog) throw new Error('Missing reset dialog');
  return {
    app, storage, settings, reloadAfterSaveReset, dialog,
    reset: button('reset-save'),
    cancel: button('cancel-reset-save'),
    confirm: button('confirm-reset-save'),
  };
}

describe('local save reset flow', () => {
  it('refuses deletion when the native modal cannot open', async () => {
    const { app, storage, reloadAfterSaveReset, dialog, reset, confirm } = await setup();
    Object.defineProperty(dialog, 'showModal', { value: undefined, configurable: true });
    const before = [...storage];
    reset.click();
    confirm.click();
    await vi.waitFor(() => {
      expect(app.querySelector('[data-notice-copy]')?.textContent)
        .toBe('暂时无法打开重置确认框，存档没有改动。');
    });
    expect(dialog.open).toBe(false);
    expect([...storage]).toEqual(before);
    expect(reloadAfterSaveReset).not.toHaveBeenCalled();
  });

  it('requires open-dialog confirmation, restores focus on cancel, and preserves settings on reset', async () => {
    const { app, storage, settings, reloadAfterSaveReset, dialog, reset, cancel, confirm } = await setup();
    // jsdom has no native modal implementation. Browser smoke verifies the real
    // autofocus and Escape behavior; this stub checks routing and write guards.
    dialog.showModal = vi.fn(() => {
      dialog.open = true;
      cancel.focus();
    });
    dialog.close = vi.fn(() => {
      dialog.open = false;
      dialog.dispatchEvent(new Event('close'));
    });
    const before = [...storage];
    confirm.click();
    expect([...storage]).toEqual(before);
    reset.click();
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(cancel);
    expect([...storage]).toEqual(before);

    const outsideConfirm = document.createElement('button');
    outsideConfirm.dataset.action = 'confirm-reset-save';
    app.append(outsideConfirm);
    outsideConfirm.click();
    expect([...storage]).toEqual(before);
    cancel.click();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(reset);
    expect([...storage]).toEqual(before);
    expect(reloadAfterSaveReset).not.toHaveBeenCalled();

    reset.click();
    confirm.click();
    confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(reloadAfterSaveReset).toHaveBeenCalledOnce();
    for (const key of Object.values(APP_STORAGE_KEYS)) expect(storage.getItem(key)).toBeNull();
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).toBe(JSON.stringify(settings));
    expect(storage.getItem('unrelated-site-data')).toBe('keep');
  });
});
