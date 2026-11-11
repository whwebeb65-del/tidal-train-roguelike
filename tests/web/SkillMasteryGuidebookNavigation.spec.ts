// @vitest-environment jsdom
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { defaultSave } from '../../src/save/SaveRepository';
import { APP_STORAGE_KEYS } from '../../web/app/AppStateRepository';
import { createLegacyGameRuntime } from '../../web/LegacyGameRuntime';
import * as archiveView from '../../web/views/TidalArchiveView';

const guidebook = {
  version: 1,
  claimedObjectiveIds: ['first-clear', 'station-level-2', 'equipment-level-2'],
};

const archive = {
  version: 2,
  discoveredEnemyKinds: ['bubble-fin'],
  discoveredSkillVariantIds: [],
  unreadEntryKeys: ['enemy:bubble-fin'],
};

async function startAtMasteryObjective() {
  const app = document.createElement('div');
  document.body.append(app);
  const storage = window.localStorage;
  storage.clear();
  const save = defaultSave();
  storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify({
    ...save,
    selectedCaptainId: 'captain-tide-female',
    gears: 18,
    skillMasteryXp: { ...save.skillMasteryXp, 'tidal-volley': 127 },
  }));
  storage.setItem(APP_STORAGE_KEYS.guidebook, JSON.stringify(guidebook));
  storage.setItem(APP_STORAGE_KEYS.tidalArchive, JSON.stringify(archive));
  const audio = new Proxy({}, { get: () => () => undefined }) as never;
  const settings = {
    version: 2, musicEnabled: false, sfxEnabled: false, reducedMotion: true,
    qualityPreference: 'auto', preferredBattleSpeed: 1,
  } as const;
  const runtime = createLegacyGameRuntime(app, storage, true, audio, {
    getSettings: () => settings,
    updateSettings: () => settings,
  });
  onTestFinished(() => {
    runtime.destroy();
    app.remove();
    storage.clear();
  });
  await runtime.start();
  const link = app.querySelector<HTMLButtonElement>('[data-guidebook-destination="skill-mastery"]');
  expect(link?.textContent).toBe('查看技能精通');
  return { app, storage, link };
}

describe('skill mastery guidebook navigation', () => {
  it('opens and focuses the existing archive skill section without awarding progress', async () => {
    const { app, storage, link } = await startAtMasteryObjective();
    link?.click();
    await vi.waitFor(() => {
      const mastery = app.querySelector('.game-scene--equipment [data-archive-mastery]');
      expect(mastery?.textContent).toContain('43 / 44 XP');
      expect(document.activeElement).toBe(mastery);
    });
    expect(app.querySelector('.wardrobe-carriage')).toBeNull();
    expect(app.querySelector('.app-notice.is-visible')).toBeNull();
    expect(app.querySelector('[data-action="show-tidal-archive"]')?.getAttribute('aria-pressed'))
      .toBe('true');
    expect(app.querySelector('[data-archive-enemy="bubble-fin"] .archive-new-stamp')?.textContent)
      .toBe('NEW');
    expect(JSON.parse(storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}'))
      .toEqual({ ...archive, unreadEntryKeys: [] });
    expect(JSON.parse(storage.getItem(APP_STORAGE_KEYS.player) ?? '{}')).toMatchObject({
      gears: 18,
      skillMasteryXp: { 'tidal-volley': 127, 'bubble-barrier': 0, 'extreme-tide': 0 },
    });
    expect(JSON.parse(storage.getItem(APP_STORAGE_KEYS.guidebook) ?? '{}')).toEqual(guidebook);
  });

  it('returns to the station and leaves unread entries intact if the skill section is missing', async () => {
    const brokenArchive = vi.spyOn(archiveView, 'renderTidalArchive')
      .mockReturnValueOnce('<section class="tidal-archive-carriage"></section>');
    onTestFinished(() => brokenArchive.mockRestore());
    const { app, storage, link } = await startAtMasteryObjective();
    link?.click();
    await vi.waitFor(() => {
      expect(app.querySelector('[data-guidebook-destination="skill-mastery"]')).not.toBeNull();
      expect(app.querySelector('.app-notice')?.textContent).toContain('技能精通页暂时未打开');
    });
    expect(JSON.parse(storage.getItem(APP_STORAGE_KEYS.tidalArchive) ?? '{}')).toEqual(archive);
    app.querySelector<HTMLButtonElement>('[data-nav-scene="equipment"]')?.click();
    await vi.waitFor(() => {
      expect(app.querySelector('[data-action="show-equipment-workshop"]')?.getAttribute('aria-pressed'))
        .toBe('true');
    });
  });
});
