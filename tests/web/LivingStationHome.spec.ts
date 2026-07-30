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
});
