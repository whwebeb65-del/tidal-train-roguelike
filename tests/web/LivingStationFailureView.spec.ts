import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('living station failure and notices', () => {
  it('uses repair-bay semantics without changing recovery actions', () => {
    const hud = readFileSync(
      new URL('../../web/battle/BattleHUD.ts', import.meta.url),
      'utf8',
    );
    const runtime = readFileSync(
      new URL('../../web/LegacyGameRuntime.ts', import.meta.url),
      'utf8',
    );

    expect(hud).toContain('failure-panel repair-bay');
    expect(hud).toContain('damage-report');
    expect(hud).toContain('repair-actions');
    expect(hud).toContain('data-battle-action="give-up"');
    expect(runtime).toContain('onRequestRevive: requestBattleRevive');
    expect(runtime).toContain('onGiveUp: settleBattleOutcome');
  });

  it('styles notices as station announcements', () => {
    const shell = readFileSync(
      new URL('../../web/app/AppShell.ts', import.meta.url),
      'utf8',
    );
    const appShellCss = readFileSync(
      new URL('../../web/styles/app-shell-v2.css', import.meta.url),
      'utf8',
    );
    const flowCss = readFileSync(
      new URL('../../web/styles/living-station-flow.css', import.meta.url),
      'utf8',
    );

    expect(shell).toContain('notice app-notice station-announcement');
    expect(shell).toContain('data-notice-copy');
    expect(appShellCss).toContain('.app-notice.station-announcement');
    expect(appShellCss).toContain('pointer-events: none');
    expect(flowCss).toContain('.repair-bay');
  });

  it('keeps repair decorations behind operable controls', () => {
    const flowCss = readFileSync(
      new URL('../../web/styles/living-station-flow.css', import.meta.url),
      'utf8',
    );

    expect(flowCss).toMatch(
      /\.repair-bay::before,[\s\S]*?\.repair-bay::after\s*\{[^}]*z-index:\s*0;[^}]*pointer-events:\s*none;/,
    );
    expect(flowCss).toMatch(
      /\.repair-bay \.repair-bay__sheet\s*\{[^}]*z-index:\s*1;/,
    );
  });

  it('keeps visible battle announcements out of the battle viewport cascade', () => {
    const appShellCss = readFileSync(
      new URL('../../web/styles/app-shell-v2.css', import.meta.url),
      'utf8',
    );

    expect(appShellCss).toMatch(
      /\.app-shell--battle \.scene-viewport:has\(\.app-notice\.is-visible\)\s*\{[^}]*padding:\s*0;/,
    );
    expect(appShellCss).toContain(
      '.app-shell--battle:has(.battle-overlay:not([hidden])) .app-notice',
    );
    expect(appShellCss).toContain(
      '.app-shell--battle:has([data-battle-tutorial]:not([hidden])) .app-notice',
    );
    expect(appShellCss).toMatch(
      /\.app-shell--battle \.app-notice\.station-announcement\s*\{[^}]*top:\s*auto;[^}]*left:\s*calc\(12px \+ env\(safe-area-inset-left\)\);[^}]*bottom:\s*calc\(18px \+ env\(safe-area-inset-bottom\)\);[^}]*width:\s*min\(236px, calc\(100% - 96px\)\);[^}]*max-width:\s*236px;[^}]*height:\s*46px;[^}]*max-height:\s*46px;[^}]*pointer-events:\s*none;/s,
    );
    expect(appShellCss).toMatch(
      /\.app-shell--battle \.app-notice\.station-announcement::before\s*\{[^}]*content:\s*'RADIO';/s,
    );
    expect(appShellCss).toMatch(
      /\.app-shell--battle \.app-notice\.station-announcement \[data-notice-copy\]\s*\{[^}]*-webkit-line-clamp:\s*2;/s,
    );
    expect(appShellCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.app-shell--battle \.app-notice\.station-announcement,[\s\S]*?\.app-shell--battle \.app-notice\.station-announcement\.is-visible\s*\{[^}]*transition:\s*none;[^}]*transform:\s*none;/,
    );
  });
});
