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
    const releaseCapture = readFileSync(
      '.superpowers/sdd/task-7-visual-qa/capture-task-7.mjs',
      'utf8',
    );

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
    expect(source).toContain('assertCaptainGuidebook');
    expect(source).toContain('assertTidalArchiveCarriage');
    expect(source).toContain('show-tidal-archive');
    expect(source).toContain('data-archive-enemy');
    expect(source).toContain('archive images must load');
    expect(source).toContain("readCurrency(client, 'routeMarks')");
    expect(source).toContain("readCurrency(client, 'starTickets')");
    expect(source).toMatch(
      /await navigateScene\(client, 'station'\);\s*await assertFirstRunBattleTutorial\(client, label\);\s*await navigateScene\(client, 'equipment'\);/,
    );
    expect(source.match(/await assertFirstRunBattleTutorial\(client, label\)/g)).toHaveLength(1);
    expect(source).toContain('guidebook-current-ticket');
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
    expect(source).toContain('eliteEncountered');
    expect(source).toContain('requiredTideBeastKinds');
    expect(source).toContain('tideBeastKindsSeen');
    expect(source).toContain('roleBehaviourSeen');
    expect(source).toContain('full battle should encounter tide beast');
    expect(source).toContain('distinctTideBeastArtSeen');
    expect(source).toContain('evolutionOfferSeen');
    expect(source).toContain('assertEvolutionRitual');
    expect(source).toContain('assertFirstRunBattleTutorial');
    expect(source).toContain('firstRunTutorialStep');
    expect(source).toContain('second run must not repeat first-run direction');
    expect(source).toContain("capture('evolution')");
    expect(source).toContain('battle-dialog--evolution');
    expect(source).toContain('evolution ritual cards are clipped');
    expect(source).toContain('precisionWeakPointSeen');
    expect(source).toContain('battleMusicIntensitySeen');
    expect(source).toContain('battle hard cap should not be reached');
    expect(source).toContain('chooseStrategicUpgrade');
    expect(source).toContain("[data-upgrade-id=");
    expect(source).toContain('resetSaveBetweenViewports');
    expect(source).toContain('assertGlobalInteractiveTargets');
    expect(source).toContain("button:not([disabled])");
    expect(source).toContain('a[href]');
    expect(source).toContain("input:not([disabled]):not([type=\"hidden\"])");
    expect(source).toContain('select:not([disabled])');
    expect(source).toContain('width < 44 || height < 44');
    expect(source).toContain('getClientRects().length > 0');
    expect(source).toContain('settings-panel');
    expect(releaseCapture).toContain('tidal-train-prototype-save-v1');
    expect(releaseCapture).toContain('captureDesktopEvidence');
    expect(releaseCapture).toContain('captureVariantEvidence');
    expect(releaseCapture).toContain('captureDefeatEvidence');
    expect(releaseCapture).toContain('battle-ready-1440x900.png');
    expect(releaseCapture).toContain('two-variants-1440x900.png');
    expect(releaseCapture).toContain('defeat-settlement-1440x900.png');
    expect(releaseCapture).toContain('variantsCaptured');
    expect(releaseCapture).toContain('assertDesktopEvidenceComplete');
    expect(releaseCapture).toContain('required desktop evidence is missing');
  });

  it('scopes archive controls and requires static reduced motion plus two victories', () => {
    const source = readFileSync('scripts/smoke-browser.mjs', 'utf8');

    expect(source).toContain('assertReducedMotionArchive');
    expect(source).toContain('archive reduced-motion decorations');
    expect(source).toContain("document.querySelector('.tidal-archive-carriage')");
    expect(source).toContain("document.querySelector('.otter-workshop')");
    expect(source).toContain("workshop.querySelectorAll('[data-action=\"upgrade-equipment\"]')");
    expect(source).toContain('button.disabled');
    expect(source).toContain('getComputedStyle(node, pseudo)');
    expect(source).toContain("name: 'prefers-reduced-motion', value: 'reduce'");
    expect(source).toContain("name: 'prefers-reduced-motion', value: 'no-preference'");
    expect(source).not.toContain(
      "document.querySelector('[data-action=\"show-tidal-archive\"]')",
    );
    expect(source).not.toContain(
      "document.querySelectorAll('.archive-card')",
    );
    expect(source).toMatch(
      /const first = await assertTidalArchiveDiscoveryFeedback[\s\S]*?const second = await finishFullBattle[\s\S]*?assert\.deepEqual\(\s*\[first\.terminalStatus, second\.terminalStatus\],\s*\['victory', 'victory'\]/,
    );
  });

  it('guards three real skill-evolution signatures without a build mutation hook', () => {
    const source = readFileSync('scripts/smoke-browser.mjs', 'utf8');
    const castStart = source.indexOf(
      'async function castAndObserveSignature',
    );
    const castEnd = source.indexOf(
      'async function assertSkillEvolutionSignatures',
      castStart,
    );
    const castSource = source.slice(castStart, castEnd);

    expect(source).toContain('assertSkillEvolutionSignatures');
    expect(source).toContain('assertApprovedE2EHookSurface');
    expect(source).toContain('approvedE2EHookKeys');
    expect(source).toContain('effectKinds');
    expect(source).toContain('split-chevron');
    expect(source).toContain('emergency-beacon');
    expect(source).toContain('undertow-eye');
    expect(source).toContain('victory/victory');
    expect(source).not.toContain('e2eApplySkillVariant');
    expect(source).not.toContain('forceSkillVariant');
    expect(source).not.toMatch(/hook[^\n]*skillVariants[^\n]*=/);
    expect(source).not.toMatch(
      /(?:\.skillVariants|\[['"]skillVariants['"]\])(?:\s*\[[^\]]+\])*\s*=/s,
    );
    expect(castSource).toContain('effects?.camera');
    expect(castSource).not.toContain('trainMotion');
    expect(castSource).toContain('static-skill-silhouette');
    expect(castSource).toContain('stableStaticRing');
    expect(castSource).toContain('secondaryColor');
    expect(castSource).toContain('staticSignatureRingBounds');
    expect(source).toContain('REDUCED_BUBBLE_RING_RADII');
    expect(source).toMatch(
      /'bursting-bubble': 54[\s\S]*?'reflective-spines': 58[\s\S]*?'overflow-membrane': 62[\s\S]*?'emergency-trigger': 66/,
    );
    expect(source).toContain('STATIC_RING_RENDERER_OUTLINE_HALF_WIDTH');
    expect(source).toContain('SIGNATURE_SMOKE_BOUND_MARGIN');
    expect(source).toContain('skillButtonCount');
    expect(source).toContain('tideHudCount');
    expect(source).toContain('visibleInteractionCount');
    expect(castSource).toContain('maximumReducedBubbleSignatureRingBounds');
    expect(castSource).toMatch(
      /staticSignatureRingBounds\(firstRing\)[\s\S]*?maximumReducedBubbleSignatureRingBounds\(firstRing\)/,
    );
    expect(castSource).toMatch(
      /if \(reducedMotion\)[\s\S]*?assertSignatureAvoidsProtectedControls/,
    );
    expect(castSource).toContain('sampleSignaturePixels');
    expect(castSource).toContain('captureSignaturePixelBaseline');
    expect(source).toContain('baselinePrimaryMatches');
    expect(source).toContain('newPrimaryMatches');
    expect(source).toContain('primaryMatchIncrease');
    expect(source).toContain('signatureMotifBounds');
    expect(source).toContain("querySelectorAll('[data-battle-skill]')");
    expect(castSource).not.toContain('pixelDifference');
    expect(source).not.toContain('primaryDistance <= 160');
    expect(source).toContain('#59e9ff');
    expect(source).toContain('#f1ffff');
    expect(source).toContain('#ff735f');
    expect(source).toContain('#ffd58a');
    expect(source).toContain('#456fe8');
    expect(source).toContain('#78e8ff');
    expect(source).toContain('continueVerifiedSignatureBattle');
    expect(source).toContain('verifiedBattleId');
    expect(source).toMatch(
      /terminalBattle\.battleId[\s\S]*?verifiedBattleId/,
    );
    const verifiedVictoryStart = source.indexOf(
      'async function continueVerifiedSignatureBattle',
    );
    const verifiedVictoryEnd = source.indexOf(
      'async function claimRepeatedSalvage',
      verifiedVictoryStart,
    );
    const verifiedVictorySource = source.slice(
      verifiedVictoryStart,
      verifiedVictoryEnd,
    );
    expect(verifiedVictorySource).toContain(
      'terminalBattle.status',
    );
    expect(verifiedVictorySource).toContain(
      'terminalBattle.battleId',
    );
    expect(verifiedVictorySource).not.toContain(
      'data-settlement-overlay',
    );
    expect(verifiedVictorySource).not.toContain(
      'data-battle-action="revive"',
    );
    expect(source).not.toContain('forceVictory');
  });

  it('binds boss cinematic evidence to all real phases and protected controls', () => {
    const source = readFileSync('scripts/smoke-browser.mjs', 'utf8');

    expect(source).toContain('bossPhasesSeen');
    expect(source).toContain("'boss-summon'");
    expect(source).toContain("'boss-tide'");
    expect(source).toContain("'boss-enraged'");
    expect(source).toContain('bossTideWarningSeen');
    expect(source).toContain('bossWeakPointStatesSeen');
    expect(source).toContain('assertBossTelegraphPresentation');
    expect(source).toContain('assertBossCanvasPixelEvidence');
    expect(source).toContain('assertBossCanvasNegativeEvidence');
    expect(source).toContain('assertBossWarningCountdownDelta');
    expect(source).toContain('normalTideCountdownSample');
    expect(source).toContain('negativeGateResults');
    expect(source).toContain('warningCountdown');
    expect(source).toContain('openPalette');
    expect(source).toContain('closedPalette');
    expect(source).toContain('cinematicTitle');
    expect(source).toContain('船长：回响集结 · 留意援军');
    expect(source).toContain('CanvasRenderingContext2D');
    expect(source).toContain('getImageData');
    expect(source).toContain('bossTideWarningActive');
    expect(source).toContain('bossPixelCounts');
    expect(source).toContain('targetPixelCounts');
    expect(source).toContain('controlPixelCounts');
    expect(source).toContain('pixelDelta');
    expect(source).toContain('targetRegions');
    expect(source).toContain('controlRegions');
    expect(source).toContain("safeSecondary: '#d8fff3'");
    expect(source).toContain("dangerSecondary: '#ffb07a'");
    expect(source).toContain('await advanceBattle(client, 50)');
    expect(source).toContain('const secondState = await snapshot(client)');
    expect(source).toContain('relativePixelDrift');
    const paletteDistance = source.match(/const paletteDistance = (\d+);/);
    expect(Number(paletteDistance?.[1])).toBeLessThan(72);
    expect(source).toContain('phaseDurationMs');
    expect(source).toContain('.json`');
    expect(source).toContain(
      "captureQaScreenshot(client, `390x844-boss-${phase}`)",
    );
    expect(source).toContain("['open', 'closed']");
    expect(source).not.toContain('setBossPhase');
    const fullBattle = source.slice(
      source.indexOf('async function finishFullBattle'),
      source.indexOf('async function assertTidalArchiveDiscoveryFeedback'),
    );
    expect(fullBattle).toContain(
      'state.verification.bossTideWarningActive',
    );
    expect(fullBattle).toContain('holdingBossDamageForTideWarning');
    expect(fullBattle).toContain('setMainCannonAim(195, 780)');
    expect(fullBattle).toContain('mainCannonAim');
    expect(fullBattle).not.toMatch(
      /bossTideWarningSeen\s*=\s*[^;]*phaseRemainingMs\s*<=\s*1200/,
    );
  });

  it('guards the complete tidal archive discovery feedback lifecycle', () => {
    const source = readFileSync('scripts/smoke-browser.mjs', 'utf8');

    expect(source).toContain('assertTidalArchiveDiscoveryFeedback');
    expect(source).toContain('data-archive-discovery');
    expect(source).toContain('data-settlement-archive');
    expect(source).toContain('archive-unread-seal');
    expect(source).toContain('archive-new-stamp');
    expect(source).toContain('unreadEntryKeys');
    expect(source).toMatch(
      /assert\.deepEqual\(\s*\[first\.terminalStatus, second\.terminalStatus\],\s*\['victory', 'victory'\]/,
    );
  });

  it('requires authoritative visible ticket binding and complete protected geometry', () => {
    const source = readFileSync('scripts/smoke-browser.mjs', 'utf8');

    expect(source).toContain(
      "'.battle-archive-discovery[data-archive-discovery]'",
    );
    expect(source).toContain('archiveDiscoveryKey');
    expect(source).toContain('isRenderedAndVisible');
    expect(source).toContain("style.display !== 'none'");
    expect(source).toContain("style.visibility === 'visible'");
    expect(source).toContain('Number.parseFloat(style.opacity) > 0');
    expect(source).toContain('rect.width > 0 && rect.height > 0');
    expect(source).toContain('protectedRegionFailures');
    expect(source).toContain('canvasAimRegion.width > 0');
    expect(source).toContain('ticket.key');
    expect(source).toContain('ticket.artSrc');
  });

  it('requires true-zero reduced motion and retains the broad archive audit', () => {
    const source = readFileSync('scripts/smoke-browser.mjs', 'utf8');

    expect(source).not.toContain('hasNonZeroCssTime');
    expect(source).toContain("style.animationDuration !== '0s'");
    expect(source).toContain("style.transitionDuration !== '0s'");
    expect(source).toContain('broadArchiveMotion');
    expect(source).toContain("workshop.querySelectorAll('.workshop-tabs button')");
    expect(source).toContain("root.querySelectorAll('*')");
    expect(source).toContain('visibleBounds');
    expect(source).toContain('archive broad reduced-motion audit');
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

  it.each(Array.from({ length: 6 }, (_, index) => index + 1))(
    'aborts an in-flight stale HTTP request when the owned preview exits (run %i)',
    async () => {
      expect(previewLifecycle.waitForOwnedPreview).toBeTypeOf('function');
      let requestStarted = false;
      let requestAborted = false;
      let staleResponseSent = false;
      let child: ReturnType<typeof spawn> | undefined;
      const staleServer = createServer((_request, response) => {
        requestStarted = true;
        child?.kill('SIGKILL');
        response.on('close', () => {
          requestAborted = !response.writableEnded;
        });
        setTimeout(() => {
          staleResponseSent = true;
          response.end('stale');
        }, 100);
      });
      const port = await listen(staleServer);
      const output: string[] = [];
      child = spawn(
        process.execPath,
        ['-e', [
          `console.log('Local: http://127.0.0.1:${port}/');`,
          'setInterval(() => {}, 1000);',
        ].join('')],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );
      child.stdout?.on('data', (chunk) => output.push(String(chunk)));

      try {
        await expect(previewLifecycle.waitForOwnedPreview(
          `http://127.0.0.1:${port}`,
          { child, getOutput: () => output.join(''), timeoutMs: 2_000 },
        )).rejects.toThrow('Owned preview exited before readiness');
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(requestStarted).toBe(true);
        expect(requestAborted).toBe(true);
        expect(staleResponseSent).toBe(true);
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
