import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('asset budget', () => {
  it('keeps launch art inside the approved byte budget', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/check-asset-budget.mjs'],
      { encoding: 'utf8' },
    );

    expect(output).toContain('first-screen bytes');
    expect(output).toContain('battle-screen bytes');
    expect(output).toContain('asset budget ok');
  });
});
