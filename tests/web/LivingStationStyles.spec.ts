import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('living station styles', () => {
  it('imports the scene language after generic progression styles', () => {
    const entry = readFileSync(new URL('../../web/styles.css', import.meta.url), 'utf8');
    expect(entry.indexOf('progression.css')).toBeLessThan(
      entry.indexOf('living-station-foundation.css'),
    );
  });

  it('defines shellless places, physical props and reduced motion', () => {
    const css = readFileSync(
      new URL('../../web/styles/living-station-foundation.css', import.meta.url),
      'utf8',
    );
    expect(css).toContain('.living-zone');
    expect(css).toContain('border: 0');
    expect(css).toContain('background: transparent');
    expect(css).toContain('.station-prop');
    expect(css).toContain('.station-stamp');
    expect(css).toContain('.station-hangtag');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
