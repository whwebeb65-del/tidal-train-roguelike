import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('living station home composition', () => {
  it('uses a route yard and work order instead of generic route cards and footer', () => {
    const source = readFileSync(
      new URL('../../web/LegacyGameRuntime.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('station-route-yard');
    expect(source).toContain('route-sign');
    expect(source).toContain('station-work-order');
    expect(source).not.toContain('<div class="station-footer">');
    expect(source).toContain('data-action="upgrade-station"');
    expect(source).toContain('data-action="select-map"');
    expect(source).toContain('data-action="unlock-map"');
    expect(source).toContain('renderCaptainGuidebook');
    expect(source.indexOf('renderCaptainGuidebook({')).toBeLessThan(
      source.indexOf('<div class="station-route-yard living-zone">'),
    );
  });

  it('keeps the route yard shellless and supplies mobile layout rules', () => {
    const css = readFileSync(
      new URL('../../web/styles/living-station-home.css', import.meta.url),
      'utf8',
    );
    expect(css).toContain('.station-route-yard');
    expect(css).toContain('.route-sign.is-current');
    expect(css).toContain('.station-work-order');
    expect(css).toContain('@media (max-width: 760px)');
  });

  it('anchors the work-order metal clip to its paper slip', () => {
    const css = readFileSync(
      new URL('../../web/styles/living-station-home.css', import.meta.url),
      'utf8',
    );
    expect(css).toMatch(/\.station-work-order\s*\{[^}]*position:\s*relative;/);
    expect(css).toMatch(/\.station-work-order::before\s*\{[^}]*position:\s*absolute;/);
  });

  it('keeps browser mobile reading checks aligned with the route-yard markup', () => {
    const smoke = readFileSync(
      new URL('../../scripts/smoke-browser.mjs', import.meta.url),
      'utf8',
    );
    expect(smoke).toContain("['.station-route-yard__heading', 0]");
    expect(smoke).toContain("['.route-sign', 0]");
    expect(smoke).toContain("['.route-sign', 3]");
    expect(smoke).not.toContain("['.map-card', 0]");
    expect(smoke).not.toContain("['.map-card', 3]");
  });
});
