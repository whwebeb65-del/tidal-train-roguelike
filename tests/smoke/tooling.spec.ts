import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('prototype tooling', () => {
  it('defines every local release gate', () => {
    const packageJson = JSON.parse(
      readFileSync('package.json', 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(Object.keys(packageJson.scripts ?? {})).toEqual(
      expect.arrayContaining([
        'test',
        'typecheck',
        'check:assets',
        'build',
        'smoke:browser',
      ]),
    );
  });

  it('runs release gates before uploading the Pages artifact', () => {
    const workflow = readFileSync(
      '.github/workflows/deploy-pages.yml',
      'utf8',
    );
    const orderedMarkers = [
      'run: npm ci',
      'run: npm test',
      'run: npm run typecheck',
      'run: npm run check:assets',
      'run: npm run build',
      'run: npm run smoke:browser',
      'uses: actions/upload-pages-artifact@v3',
    ];
    let previousIndex = -1;
    for (const marker of orderedMarkers) {
      const index = workflow.indexOf(marker);
      expect(index, `${marker} should exist`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  });
});
