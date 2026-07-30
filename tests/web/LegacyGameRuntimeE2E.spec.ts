import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LegacyGameRuntime E2E purchase controls', () => {
  it('allows a purchase delay only behind the exact e2e gate', () => {
    const source = readFileSync(
      new URL('../../web/LegacyGameRuntime.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("runtimeSearchParams.get('e2ePurchaseDelayMs')");
    expect(source).toMatch(/const e2ePurchaseDelayMs = e2eEnabled[\s\S]*new MockStore\('verified', e2ePurchaseDelayMs\)/);
  });
});
