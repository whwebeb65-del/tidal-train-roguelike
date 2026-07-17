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
  });
});
