import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The runtime smoke helpers are intentionally plain ESM.
import * as chromeCdp from '../../scripts/lib/chrome-cdp.mjs';

type PreviewLifecycle = {
  assertLoopbackPortAvailable: (port: number) => Promise<void>;
  waitForOwnedPreview: (
    url: string,
    options: {
      child: ReturnType<typeof spawn>;
      getOutput: () => string;
      timeoutMs?: number;
    },
  ) => Promise<void>;
};

const previewLifecycle = chromeCdp as typeof chromeCdp & PreviewLifecycle;

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test port');
  return address.port;
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

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
    expect(source).toContain('assertLoopbackPortAvailable');
    expect(source).toContain('waitForOwnedPreview');
    expect(source).toContain('assertPreviewAlive');
    expect(source).toContain('inspectBattleCanvasRegions');
    expect(source).toContain('compareObjectRegionToControl');
    expect(source).toContain('nearbyControlCandidates');
    expect(source).toContain('controlGridCandidates');
    expect(source).toContain('defeatedEnemyId');
    expect(source).toContain('deathCoordinates');
    expect(source).toContain('preDefeatLocalBaseline');
    expect(source).toContain('defeatEvidenceDeadline');
    expect(source).toContain('createEvidenceViewport');
    expect(source).toContain('logicalRectToPixelRect');
    expect(source).toContain('selectSafeControlRegion');
    expect(source).toContain('passesDefeatCueEvidence');
    expect(source).toContain('backgroundBaseline');
    expect(source).toContain('state.effects');
    expect(source).toContain('defeatSquash');
    expect(source).toContain('dynamicBounds');
    expect(source).toContain('smallRegionStride');
    expect(source).toContain("alive === false");
    expect(source).toContain('continueObservingLaterKills');
    expect(source).toContain('background-foreground semantic omission');
    expect(source).toContain('1000ms displacement-sample window');
    expect(source).toContain('1200ms full choreography');
  });

  it('rejects an already occupied preview port before startup', async () => {
    expect(previewLifecycle.assertLoopbackPortAvailable).toBeTypeOf('function');
    const staleServer = createServer((_request, response) => response.end('stale'));
    const port = await listen(staleServer);

    try {
      await expect(
        previewLifecycle.assertLoopbackPortAvailable(port),
      ).rejects.toThrow(`Preview port ${port} is already occupied`);
    } finally {
      await close(staleServer);
    }
  });

  it.each(Array.from({ length: 8 }, (_, index) => index + 1))(
    'rejects delayed stale HTTP when the owned preview exits first (run %i)',
    async () => {
      expect(previewLifecycle.waitForOwnedPreview).toBeTypeOf('function');
      let staleResponseSent = false;
      const staleServer = createServer((_request, response) => {
        setTimeout(() => {
          staleResponseSent = true;
          response.end('stale');
        }, 300);
      });
      const port = await listen(staleServer);
      const output: string[] = [];
      const child = spawn(
        process.execPath,
        ['-e', [
          `console.log('Local: http://127.0.0.1:${port}/');`,
          'setTimeout(() => process.exit(0), 30);',
        ].join('')],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );
      child.stdout?.on('data', (chunk) => output.push(String(chunk)));

      try {
        await expect(previewLifecycle.waitForOwnedPreview(
          `http://127.0.0.1:${port}`,
          {
            child,
            getOutput: () => output.join(''),
            timeoutMs: 2_000,
          },
        )).rejects.toThrow('Owned preview exited before readiness');
        expect(staleResponseSent).toBe(false);
      } finally {
        if (child.exitCode === null) child.kill('SIGKILL');
        await close(staleServer);
      }
    },
  );

  it('requires the ready signal to name the exact expected host and port', async () => {
    const server = createServer((_request, response) => response.end('ready'));
    const port = await listen(server);
    const output: string[] = [];
    const child = spawn(
      process.execPath,
      ['-e', [
        `console.log('Local: http://127.0.0.1:${port + 1}/');`,
        'setInterval(() => {}, 1000);',
      ].join('')],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    child.stdout?.on('data', (chunk) => output.push(String(chunk)));

    try {
      await expect(previewLifecycle.waitForOwnedPreview(
        `http://127.0.0.1:${port}`,
        { child, getOutput: () => output.join(''), timeoutMs: 250 },
      )).rejects.toThrow('Timed out waiting for the owned preview ready signal');
    } finally {
      child.kill('SIGKILL');
      await close(server);
    }
  });
});
