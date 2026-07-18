import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderAppShell } from '../../web/app/AppShell';

const appShellCss = readFileSync(
  new URL('../../web/styles/app-shell-v2.css', import.meta.url),
  'utf8',
);
const responsiveCss = readFileSync(
  new URL('../../web/styles/responsive.css', import.meta.url),
  'utf8',
);

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
