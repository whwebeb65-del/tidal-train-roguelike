// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountAppShell, renderAppShell } from '../../web/app/AppShell';

const appShellCss = readFileSync(
  resolve(process.cwd(), 'web/styles/app-shell-v2.css'),
  'utf8',
);
const responsiveCss = readFileSync(
  resolve(process.cwd(), 'web/styles/responsive.css'),
  'utf8',
);

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('AppShell', () => {
  it('renders five independent scene actions and one scene host', () => {
    const html = renderAppShell({
      gears: 7,
      routeMarks: 2,
      starTickets: 1,
    });

    expect(html.match(/data-nav-scene=/g)).toHaveLength(5);
    expect(html).toContain('data-nav-scene="station"');
    expect(html).toContain('data-nav-scene="captain"');
    expect(html).toContain('data-nav-scene="equipment"');
    expect(html).toContain('data-nav-scene="legion"');
    expect(html).toContain('data-nav-scene="store"');
    expect(html).toContain('id="scene-host"');
    expect(html).toContain('data-action="reset-save"');
    expect(html).toContain('data-action="open-settings"');
    expect(html).toContain('id="settings-host"');
    expect(html).not.toContain('open-hub-anchor');
  });

  it('renders an account ticket with current xp, stamina, and the next speed gate', () => {
    const html = renderAppShell({
      gears: 7,
      routeMarks: 2,
      starTickets: 1,
      account: {
        level: 12,
        xp: 340,
        nextLevelXp: 500,
        stamina: 25,
        maxStamina: 30,
        nextSpeedUnlock: { level: 20, speed: 2 },
      },
    });

    expect(html).toContain('账号 Lv.12');
    expect(html).toContain('340 / 500 XP');
    expect(html).toContain('体力 25 / 30');
    expect(html).toContain('下一倍速：Lv.20 · 2×');
  });

  it('uses text-only resource labels instead of Unicode placeholder icons', () => {
    const html = renderAppShell({ gears: 7, routeMarks: 2, starTickets: 1 });
    expect(html).toContain('data-currency="gears"');
    expect(html).not.toMatch(/[⚙◇☆]/u);
  });

  it('removes station navigation chrome during battle overlays', () => {
    expect(appShellCss).toContain('.app-shell--battle .app-topbar');
    expect(appShellCss).toContain('display: none');
    expect(appShellCss).toContain('.app-shell--battle .app-hub-nav');
    expect(appShellCss).toMatch(
      /\.app-shell--battle \.app-hub-nav\s*\{[^}]*display:\s*none/s,
    );
    expect(appShellCss).toMatch(
      /\.app-shell--battle:has\(\.battle-overlay:not\(\[hidden\]\)\) \.app-notice\s*\{[^}]*display:\s*none/s,
    );
    expect(appShellCss).toMatch(
      /\.app-shell--battle:has\(\[data-battle-tutorial\]:not\(\[hidden\]\)\) \.app-notice\s*\{[^}]*display:\s*none/s,
    );
  });

  it('styles navigation as an accessible station wayfinding rail', () => {
    const css = [
      readFileSync(resolve(process.cwd(), 'web/styles/shell.css'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'web/styles/app-shell-v2.css'), 'utf8'),
    ].join('\n');

    expect(css).toContain('.app-hub-nav::before');
    expect(css).toContain('.hub-nav__item[aria-current="page"]');
    expect(css).toContain('min-height: 44px');
  });

  it('keeps topbar actions at least 44px on both axes in mobile overrides', () => {
    const css = [
      readFileSync(resolve(process.cwd(), 'web/styles/responsive.css'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'web/styles/app-shell-v2.css'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'web/styles/settings-panel.css'), 'utf8'),
    ].join('\n');

    expect(css).toMatch(
      /\.app-shell__reset,[\s\S]*?\.app-shell__settings\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/,
    );
  });

  it('gives the settings close control one CSS pixel of cross-platform touch slack', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'web/styles/settings-panel.css'),
      'utf8',
    );

    expect(css).toMatch(
      /\.settings-sheet__close\s*\{[^}]*width:\s*45px;[^}]*min-height:\s*45px;/,
    );
  });

  it('removes notice transition and vertical displacement for reduced motion', () => {
    expect(appShellCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.app-notice,[\s\S]*?\.app-notice\.is-visible\s*\{[^}]*transition:\s*none;[^}]*transform:\s*translateX\(-50%\);/,
    );
  });

  it('uses a shorter battle radio timer and restarts it for new copy', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    const shell = mountAppShell(root, { gears: 0, routeMarks: 0, starTickets: 0 });

    shell.setNotice('车站公告');
    vi.advanceTimersByTime(4199);
    expect(shell.noticeHost.classList.contains('is-visible')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(shell.noticeHost.classList.contains('is-visible')).toBe(false);

    shell.setBattleChrome(true);
    shell.setNotice('第一条电台短讯');
    vi.advanceTimersByTime(2300);
    shell.setNotice('第二条电台短讯');
    vi.advanceTimersByTime(2399);
    expect(shell.noticeHost.classList.contains('is-visible')).toBe(true);
    expect(shell.noticeHost.querySelector('[data-notice-copy]')?.textContent)
      .toBe('第二条电台短讯');
    expect(shell.noticeHost.getAttribute('role')).toBe('status');
    vi.advanceTimersByTime(1);
    expect(shell.noticeHost.classList.contains('is-visible')).toBe(false);
  });

  it('styles battle notices as compact noninteractive radio strips', () => {
    expect(appShellCss).toMatch(
      /\.app-shell--battle \.app-notice\.station-announcement\s*\{[^}]*left:\s*calc\(12px \+ env\(safe-area-inset-left\)\);[^}]*bottom:\s*calc\(18px \+ env\(safe-area-inset-bottom\)\);[^}]*width:\s*min\(236px, calc\(100% - 96px\)\);[^}]*max-width:\s*236px;[^}]*height:\s*46px;[^}]*max-height:\s*46px;[^}]*pointer-events:\s*none;/s,
    );
    expect(appShellCss).toMatch(
      /\.app-shell--battle \.app-notice\.station-announcement::before\s*\{[^}]*content:\s*'RADIO';/s,
    );
    expect(appShellCss).toMatch(
      /\.app-shell--battle \.app-notice\.station-announcement::after\s*\{[^}]*repeating-radial-gradient/s,
    );
    expect(appShellCss).toMatch(
      /\.app-shell--battle \.app-notice\.station-announcement \[data-notice-copy\]\s*\{[^}]*-webkit-line-clamp:\s*2;/s,
    );
    expect(appShellCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.app-shell--battle \.app-notice\.station-announcement,[\s\S]*?\.app-shell--battle \.app-notice\.station-announcement\.is-visible\s*\{[^}]*transition:\s*none;[^}]*transform:\s*none;/,
    );
  });

  it('reserves a mobile notice lane away from readable content and fixed navigation', () => {
    expect(appShellCss).toContain('.scene-viewport:has(.app-notice.is-visible)');
    expect(appShellCss).toMatch(
      /\.app-notice\s*\{[^}]*position:\s*fixed;[^}]*top:\s*calc\(68px/s,
    );
    expect(appShellCss).toMatch(
      /@media \(max-width: 620px\)[\s\S]*\.scene-viewport\s*\{[^}]*padding-bottom:\s*calc\(150px/s,
    );
  });

  it('keeps the full narrow-screen brand beside usable resource controls', () => {
    expect(responsiveCss).toMatch(
      /@media \(max-width: 430px\)[\s\S]*\.brand strong\s*\{[^}]*overflow:\s*visible;[^}]*text-overflow:\s*clip;[^}]*white-space:\s*nowrap;/s,
    );
    expect(responsiveCss).toMatch(
      /@media \(max-width: 430px\)[\s\S]*\.currencies\s*\{[^}]*min-width:\s*0;/s,
    );
  });
});
