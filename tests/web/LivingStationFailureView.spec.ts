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
    expect(appShellCss).toMatch(
      /\.app-shell--battle \.app-notice\.station-announcement\s*\{[^}]*top:\s*auto;[^}]*bottom:\s*calc\(210px[^}]*width:\s*min\(340px,/,
    );
  });
});
