import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('browser smoke script', () => {
  it('uses strict preview, four mobile viewports and e2e hooks', () => {
    const source = readFileSync('scripts/smoke-browser.mjs', 'utf8');

    expect(source).toContain('--strictPort');
    expect(source).toContain('360');
    expect(source).toContain('390');
    expect(source).toContain('412');
    expect(source).toContain('430');
    expect(source).toContain('__TIDAL_TRAIN_E2E__');
    expect(source).toContain('timeoutMs: 45_000');
    expect(source).toContain('inspectHandDrawnStation');
    expect(source).toContain('data-station-layer');
    expect(source).toContain('captain-greeting');
    expect(source).toContain('background-foreground');
    expect(source).toContain('data-ambient-event');
    expect(source).toContain('assertMobileReadingSafety');
    expect(source).toContain('visibleRouteContent');
    expect(source).toContain('brandTextFullyVisible');
    expect(source).toContain('captainProminence');
  });
});
