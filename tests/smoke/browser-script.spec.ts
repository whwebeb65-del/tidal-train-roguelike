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
    expect(source).toContain('trainInkRatio');
    expect(source).toContain('enemyInkRatio');
    expect(source).toContain('defeatRegionChanged');
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

  it('does not accept stale HTTP readiness after the owned preview exits', async () => {
    expect(previewLifecycle.waitForOwnedPreview).toBeTypeOf('function');
    const staleServer = createServer((_request, response) => response.end('stale'));
    const port = await listen(staleServer);
    const output: string[] = [];
    const child = spawn(
      process.execPath,
      ['-e', `console.log('Local: http://127.0.0.1:${port}/');`],
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
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
      await close(staleServer);
    }
  });
});
