// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { MAP_PROGRESSION } from '../../src/domain/station/MapProgression';
import { defaultSave } from '../../src/save/SaveRepository';
import { APP_STORAGE_KEYS } from '../../web/app/AppStateRepository';
import { createLegacyGameRuntime } from '../../web/LegacyGameRuntime';
import {
  renderStationRouteYard,
  renderStationWorkOrder,
} from '../../web/views/StationRouteYardView';

function parse(markup: string): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = markup;
  return root;
}

describe('living station home composition', () => {
  it('uses a route yard and work order instead of generic route cards and footer', () => {
    const source = readFileSync(
      'web/LegacyGameRuntime.ts',
      'utf8',
    );
    const save = defaultSave();
    const home = parse(renderStationRouteYard(save, 'drift-suburb') + renderStationWorkOrder(save));
    expect(home.querySelector('.station-route-yard.living-zone')).not.toBeNull();
    expect(home.querySelectorAll('.route-sign')).toHaveLength(4);
    expect(home.querySelector('.station-work-order.station-prop')).not.toBeNull();
    expect(source).not.toContain('<div class="station-footer">');
    expect(home.querySelector('[data-action="upgrade-station"]')).not.toBeNull();
    expect(home.querySelector('[data-action="select-map"]')).not.toBeNull();
    expect(source).toContain('renderStationRouteYard(save, currentMapId)');
    expect(source).toContain('renderStationWorkOrder(save)');
    expect(source.indexOf('renderCaptainGuidebook({')).toBeLessThan(
      source.indexOf('renderStationRouteYard(save, currentMapId)'),
    );
  });

  it('explains the exact shortage, the next map, and the earlier daily trial at Lv.1', () => {
    const save = { ...defaultSave(), gears: 37 };
    const workOrder = parse(renderStationWorkOrder(save));
    expect(workOrder.textContent).toContain('车站 Lv.1 → Lv.2');
    expect(workOrder.textContent).toContain('本次需要 80 齿轮 · 现有 37 齿轮');
    expect(workOrder.textContent).toContain('还差 43 齿轮');
    expect(workOrder.textContent).toContain('下一条航线：旧港口 · 车站 Lv.3 开放');
    expect(workOrder.textContent).toContain('升至 Lv.2 即可开启每日潮汐试炼');
    expect(workOrder.querySelector<HTMLButtonElement>('[data-action="upgrade-station"]')?.disabled).toBe(true);
  });

  it('separates locked, pending first clear, and cleared routes', () => {
    const save = {
      ...defaultSave(),
      stationLevel: 3,
      unlockedMapIds: ['drift-suburb', 'old-port'],
      firstClearMapIds: ['drift-suburb', 'glass-city'],
    };
    const yard = parse(renderStationRouteYard(save, 'old-port'));
    const cleared = yard.querySelector('[data-route-id="drift-suburb"]');
    const pending = yard.querySelector('[data-route-id="old-port"]');
    const locked = yard.querySelector('[data-route-id="glass-city"]');
    expect(cleared?.querySelector('.route-sign__stamp.is-cleared')?.textContent).toBe('已首通');
    expect(pending?.querySelector('.route-sign__stamp')?.textContent).toBe('待首通');
    expect(pending?.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(locked?.classList.contains('is-locked')).toBe(true);
    expect(locked?.querySelector('.locked')?.textContent).toBe('车站 Lv.5 开放');
    expect(locked?.querySelector('button, .route-sign__stamp')).toBeNull();
    expect(yard.textContent).toContain('潮壳幼蟹更常见');
    expect(yard.textContent).toContain('精准命中潮眼收益更高');
  });

  it('keeps manual unlock available for a qualifying older save', () => {
    const save = { ...defaultSave(), stationLevel: 3 };
    const home = parse(renderStationRouteYard(save, 'drift-suburb') + renderStationWorkOrder(save));
    expect(home.querySelector('[data-action="unlock-map"][data-map-id="old-port"]')).not.toBeNull();
    expect(home.textContent).toContain('下一条航线：旧港口 · 已达条件，可在发车牌解锁');
    expect(home.textContent).not.toContain('升至 Lv.2 即可开启');
  });

  it('does not invent another route or cap upgrades when all known routes are open', () => {
    const save = {
      ...defaultSave(),
      stationLevel: 8,
      gears: 640,
      unlockedMapIds: [...MAP_PROGRESSION.map((map) => map.id), 'old-prototype-map'],
    };
    const home = parse(renderStationRouteYard(save, 'deep-tunnel') + renderStationWorkOrder(save));
    expect(home.textContent).toContain('已开放 4/4');
    expect(home.textContent).toContain('航线已全部开放');
    expect(home.textContent).toContain('车站 Lv.8 → Lv.9');
    expect(home.textContent).toContain('齿轮已备齐');
    expect(home.textContent).not.toContain('还差 0 齿轮');
    expect(home.querySelector<HTMLButtonElement>('[data-action="upgrade-station"]')?.disabled).toBe(false);
  });

  it('spends the shown exact cost and automatically opens the route on a real upgrade', async () => {
    const app = document.createElement('div');
    document.body.append(app);
    const storage = window.localStorage;
    storage.clear();
    storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify({
      ...defaultSave(),
      selectedCaptainId: 'captain-tide-female',
      stationLevel: 2,
      gears: 160,
    }));
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
    const upgrade = app.querySelector<HTMLButtonElement>('[data-action="upgrade-station"]');
    expect(upgrade?.disabled).toBe(false);
    expect(app.querySelector('[data-route-id="old-port"]')?.classList.contains('is-locked')).toBe(true);
    upgrade?.click();
    await vi.waitFor(() => {
      expect(app.querySelector('[data-route-id="old-port"]')?.classList.contains('is-open')).toBe(true);
    });
    const persisted = JSON.parse(storage.getItem(APP_STORAGE_KEYS.player) ?? '{}');
    expect(persisted).toMatchObject({
      stationLevel: 3,
      gears: 0,
      unlockedMapIds: ['drift-suburb', 'old-port'],
    });
    expect(app.querySelector('.station-work-order')?.textContent).toContain('本次需要 240 齿轮 · 现有 0 齿轮');
    expect(app.querySelector('.station-work-order')?.textContent).toContain('下一条航线：玻璃城 · 车站 Lv.5 开放');
  });

  it('keeps the route yard shellless and supplies mobile layout rules', () => {
    const css = readFileSync(
      'web/styles/living-station-home.css',
      'utf8',
    );
    expect(css).toContain('.station-route-yard');
    expect(css).toContain('.route-sign.is-current');
    expect(css).toContain('.station-work-order');
    expect(css).toContain('@media (max-width: 760px)');
  });

  it('anchors the work-order metal clip to its paper slip', () => {
    const css = readFileSync(
      'web/styles/living-station-home.css',
      'utf8',
    );
    expect(css).toMatch(/\.station-work-order\s*\{[^}]*position:\s*relative;/);
    expect(css).toMatch(/\.station-work-order::before\s*\{[^}]*position:\s*absolute;/);
  });

  it('keeps browser mobile reading checks aligned with the route-yard markup', () => {
    const smoke = readFileSync(
      'scripts/smoke-browser.mjs',
      'utf8',
    );
    expect(smoke).toContain("['.station-route-yard__heading', 0]");
    expect(smoke).toContain("['.route-sign', 0]");
    expect(smoke).toContain("['.route-sign', 3]");
    expect(smoke).not.toContain("['.map-card', 0]");
    expect(smoke).not.toContain("['.map-card', 3]");
  });
});
