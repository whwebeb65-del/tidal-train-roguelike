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

  it('installs the image decoder required by production asset tests', () => {
    const workflow = readFileSync(
      '.github/workflows/deploy-pages.yml',
      'utf8',
    );
    const setupPython = workflow.indexOf('uses: actions/setup-python@v5');
    const installPillow = workflow.indexOf(
      'run: python -m pip install Pillow',
    );
    const runTests = workflow.indexOf('run: npm test');

    expect(setupPython).toBeGreaterThan(-1);
    expect(installPillow).toBeGreaterThan(setupPython);
    expect(runTests).toBeGreaterThan(installPillow);
  });
});
