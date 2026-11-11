// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it, onTestFinished } from 'vitest';
import { defaultSave } from '../../src/save/SaveRepository';
import { APP_STORAGE_KEYS } from '../../web/app/AppStateRepository';
import { defaultGameSettings } from '../../web/app/SettingsRepository';
import { createLegacyGameRuntime } from '../../web/LegacyGameRuntime';

describe('effective reduced motion', () => {
  it('applies the effective preference before mount and updates the current shell and station without remounting', async () => {
    const app = document.createElement('div');
    document.body.append(app);
    const storage = window.sessionStorage;
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify({
      ...defaultSave(),
      selectedCaptainId: 'captain-tide-female',
    }));
    const settings = { ...defaultGameSettings(), musicEnabled: false };
    const audio = new Proxy({}, { get: () => () => undefined }) as never;
    const runtime = createLegacyGameRuntime(app, storage, true, audio, {
      getSettings: () => settings,
      updateSettings: () => settings,
    });
    onTestFinished(() => {
      runtime.destroy();
      storage.clear();
      app.remove();
    });

    // The effective value may be true even while the stored game toggle is
    // false, e.g. when the operating system requests less motion.
    expect(settings.reducedMotion).toBe(false);
    const shell = app.querySelector<HTMLElement>('.app-shell');
    expect(shell?.dataset.reducedMotion).toBe('true');
    await runtime.start();
    const hero = app.querySelector<HTMLElement>('.station-hero');
    expect(hero?.dataset.reducedMotion).toBe('true');

    runtime.applySettings(settings, false);
    expect(shell?.dataset.reducedMotion).toBe('false');
    expect(hero?.dataset.reducedMotion).toBe('false');

    runtime.applySettings({ ...settings, reducedMotion: true }, true);
    expect(shell?.dataset.reducedMotion).toBe('true');
    expect(hero?.dataset.reducedMotion).toBe('true');
    expect(app.querySelector('.station-hero')).toBe(hero);
  });

  it('loads the scoped animation overrides last without resetting static poses', () => {
    const imports = readFileSync('web/styles.css', 'utf8').trimEnd();
    const css = readFileSync('web/styles/motion-preferences.css', 'utf8');
    expect(imports.endsWith('@import "./styles/motion-preferences.css";')).toBe(true);
    expect(css).toContain('.app-shell[data-reduced-motion="true"]');
    expect(css).toContain('.scene-host > .game-scene');
    expect(css).toContain('.battle-skill.is-ready');
    expect(css).toContain('.battle-skill[data-rank="5"]');
    expect(css).toContain('.evolution-crest');
    expect(css).toContain('.battle-tutorial-ticket');
    expect(css).toContain('.daily-check-in-layer--sky');
    expect(css).not.toMatch(/!important|\btransform\s*:|\[data-departure-state/);
  });
});
