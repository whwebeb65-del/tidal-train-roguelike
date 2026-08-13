import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CdpClient,
  assertChildAlive,
  assertLoopbackPortAvailable,
  createCdpTarget,
  delay,
  findChromeExecutable,
  findFreePort,
  stopChild,
  waitForHttp,
  waitForOwnedPreview,
} from './lib/chrome-cdp.mjs';
import {
  buildBattleDynamicBounds,
  boundsIntersectRect,
  createEvidenceViewport,
  logicalRectToPixelRect,
  passesDefeatCueEvidence,
  passesObjectEvidence,
  predictDefeatSampleRegions,
  predictNextEnemyRegion,
  selectSafeControlRegion,
} from './lib/battle-pixel-evidence.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const previewPort = 4177;
const previewOrigin = `http://127.0.0.1:${previewPort}`;
const viewports = [
  { width: 360, height: 800, full: false },
  { width: 390, height: 844, full: true },
  { width: 412, height: 915, full: false },
  { width: 430, height: 932, full: false },
];
const stationRelativeXTolerancePx = 4;
const qaDirectory = path.join(repositoryRoot, '.superpowers', 'sdd', 'battle-progression-qa');

async function captureQaScreenshot(client, name) {
  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(qaDirectory, `${name}.png`), shot.data, 'base64');
}

function captureChildOutput(child, label) {
  let output = '';
  const append = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-8_000);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  return {
    raw: () => output,
    diagnostic: () => (output.trim() ? `\n${label}:\n${output.trim()}` : ''),
  };
}

function assertPreviewAlive(preview, label) {
  assertChildAlive(preview, `Owned preview before ${label}`);
}

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    const description = response.exceptionDetails.exception?.description
      ?? response.exceptionDetails.text
      ?? 'unknown browser exception';
    throw new Error(description);
  }
  if (response.result?.subtype === 'error') {
    throw new Error(response.result.description ?? 'browser evaluation failed');
  }
  return response.result?.value;
}

async function waitForEvaluation(
  client,
  expression,
  { timeoutMs = 15_000, label = expression } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await evaluate(client, expression);
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${label}${detail}`);
}

const hookExpression = 'window.__TIDAL_TRAIN_E2E__';
const playerSaveStorageKey = 'tidal-train-prototype-save-v1';
const tidalArchiveStorageKey = 'tidal-train-tidal-archive-v1';
const firstRunBattleTutorialStorageKey =
  'tidal-train-first-run-battle-tutorial-v1';
const authoritativeFirstArchiveDiscovery = Object.freeze({
  entryId: 'bubble-fin',
  key: 'enemy:bubble-fin',
  name: '泡鳍怪',
});
const completedFirstRunBattleTutorialFixture = Object.freeze({
  version: 1,
  completedStepIds: Object.freeze(['aim', 'skill', 'upgrade']),
  skipped: false,
});

function createTidalArchiveFixture({ unread = false } = {}) {
  return {
    version: 2,
    discoveredEnemyKinds: unread
      ? [authoritativeFirstArchiveDiscovery.entryId]
      : [],
    discoveredSkillVariantIds: [],
    unreadEntryKeys: unread
      ? [authoritativeFirstArchiveDiscovery.key]
      : [],
  };
}

async function snapshot(client) {
  return evaluate(client, `${hookExpression}.snapshot()`);
}

async function callHook(client, body) {
  return evaluate(
    client,
    `(async () => { const hook = ${hookExpression}; ${body} })()`,
  );
}

async function reloadWithE2EArchiveFixture(
  client,
  { unread = false } = {},
) {
  const fixtureInstalled = await evaluate(client, `(() => {
    const exactE2EGate = new URLSearchParams(location.search).get('e2e') === '1'
      && Boolean(${hookExpression});
    if (!exactE2EGate) return false;
    localStorage.setItem(
      ${JSON.stringify(tidalArchiveStorageKey)},
      ${JSON.stringify(JSON.stringify(createTidalArchiveFixture({ unread })))}
    );
    localStorage.setItem(
      ${JSON.stringify(firstRunBattleTutorialStorageKey)},
      ${JSON.stringify(JSON.stringify(completedFirstRunBattleTutorialFixture))}
    );
    return true;
  })()`);
  assert.equal(
    fixtureInstalled,
    true,
    'archive fixtures must only be installed through the exact e2e=1 gate',
  );
  const navigation = await client.send('Page.reload', { ignoreCache: true });
  if (navigation.errorText) {
    throw new Error(`Fixture reload failed: ${navigation.errorText}`);
  }
  await waitForEvaluation(
    client,
    `Boolean(${hookExpression})
      && ${hookExpression}.snapshot().sceneId === 'station'
      && document.querySelector('#scene-host')?.dataset.sceneId === 'station'`,
    { label: 'E2E archive fixture reload' },
  );
}

async function navigateScene(client, sceneId) {
  await callHook(
    client,
    `await hook.navigate(${JSON.stringify(sceneId)}); return true;`,
  );
  await waitForEvaluation(
    client,
    `(() => {
      const hook = ${hookExpression};
      return hook?.snapshot().sceneId === ${JSON.stringify(sceneId)}
        && document.querySelector('#scene-host')?.dataset.sceneId
          === ${JSON.stringify(sceneId)};
    })()`,
    { label: `scene ${sceneId}` },
  );
}

async function ensureCaptainSelected(client) {
  const captainButtonExists = await evaluate(
    client,
    `Boolean(document.querySelector(
      '[data-action="select-captain"]'
        + '[data-captain-id="captain-tide-female"]'
    ))`,
  );
  if (!captainButtonExists) return;
  const clicked = await evaluate(
    client,
    `(() => {
      const button = document.querySelector(
        '[data-action="select-captain"]'
          + '[data-captain-id="captain-tide-female"]'
      );
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`,
  );
  assert.equal(clicked, true, 'default captain button should be clickable');
  await waitForEvaluation(
    client,
    `${hookExpression}?.snapshot().sceneId === 'station'`,
    { label: 'captain selection to reach station' },
  );
}

async function assertNoHorizontalOverflow(client, label) {
  const dimensions = await evaluate(
    client,
    `({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    })`,
  );
  assert.ok(
    dimensions.scrollWidth <= dimensions.innerWidth + 1,
    `${label} overflows horizontally: ${dimensions.scrollWidth}`
      + ` > ${dimensions.innerWidth}`,
  );
}

async function assertGlobalInteractiveTargets(client, label) {
  const interactiveSelector = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
  ].join(', ');
  const undersized = await evaluate(
    client,
    `(() => [...document.querySelectorAll(${JSON.stringify(interactiveSelector)})]
      .filter((element) => {
        const style = getComputedStyle(element);
        return element.getClientRects().length > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number.parseFloat(style.opacity) > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          action: element.getAttribute('data-action')
            ?? element.getAttribute('data-battle-action')
            ?? element.getAttribute('href')
            ?? '',
          label: element.getAttribute('aria-label')
            ?? element.textContent?.trim()
            ?? '',
          width: rect.width,
          height: rect.height,
        };
      })
      .filter(({ width, height }) => width < 44 || height < 44))()`,
  );
  assert.deepEqual(
    undersized,
    [],
    `${label} interactive target(s) below 44x44: ${JSON.stringify(undersized)}`,
  );
}

async function assertLivingZoneAccessibility(client, label) {
  const result = await evaluate(
    client,
    `(() => {
      const livingZones = [...document.querySelectorAll('.living-zone')];
      const buttons = livingZones.flatMap((zone) => [
        ...zone.querySelectorAll('button:not([disabled])'),
      ]);
      const undersizedButtons = buttons
        .map((button) => ({
          label: button.textContent?.trim() ?? '',
          height: button.getBoundingClientRect().height,
        }))
        .filter(({ height }) => height < 44);
      const interactivePseudos = [...document.querySelectorAll('.living-zone, .living-zone *')]
        .flatMap((element) => ['::before', '::after'].map((pseudo) => ({
          element: element.className || element.tagName,
          pseudo,
          style: getComputedStyle(element, pseudo),
        })))
        .filter(({ style }) => style.content !== 'none' && style.pointerEvents !== 'none')
        .map(({ element, pseudo }) => ({ element, pseudo }));
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        livingZoneCount: livingZones.length,
        undersizedButtons,
        interactivePseudos,
      };
    })()`,
  );
  assert.ok(
    result.scrollWidth <= result.innerWidth,
    `${label} living station overflow: ${result.scrollWidth} > ${result.innerWidth}`,
  );
  assert.ok(result.livingZoneCount >= 1, `${label} missing living zone`);
  assert.deepEqual(
    result.undersizedButtons,
    [],
    `${label} small touch target(s): ${JSON.stringify(result.undersizedButtons)}`,
  );
  assert.deepEqual(
    result.interactivePseudos,
    [],
    `${label} decorative pseudo-element intercepts input: ${JSON.stringify(result.interactivePseudos)}`,
  );
}

async function assertCaptainGuidebook(client, label) {
  const result = await evaluate(client, `(() => {
    const root = document.querySelector('.captain-guidebook');
    const current = root?.querySelectorAll('.guidebook-current-ticket') ?? [];
    const previews = root?.querySelectorAll('.guidebook-preview-ticket') ?? [];
    const buttons = [...(root?.querySelectorAll('button:not([disabled])') ?? [])];
    const rect = root?.getBoundingClientRect() ?? null;
    return {
      exists: root instanceof HTMLElement,
      currentCount: current.length,
      previewCount: previews.length,
      rootLeft: rect?.left ?? -1,
      rootRight: rect?.right ?? innerWidth + 1,
      innerWidth,
      controls: buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    };
  })()`);
  assert.equal(result.exists, true, `${label} guidebook root is missing`);
  assert.equal(result.currentCount, 1, `${label} guidebook must show one current ticket`);
  assert.ok(result.previewCount <= 2, `${label} guidebook shows too many previews`);
  assert.ok(
    result.rootLeft >= 0 && result.rootRight <= result.innerWidth + 1,
    `${label} guidebook overflows horizontally`,
  );
  assert.ok(
    result.controls.every(({ width, height }) => width >= 44 && height >= 44),
    `${label} guidebook has an undersized control`,
  );
}

async function readStoredTidalArchive(client) {
  return evaluate(client, `JSON.parse(
    localStorage.getItem(${JSON.stringify(tidalArchiveStorageKey)}) ?? '{}'
  )`);
}

async function assertArchiveUnreadSeal(client, label) {
  const seal = await evaluate(client, `(() => {
    const workshop = document.querySelector('.otter-workshop');
    const tab = workshop?.querySelector(
      '[data-action="show-tidal-archive"]'
    );
    const node = tab?.querySelector('.archive-unread-seal');
    if (!(tab instanceof HTMLButtonElement) || !(node instanceof HTMLElement)) {
      return null;
    }
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const isRenderedAndVisible = style.display !== 'none'
      && style.visibility === 'visible'
      && Number.parseFloat(style.opacity) > 0
      && node.getClientRects().length > 0
      && rect.width > 0 && rect.height > 0;
    return {
      text: node.textContent?.trim() ?? '',
      visible: isRenderedAndVisible,
      visibleBounds: { width: rect.width, height: rect.height },
      contained: rect.left >= -1
        && rect.right <= innerWidth + 1
        && rect.top >= -1
        && rect.bottom <= innerHeight + 1,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
    };
  })()`);
  assert.ok(seal, `${label} archive-unread-seal is missing`);
  assert.equal(seal.visible, true, `${label} archive unread seal is hidden`);
  assert.ok(
    seal.visibleBounds.width > 0 && seal.visibleBounds.height > 0,
    `${label} archive unread seal has no visible bounds`,
  );
  assert.match(seal.text, /^NEW [1-9]\d*$/, `${label} archive unread seal copy`);
  assert.equal(seal.contained, true, `${label} archive unread seal is clipped`);
  assert.ok(
    seal.scrollWidth <= seal.innerWidth + 1,
    `${label} archive unread seal causes horizontal overflow`,
  );
}

async function assertTidalArchiveCarriage(client, label, { full = false } = {}) {
  await navigateScene(client, 'equipment');

  if (!full) {
    assert.deepEqual(
      (await readStoredTidalArchive(client)).unreadEntryKeys,
      [authoritativeFirstArchiveDiscovery.key],
      `${label} legal unread fixture must survive normalization`,
    );
    await assertArchiveUnreadSeal(client, `${label} seeded`);
  }

  const openAndInspectArchive = async (phase) => {
    const opened = await evaluate(client, `(() => {
      const workshop = document.querySelector('.otter-workshop');
      const button = workshop?.querySelector(
        '[data-action="show-tidal-archive"]'
      );
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()`);
    assert.equal(opened, true, `${label} ${phase} archive tab must be clickable`);
    await waitForEvaluation(
      client,
      `(() => {
        const workshop = document.querySelector('.otter-workshop');
        return Boolean(document.querySelector('.tidal-archive-carriage'))
          && workshop?.querySelector('[data-action="show-tidal-archive"]')
            ?.getAttribute('aria-pressed') === 'true';
      })()`,
      { label: `${label} ${phase} tidal archive carriage` },
    );

    const overview = await evaluate(client, `(() => {
      const root = document.querySelector('.tidal-archive-carriage');
      const workshop = document.querySelector('.otter-workshop');
      const active = workshop?.querySelector(
        '[data-action="show-tidal-archive"]'
      );
      const tabs = [...(workshop?.querySelectorAll(
        '.workshop-tabs button:not([disabled])'
      ) ?? [])].filter((button) => {
        const style = getComputedStyle(button);
        return button.getClientRects().length > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden';
      });
      return {
        root: root instanceof HTMLElement,
        active: active?.getAttribute('aria-pressed'),
        enemyCount: root?.querySelectorAll('[data-archive-enemy]').length ?? 0,
        variantCount: root?.querySelectorAll('[data-archive-variant]').length ?? 0,
        equipmentCount: root?.querySelectorAll('[data-archive-equipment]').length ?? 0,
        enemyDiscovered: root?.querySelectorAll(
          '[data-archive-enemy].is-discovered'
        ).length ?? 0,
        matchingNewStamp: Boolean(root?.querySelector(
          '[data-archive-enemy="${authoritativeFirstArchiveDiscovery.entryId}"]'
            + ' .archive-new-stamp'
        )),
        newStampCount: root?.querySelectorAll('.archive-new-stamp').length ?? 0,
        tabs: tabs.map((tab) => {
          const rect = tab.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth,
      };
    })()`);
    assert.equal(overview.root, true, `${label} ${phase} archive root is missing`);
    assert.equal(overview.active, 'true', `${label} ${phase} archive tab is inactive`);
    assert.deepEqual(
      [overview.enemyCount, overview.variantCount, overview.equipmentCount],
      [8, 12, 8],
      `${label} ${phase} archive must expose exact 8/12/8 card counts`,
    );
    assert.ok(
      overview.tabs.length > 0
        && overview.tabs.every(({ width, height }) => width >= 44 && height >= 44),
      `${label} ${phase} archive tab is below 44x44: ${JSON.stringify(overview.tabs)}`,
    );
    assert.ok(
      overview.scrollWidth <= overview.innerWidth + 1,
      `${label} ${phase} archive overflows horizontally`,
    );
    await assertGlobalInteractiveTargets(client, `${label} ${phase} archive actions`);

    await evaluate(client, `(async () => {
      const cards = [...document.querySelectorAll(
        '.tidal-archive-carriage .archive-card'
      )];
      for (const card of cards) {
        card.scrollIntoView({ block: 'center', inline: 'nearest' });
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return true;
    })()`);
    await waitForEvaluation(
      client,
      `(() => {
        const images = [...document.querySelectorAll(
          '.tidal-archive-carriage img'
        )];
        return images.length > 0
          && images.every((image) => image.complete && image.naturalWidth > 0);
      })()`,
      { label: `${label} ${phase} archive images must load` },
    );

    const cardBounds = await evaluate(client, `(async () => {
      const cards = [...document.querySelectorAll('.tidal-archive-carriage .archive-card')];
      const results = [];
      for (const card of cards) {
        card.scrollIntoView({ block: 'center', inline: 'nearest' });
        await new Promise((resolve) => requestAnimationFrame(() => (
          requestAnimationFrame(resolve)
        )));
        const rect = card.getBoundingClientRect();
        results.push({
          key: card.getAttribute('data-archive-enemy')
            ?? card.getAttribute('data-archive-variant')
            ?? card.getAttribute('data-archive-equipment'),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          innerWidth,
          innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
        });
      }
      return results;
    })()`);
    assert.equal(cardBounds.length, 28, `${label} ${phase} archive card walk is incomplete`);
    assert.ok(
      cardBounds.every((card) => (
        card.left >= -1
        && card.right <= card.innerWidth + 1
        && card.top >= -1
        && card.bottom <= card.innerHeight + 1
        && card.scrollWidth <= card.innerWidth + 1
      )),
      `${label} ${phase} archive card escapes the viewport: `
        + JSON.stringify(cardBounds.filter((card) => (
          card.left < -1
          || card.right > card.innerWidth + 1
          || card.top < -1
          || card.bottom > card.innerHeight + 1
          || card.scrollWidth > card.innerWidth + 1
        ))),
    );
    return overview;
  };

  const initial = await openAndInspectArchive('initial');
  if (!full) {
    assert.deepEqual(
      (await readStoredTidalArchive(client)).unreadEntryKeys,
      [],
      `${label} opening archive must clear persisted unreadEntryKeys`,
    );
    assert.equal(
      initial.matchingNewStamp,
      true,
      `${label} seeded card must retain its archive-new-stamp for this visit`,
    );
    assert.equal(
      initial.newStampCount,
      1,
      `${label} seeded audit must expose exactly one NEW stamp`,
    );
  }
  if (full) {
    const currenciesBefore = await Promise.all([
      readCurrency(client, 'gears'),
      readCurrency(client, 'routeMarks'),
      readCurrency(client, 'starTickets'),
    ]);
    assert.ok(
      currenciesBefore.every(Number.isFinite),
      `${label} archive discovery currency baseline is unreadable`,
    );
    await navigateScene(client, 'station');
    await assertFirstRunBattleTutorial(client, label);
    await navigateScene(client, 'equipment');
    const grown = await openAndInspectArchive('post-battle');
    assert.ok(
      grown.enemyDiscovered > initial.enemyDiscovered,
      `${label} real battle must increase archive enemy discovery`,
    );
    const currenciesAfter = await Promise.all([
      readCurrency(client, 'gears'),
      readCurrency(client, 'routeMarks'),
      readCurrency(client, 'starTickets'),
    ]);
    assert.deepEqual(
      currenciesAfter,
      currenciesBefore,
      `${label} archive discovery alone must not change currencies`,
    );
  }

  const switchedBack = await evaluate(client, `(() => {
    const workshop = document.querySelector('.otter-workshop');
    const button = workshop?.querySelector(
      '[data-action="show-equipment-workshop"]'
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert.equal(switchedBack, true, `${label} workshop tab must remain clickable`);
  await waitForEvaluation(
    client,
    `(() => {
      const workshop = document.querySelector('.otter-workshop');
      return workshop?.querySelector('[data-action="show-equipment-workshop"]')
        ?.getAttribute('aria-pressed') === 'true'
        && !document.querySelector('.tidal-archive-carriage');
    })()`,
    { label: `${label} restored equipment workshop` },
  );
  const mutationControls = await evaluate(client, `(() => {
    const workshop = document.querySelector('.otter-workshop');
    if (!(workshop instanceof HTMLElement)) return null;
    const groups = {
      upgrade: workshop.querySelectorAll('[data-action="upgrade-equipment"]'),
      star: workshop.querySelectorAll('[data-action="star-equipment"]'),
      reroll: workshop.querySelectorAll('[data-action="reroll-equipment"]'),
    };
    return Object.fromEntries(Object.entries(groups).map(([key, controls]) => [
      key,
      [...controls].filter((button) => {
        if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
        const style = getComputedStyle(button);
        return !button.hidden
          && button.getClientRects().length > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden';
      }).length,
    ]));
  })()`);
  assert.ok(
    mutationControls
      && mutationControls.upgrade > 0
      && mutationControls.star > 0
      && mutationControls.reroll > 0,
    `${label} visible enabled switch-back workshop mutation controls are missing: `
      + JSON.stringify(mutationControls),
  );
  await navigateScene(client, 'station');
}

function assertStaticArchiveFeedback(styles, label) {
  assert.ok(styles.length > 0, `${label} reduced-motion audit is empty`);
  const failures = styles.filter((style) => (
    style.animationName !== 'none'
    || style.animationDuration !== '0s'
    || style.transform !== 'none'
    || style.transitionDuration !== '0s'
  ));
  assert.deepEqual(
    failures,
    [],
    `${label} reduced-motion feedback must have no animation, transition, or transform: `
      + JSON.stringify(failures),
  );
}

async function assertFirstArchiveDiscoveryTicket(
  client,
  label,
  { reducedMotion = false } = {},
) {
  const discoveryTicketSelector =
    '.battle-archive-discovery[data-archive-discovery]';
  let firstEnemyKind = null;
  for (let index = 0; index < 40; index += 1) {
    const state = await snapshot(client);
    firstEnemyKind = state.battle?.enemies[0]?.kind ?? null;
    const ticketVisible = await evaluate(
      client,
      `(() => {
        const node = document.querySelector(
          ${JSON.stringify(discoveryTicketSelector)}
        );
        if (!(node instanceof HTMLElement) || node.hidden) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility === 'visible'
          && Number.parseFloat(style.opacity) > 0
          && node.getClientRects().length > 0
          && rect.width > 0 && rect.height > 0;
      })()`,
    );
    if (firstEnemyKind && ticketVisible) break;
    await advanceBattle(client, 50);
  }
  assert.equal(
    firstEnemyKind,
    authoritativeFirstArchiveDiscovery.entryId,
    `${label} first authoritative enemy must match the archive catalog`,
  );
  await waitForEvaluation(
    client,
    `(() => {
      const root = document.querySelector(
        ${JSON.stringify(discoveryTicketSelector)}
      );
      const image = root?.querySelector('[data-archive-discovery-art]');
      return image instanceof HTMLImageElement
        && root instanceof HTMLElement
        && !root.hidden
        && image.complete
        && image.naturalWidth > 0;
    })()`,
    { label: `${label} first discovery image` },
  );

  const ticket = await evaluate(client, `(() => {
    const root = document.querySelector(
      ${JSON.stringify(discoveryTicketSelector)}
    );
    const canvas = document.querySelector('[data-battle-canvas]');
    if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
      return null;
    }
    const image = root.querySelector('[data-archive-discovery-art]');
    const rootRect = root.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const rootStyle = getComputedStyle(root);
    const canvasStyle = getComputedStyle(canvas);
    const isRenderedAndVisible = (node, style, rect) => (
      !node.hidden
      && node.getClientRects().length > 0
      && style.display !== 'none'
      && style.visibility === 'visible'
      && Number.parseFloat(style.opacity) > 0
      && rect.width > 0 && rect.height > 0
    );
    const overlaps = (first, second) => first.left < second.right
      && first.right > second.left
      && first.top < second.bottom
      && first.bottom > second.top;
    const inspectProtectedRegion = (selector) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) {
        return { selector, exists: false, visible: false, rect: null };
      }
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        selector,
        exists: true,
        visible: isRenderedAndVisible(node, style, rect),
        rect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      };
    };
    const canvasAimRegion = {
      left: canvasRect.left + canvasRect.width * .72 - 28,
      right: canvasRect.left + canvasRect.width * .72 + 28,
      top: canvasRect.top + canvasRect.height * .34 - 28,
      bottom: canvasRect.top + canvasRect.height * .34 + 28,
      width: 56,
      height: 56,
    };
    const styleEntries = [null, '::before', '::after']
      .map((pseudo) => {
        const style = getComputedStyle(root, pseudo);
        return {
          key: 'battle-archive-discovery' + (pseudo ?? ''),
          pseudo,
          content: style.content,
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
          transform: style.transform,
        };
      })
      .filter((entry) => entry.pseudo === null || entry.content !== 'none');
    const protectedRegions = {
      topHud: inspectProtectedRegion('.battle-hud__tide-log'),
      speed: inspectProtectedRegion('[data-battle-action="speed"]'),
      pause: inspectProtectedRegion('[data-battle-action="pause"]'),
      skills: inspectProtectedRegion('.battle-hud__skills'),
    };
    return {
      key: root.dataset.archiveDiscoveryKey ?? '',
      kind: root.dataset.archiveDiscoveryKind ?? '',
      name: root.querySelector('[data-archive-discovery-name]')
        ?.textContent?.trim() ?? '',
      typeText: root.querySelector('[data-archive-discovery-type]')
        ?.textContent?.trim() ?? '',
      ticketText: root.textContent?.trim() ?? '',
      artSrc: image instanceof HTMLImageElement
        ? image.currentSrc || image.src
        : '',
      imageLoaded: image instanceof HTMLImageElement
        && image.complete
        && image.naturalWidth > 0,
      pointerEvents: getComputedStyle(root).pointerEvents,
      interactiveDescendants: root.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]'
      ).length,
      interactionVisible: Boolean(document.querySelector(
        '[data-battle-action="claim-interaction"]:not([hidden])'
      )),
      visible: isRenderedAndVisible(root, rootStyle, rootRect),
      visibleBounds: { width: rootRect.width, height: rootRect.height },
      canvasVisible: isRenderedAndVisible(canvas, canvasStyle, canvasRect),
      canvasBounds: { width: canvasRect.width, height: canvasRect.height },
      canvasAimRegion,
      protectedRegions,
      contained: rootRect.left >= -1
        && rootRect.right <= innerWidth + 1
        && rootRect.top >= -1
        && rootRect.bottom <= innerHeight + 1,
      overlaps: {
        ...Object.fromEntries(Object.entries(protectedRegions).map(
          ([key, region]) => [
            key,
            region.rect ? overlaps(rootRect, region.rect) : null,
          ]
        )),
        canvasAimRegion: overlaps(rootRect, canvasAimRegion),
      },
      styles: styleEntries,
    };
  })()`);
  assert.ok(ticket, `${label} battle discovery ticket is missing`);
  assert.equal(ticket.visible, true, `${label} battle discovery ticket is not visible`);
  assert.ok(
    ticket.visibleBounds.width > 0 && ticket.visibleBounds.height > 0,
    `${label} battle discovery ticket has no visible bounds`,
  );
  const storedArchive = await readStoredTidalArchive(client);
  assert.deepEqual(
    storedArchive.unreadEntryKeys,
    [authoritativeFirstArchiveDiscovery.key],
    `${label} first spawn must persist the matching authoritative enemy key`,
  );
  assert.equal(
    ticket.key,
    storedArchive.unreadEntryKeys[0],
    `${label} ticket key must bind directly to the stored discovery`,
  );
  assert.equal(ticket.kind, 'enemy', `${label} discovery kind`);
  assert.equal(
    ticket.name,
    authoritativeFirstArchiveDiscovery.name,
    `${label} discovery name must use the authoritative archive catalog`,
  );
  assert.equal(
    ticket.typeText,
    '首次目击已装订',
    `${label} enemy discovery type must match the authoritative entry`,
  );
  assert.match(
    new URL(ticket.artSrc).pathname,
    /\/assets\/puffer-dragon-[^/]+\.webp$/,
    `${label} discovery art must use the authoritative bubble-fin asset`,
  );
  assert.equal(ticket.imageLoaded, true, `${label} discovery image must load`);
  assert.equal(
    ticket.interactiveDescendants,
    0,
    `${label} discovery ticket must have no interactive descendants`,
  );
  assert.equal(
    ticket.pointerEvents,
    'none',
    `${label} discovery ticket must use pointer-events: none`,
  );
  assert.equal(
    ticket.interactionVisible,
    false,
    `${label} first discovery must occur outside a battle interaction`,
  );
  assert.equal(ticket.contained, true, `${label} discovery ticket is clipped`);
  assert.equal(ticket.canvasVisible, true, `${label} canvas aim surface is hidden`);
  assert.ok(
    ticket.canvasBounds.width > 0 && ticket.canvasBounds.height > 0,
    `${label} canvas aim surface has no bounds`,
  );
  assert.ok(
    ticket.canvasAimRegion.width > 0
      && ticket.canvasAimRegion.height > 0,
    `${label} protected canvas aim region has no positive geometry`,
  );
  const protectedRegionFailures = Object.entries(ticket.protectedRegions)
    .filter(([, region]) => (
      !region.exists
      || !region.visible
      || !region.rect
      || region.rect.width <= 0
      || region.rect.height <= 0
    ));
  assert.deepEqual(
    protectedRegionFailures,
    [],
    `${label} protected battle controls must exist with visible positive bounds: `
      + JSON.stringify(protectedRegionFailures),
  );
  assert.deepEqual(
    ticket.overlaps,
    {
      topHud: false,
      speed: false,
      pause: false,
      skills: false,
      canvasAimRegion: false,
    },
    `${label} discovery ticket overlaps protected battle geometry`,
  );
  if (reducedMotion) {
    assert.match(
      ticket.ticketText,
      /NEW ARCHIVE ENTRY.*首次目击已装订.*泡鳍怪/s,
      `${label} reduced motion must retain discovery text`,
    );
    assertStaticArchiveFeedback(ticket.styles, `${label} battle discovery`);
  }
  return Object.freeze({
    ...authoritativeFirstArchiveDiscovery,
    artSrc: ticket.artSrc,
  });
}

async function assertBattleHudGeometry(client, label) {
  const geometry = await evaluate(client, `(() => {
    const hud = document.querySelector('.battle-hud__tide-log');
    const canvas = document.querySelector('[data-battle-canvas]');
    const skills = [...document.querySelectorAll('[data-battle-skill]')];
    const refresh = document.querySelector('[data-battle-action="skill-refresh"]');
    if (!(hud instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('battle HUD or canvas is missing');
    }
    if (!(refresh instanceof HTMLButtonElement)) {
      throw new Error('battle skill refresh control is missing');
    }
    // The reward ticket is normally conditional. Reveal it here so every
    // production viewport proves its reserved, non-overlapping layout.
    refresh.hidden = false;
    const overlaps = (first, second) => first.left < second.right
      && first.right > second.left
      && first.top < second.bottom
      && first.bottom > second.top;
    const hudBottom = hud.getBoundingClientRect().bottom;
    const canvasRect = canvas.getBoundingClientRect();
    const logicalScale = window.visualViewport?.scale ?? 1;
    return {
      hudBottom: Number.parseFloat(getComputedStyle(hud).height),
      logicalScale,
      enemyLaneTop: (canvasRect.top + canvasRect.height * 120 / 844) / logicalScale,
      skillMin: Math.min(...skills.map((skill) => skill.getBoundingClientRect().height)) / logicalScale,
      skillCopy: skills.map((skill) => {
        const name = skill.querySelector('.battle-skill__copy b');
        const status = skill.querySelector('.battle-skill__copy small');
        const a11yStatus = skill.querySelector('[data-skill-status]');
        const nameRect = name?.getBoundingClientRect();
        const statusRect = status?.getBoundingClientRect();
        const a11yRect = a11yStatus?.getBoundingClientRect();
        const a11yStyle = a11yStatus instanceof HTMLElement
          ? getComputedStyle(a11yStatus)
          : null;
        return {
          nameVisible: name instanceof HTMLElement && nameRect !== undefined
            && nameRect.top >= 0 && nameRect.bottom <= innerHeight
            && nameRect.left >= 0 && nameRect.right <= innerWidth
            && name.scrollWidth <= name.clientWidth + 1,
          statusVisible: status instanceof HTMLElement && statusRect !== undefined
            && statusRect.top >= 0 && statusRect.bottom <= innerHeight
            && statusRect.left >= 0 && statusRect.right <= innerWidth
            && status.scrollWidth <= status.clientWidth + 1,
          a11yStatus: {
            text: a11yStatus?.textContent?.trim() ?? '',
            ariaHidden: a11yStatus?.getAttribute('aria-hidden'),
            visuallyHidden: a11yStyle?.position === 'absolute'
              && (a11yRect?.width ?? Infinity) <= 1
              && (a11yRect?.height ?? Infinity) <= 1
              && a11yStyle.overflow === 'hidden'
              && a11yStyle.clipPath !== 'none',
          },
        };
      }),
      refresh: (() => {
        const rect = refresh.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          overlapsSkill: skills.some((skill) => overlaps(rect, skill.getBoundingClientRect())),
        };
      })(),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
    };
  })()`);
  assert.ok(geometry.hudBottom <= 108, `${label} HUD bottom exceeds 108px: ${geometry.hudBottom}`);
  assert.ok(
    geometry.enemyLaneTop - geometry.hudBottom >= 12,
    `${label} enemy lane gap is below 12px: ${JSON.stringify(geometry)}`,
  );
  assert.ok(geometry.skillMin >= 56, `${label} skill target is below 56px`);
  assert.ok(geometry.skillCopy.every((copy) => copy.nameVisible), `${label} skill names are clipped or ellipsized`);
  assert.ok(geometry.skillCopy.every((copy) => copy.statusVisible), `${label} skill cooldown copy is clipped or ellipsized`);
  assert.ok(geometry.skillCopy.every((copy) => copy.a11yStatus.text.length > 0), `${label} skill status has no accessible name`);
  assert.ok(geometry.skillCopy.every((copy) => copy.a11yStatus.ariaHidden === null), `${label} skill status must remain available to assistive technology`);
  assert.ok(geometry.skillCopy.every((copy) => copy.a11yStatus.visuallyHidden), `${label} skill status leaks into the badge visual layout`);
  assert.ok(
    geometry.refresh.width / geometry.logicalScale >= 44
      && geometry.refresh.height / geometry.logicalScale >= 44,
    `${label} refresh target is below 44px: ${JSON.stringify(geometry.refresh)} @${geometry.logicalScale}`,
  );
  assert.equal(geometry.refresh.overlapsSkill, false, `${label} refresh ticket overlaps a skill target`);
  assert.ok(geometry.scrollWidth <= geometry.innerWidth + 1, `${label} battle overflows horizontally`);
}

async function assertEvolutionRitual(client, label) {
  const result = await evaluate(client, `(() => {
    const dialog = document.querySelector('.battle-dialog--evolution');
    const crest = dialog?.querySelector('[data-evolution-crest]:not([hidden])');
    const cards = [...(dialog?.querySelectorAll('[data-upgrade-slot]:not([hidden])') ?? [])];
    return {
      dialogCount: document.querySelectorAll('.battle-dialog--evolution').length,
      crestVisible: crest instanceof HTMLElement && crest.getClientRects().length > 0,
      cards: cards.map((card) => {
        const rect = card.getBoundingClientRect();
        const content = [...card.children].map((child) => {
          const childRect = child.getBoundingClientRect();
          return childRect.top >= rect.top - 1
            && childRect.bottom <= rect.bottom + 1
            && childRect.left >= rect.left - 1
            && childRect.right <= rect.right + 1;
        });
        return {
          width: rect.width,
          height: rect.height,
          contentClipped: content.some((visible) => !visible),
        };
      }),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
    };
  })()`);
  assert.equal(result.dialogCount, 1, `${label} must expose one evolution ritual`);
  assert.equal(result.crestVisible, true, `${label} evolution crest is hidden`);
  assert.equal(result.cards.length, 3, `${label} must expose three reward crates`);
  assert.ok(
    result.cards.every((card) => card.width >= 44 && card.height >= 44 && !card.contentClipped),
    `${label} evolution ritual cards are clipped: ${JSON.stringify(result.cards)}`,
  );
  assert.ok(result.scrollWidth <= result.innerWidth + 1, `${label} evolution ritual overflows`);
  await assertGlobalInteractiveTargets(client, `${label} evolution ritual`);
}

async function inspectSafeReadingTarget(client, selector, index) {
  return evaluate(
    client,
    `(async () => {
      const targets = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const target = targets[${index}] ?? null;
      if (!(target instanceof HTMLElement)) {
        throw new Error('route reading target is missing');
      }
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      await new Promise((resolve) => requestAnimationFrame(() => (
        requestAnimationFrame(() => resolve())
      )));
      const rect = target.getBoundingClientRect();
      const notice = document.querySelector('.app-notice.is-visible');
      const nav = document.querySelector('.app-hub-nav:not([hidden])');
      const topbar = document.querySelector('.app-topbar');
      const noticeRect = notice?.getBoundingClientRect() ?? null;
      const navRect = nav?.getBoundingClientRect() ?? null;
      const topbarRect = topbar?.getBoundingClientRect() ?? null;
      const safeTop = Math.max(
        0,
        topbarRect?.bottom ?? 0,
        noticeRect?.bottom ?? 0,
      ) + 8;
      const safeBottom = Math.min(
        innerHeight,
        navRect?.top ?? innerHeight,
      ) - 8;
      const overlaps = (first, second) => first && second
        && first.left < second.right
        && first.right > second.left
        && first.top < second.bottom
        && first.bottom > second.top;
      return {
        text: target.textContent?.trim() ?? '',
        top: rect.top,
        bottom: rect.bottom,
        safeTop,
        safeBottom,
        overlapsNotice: overlaps(rect, noticeRect),
        overlapsNav: overlaps(rect, navRect),
        fullyReadable: rect.top >= safeTop
          && rect.bottom <= safeBottom
          && !overlaps(rect, noticeRect)
          && !overlaps(rect, navRect),
      };
    })()`,
  );
}

async function assertMobileReadingSafety(client, label) {
  const shellAndHierarchy = await evaluate(
    client,
    `(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!(node instanceof HTMLElement)) return null;
        const box = node.getBoundingClientRect();
        return {
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          left: box.left,
          width: box.width,
          height: box.height,
        };
      };
      const brand = document.querySelector('.brand strong');
      const reset = document.querySelector('[data-action="reset-save"]');
      const settings = document.querySelector('[data-action="open-settings"]');
      const title = document.querySelector('.station-ticket h1');
      const captain = rect('[data-action="captain-greeting"]');
      const train = rect('[data-motion-role="train"]');
      const ticket = rect('.station-ticket');
      const departure = rect('[data-action="start-run"]');
      if (
        !(brand instanceof HTMLElement)
        || !(reset instanceof HTMLButtonElement)
        || !(settings instanceof HTMLButtonElement)
        || !(title instanceof HTMLElement)
        || !captain
        || !train
        || !ticket
        || !departure
      ) {
        throw new Error('mobile shell or station hierarchy nodes are missing');
      }
      const brandBox = brand.getBoundingClientRect();
      const resetBox = reset.getBoundingClientRect();
      const settingsBox = settings.getBoundingClientRect();
      const brandTextFullyVisible = brand.textContent?.trim() === '最后一班'
        && brand.scrollWidth <= brand.clientWidth + 1
        && brandBox.left >= 0
        && brandBox.right <= innerWidth;
       const controlsUsable = [resetBox, settingsBox].every((box) => (
         box.width >= 44
         && box.height >= 44
        && box.left >= 0
        && box.right <= innerWidth
      ));
      const captainProminence = captain.height > train.height
        && captain.top < train.top
        && train.width > departure.width
        && ticket.height <= 190
        && Number.parseFloat(getComputedStyle(title).fontSize) <= 26
        && ticket.bottom + 8 <= captain.top;
      return {
        brandTextFullyVisible,
        controlsUsable,
        captainProminence,
        brandText: brand.textContent?.trim() ?? '',
        titleFontSize: getComputedStyle(title).fontSize,
        captain,
        train,
        ticket,
        departure,
      };
    })()`,
  );
  assert.equal(
    shellAndHierarchy.brandTextFullyVisible,
    true,
    `${label} must show the full 最后一班 brand`,
  );
  assert.equal(
    shellAndHierarchy.controlsUsable,
    true,
    `${label} reset and settings controls must remain usable`,
  );
  assert.equal(
    shellAndHierarchy.captainProminence,
    true,
    `${label} hierarchy must be captain, train, then departure without overlap: `
      + JSON.stringify(shellAndHierarchy),
  );

  await evaluate(client, 'scrollTo({ top: 0, behavior: "instant" }); true;');

  const routeButtonClicked = await evaluate(
    client,
    `(() => {
      const button = document.querySelector('[data-action="select-map"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`,
  );
  assert.equal(routeButtonClicked, true, `${label} route selection must be available`);
  await waitForEvaluation(
    client,
    `document.querySelector('.app-notice')?.classList.contains('is-visible')
      === true`,
    { label: `${label} visible route notice` },
  );

  for (const [selector, index] of [
    ['.station-route-yard__heading', 0],
    ['.route-sign', 0],
    ['.route-sign', 3],
  ]) {
    const visibleRouteContent = await inspectSafeReadingTarget(client, selector, index);
    assert.equal(
      visibleRouteContent.overlapsNotice || visibleRouteContent.overlapsNav,
      false,
      `${label} current visible route content must not overlap notice/nav: `
        + JSON.stringify(visibleRouteContent),
    );
    assert.equal(
      visibleRouteContent.fullyReadable,
      true,
      `${label} route content must scroll fully into the mobile safe area: `
        + JSON.stringify(visibleRouteContent),
    );
  }
  await evaluate(client, 'scrollTo({ top: 0, behavior: "instant" }); true;');
}

function assertWarmOpaqueColor(color, label) {
  const components = color.match(/[\d.]+/g)?.map(Number) ?? [];
  assert.ok(components.length >= 3, `${label} must resolve to an RGB color`);
  const [red, green, blue, alpha = 1] = components;
  assert.ok(alpha > 0, `${label} must be non-transparent`);
  assert.ok(
    red >= blue + 10 && green >= blue,
    `${label} must resolve to a warm paper color, received ${color}`,
  );
}

async function inspectHandDrawnStation(client, label) {
  const station = await evaluate(
    client,
    `(() => {
      const ticket = document.querySelector('.station-ticket');
      if (!(ticket instanceof HTMLElement)) {
        throw new Error('station ticket is missing');
      }
      const ticketStyle = getComputedStyle(ticket);
      return {
        layerIds: [...document.querySelectorAll('[data-station-layer]')]
          .map((node) => node.getAttribute('data-station-layer')),
        ambientReady:
          Boolean(document.querySelector('[data-ambient-role="mail-fish"]'))
          && Boolean(document.querySelector('[data-ambient-role="distant-train"]')),
        captainButtonSize: (() => {
          const rect = document.querySelector('[data-action="captain-greeting"]')
            ?.getBoundingClientRect();
          return rect ? { width: rect.width, height: rect.height } : null;
        })(),
        ticketBackground: ticketStyle.backgroundColor,
        backdropFilter: ticketStyle.backdropFilter,
      };
    })()`,
  );

  assert.deepEqual(
    station.layerIds,
    ['sky', 'horizon', 'platform', 'foreground'],
    `${label} station layers must retain their exact authored order`,
  );
  assert.equal(station.ambientReady, true, `${label} ambient actors must exist`);
  assert.ok(station.captainButtonSize, `${label} captain greeting target is missing`);
  assert.ok(
    station.captainButtonSize.width >= 44
      && station.captainButtonSize.height >= 44,
    `${label} captain greeting target must be at least 44x44 CSS pixels`,
  );
  assertWarmOpaqueColor(station.ticketBackground, `${label} ticket background`);
  assert.equal(
    station.backdropFilter,
    'none',
    `${label} ticket must be paper rather than glass`,
  );

  const clicked = await evaluate(
    client,
    `(() => {
      const button = document.querySelector('[data-action="captain-greeting"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`,
  );
  assert.equal(clicked, true, `${label} captain greeting must be clickable`);
  await waitForEvaluation(
    client,
    `Boolean(document.querySelector(
      '.station-hero[data-ambient-event="captain-greeting"]'
    ))`,
    { label: `${label} captain greeting event`, timeoutMs: 500 },
  );
  const greeting = await evaluate(
    client,
    `document.querySelector('[data-ambient-role="dialogue"][aria-live]')
      ?.textContent?.trim() ?? ''`,
  );
  assert.match(greeting, /末班车/, `${label} greeting must remain in aria-live text`);
  await waitForEvaluation(
    client,
    `!document.querySelector(
      '.station-hero[data-ambient-event="captain-greeting"]'
    )`,
    { label: `${label} captain greeting completion`, timeoutMs: 2_000 },
  );
  assert.notEqual(
    await evaluate(
      client,
      `document.querySelector('.station-hero')?.dataset.ambientEvent ?? null`,
    ),
    'captain-greeting',
    `${label} greeting must be cleared before departure`,
  );
}

async function setDisplaySettings(
  client,
  { qualityPreference, reducedMotion },
  label,
) {
  assert.equal(
    await evaluate(
      client,
      `(() => {
        const button = document.querySelector('[data-action="open-settings"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`,
    ),
    true,
    `${label} settings button must be clickable`,
  );
  await waitForEvaluation(
    client,
    `Boolean(document.querySelector('[data-settings-panel]'))`,
    { label: `${label} settings panel` },
  );

  if (qualityPreference != null) {
    await evaluate(
      client,
      `(() => {
        const select = document.querySelector(
          'select[data-setting="qualityPreference"]'
        );
        if (!(select instanceof HTMLSelectElement)) return false;
        if (select.value !== ${JSON.stringify(qualityPreference)}) {
          select.value = ${JSON.stringify(qualityPreference)};
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      })()`,
    );
    await waitForEvaluation(
      client,
      `document.querySelector('select[data-setting="qualityPreference"]')
        ?.value === ${JSON.stringify(qualityPreference)}`,
      { label: `${label} quality ${qualityPreference}` },
    );
  }

  if (reducedMotion != null) {
    await evaluate(
      client,
      `(() => {
        const input = document.querySelector(
          'input[data-setting="reducedMotion"]'
        );
        if (!(input instanceof HTMLInputElement)) return false;
        if (input.checked !== ${Boolean(reducedMotion)}) {
          input.checked = ${Boolean(reducedMotion)};
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      })()`,
    );
    await waitForEvaluation(
      client,
      `document.querySelector('input[data-setting="reducedMotion"]')
        ?.checked === ${Boolean(reducedMotion)}`,
      { label: `${label} reduced motion ${Boolean(reducedMotion)}` },
    );
  }

  assert.equal(
    await evaluate(
      client,
      `(() => {
        const button = document.querySelector('[data-action="close-settings"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`,
    ),
    true,
    `${label} settings close button must be clickable`,
  );
  await waitForEvaluation(
    client,
    `document.querySelector('#settings-host')?.hasAttribute('hidden') === true`,
    { label: `${label} settings close` },
  );
}

async function measureStationDeparturePose(client, label) {
  const measurement = await evaluate(
    client,
    `(async () => {
      const hero = document.querySelector('.station-hero');
      const startButton = hero?.querySelector('[data-action="start-run"]');
      const vehicle = hero?.querySelector(
        '.station-hero__vehicle[data-motion-role="vehicle"]'
      );
      const vehicleRoleNames = [
        'train',
        'captain',
        'otter',
        'jellyfish',
        'wake',
        'engine',
      ];
      const displacementRoleNames = ['train', 'captain', 'otter', 'jellyfish'];
      const roleElements = Object.fromEntries(vehicleRoleNames.map((role) => [
        role,
        hero?.querySelector('[data-motion-role="' + role + '"]') ?? null,
      ]));
      if (
        !(hero instanceof HTMLElement)
        || !(startButton instanceof HTMLButtonElement)
        || !(vehicle instanceof HTMLElement)
        || Object.values(roleElements).some((element) => !(element instanceof HTMLElement))
      ) {
        throw new Error('station departure pose elements are missing');
      }
      const sharedVehicleAncestor = vehicleRoleNames.every((role) => (
        roleElements[role].closest('.station-hero__vehicle') === vehicle
        && roleElements[role].closest('[data-motion-role="vehicle"]') === vehicle
      ));
      if (!sharedVehicleAncestor) {
        throw new Error('station vehicle roles do not share the exact closest vehicle ancestor');
      }
      const readBoxes = () => Object.fromEntries(displacementRoleNames.map((role) => {
        const rect = roleElements[role].getBoundingClientRect();
        return [role, {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          centerX: rect.left + rect.width / 2,
        }];
      }));

      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const before = readBoxes();
      startButton.click();
      const deadline = performance.now() + 5_000;
      while (hero.dataset.departureState !== 'departing') {
        if (performance.now() >= deadline) {
          throw new Error('station departure state did not begin');
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      if (hero.dataset.ambientEvent === 'captain-greeting') {
        throw new Error('captain greeting overlapped station departure');
      }
      const departureStartedAt = performance.now();
      const displacementSampleTimeoutMs = 1_000;
      const choreographyDeadline = departureStartedAt + displacementSampleTimeoutMs;
      let during = readBoxes();
      let sampleReady = false;
      while (performance.now() < choreographyDeadline) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        during = readBoxes();
        const trainDisplacement = during.train.centerX - before.train.centerX;
        const sharedRelativeDriftReady = ['captain', 'otter', 'jellyfish']
          .every((role) => {
            const drift = (during[role].centerX - during.train.centerX)
              - (before[role].centerX - before.train.centerX);
            return Number.isFinite(drift)
              && Math.abs(drift) <= ${stationRelativeXTolerancePx};
          });
        if (trainDisplacement >= 12 && sharedRelativeDriftReady) {
          sampleReady = true;
          break;
        }
      }
      if (!sampleReady) {
        throw new Error(
          'station departure did not reach measurable shared displacement '
            + 'inside the 1000ms displacement-sample window '
            + '(1200ms full choreography)'
        );
      }
      return {
        before,
        during,
        sampleElapsedMs: performance.now() - departureStartedAt,
        departureState: hero.dataset.departureState ?? null,
        sameHero: hero.isConnected
          && document.querySelector('.station-hero') === hero,
        sharedVehicleAncestor,
        vehicleRoles: vehicleRoleNames,
      };
    })()`,
  );

  const displacementX = {};
  const relativeXDrift = {};
  for (const role of ['train', 'captain', 'otter', 'jellyfish']) {
    displacementX[role] = measurement.during[role].centerX
      - measurement.before[role].centerX;
    relativeXDrift[role] = role === 'train'
      ? 0
      : (measurement.during[role].centerX
          - measurement.during.train.centerX)
        - (measurement.before[role].centerX
          - measurement.before.train.centerX);
  }
  const enoughDepartureMotion = displacementX.train >= 12;
  const stableRelativeOffsets = ['captain', 'otter', 'jellyfish'].every(
    (role) => Math.abs(relativeXDrift[role]) <= stationRelativeXTolerancePx,
  );
  const passed = measurement.sameHero
    && measurement.sharedVehicleAncestor
    && measurement.departureState === 'departing'
    && enoughDepartureMotion
    && stableRelativeOffsets;
  const rounded = (value) => Number(value.toFixed(2));
  const result = {
    label,
    passed,
    sameHero: measurement.sameHero,
    sharedVehicleAncestor: measurement.sharedVehicleAncestor,
    vehicleRoles: measurement.vehicleRoles,
    departureState: measurement.departureState,
    tolerancePx: stationRelativeXTolerancePx,
    sampleElapsedMs: rounded(measurement.sampleElapsedMs),
    displacementX: Object.fromEntries(Object.entries(displacementX).map(
      ([role, value]) => [role, rounded(value)],
    )),
    relativeXDrift: Object.fromEntries(Object.entries(relativeXDrift).map(
      ([role, value]) => [role, rounded(value)],
    )),
  };
  console.log(
    `[smoke] ${label} station pose ${passed ? 'PASS' : 'FAIL'} - `
      + `displacementX=${JSON.stringify(result.displacementX)}; `
      + `relativeXDrift=${JSON.stringify(result.relativeXDrift)}; `
      + `sampleElapsedMs=${result.sampleElapsedMs}; `
      + `tolerance=±${stationRelativeXTolerancePx}px; `
      + `sameHero=${measurement.sameHero}; `
      + `sharedVehicleAncestor=${measurement.sharedVehicleAncestor}; `
      + `vehicleRoles=${measurement.vehicleRoles.join(',')}`,
  );
  return result;
}

async function startNormalBattle(client) {
  await callHook(client, 'await hook.startNormalBattle(); return true;');
  await waitForEvaluation(
    client,
    `${hookExpression}?.snapshot().sceneId === 'battle'`,
    { label: 'normal battle scene', timeoutMs: 45_000 },
  );
}

async function advanceBattle(client, durationMs) {
  await callHook(
    client,
    `hook.advanceBattle(${durationMs}); return hook.snapshot();`,
  );
}

async function assertFirstRunBattleTutorial(client, label) {
  const baseline = await snapshot(client);
  await startNormalBattle(client);
  await waitForEvaluation(
    client,
    `${hookExpression}?.snapshot().verification.firstRunTutorialStep === 'aim'`,
    { label: `${label} first-run aim direction` },
  );

  const inspectTicket = async (placement, protectedSelector) => evaluate(
    client,
    `(() => {
      const ticket = document.querySelector(
        '[data-battle-tutorial=${JSON.stringify(placement)}]:not([hidden])'
      );
      if (!(ticket instanceof HTMLElement)) return null;
      const title = ticket.querySelector('[data-tutorial-title]');
      const body = ticket.querySelector('[data-tutorial-body]');
      const skip = ticket.querySelector('[data-battle-action="skip-tutorial"]');
      if (!(skip instanceof HTMLButtonElement)) return null;
      const ticketRect = ticket.getBoundingClientRect();
      const skipRect = skip.getBoundingClientRect();
      const overlaps = [...document.querySelectorAll(${JSON.stringify(protectedSelector)})]
        .filter((element) => {
          if (!(element instanceof HTMLElement) || element.hidden) return false;
          const style = getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden';
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return Math.min(ticketRect.right, rect.right) > Math.max(ticketRect.left, rect.left)
            && Math.min(ticketRect.bottom, rect.bottom) > Math.max(ticketRect.top, rect.top);
        })
        .some(Boolean);
      return {
        title: title?.textContent?.trim() ?? '',
        body: body?.textContent?.trim() ?? '',
        skipWidth: skipRect.width,
        skipHeight: skipRect.height,
        clipped: ticketRect.left < 0
          || ticketRect.right > innerWidth + 1
          || ticketRect.top < 0
          || ticketRect.bottom > innerHeight + 1,
        overlaps,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    })()`,
  );

  const aimLayout = await inspectTicket(
    'battle',
    '[data-battle-skill], .app-notice.is-visible',
  );
  assert.ok(aimLayout, `${label} aim direction ticket must be visible`);
  assert.ok(aimLayout.title && aimLayout.body, `${label} aim direction copy must be complete`);
  assert.ok(
    aimLayout.skipWidth >= 44 && aimLayout.skipHeight >= 44,
    `${label} tutorial skip target must be at least 44x44`,
  );
  assert.equal(aimLayout.clipped, false, `${label} aim direction ticket is clipped`);
  assert.equal(aimLayout.overlaps, false, `${label} aim direction covers battle skills`);
  assert.equal(aimLayout.horizontalOverflow, false, `${label} aim direction overflows horizontally`);
  await captureQaScreenshot(client, `first-run-aim-${label}`);

  const aimPoint = await evaluate(client, `(() => {
    const canvas = document.querySelector('[data-battle-canvas]');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + rect.width * .72,
      y: rect.top + rect.height * .34,
    };
  })()`);
  assert.ok(aimPoint, `${label} battle canvas must accept real pointer aim`);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: aimPoint.x,
    y: aimPoint.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: aimPoint.x,
    y: aimPoint.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await waitForEvaluation(
    client,
    `${hookExpression}?.snapshot().verification.firstRunTutorialStep === 'skill'`,
    { label: `${label} first-run skill direction` },
  );
  await captureQaScreenshot(client, `first-run-skill-${label}`);

  await advanceBattle(client, 1_000);
  let skillUsed = await callHook(client, `return hook.useSkill('tidal-volley');`);
  if (!skillUsed) {
    await advanceBattle(client, 1_000);
    skillUsed = await callHook(client, `return hook.useSkill('tidal-volley');`);
  }
  assert.equal(skillUsed, true, `${label} directed active skill must be usable`);
  await advanceBattle(client, 17);
  await waitForEvaluation(
    client,
    `${hookExpression}?.snapshot().verification.firstRunTutorialStep === 'upgrade'`,
    { label: `${label} first-run upgrade direction` },
  );

  let upgradeReached = false;
  for (let index = 0; index < 90; index += 1) {
    const state = await snapshot(client);
    if (state.battle?.status === 'upgrade') {
      upgradeReached = true;
      break;
    }
    assert.notEqual(
      state.battle?.status,
      'defeat',
      `${label} first-run battle was defeated before the directed upgrade`,
    );
    await advanceBattle(client, 1_000);
  }
  assert.equal(upgradeReached, true, `${label} first-run upgrade must arrive within the bounded run`);
  await delay(420);

  const upgradeLayout = await inspectTicket(
    'upgrade',
    '[data-upgrade-slot]:not([hidden]), [data-battle-action="upgrade-reroll"]:not([hidden])',
  );
  assert.ok(upgradeLayout, `${label} upgrade direction ticket must be visible`);
  assert.ok(
    upgradeLayout.title && upgradeLayout.body,
    `${label} upgrade direction copy must be complete`,
  );
  assert.ok(
    upgradeLayout.skipWidth >= 44 && upgradeLayout.skipHeight >= 44,
    `${label} upgrade tutorial skip target must be at least 44x44`,
  );
  assert.equal(upgradeLayout.clipped, false, `${label} upgrade direction ticket is clipped`);
  assert.equal(upgradeLayout.overlaps, false, `${label} upgrade direction covers reward controls`);
  assert.equal(upgradeLayout.horizontalOverflow, false, `${label} upgrade direction overflows horizontally`);
  await captureQaScreenshot(client, `first-run-upgrade-${label}`);

  const upgradeChosen = await callHook(client, 'return hook.chooseFirstUpgrade();');
  assert.equal(upgradeChosen, true, `${label} directed upgrade must remain selectable`);
  await delay(450);
  await advanceBattle(client, 17);
  await waitForEvaluation(
    client,
    `${hookExpression}?.snapshot().verification.firstRunTutorialStep === null`,
    { label: `${label} completed first-run direction` },
  );
  await returnToStation(client, baseline.diagnostics.activeListeners);

  await startNormalBattle(client);
  const repeated = await evaluate(client, `(() => ({
    step: ${hookExpression}.snapshot().verification.firstRunTutorialStep,
    visibleTickets: document.querySelectorAll(
      '[data-battle-tutorial]:not([hidden])'
    ).length,
  }))()`);
  assert.deepEqual(
    repeated,
    { step: null, visibleTickets: 0 },
    `${label} second run must not repeat first-run direction`,
  );
  await returnToStation(client, baseline.diagnostics.activeListeners);
}

async function readBattleCanvasViewport(client) {
  const canvasMetrics = await evaluate(
    client,
    `(() => {
      const canvas = document.querySelector('[data-battle-canvas]');
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('battle canvas is missing');
      }
      return {
        cssWidth: Number.parseFloat(canvas.style.width),
        cssHeight: Number.parseFloat(canvas.style.height),
        pixelWidth: canvas.width,
        pixelHeight: canvas.height,
      };
    })()`,
  );
  const actualPixelRatio = Math.round(
    canvasMetrics.pixelWidth / canvasMetrics.cssWidth * 4,
  ) / 4;
  const viewport = createEvidenceViewport({
    cssWidth: canvasMetrics.cssWidth,
    cssHeight: canvasMetrics.cssHeight,
    devicePixelRatio: actualPixelRatio,
    maxDevicePixelRatio: actualPixelRatio,
  });
  assert.equal(viewport.pixelWidth, canvasMetrics.pixelWidth);
  assert.equal(viewport.pixelHeight, canvasMetrics.pixelHeight);
  return viewport;
}

async function inspectBattleCanvasRegions(
  client,
  regions,
  evidenceViewport = null,
) {
  const viewport = evidenceViewport ?? await readBattleCanvasViewport(client);
  const pixelRegions = regions.map((region) => ({
    ...logicalRectToPixelRect(region, viewport),
    name: region.name,
  }));
  return evaluate(
    client,
    `(() => {
      const canvas = document.querySelector('[data-battle-canvas]');
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('battle canvas is missing');
      }
      const context = canvas.getContext('2d');
      if (!context) throw new Error('battle canvas context is missing');
      const inspect = (region) => {
        const x = Math.max(0, region.x);
        const y = Math.max(0, region.y);
        const width = Math.max(1, Math.min(
          canvas.width - x,
          region.width,
        ));
        const height = Math.max(1, Math.min(
          canvas.height - y,
          region.height,
        ));
        const pixels = context.getImageData(x, y, width, height).data;
        let sampled = 0;
        const colorTotal = [0, 0, 0];
        const shapeTotal = Array.from({ length: 9 }, () => 0);
        const shapeCount = Array.from({ length: 9 }, () => 0);
        let brightCyanCount = 0;
        let centerBrightCount = 0;
        let centerSampled = 0;
        const smallRegionStride = width * height <= 64 ? 4 : 16;
        for (let index = 0; index < pixels.length; index += smallRegionStride) {
          sampled += 1;
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          colorTotal[0] += red;
          colorTotal[1] += green;
          colorTotal[2] += blue;
          const pixelIndex = index / 4;
          const pixelX = pixelIndex % width;
          const pixelY = Math.floor(pixelIndex / width);
          const cellX = Math.min(2, Math.floor(pixelX / width * 3));
          const cellY = Math.min(2, Math.floor(pixelY / height * 3));
          const cell = cellY * 3 + cellX;
          shapeTotal[cell] += (red + green + blue) / (3 * 255);
          shapeCount[cell] += 1;
          const brightCyan = red >= 180 && green >= 225 && blue >= 225;
          if (brightCyan) brightCyanCount += 1;
          if (cell === 4) {
            centerSampled += 1;
            if (brightCyan) centerBrightCount += 1;
          }
        }
        return {
          name: region.name,
          meanColor: colorTotal.map((total) => total / Math.max(1, sampled)),
          shapeProfile: shapeTotal.map((total, index) => (
            total / Math.max(1, shapeCount[index])
          )),
          brightCyanFraction: brightCyanCount / Math.max(1, sampled),
          centerBrightFraction: centerBrightCount / Math.max(1, centerSampled),
        };
      };
      return {
        width: canvas.width,
        height: canvas.height,
        regions: ${JSON.stringify(pixelRegions)}.map(inspect),
      };
    })()`,
  );
}

function nearbyControlCandidates(region) {
  const horizontalGap = region.width + 84;
  const verticalGap = region.height + 84;
  return [
    { ...region, x: region.x + horizontalGap },
    { ...region, x: region.x - horizontalGap },
    { ...region, y: region.y - verticalGap },
    { ...region, y: region.y + verticalGap },
    { ...region, x: region.x + horizontalGap, y: region.y - verticalGap },
    { ...region, x: region.x - horizontalGap, y: region.y - verticalGap },
  ];
}

function controlGridCandidates(region) {
  const candidates = [];
  for (let y = 32; y <= 620; y += 64) {
    for (let x = 20; x <= 350; x += 55) {
      candidates.push({
        ...region,
        x,
        y,
      });
    }
  }
  return candidates;
}

async function compareObjectRegionToControl(
  client,
  objectRegions,
  dynamicBounds,
) {
  const viewport = await readBattleCanvasViewport(client);
  const safePairs = objectRegions.map((region) => ({
    region,
    control: selectSafeControlRegion({
      target: region,
      candidates: [
        ...nearbyControlCandidates(region),
        ...controlGridCandidates(region),
      ],
      dynamicBounds,
      viewport,
    }),
  })).filter(({ control }) => control != null);
  const pairedRegions = safePairs.flatMap(({ region, control }) => [
    region,
    { ...control, name: `${region.name}-nearby-background-control` },
  ]);
  const canvas = await inspectBattleCanvasRegions(client, pairedRegions, viewport);
  return safePairs.map(({ region, control }, index) => {
    const object = canvas.regions[index * 2];
    const controlEvidence = canvas.regions[index * 2 + 1];
    return {
      id: region.id,
      region,
      object,
      controlRegion: control,
      control: controlEvidence,
      viewport,
      passed: passesObjectEvidence({
        target: object,
        backgroundBaseline: region.backgroundBaseline,
        signature: region.signature,
      }),
    };
  });
}

async function inspectFixedObjectControlPair(client, baseline) {
  const evidence = await inspectBattleCanvasRegions(client, [
    baseline.region,
    { ...baseline.controlRegion, name: `${baseline.region.name}-control` },
  ], baseline.viewport);
  return { target: evidence.regions[0], control: evidence.regions[1] };
}

async function assertLowQualityResilience(client, label) {
  await setDisplaySettings(
    client,
    { qualityPreference: 'low', reducedMotion: false },
    `${label} low quality`,
  );
  await waitForEvaluation(
    client,
    `document.querySelector('.station-hero')?.dataset.lowPerformance === 'true'`,
    { label: `${label} low-performance station state` },
  );
  const station = await evaluate(
    client,
    `(() => {
      const hero = document.querySelector('.station-hero');
      const distant = document.querySelector('[data-ambient-role="distant-train"]');
      const foreground = document.querySelector('[data-station-layer="foreground"]');
      return {
        lowPerformance: hero?.dataset.lowPerformance ?? null,
        distantDisplay: distant ? getComputedStyle(distant).display : null,
        foregroundDisplay: foreground ? getComputedStyle(foreground).display : null,
      };
    })()`,
  );
  assert.deepEqual(station, {
    lowPerformance: 'true',
    distantDisplay: 'none',
    foregroundDisplay: 'none',
  }, `${label} background-foreground semantic omission must be visible`);

  const baseline = await snapshot(client);
  await startNormalBattle(client);
  await waitForEvaluation(
    client,
    `${hookExpression}?.snapshot().diagnostics.qualityLevel === 'low'`,
    { label: `${label} low battle quality` },
  );

  let enemySeen = false;
  let defeatCueSeen = false;
  let trainObjectBound = false;
  let enemyObjectBound = false;
  let defeatObjectBound = false;
  let preDefeatLocalBaseline = new Map();
  const laneBackgroundBaselines = new Map();
  const laneWitnessRegions = [92, 195, 298].map((x, lane) => ({
    id: `lane-${lane}`,
    name: `enemy-lane-${lane}-witness`,
    x: x - 12,
    y: 98,
    width: 24,
    height: 24,
  }));
  const trainCannonRegion = {
    name: 'train-cannon',
    x: 179,
    y: 683,
    width: 32,
    height: 32,
  };
  const attemptedKillIds = new Set();
  let defeatedEnemyId = null;
  let deathCoordinates = null;
  const defeatDiagnostics = [];
  let maxDefeatBaselines = 0;
  const deadIdsWithoutBaseline = new Set();
  const observedDeadIds = new Set();
  const evidenceStepMs = 17;
  for (let index = 0; index < 960; index += 1) {
    const state = await snapshot(client);
    const battle = state.battle;
    assert.ok(battle, `${label} low-quality battle snapshot must exist`);
    const liveEnemies = battle.enemies.filter((enemy) => enemy.alive);
    for (const enemy of battle.enemies.filter((candidate) => !candidate.alive)) {
      if (!preDefeatLocalBaseline.has(enemy.id)) deadIdsWithoutBaseline.add(enemy.id);
      if (!observedDeadIds.has(enemy.id)) {
        observedDeadIds.add(enemy.id);
        defeatDiagnostics.push({
          enemyId: enemy.id,
          firstDeadObservation: true,
          baselineIds: [...preDefeatLocalBaseline.keys()],
          activeProjectiles: battle.projectiles.filter((projectile) => projectile.active)
            .map((projectile) => ({ id: projectile.id, targetId: projectile.targetId })),
          effectIds: state.effects?.particles.map((particle) => (
            `${particle.kind}-${particle.id}`
          )) ?? [],
        });
      }
    }
    enemySeen ||= liveEnemies.length > 0;
    const dynamicBounds = buildBattleDynamicBounds(
      battle,
      state.trainMotion,
      state.effects,
    );
    const witnessCanvas = await inspectBattleCanvasRegions(client, [
      {
        ...trainCannonRegion,
        x: trainCannonRegion.x + (state.trainMotion?.offsetX ?? 0),
        y: trainCannonRegion.y + (state.trainMotion?.offsetY ?? 0),
      },
      ...laneWitnessRegions,
    ]);
    trainObjectBound ||= passesObjectEvidence({
      target: witnessCanvas.regions[0],
      signature: 'train-cannon',
    });
    for (let laneIndex = 0; laneIndex < laneWitnessRegions.length; laneIndex += 1) {
      const region = laneWitnessRegions[laneIndex];
      const appearance = witnessCanvas.regions[laneIndex + 1];
      const overlapping = dynamicBounds.filter((bounds) => (
        boundsIntersectRect(bounds, region)
      ));
      if (overlapping.length === 0) {
        laneBackgroundBaselines.set(region.id, appearance);
        continue;
      }
      const onlyEnemyObjects = overlapping.every((bounds) => (
        bounds.id.startsWith('enemy-')
      ));
      const backgroundBaseline = laneBackgroundBaselines.get(region.id);
      if (onlyEnemyObjects && backgroundBaseline) {
        enemyObjectBound ||= passesObjectEvidence({
          target: appearance,
          backgroundBaseline,
        });
      }
    }

    const deadEnemy = battle.enemies.find((enemy) => (
      enemy.alive === false
      && preDefeatLocalBaseline.has(enemy.id)
      && !attemptedKillIds.has(enemy.id)
    ));
    if (deadEnemy) {
      attemptedKillIds.add(deadEnemy.id);
      const defeatedBaseline = preDefeatLocalBaseline.get(deadEnemy.id).find(
        (candidate) => selectSafeControlRegion({
          target: candidate.region,
          candidates: [candidate.controlRegion],
          dynamicBounds,
          viewport: candidate.viewport,
        }),
      );
      if (!defeatedBaseline) continue;
      const expectedX = defeatedBaseline.region.deathX;
      const expectedY = defeatedBaseline.region.deathY;
      const exactDeathLocation = Math.abs(expectedX - deadEnemy.x) < 0.001
        && Math.abs(expectedY - deadEnemy.y) < 0.001;
      const controlStillSafe = selectSafeControlRegion({
        target: defeatedBaseline.region,
        candidates: [defeatedBaseline.controlRegion],
        dynamicBounds,
        viewport: defeatedBaseline.viewport,
      });
      if (!exactDeathLocation || !controlStillSafe) {
        defeatDiagnostics.push({
          enemyId: deadEnemy.id,
          rejectedBeforeCue: true,
          exactDeathLocation,
          controlStillSafe: Boolean(controlStillSafe),
          expectedX,
          expectedY,
          actualX: deadEnemy.x,
          actualY: deadEnemy.y,
        });
        continue;
      }
      defeatedEnemyId = deadEnemy.id;
      deathCoordinates = { x: deadEnemy.x, y: deadEnemy.y };
      const squashFrames = [];
      const defeatEvidenceDeadline = Date.now() + 500;
      while (Date.now() < defeatEvidenceDeadline) {
        await advanceBattle(client, evidenceStepMs);
        const followState = await snapshot(client);
        const followBattle = followState.battle;
        if (!followBattle) {
          defeatDiagnostics.push({ enemyId: deadEnemy.id, missingFollowBattle: true });
          break;
        }
        const followDynamicBounds = buildBattleDynamicBounds(
          followBattle,
          followState.trainMotion,
          followState.effects,
        );
        const followControlSafe = selectSafeControlRegion({
          target: defeatedBaseline.region,
          candidates: [defeatedBaseline.controlRegion],
          dynamicBounds: followDynamicBounds,
          viewport: defeatedBaseline.viewport,
        });
        if (!followControlSafe) {
          defeatDiagnostics.push({
            enemyId: deadEnemy.id,
            followControlUnsafe: true,
            controlRegion: defeatedBaseline.controlRegion,
            overlappingIds: followDynamicBounds.filter((bounds) => (
              boundsIntersectRect(bounds, defeatedBaseline.controlRegion)
            )).map((bounds) => bounds.id),
          });
          break;
        }
        const defeatSquash = followState.effects?.particles.find((particle) => (
          particle.kind === 'defeat-squash'
          && particle.sourceEnemyId === deadEnemy.id
          && Math.abs(particle.originX - deadEnemy.x) < 0.001
          && Math.abs(particle.originY - deadEnemy.y) < 0.001
        ));
        if (!defeatSquash) {
          defeatDiagnostics.push({
            enemyId: deadEnemy.id,
            missingDefeatSquash: true,
            effects: followState.effects?.particles.map((particle) => (
              `${particle.kind}-${particle.id}@${particle.x},${particle.y}`
            )) ?? [],
          });
          break;
        }
        const squashBounds = followDynamicBounds.find((bounds) => (
          bounds.id === `effect-defeat-squash-${defeatSquash.id}`
        ));
        if (
          !squashBounds
          || !boundsIntersectRect(squashBounds, defeatedBaseline.region)
        ) continue;
        const interfering = followDynamicBounds.some((bounds) => (
          boundsIntersectRect(bounds, defeatedBaseline.region)
          && bounds.id !== `enemy-${deadEnemy.id}`
          && bounds.id !== `effect-defeat-squash-${defeatSquash.id}`
          && !(bounds.kind === 'enemy' && bounds.alive === false)
        ));
        const interferingIds = followDynamicBounds.filter((bounds) => (
          boundsIntersectRect(bounds, defeatedBaseline.region)
          && bounds.id !== `enemy-${deadEnemy.id}`
          && bounds.id !== `effect-defeat-squash-${defeatSquash.id}`
          && !(bounds.kind === 'enemy' && bounds.alive === false)
        )).map((bounds) => bounds.id);
        defeatDiagnostics.push({
          enemyId: deadEnemy.id,
          progress: defeatSquash.progress,
          interferingIds,
          collectedFrames: squashFrames.length,
        });
        if (interfering) continue;
        const sample = await inspectFixedObjectControlPair(
          client,
          defeatedBaseline,
        );
        squashFrames.push({
          target: sample.target,
          control: sample.control,
          defeatSquash: {
            id: defeatSquash.id,
            kind: defeatSquash.kind,
            sourceEnemyId: defeatSquash.sourceEnemyId,
            originX: defeatSquash.originX,
            originY: defeatSquash.originY,
            x: defeatSquash.x,
            y: defeatSquash.y,
            size: defeatSquash.size,
            progress: defeatSquash.progress,
          },
          dynamicBounds: followDynamicBounds,
        });
        if (passesDefeatCueEvidence({
          killedEnemyId: deadEnemy.id,
          deadEnemy,
          preTarget: defeatedBaseline.object,
          preControl: defeatedBaseline.control,
          targetRegion: defeatedBaseline.region,
          targetAnchor: { x: deadEnemy.x, y: deadEnemy.y },
          frames: squashFrames,
        })) {
          defeatCueSeen = true;
          defeatObjectBound = true;
          break;
        }
      }
      const continueObservingLaterKills = !defeatObjectBound;
      if (continueObservingLaterKills) continue;
      break;
    }
    if (battle.status === 'upgrade') {
      await callHook(client, 'return hook.chooseFirstUpgrade();');
    }
    if (battle.status === 'defeat' || battle.status === 'victory') break;
    const predictedEnemyRegions = liveEnemies.flatMap(predictDefeatSampleRegions);
    const predictedEvidence = await compareObjectRegionToControl(
      client,
      predictedEnemyRegions,
      dynamicBounds,
    );
    preDefeatLocalBaseline = new Map();
    for (const evidence of predictedEvidence) {
      const enemyId = evidence.region.enemyId;
      const entries = preDefeatLocalBaseline.get(enemyId) ?? [];
      entries.push(evidence);
      preDefeatLocalBaseline.set(enemyId, entries);
    }
    maxDefeatBaselines = Math.max(maxDefeatBaselines, preDefeatLocalBaseline.size);
    await advanceBattle(client, evidenceStepMs);
  }
  const state = await snapshot(client);
  assert.equal(state.diagnostics.qualityLevel, 'low');
  assert.ok(state.trainMotion, `${label} low quality must retain the train`);
  assert.equal(enemySeen, true, `${label} low quality must retain enemies`);
  assert.equal(
    defeatCueSeen,
    true,
    `${label} low quality must retain the pooled defeat cue: `
      + JSON.stringify({
        frames: defeatDiagnostics.slice(-20),
        maxDefeatBaselines,
        deadIdsWithoutBaseline: [...deadIdsWithoutBaseline],
      }),
  );
  assert.equal(trainObjectBound, true, `${label} train must differ from nearby background`);
  assert.equal(enemyObjectBound, true, `${label} enemy must differ from nearby background`);
  assert.ok(defeatedEnemyId != null, `${label} defeated enemy ID must be retained`);
  assert.ok(deathCoordinates, `${label} exact death coordinates must be retained`);
  assert.equal(defeatObjectBound, true, `${label} defeat cue must change its death region`);
  const stateText = await evaluate(
    client,
    `[
      document.querySelector('[data-hud-wave]')?.textContent?.trim(),
      document.querySelector('[data-hud-hp-label]')?.textContent?.trim(),
    ]`,
  );
  assert.ok(stateText.every(Boolean), `${label} low quality must retain state text`);
  await returnToStation(client, baseline.diagnostics.activeListeners);
  await setDisplaySettings(
    client,
    { qualityPreference: 'high', reducedMotion: false },
    `${label} restore high quality`,
  );
}

async function assertReducedMotionArchive(client, label) {
  await navigateScene(client, 'equipment');
  await assertArchiveUnreadSeal(client, `${label} reduced-motion`);
  const inspectFeedback = async (selector) => evaluate(client, `(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const entries = nodes.flatMap((node) => [null, '::before', '::after']
      .map((pseudo) => {
        const style = getComputedStyle(node, pseudo);
        return {
          key: (node.className || node.tagName) + (pseudo ?? ''),
          pseudo,
          content: style.content,
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
          transform: style.transform,
          pointerEvents: style.pointerEvents,
        };
      }))
      .filter((entry) => entry.pseudo === null || entry.content !== 'none');
    return {
      count: nodes.length,
      text: nodes.map((node) => node.textContent?.trim() ?? ''),
      visibleBounds: nodes.map((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return {
          visible: !node.hidden
            && node.getClientRects().length > 0
            && style.display !== 'none'
            && style.visibility === 'visible'
            && Number.parseFloat(style.opacity) > 0
            && rect.width > 0 && rect.height > 0,
          width: rect.width,
          height: rect.height,
        };
      }),
      entries,
    };
  })()`);
  const sealMotion = await inspectFeedback(
    '.otter-workshop .archive-unread-seal',
  );
  assert.equal(sealMotion.count, 1, `${label} reduced-motion unread seal`);
  assert.match(sealMotion.text[0] ?? '', /^NEW [1-9]\d*$/);
  assert.deepEqual(
    sealMotion.visibleBounds.map(({ visible }) => visible),
    [true],
    `${label} reduced-motion unread seal must have visible positive bounds`,
  );
  assertStaticArchiveFeedback(sealMotion.entries, `${label} unread seal`);
  assert.deepEqual(
    sealMotion.entries
      .filter((entry) => entry.pseudo !== null)
      .map((entry) => entry.pointerEvents),
    ['none', 'none'],
    `${label} unread seal pseudos must remain non-interactive`,
  );

  const opened = await evaluate(client, `(() => {
    const workshop = document.querySelector('.otter-workshop');
    const button = workshop?.querySelector(
      '[data-action="show-tidal-archive"]'
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert.equal(opened, true, `${label} reduced-motion archive must open`);
  await waitForEvaluation(
    client,
    `Boolean(document.querySelector(
      '.tidal-archive-carriage '
        + '[data-archive-enemy="${authoritativeFirstArchiveDiscovery.entryId}"] '
        + '.archive-new-stamp'
    ))`,
    { label: `${label} reduced-motion archive-new-stamp` },
  );

  const stampMotion = await inspectFeedback(
    '.tidal-archive-carriage .archive-new-stamp',
  );
  assert.equal(stampMotion.count, 1, `${label} reduced-motion NEW stamp`);
  assert.deepEqual(stampMotion.text, ['NEW']);
  assert.deepEqual(
    stampMotion.visibleBounds.map(({ visible }) => visible),
    [true],
    `${label} reduced-motion NEW stamp must have visible positive bounds`,
  );
  assertStaticArchiveFeedback(stampMotion.entries, `${label} archive NEW stamp`);
  assert.deepEqual(
    stampMotion.entries
      .filter((entry) => entry.pseudo !== null)
      .map((entry) => entry.pointerEvents),
    ['none', 'none'],
    `${label} archive reduced-motion decorations must be static and non-interactive`,
  );

  const broadArchiveMotion = await evaluate(client, `(() => {
    const workshop = document.querySelector('.otter-workshop');
    const root = document.querySelector('.tidal-archive-carriage');
    if (!(workshop instanceof HTMLElement) || !(root instanceof HTMLElement)) {
      return { checked: 0, failures: [{ key: 'archive-root', missing: true }] };
    }
    const nodes = [
      ...workshop.querySelectorAll('.workshop-tabs button'),
      root,
      ...root.querySelectorAll('*'),
    ];
    const inspected = nodes.flatMap((node) => [null, '::before', '::after']
      .map((pseudo) => {
        const style = getComputedStyle(node, pseudo);
        const rect = node.getBoundingClientRect();
        const visible = node.getClientRects().length > 0
          && style.display !== 'none'
          && style.visibility === 'visible'
          && Number.parseFloat(style.opacity) > 0
          && rect.width > 0 && rect.height > 0;
        return {
          key: (node.className || node.tagName) + (pseudo ?? ''),
          pseudo,
          content: style.content,
          visible,
          animationName: style.animationName,
          transform: style.transform,
          pointerEvents: style.pointerEvents,
        };
      }))
      .filter((entry) => entry.pseudo === null
        || (entry.content !== 'none' && entry.visible));
    return {
      checked: inspected.length,
      failures: inspected.filter((entry) => (
        entry.animationName !== 'none'
        || entry.transform !== 'none'
        || (entry.pseudo !== null && entry.pointerEvents !== 'none')
      )),
    };
  })()`);
  assert.ok(
    broadArchiveMotion.checked > 0,
    `${label} archive broad reduced-motion audit is empty`,
  );
  assert.deepEqual(
    broadArchiveMotion.failures,
    [],
    `${label} archive broad reduced-motion audit found moving or interactive decorations: `
      + JSON.stringify(broadArchiveMotion.failures),
  );

  const closed = await evaluate(client, `(() => {
    const workshop = document.querySelector('.otter-workshop');
    const button = workshop?.querySelector(
      '[data-action="show-equipment-workshop"]'
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert.equal(closed, true, `${label} reduced-motion archive must close`);
  await waitForEvaluation(
    client,
    `!document.querySelector('.tidal-archive-carriage')`,
    { label: `${label} closed reduced-motion archive` },
  );
  await navigateScene(client, 'station');
}

async function assertReducedMotionResilience(client, label) {
  await reloadWithE2EArchiveFixture(client);
  await client.send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await setDisplaySettings(
    client,
    { qualityPreference: 'high', reducedMotion: true },
    `${label} reduced motion`,
  );
  await waitForEvaluation(
    client,
    `document.querySelector('.station-hero')?.dataset.reducedMotion === 'true'`,
    { label: `${label} reduced-motion station state` },
  );
  const greetingButton = await evaluate(
    client,
    `(() => {
      const button = document.querySelector('[data-action="captain-greeting"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`,
  );
  assert.equal(greetingButton, true);
  await waitForEvaluation(
    client,
    `document.querySelector('[data-ambient-role="dialogue"]')
      ?.textContent?.includes('末班车') === true`,
    { label: `${label} reduced-motion state text`, timeoutMs: 500 },
  );
  const stationMotion = await evaluate(
    client,
    `(() => {
      const selectors = [
        '[data-station-layer="foreground"]',
        '[data-ambient-role="distant-train"]',
        '[data-motion-role="vehicle"]',
      ];
      return {
        styles: selectors.map((selector) => {
          const node = document.querySelector(selector);
          const style = node ? getComputedStyle(node) : null;
          return style ? {
            animationName: style.animationName,
            transform: style.transform,
          } : null;
        }),
        stateText: document.querySelector('[data-ambient-role="dialogue"]')
          ?.textContent?.trim() ?? '',
      };
    })()`,
  );
  assert.match(stationMotion.stateText, /末班车/);
  assert.ok(
    stationMotion.styles.every((style) => (
      style?.animationName === 'none' && style.transform === 'none'
    )),
    `${label} reduced motion must disable continuous station drift`,
  );
  await waitForEvaluation(
    client,
    `!document.querySelector(
      '.station-hero[data-ambient-event="captain-greeting"]'
    )`,
    { label: `${label} reduced greeting completion`, timeoutMs: 2_000 },
  );

  const baseline = await snapshot(client);
  await startNormalBattle(client);
  await assertFirstArchiveDiscoveryTicket(
    client,
    `${label} reduced-motion isolated discovery`,
    { reducedMotion: true },
  );
  const before = requireTrainMotion((await snapshot(client)).trainMotion);
  await advanceBattle(client, 500);
  await callHook(client, `return hook.useSkill('tidal-volley');`);
  await advanceBattle(client, 120);
  const afterState = await snapshot(client);
  const after = requireTrainMotion(afterState.trainMotion);
  assert.notEqual(
    after.laneOffset,
    before.laneOffset,
    `${label} reduced motion must retain route progress`,
  );
  assert.deepEqual(
    {
      offsetX: after.offsetX,
      offsetY: after.offsetY,
      rotation: after.rotation,
      cannonRecoil: after.cannonRecoil,
      surge: after.surge,
      damagePulse: after.damagePulse,
    },
    {
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      cannonRecoil: 0,
      surge: 0,
      damagePulse: 0,
    },
    `${label} reduced motion must suppress drift, recoil and camera-driving motion`,
  );
  const stateText = await evaluate(
    client,
    `[
      document.querySelector('[data-hud-wave]')?.textContent?.trim(),
      document.querySelector('[data-hud-time]')?.textContent?.trim(),
      document.querySelector('[data-hud-hp-label]')?.textContent?.trim(),
    ]`,
  );
  assert.ok(
    stateText.every(Boolean),
    `${label} reduced motion must preserve battle state text`,
  );
  await returnToStation(client, baseline.diagnostics.activeListeners);
  await assertReducedMotionArchive(client, label);
  await setDisplaySettings(
    client,
    { qualityPreference: 'high', reducedMotion: false },
    `${label} restore motion`,
  );
  await client.send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
}

function requireTrainMotion(motion) {
  assert.ok(motion, 'battle must expose train motion');
  return motion;
}

function motionPose(motion) {
  const trainMotion = requireTrainMotion(motion);
  return {
    motionTimeMs: trainMotion.motionTimeMs,
    laneOffset: trainMotion.laneOffset,
    offsetX: trainMotion.offsetX,
    offsetY: trainMotion.offsetY,
    rotation: trainMotion.rotation,
  };
}

async function assertTravelMotion(client) {
  const before = requireTrainMotion((await snapshot(client)).trainMotion);
  await advanceBattle(client, 500);
  const after = requireTrainMotion((await snapshot(client)).trainMotion);
  assert.notEqual(
    after.laneOffset,
    before.laneOffset,
    'train lane offset should advance after 500 ms',
  );
  assert.ok(after.speed >= 0.95, 'train cruise speed should be at least 0.95');
  assert.ok(
    Number.isFinite(after.offsetX) && Number.isFinite(after.offsetY),
    'train offsets should remain finite',
  );
  assert.ok(
    after.phase === 'cruise' || after.phase === 'elite',
    `initial train phase should be cruise or elite, received ${after.phase}`,
  );
}

async function probeAutomaticFire(client) {
  let maxProjectiles = 0;
  let maxKills = 0;
  for (let index = 0; index < 12; index += 1) {
    await advanceBattle(client, 250);
    const state = await snapshot(client);
    if (state.battle?.status === 'upgrade') {
      await callHook(client, 'return hook.chooseFirstUpgrade();');
    }
    maxProjectiles = Math.max(
      maxProjectiles,
      state.battle?.projectiles.length ?? 0,
    );
    maxKills = Math.max(maxKills, state.battle?.kills ?? 0);
  }
  assert.ok(
    maxProjectiles > 0 || maxKills > 0,
    'automatic cannon should create a projectile or defeat an enemy',
  );
  return { maxProjectiles, maxKills };
}

async function exercisePauseAndSkills(client) {
  await callHook(client, 'hook.requestPause(); return hook.snapshot();');
  const pausedBefore = await snapshot(client);
  assert.equal(pausedBefore.battle?.status, 'paused');
  const pausedPose = motionPose(pausedBefore.trainMotion);
  await advanceBattle(client, 500);
  const pausedAfter = await snapshot(client);
  assert.equal(pausedAfter.battle?.status, 'paused');
  assert.deepEqual(
    motionPose(pausedAfter.trainMotion),
    pausedPose,
    'paused train motion must not advance or catch up',
  );
  await callHook(client, 'await hook.requestResume(); return true;');
  assert.equal((await snapshot(client)).battle?.status, 'running');

  let tidalUsed = await callHook(
    client,
    `return hook.useSkill('tidal-volley');`,
  );
  if (!tidalUsed) {
    await advanceBattle(client, 1_000);
    tidalUsed = await callHook(
      client,
      `return hook.useSkill('tidal-volley');`,
    );
  }
  const barrierUsed = await callHook(
    client,
    `return hook.useSkill('bubble-barrier');`,
  );
  assert.ok(tidalUsed || barrierUsed, 'at least one active skill should work');
  return { tidalUsed, barrierUsed };
}

function assertDisposedBattle(state, listenerBaseline) {
  assert.equal(state.battle, null, 'battle snapshot must be released');
  assert.equal(state.trainMotion, null, 'station return must release train motion');
  assert.equal(state.diagnostics.activeFrameLoops, 0);
  assert.equal(state.diagnostics.activeListeners, listenerBaseline);
  assert.ok(state.diagnostics.activeAudioSchedulers <= 1);
  assert.equal(state.diagnostics.enemies, 0);
  assert.equal(state.diagnostics.projectiles, 0);
  assert.equal(state.diagnostics.loot, 0);
  assert.equal(state.diagnostics.effects, 0);
  assert.equal(state.diagnostics.pooledInUse, 0);
  assert.equal(state.diagnostics.lastUncaughtError, null);
}

async function returnToStation(client, listenerBaseline) {
  await callHook(client, 'await hook.returnToStation(); return true;');
  await waitForEvaluation(
    client,
    `${hookExpression}?.snapshot().sceneId === 'station'`,
    { label: 'return to station' },
  );
  const state = await snapshot(client);
  assertDisposedBattle(state, listenerBaseline);
  return state;
}

async function runBriefBattle(client, label) {
  const baseline = await snapshot(client);
  await startNormalBattle(client);
  await assertTravelMotion(client);
  await assertBattleHudGeometry(client, label);
  await captureQaScreenshot(client, `battle-ready-${label}`);
  const fire = await probeAutomaticFire(client);
  const skills = await exercisePauseAndSkills(client);
  await assertNoHorizontalOverflow(client, `${label} battle`);
  await returnToStation(
    client,
    baseline.diagnostics.activeListeners,
  );
  return { fire, skills };
}

async function readCurrency(client, currency) {
  return evaluate(
    client,
    `Number(document.querySelector(
      '[data-currency=${JSON.stringify(currency)}] b'
    )?.textContent ?? NaN)`,
  );
}

async function clickBattleButton(client, selector) {
  return evaluate(
    client,
    `(() => {
      const button = document.querySelector(${JSON.stringify(selector)});
      if (
        !(button instanceof HTMLButtonElement)
        || button.hidden
        || button.disabled
      ) return false;
      button.click();
      return true;
    })()`,
  );
}

async function reloadWithSkillEvolutionFixture(client) {
  await navigateScene(client, 'station');
  await resetSaveBetweenViewports(client);
  const installed = await evaluate(client, `(() => {
    const exactE2EGate = new URLSearchParams(location.search).get('e2e') === '1'
      && Boolean(${hookExpression});
    if (!exactE2EGate) return false;
    const save = JSON.parse(localStorage.getItem(
      ${JSON.stringify(playerSaveStorageKey)}
    ) ?? '{}');
    localStorage.setItem(
      ${JSON.stringify(playerSaveStorageKey)},
      JSON.stringify({
        ...save,
        stamina: 30,
        selectedCaptainId: 'captain-tide-female',
        skillMasteryXp: {
          'tidal-volley': 1,
          'bubble-barrier': 1,
          'extreme-tide': 1,
        },
      })
    );
    localStorage.setItem(
      ${JSON.stringify(tidalArchiveStorageKey)},
      ${JSON.stringify(JSON.stringify(createTidalArchiveFixture()))}
    );
    localStorage.setItem(
      ${JSON.stringify(firstRunBattleTutorialStorageKey)},
      ${JSON.stringify(JSON.stringify(completedFirstRunBattleTutorialFixture))}
    );
    return true;
  })()`);
  assert.equal(
    installed,
    true,
    'skill evolution fixture requires the exact e2e=1 gate',
  );
  await client.send('Page.reload', { ignoreCache: true });
  await waitForEvaluation(
    client,
    `Boolean(${hookExpression})
      && ${hookExpression}.snapshot().sceneId === 'station'
      && ${hookExpression}.snapshot().progression.stamina === 30`,
    { label: 'authoritative mastery save reload' },
  );
}

function signaturePixelRegion(signature) {
  if (signature.skillId === 'tidal-volley') {
    return { name: signature.effectKind, x: 145, y: 600, width: 100, height: 100 };
  }
  if (signature.skillId === 'bubble-barrier') {
    return { name: signature.effectKind, x: 145, y: 640, width: 100, height: 100 };
  }
  return { name: signature.effectKind, x: 125, y: 360, width: 140, height: 140 };
}

function pixelDifference(before, after) {
  const beforeRegion = before.regions[0];
  const afterRegion = after.regions[0];
  assert.ok(beforeRegion && afterRegion, 'signature pixel regions must exist');
  return [...beforeRegion.meanColor, ...beforeRegion.shapeProfile]
    .reduce((total, value, index) => (
      total + Math.abs(value - [
        ...afterRegion.meanColor,
        ...afterRegion.shapeProfile,
      ][index])
    ), 0);
}

async function chooseEvolutionThroughRealProgression(client, signature, label) {
  for (let iteration = 0; iteration < 2_000; iteration += 1) {
    const state = await snapshot(client);
    const battle = state.battle;
    assert.ok(battle, `${label} must retain a battle snapshot`);
    assert.notEqual(battle.status, 'defeat', `${label} must survive to its evolution`);
    assert.notEqual(battle.status, 'victory', `${label} must choose its evolution before victory`);
    if (battle.status === 'upgrade') {
      if (battle.offeredUpgradeIds.includes(signature.variantId)) {
        const card = await evaluate(client, `(() => {
          const button = document.querySelector(
            '[data-upgrade-id=${JSON.stringify(signature.variantId)}]'
          );
          return button instanceof HTMLButtonElement ? {
            enabled: !button.disabled && !button.hidden,
            evolution: button.classList.contains('is-evolution'),
            text: button.textContent?.trim() ?? '',
          } : null;
        })()`);
        assert.ok(card?.enabled, `${label} real evolution card must be enabled`);
        assert.equal(card.evolution, true, `${label} evolution card styling`);
        assert.ok(card.text.length > 0, `${label} evolution card must name its choice`);
        assert.equal(
          await clickBattleButton(
            client,
            `[data-upgrade-id="${signature.variantId}"]`,
          ),
          true,
          `${label} evolution card must accept a real click`,
        );
        await callHook(client, 'await hook.requestResume(); return true;');
        await advanceBattle(client, 0);
        const selected = await snapshot(client);
        assert.ok(
          selected.progression.variants[signature.skillId]
            .includes(signature.variantId),
          `${label} selected variant must come from authoritative progression`,
        );
        const glyph = await evaluate(client, `(() => {
          const button = document.querySelector(
            '[data-battle-skill=${JSON.stringify(signature.skillId)}]'
          );
          const image = button?.querySelector(
            '[data-skill-variant][alt=${JSON.stringify(signature.variantId)}]'
          );
          return image instanceof HTMLImageElement ? {
            visible: !image.hidden,
            loaded: image.complete && image.naturalWidth > 0,
            src: image.currentSrc || image.src,
          } : null;
        })()`);
        assert.equal(glyph?.visible, true, `${label} skill button variant glyph`);
        assert.equal(glyph?.loaded, true, `${label} skill button glyph must load`);
        assert.ok(glyph?.src, `${label} skill button glyph source`);
        return;
      }
      assert.equal(
        await callHook(client, 'return hook.chooseFirstUpgrade();'),
        true,
        `${label} deterministic real upgrade choice`,
      );
      await callHook(client, 'await hook.requestResume(); return true;');
      await advanceBattle(client, 0);
      continue;
    }
    if (battle.status === 'paused') {
      await callHook(client, 'await hook.requestResume(); return true;');
      continue;
    }
    await advanceBattle(client, 500);
  }
  assert.fail(`${label} never selected ${signature.variantId}`);
}

async function waitUntilSkillCanCast(client, signature, label) {
  for (let iteration = 0; iteration < 800; iteration += 1) {
    const state = await snapshot(client);
    const battle = state.battle;
    assert.ok(battle, `${label} cast preparation must retain battle`);
    if (battle.status === 'upgrade') {
      assert.equal(await callHook(client, 'return hook.chooseFirstUpgrade();'), true);
      await callHook(client, 'await hook.requestResume(); return true;');
      await advanceBattle(client, 0);
      continue;
    }
    if (battle.status === 'running') {
      const enoughEnergy = signature.skillId !== 'extreme-tide'
        || battle.energy >= 100;
      if (battle.cooldowns[signature.skillId] <= 0 && enoughEnergy) return battle;
      await advanceBattle(client, 100);
      continue;
    }
    assert.fail(`${label} reached ${battle.status} before its real skill cast`);
  }
  assert.fail(`${label} skill never became castable`);
}

async function assertSignatureAvoidsProtectedControls(client, signature, label) {
  const overlaps = await evaluate(client, `(() => {
    const state = ${hookExpression}.snapshot();
    const particle = state.effects?.particles.find(
      (entry) => entry.kind === ${JSON.stringify(signature.effectKind)}
    );
    const canvas = document.querySelector('[data-battle-canvas]');
    if (!particle || !(canvas instanceof HTMLCanvasElement)) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / 390;
    const scaleY = canvasRect.height / 844;
    const radius = Math.max(3, particle.size) * Math.max(scaleX, scaleY);
    const particleRect = {
      left: canvasRect.left + particle.x * scaleX - radius,
      right: canvasRect.left + particle.x * scaleX + radius,
      top: canvasRect.top + particle.y * scaleY - radius,
      bottom: canvasRect.top + particle.y * scaleY + radius,
    };
    const intersects = (rect) => particleRect.left < rect.right
      && particleRect.right > rect.left
      && particleRect.top < rect.bottom
      && particleRect.bottom > rect.top;
    const selectors = [
      '.battle-hud__tide-log',
      '[data-battle-action="claim-interaction"]:not([hidden])',
      '[data-battle-skill]:not([data-battle-skill='
        + ${JSON.stringify(signature.skillId)} + '])',
    ];
    return selectors.flatMap((selector) => (
      [...document.querySelectorAll(selector)]
        .filter((node) => node instanceof HTMLElement && !node.hidden)
        .filter((node) => intersects(node.getBoundingClientRect()))
        .map(() => selector)
    ));
  })()`);
  assert.deepEqual(overlaps, [], `${label} signature overlaps protected controls`);
}

async function castAndObserveSignature(client, signature, label, reducedMotion) {
  const castable = await waitUntilSkillCanCast(client, signature, label);
  const pixelRegion = signaturePixelRegion(signature);
  const beforePixels = await inspectBattleCanvasRegions(client, [pixelRegion]);
  const beforeElapsedMs = castable.elapsedMs;
  assert.equal(
    await clickBattleButton(
      client,
      `[data-battle-skill="${signature.skillId}"]`,
    ),
    true,
    `${label} real skill button click`,
  );

  let evidence = null;
  for (let iteration = 0; iteration < 800; iteration += 1) {
    await advanceBattle(client, iteration === 0 ? 17 : 100);
    const state = await snapshot(client);
    if (state.battle?.status === 'upgrade') {
      assert.equal(await callHook(client, 'return hook.chooseFirstUpgrade();'), true);
      await callHook(client, 'await hook.requestResume(); return true;');
      await advanceBattle(client, 0);
      continue;
    }
    if (reducedMotion) {
      if (state.verification.effectKinds.includes('static-skill-silhouette')) {
        evidence = state;
        break;
      }
    } else if (state.verification.effectKinds.includes(signature.effectKind)) {
      evidence = state;
      break;
    }
    assert.ok(
      state.battle?.status === 'running' || state.battle?.status === 'boss-intro',
      `${label} must present its signature before battle termination`,
    );
  }
  assert.ok(evidence, `${label} signature evidence is missing`);
  assert.equal(
    new Set(evidence.verification.effectKinds).size,
    evidence.verification.effectKinds.length,
    `${label} effectKinds must be deduplicated`,
  );

  if (reducedMotion) {
    assert.ok(
      evidence.verification.effectKinds.includes('static-skill-silhouette'),
      `${label} reduced motion must retain a static-skill-silhouette`,
    );
    assert.equal(
      evidence.verification.effectKinds.includes(signature.effectKind),
      false,
      `${label} reduced motion must remove moving signature particles`,
    );
    assert.deepEqual(
      {
        offsetX: evidence.trainMotion?.offsetX,
        offsetY: evidence.trainMotion?.offsetY,
        rotation: evidence.trainMotion?.rotation,
        cannonRecoil: evidence.trainMotion?.cannonRecoil,
        surge: evidence.trainMotion?.surge,
        damagePulse: evidence.trainMotion?.damagePulse,
      },
      {
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        cannonRecoil: 0,
        surge: 0,
        damagePulse: 0,
      },
      `${label} reduced motion must suppress camera-driving motion`,
    );
  } else {
    assert.ok(
      evidence.verification.effectKinds.includes(signature.effectKind),
      `${label} current effectKinds must contain ${signature.effectKind}`,
    );
    await assertSignatureAvoidsProtectedControls(client, signature, label);
    const afterPixels = await inspectBattleCanvasRegions(client, [pixelRegion]);
    assert.ok(
      pixelDifference(beforePixels, afterPixels) > 0.001,
      `${label} signature must produce a nonempty protected Canvas pixel diff`,
    );
  }
  assert.ok(
    (evidence.battle?.elapsedMs ?? 0) > beforeElapsedMs,
    `${label} battle must continue progressing through the cast`,
  );
}

async function assertSkillEvolutionSignatures(client, viewport) {
  const emergencyBarrierSignatureKind = 'emergency-beacon';
  const signatures = [
    {
      skillId: 'tidal-volley',
      variantId: 'split-tide-arrow',
      effectKind: 'split-chevron',
    },
    {
      skillId: 'bubble-barrier',
      variantId: 'bursting-bubble',
      effectKind: 'bubble-fracture',
      excludedKind: emergencyBarrierSignatureKind,
    },
    {
      skillId: 'extreme-tide',
      variantId: 'undertow-eye',
      effectKind: 'undertow-eye',
    },
  ];

  try {
    for (const reducedMotion of [false, true]) {
      await client.send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [{
          name: 'prefers-reduced-motion',
          value: reducedMotion ? 'reduce' : 'no-preference',
        }],
      });
      for (const signature of signatures) {
        await reloadWithSkillEvolutionFixture(client);
        const baseline = await snapshot(client);
        await startNormalBattle(client);
        const label = `${viewport.width}x${viewport.height} ${signature.variantId}`
          + (reducedMotion ? ' reduced-motion' : ' animated');
        await chooseEvolutionThroughRealProgression(client, signature, label);
        await castAndObserveSignature(
          client,
          signature,
          label,
          reducedMotion,
        );
        if (signature.excludedKind) {
          assert.equal(
            (await snapshot(client)).verification.effectKinds
              .includes(signature.excludedKind),
            false,
            `${label} must not substitute ${signature.excludedKind}`,
          );
        }
        await returnToStation(client, baseline.diagnostics.activeListeners);
      }
    }
  } finally {
    await client.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
  }
}

// Exercise the real card controls with a stable defensive/offensive priority;
// this avoids treating the generated card order as player strategy.
async function chooseStrategicUpgrade(client, offeredUpgradeIds) {
  const priorities = [
    'bubble-capacitor', 'rapid-reload', 'multi-barrel', 'coral-warhead',
    'echo-chain', 'rank-bubble-barrier', 'rank-tidal-volley',
    'tidal-resonance', 'precision-lens', 'overload-core', 'magnetic-salvage',
    'rank-extreme-tide',
  ];
  const upgradeId = priorities.find((id) => offeredUpgradeIds.includes(id))
    ?? offeredUpgradeIds[0];
  assert.ok(upgradeId, 'upgrade offer must contain a legal card');
  const accepted = await clickBattleButton(
    client,
    `[data-upgrade-id="${upgradeId}"]`,
  );
  assert.equal(accepted, true, `upgrade ${upgradeId} should be clickable`);
  return upgradeId;
}

async function claimRepeatedSalvage(client) {
  const selector = '[data-battle-action="claim-interaction"]'
    + '[data-interaction-id="salvage-a"]';
  const before = await readCurrency(client, 'gears');
  assert.ok(Number.isFinite(before));

  for (const expectedGain of [8, 16]) {
    assert.equal(
      await clickBattleButton(client, selector),
      true,
      `salvage claim +${expectedGain} should be available`,
    );
    await advanceBattle(client, 0);
    await waitForEvaluation(
      client,
      `Number(document.querySelector('[data-currency="gears"] b')
        ?.textContent ?? NaN) === ${before + expectedGain}`,
      { label: `salvage reward +${expectedGain}` },
    );
  }

  const thirdAccepted = await clickBattleButton(client, selector);
  await advanceBattle(client, 0);
  await delay(20);
  assert.equal(thirdAccepted, false, 'third salvage click must be unavailable');
  assert.equal(await readCurrency(client, 'gears'), before + 16);
}

async function finishFullBattle(
  client,
  { claimSalvage, afterBattleStart, inspectSettlement },
) {
  const before = await snapshot(client);
  const listenerBaseline = before.diagnostics.activeListeners;
  const settlementBaseline = before.settlementCount;
  await startNormalBattle(client);
  if (afterBattleStart) await afterBattleStart();
  await assertTravelMotion(client);
  await assertBattleHudGeometry(client, 'full battle');
  const fire = await probeAutomaticFire(client);
  const initialSkills = await exercisePauseAndSkills(client);

  let upgrades = 0;
  let normalKillSeen = fire.maxKills > 0;
  let eliteEncountered = false;
  let bossIntroSeen = false;
  let bossMotionSeen = false;
  let maxTrainSpeed = 0;
  let extremeTideUsed = false;
  let salvageClaimed = false;
  let reviveUsed = false;
  let terminalStatus = null;
  let terminalBattle = null;
  const requiredTideBeastKinds = [
    'tide-shell-hatchling',
    'lantern-ray',
    'tide-parasite-snail',
  ];
  const tideBeastKindsSeen = new Set();
  const evolutionIds = new Set([
    'split-tide-arrow', 'reef-piercer', 'returning-volley', 'rainstorm-school',
    'bursting-bubble', 'reflective-spines', 'overflow-membrane', 'emergency-trigger',
    'undertow-eye', 'lingering-vortex', 'energy-return', 'double-crest',
  ]);
  let evolutionOfferSeen = false;
  let precisionWeakPointSeen = false;
  let battleMusicIntensitySeen = false;
  let roleBehaviourSeen = false;
  const captured = new Set();

  for (let iteration = 0; iteration < 2_500; iteration += 1) {
    let state = await snapshot(client);
    const battle = state.battle;
    assert.ok(battle, 'full battle must retain a battle snapshot');
    const trainMotion = requireTrainMotion(state.trainMotion);
    maxTrainSpeed = Math.max(maxTrainSpeed, trainMotion.speed);
    bossMotionSeen ||= trainMotion.phase === 'boss';
    normalKillSeen ||= battle.kills > 0;
    evolutionOfferSeen ||= battle.offeredUpgradeIds.some((id) => evolutionIds.has(id));
    precisionWeakPointSeen ||= state.verification.precisionWeakPointHits > 0;
    battleMusicIntensitySeen ||= state.verification.musicIntensity >= 2;
    for (const enemy of battle.enemies) {
      if (requiredTideBeastKinds.includes(enemy.kind)) {
        tideBeastKindsSeen.add(enemy.kind);
        roleBehaviourSeen ||= enemy.behaviour?.phase !== 'advance';
      }
    }
    // The elite can be defeated within a single E2E advance window. Use the
    // engine's authoritative encounter latch rather than a timing-sensitive
    // visual-frame sample.
    eliteEncountered ||= battle.eliteEncountered;
    bossIntroSeen ||= battle.status === 'boss-intro'
      || battle.enemies.some((enemy) => enemy.kind === 'deep-echo-boss');
    const capture = async (name) => {
      if (!captured.has(name)) {
        captured.add(name);
        await captureQaScreenshot(client, `390x844-${name}`);
      }
    };
    if (battle.runLevel === 3) await capture('rank3');
    if (battle.runLevel === 5) await capture('rank5');
    if (Object.values(battle.skillVariants).flat().length >= 2) await capture('two-variants');
    if (battle.cooldowns['tidal-volley'] > 0) await capture('cooldown');
    if (battle.cooldowns['tidal-volley'] <= 0) await capture('ready');
    if (bossIntroSeen) await capture('boss');
    if (roleBehaviourSeen) await capture('tide-beast-role');

    const openBoss = battle.enemies.find((enemy) => (
      enemy.kind === 'deep-echo-boss'
      && enemy.alive
      && enemy.behaviour?.weakPointOpen
    ));
    if (openBoss && !precisionWeakPointSeen) {
      await callHook(
        client,
        `return hook.setMainCannonAim(${openBoss.x}, ${openBoss.y + 9});`,
      );
    }

    if (
      battle.status === 'defeat'
      && !bossIntroSeen
      && !reviveUsed
    ) {
      assert.equal(
        await clickBattleButton(
          client,
          '[data-battle-action="revive"]',
        ),
        true,
        'pre-boss defeat should expose rewarded revive',
      );
      await waitForEvaluation(
        client,
        `${hookExpression}?.snapshot().battle?.status === 'running'`,
        { label: 'rewarded revive completion' },
      );
      await advanceBattle(client, 0);
      reviveUsed = true;
      continue;
    }
    if (battle.status === 'victory' || battle.status === 'defeat') {
      await capture(battle.status);
      terminalStatus = battle.status;
      terminalBattle = battle;
      break;
    }
    if (battle.status === 'upgrade') {
      if (battle.offeredUpgradeIds.some((id) => evolutionIds.has(id))) {
        await assertEvolutionRitual(client, '390x844');
        await delay(650);
        await capture('evolution');
      }
      await capture('upgrade');
      await chooseStrategicUpgrade(client, battle.offeredUpgradeIds);
      upgrades += 1;
      continue;
    }
    if (battle.status === 'paused') {
      await capture('pause');
      await callHook(client, 'await hook.requestResume(); return true;');
      continue;
    }

    if (
      claimSalvage
      && !salvageClaimed
      && battle.elapsedMs >= 18_000
      && battle.elapsedMs <= 80_000
    ) {
      await claimRepeatedSalvage(client);
      salvageClaimed = true;
      state = await snapshot(client);
    }

    if (battle.cooldowns['tidal-volley'] <= 0) {
      await callHook(client, `return hook.useSkill('tidal-volley');`);
    }
    if (battle.cooldowns['bubble-barrier'] <= 0) {
      await callHook(client, `return hook.useSkill('bubble-barrier');`);
    }
    if (!extremeTideUsed && battle.energy >= 100) {
      extremeTideUsed = await callHook(
        client,
        `return hook.useSkill('extreme-tide');`,
      );
    }

    const stepMs = battle.elapsedMs >= 125_000 ? 250 : 1_000;
    await advanceBattle(client, stepMs);
  }

  const terminalDetail = terminalBattle
    ? `status=${terminalBattle.status}, elapsed=${Math.round(
      terminalBattle.elapsedMs,
    )}, hp=${terminalBattle.trainHp}, kills=${terminalBattle.kills}, `
      + `upgrades=${upgrades}, revived=${reviveUsed}, enemies=${
        terminalBattle.enemies
          .filter((enemy) => enemy.alive)
          .map((enemy) => `${enemy.kind}:${Math.round(enemy.hp)}`)
          .join('|') || 'none'
      }`
    : 'no terminal snapshot';
  assert.ok(
    terminalStatus,
    `full battle should reach victory or defeat (${terminalDetail})`,
  );
  assert.ok(normalKillSeen, 'full battle should defeat a normal enemy');
  for (const kind of requiredTideBeastKinds) {
    assert.ok(
      tideBeastKindsSeen.has(kind),
      `full battle should encounter tide beast ${kind}`,
    );
  }
  const distinctTideBeastArtSeen = await evaluate(client, `(() => {
    const resources = performance.getEntriesByType('resource')
      .map((entry) => entry.name);
    return [
      'tide-shell-hatchling-',
      'lantern-ray-',
      'tide-parasite-snail-',
    ].every((asset) => resources.some((url) => url.includes(asset)));
  })()`);
  assert.equal(
    distinctTideBeastArtSeen,
    true,
    'full battle should load all three dedicated tide beast artworks',
  );
  assert.equal(
    evolutionOfferSeen,
    true,
    'full battle should offer a qualitative skill evolution at a milestone',
  );
  assert.equal(
    precisionWeakPointSeen,
    true,
    'manual boss aim should land at least one precise weak-point hit',
  );
  assert.equal(
    battleMusicIntensitySeen,
    true,
    'battle score should rise above the calm arrangement',
  );
  assert.equal(
    roleBehaviourSeen,
    true,
    'full battle should observe a non-idle tide beast role behaviour',
  );
  assert.ok(eliteEncountered, 'full battle should encounter the elite');
  assert.equal(
    (await snapshot(client)).progression.hardCap,
    false,
    'battle hard cap should not be reached',
  );
  assert.ok(
    bossIntroSeen,
    `full battle should reach the boss intro (${terminalDetail})`,
  );
  assert.ok(bossMotionSeen, 'full battle should enter the boss motion phase');
  assert.ok(
    maxTrainSpeed >= 1.18,
    `full battle should reach boss train speed >= 1.18, received ${maxTrainSpeed}`,
  );
  assert.ok(upgrades >= 3, `expected 3 upgrades, received ${upgrades}`);
  assert.ok(
    initialSkills.tidalUsed || initialSkills.barrierUsed,
    'full battle should use an active skill',
  );
  assert.equal(extremeTideUsed, true, 'full battle should use extreme tide');
  if (claimSalvage) assert.equal(salvageClaimed, true);

  if (terminalStatus === 'defeat') {
    assert.equal(
      await clickBattleButton(
        client,
        '[data-battle-action="give-up"]',
      ),
      true,
      'defeat should expose the give-up settlement action',
    );
    await advanceBattle(client, 0);
  }
  await waitForEvaluation(
    client,
    `(() => {
      const overlay = document.querySelector('[data-settlement-overlay]');
      return overlay instanceof HTMLElement && !overlay.hidden;
    })()`,
    { label: 'battle settlement overlay' },
  );
  const settled = await snapshot(client);
  assert.equal(settled.settlementCount, settlementBaseline + 1);
  if (inspectSettlement) await inspectSettlement(settled);

  const station = await returnToStation(client, listenerBaseline);
  assert.equal(station.settlementCount, settlementBaseline + 1);
  if (claimSalvage) {
    assert.equal(
      await clickBattleButton(
        client,
        '[data-action="claim-guidebook"]'
          + '[data-guidebook-objective="first-clear"]',
      ),
      true,
      'first real clear should unlock the guidebook claim stamp',
    );
    await waitForEvaluation(
      client,
      `!document.querySelector(
        '[data-guidebook-objective="first-clear"]'
      )`,
      { label: 'guidebook advancing after first clear' },
    );
  }
  return {
    terminalStatus,
    upgrades,
    extremeTideUsed,
    settlementCount: station.settlementCount,
  };
}

async function assertTidalArchiveDiscoveryFeedback(client, label) {
  await reloadWithE2EArchiveFixture(client);
  const initialArchive = await readStoredTidalArchive(client);
  assert.deepEqual(
    initialArchive,
    createTidalArchiveFixture(),
    `${label} discovery lifecycle must start from an empty archive fixture`,
  );

  let firstTicket = null;
  const result = await finishFullBattle(client, {
    claimSalvage: true,
    afterBattleStart: async () => {
      firstTicket = await assertFirstArchiveDiscoveryTicket(
        client,
        `${label} real first spawn`,
      );
    },
    inspectSettlement: async () => {
      await waitForEvaluation(
        client,
        `(() => {
          const root = document.querySelector('[data-settlement-archive]');
          const entry = root?.querySelector(
            '[data-settlement-archive-entry="${authoritativeFirstArchiveDiscovery.key}"]'
          );
          const image = entry?.querySelector('img');
          return root instanceof HTMLElement
            && !root.hidden
            && entry instanceof HTMLElement
            && image instanceof HTMLImageElement
            && image.complete
            && image.naturalWidth > 0;
        })()`,
        { label: `${label} settlement archive luggage` },
      );
      const settlement = await evaluate(client, `(() => {
        const root = document.querySelector('[data-settlement-archive]');
        const entry = root?.querySelector(
          '[data-settlement-archive-entry="${authoritativeFirstArchiveDiscovery.key}"]'
        );
        if (!(root instanceof HTMLElement) || !(entry instanceof HTMLElement)) {
          return null;
        }
        const image = entry.querySelector('img');
        const rect = entry.getBoundingClientRect();
        return {
          heading: root.querySelector('h3')?.textContent?.trim() ?? '',
          key: entry.getAttribute('data-settlement-archive-entry'),
          name: entry.querySelector('b')?.textContent?.trim() ?? '',
          type: entry.querySelector('small')?.textContent?.trim() ?? '',
          imageLoaded: image instanceof HTMLImageElement
            && image.complete
            && image.naturalWidth > 0,
          imageAlt: image?.getAttribute('alt') ?? '',
          imageSrc: image instanceof HTMLImageElement
            ? image.currentSrc || image.src
            : '',
          contained: rect.left >= -1
            && rect.right <= innerWidth + 1
            && rect.top >= -1
            && rect.bottom <= innerHeight + 1,
          rewards: [
            '[data-settlement-gears]',
            '[data-settlement-route-marks]',
            '[data-settlement-star-tickets]',
          ].map((selector) => Number(document.querySelector(selector)?.textContent)),
        };
      })()`);
      assert.ok(settlement, `${label} settlement archive entry is missing`);
      assert.equal(settlement.heading, '本局新档案');
      assert.equal(settlement.key, authoritativeFirstArchiveDiscovery.key);
      assert.equal(settlement.name, authoritativeFirstArchiveDiscovery.name);
      assert.equal(settlement.type, '潮兽目击');
      assert.equal(settlement.imageLoaded, true);
      assert.equal(settlement.imageAlt, authoritativeFirstArchiveDiscovery.name);
      assert.ok(firstTicket, `${label} first-spawn ticket binding is missing`);
      assert.equal(
        settlement.imageSrc,
        firstTicket.artSrc,
        `${label} settlement must retain the exact first-spawn archive art`,
      );
      assert.equal(settlement.contained, true, `${label} settlement entry is clipped`);
      assert.ok(
        settlement.rewards.every(Number.isFinite),
        `${label} existing settlement reward values must remain readable`,
      );
    },
  });

  await navigateScene(client, 'equipment');
  const persistedUnread = (await readStoredTidalArchive(client)).unreadEntryKeys;
  assert.ok(
    persistedUnread.includes(authoritativeFirstArchiveDiscovery.key),
    `${label} first discovery must remain unread at equipment return`,
  );
  await assertArchiveUnreadSeal(client, `${label} post-settlement`);
  const opened = await evaluate(client, `(() => {
    const workshop = document.querySelector('.otter-workshop');
    const button = workshop?.querySelector(
      '[data-action="show-tidal-archive"]'
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert.equal(opened, true, `${label} archive must open after settlement`);
  await waitForEvaluation(
    client,
    `Boolean(document.querySelector(
      '[data-archive-enemy="${authoritativeFirstArchiveDiscovery.entryId}"] '
        + '.archive-new-stamp'
    ))`,
    { label: `${label} matching archive NEW stamp` },
  );
  assert.deepEqual(
    (await readStoredTidalArchive(client)).unreadEntryKeys,
    [],
    `${label} opening archive must clear persisted unreadEntryKeys`,
  );
  const matchingCard = await evaluate(client, `(() => {
    const card = document.querySelector(
      '[data-archive-enemy="${authoritativeFirstArchiveDiscovery.entryId}"]'
    );
    const stamp = card?.querySelector('.archive-new-stamp');
    const image = card?.querySelector('img');
    return {
      discovered: card?.classList.contains('is-discovered') ?? false,
      isNew: card?.classList.contains('is-new') ?? false,
      stampText: stamp?.textContent?.trim() ?? '',
      imageLoaded: image instanceof HTMLImageElement
        && image.complete
        && image.naturalWidth > 0,
      imageSrc: image instanceof HTMLImageElement
        ? image.currentSrc || image.src
        : '',
    };
  })()`);
  assert.equal(matchingCard.discovered, true);
  assert.equal(matchingCard.isNew, true);
  assert.equal(matchingCard.stampText, 'NEW');
  assert.equal(matchingCard.imageLoaded, true);
  assert.ok(firstTicket, `${label} first-spawn ticket binding is missing`);
  assert.equal(
    matchingCard.imageSrc,
    firstTicket.artSrc,
    `${label} archive card must retain the exact first-spawn archive art`,
  );

  const workshopOpened = await evaluate(client, `(() => {
    const workshop = document.querySelector('.otter-workshop');
    const button = workshop?.querySelector(
      '[data-action="show-equipment-workshop"]'
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert.equal(workshopOpened, true, `${label} workshop tab must clear the visit`);
  await waitForEvaluation(
    client,
    `!document.querySelector('.tidal-archive-carriage')`,
    { label: `${label} workshop after archive visit` },
  );
  await navigateScene(client, 'station');
  await navigateScene(client, 'equipment');
  assert.equal(
    await evaluate(client, `Boolean(document.querySelector('.archive-unread-seal'))`),
    false,
    `${label} re-entry must not restore the unread seal`,
  );
  const reopened = await evaluate(client, `(() => {
    const workshop = document.querySelector('.otter-workshop');
    const button = workshop?.querySelector(
      '[data-action="show-tidal-archive"]'
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert.equal(reopened, true, `${label} archive must reopen after navigation`);
  await waitForEvaluation(
    client,
    `Boolean(document.querySelector('.tidal-archive-carriage'))`,
    { label: `${label} archive re-entry` },
  );
  assert.equal(
    await evaluate(client, `document.querySelectorAll('.archive-new-stamp').length`),
    0,
    `${label} workshop plus leave/re-entry must clear all NEW stamps`,
  );
  await navigateScene(client, 'station');
  return result;
}

async function loadViewport(client, viewport, smokeId) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 3,
    mobile: true,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });
  const marker = `${smokeId}-${viewport.width}`;
  const url = `${previewOrigin}/?e2e=1&e2eSeed=17&smoke=${encodeURIComponent(marker)}`;
  const navigation = await client.send('Page.navigate', { url });
  if (navigation.errorText) {
    throw new Error(`Navigation failed: ${navigation.errorText}`);
  }
  await waitForEvaluation(
    client,
    `location.search.includes(${JSON.stringify(marker)})
      && Boolean(${hookExpression})`,
    { label: `${viewport.width}x${viewport.height} E2E hook` },
  );
  await ensureCaptainSelected(client);
  if (!viewport.full) {
    await reloadWithE2EArchiveFixture(client, { unread: true });
  }
}

async function resetSaveBetweenViewports(client) {
  const reset = await evaluate(
    client,
    `(() => {
      const button = document.querySelector('[data-action="reset-save"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`,
  );
  assert.equal(reset, true, 'reset control must be available between isolated viewports');
  await waitForEvaluation(
    client,
    `Boolean(${hookExpression}) && ${hookExpression}.snapshot().progression.stamina === 30`,
    { label: 'isolated viewport reset' },
  );
}

async function exerciseScenes(client, label) {
  const placeRoots = {
    station: '.station-hero',
    captain: '.wardrobe-carriage',
    equipment: '.otter-workshop',
    legion: '.lighthouse-dock',
    store: '.supply-market',
  };
  for (const [sceneId, placeRoot] of Object.entries(placeRoots)) {
    await navigateScene(client, sceneId);
    const rootExists = await evaluate(client, `Boolean(document.querySelector(${JSON.stringify(placeRoot)}))`);
    assert.equal(rootExists, true, `${label} ${sceneId} expected place root is missing: ${placeRoot}`);
    await assertNoHorizontalOverflow(client, `${label} ${sceneId}`);
    await assertLivingZoneAccessibility(client, `${label} ${sceneId}`);
    await assertGlobalInteractiveTargets(client, `${label} ${sceneId}`);
  }
  await navigateScene(client, 'station');
  const settingsOpened = await evaluate(client, `(() => {
    const button = document.querySelector('[data-action="open-settings"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  assert.equal(settingsOpened, true, `${label} settings control must open the form`);
  await waitForEvaluation(
    client,
    `Boolean(document.querySelector('.settings-panel'))`,
    { label: `${label} settings-panel` },
  );
  await assertGlobalInteractiveTargets(client, `${label} settings/form`);
  const settingsClosed = await evaluate(client, `(() => {
    const button = document.querySelector('[data-action="close-settings"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  assert.equal(settingsClosed, true, `${label} settings close control must remain available`);
  await waitForEvaluation(
    client,
    `!document.querySelector('.settings-panel')`,
    { label: `${label} closed settings-panel` },
  );
}

async function runViewport(client, viewport, smokeId, browserErrors) {
  const label = `${viewport.width}x${viewport.height}`;
  const errorBaseline = browserErrors.length;
  try {
  await loadViewport(client, viewport, smokeId);
  await assertNoHorizontalOverflow(client, `${label} launch`);
  await exerciseScenes(client, label);
  await assertTidalArchiveCarriage(client, label, { full: viewport.full });
  await assertMobileReadingSafety(client, label);
  await assertCaptainGuidebook(client, label);
  await inspectHandDrawnStation(client, label);
  await captureQaScreenshot(client, `station-${label}`);
  if (viewport.full) {
    await assertLowQualityResilience(client, label);
    await assertReducedMotionResilience(client, label);
    await resetSaveBetweenViewports(client);
    await ensureCaptainSelected(client);
    await assertSkillEvolutionSignatures(client, viewport);
    await resetSaveBetweenViewports(client);
    await ensureCaptainSelected(client);
  }
  const stationPose = await measureStationDeparturePose(client, label);

  let detail;
  if (viewport.full) {
    const first = await assertTidalArchiveDiscoveryFeedback(client, label);
    const second = await finishFullBattle(client, { claimSalvage: false });
    assert.deepEqual(
      [first.terminalStatus, second.terminalStatus],
      ['victory', 'victory'],
      `${label} later full battles must both finish in victory`,
    );
    detail = `two runs victory/victory`;
  } else {
    const brief = await runBriefBattle(client, label);
    detail = `auto-fire ${brief.fire.maxProjectiles} projectile(s)`;
  }

  const newErrors = browserErrors.slice(errorBaseline);
  assert.deepEqual(newErrors, [], `${label} browser errors:\n${newErrors.join('\n')}`);
  console.log(`[smoke] ${label} PASS - ${detail}`);
  await resetSaveBetweenViewports(client);
  return stationPose;
  } finally {
    await client.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
  }
}

async function assertOrdinaryUrlHasNoHook(client, smokeId) {
  const url = `${previewOrigin}/?release=${encodeURIComponent(smokeId)}`;
  await client.send('Page.navigate', { url });
  await waitForEvaluation(
    client,
    `location.search.includes('release=')
      && document.querySelector('#scene-host')?.dataset.sceneId != null`,
    { label: 'ordinary release page' },
  );
  assert.equal(
    await evaluate(client, `typeof window.__TIDAL_TRAIN_E2E__`),
    'undefined',
  );
}

async function main() {
  await mkdir(qaDirectory, { recursive: true });
  if (!existsSync(path.join(repositoryRoot, 'dist', 'index.html'))) {
    throw new Error('dist/index.html is missing; run npm run build first');
  }

  const executable = findChromeExecutable();
  const smokeId = `${Date.now()}`;
  let preview = null;
  let browserProcess = null;
  let profileDirectory = null;
  let client = null;
  let target = null;
  let previewOutput = { raw: () => '', diagnostic: () => '' };
  let browserOutput = { raw: () => '', diagnostic: () => '' };

  try {
    await assertLoopbackPortAvailable(previewPort);
    preview = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        String(previewPort),
        '--strictPort',
      ],
      {
        cwd: repositoryRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    previewOutput = captureChildOutput(preview, 'preview output');
    await waitForOwnedPreview(previewOrigin, {
      child: preview,
      getOutput: previewOutput.raw,
    });

    const cdpPort = await findFreePort();
    profileDirectory = await mkdtemp(path.join(
      os.tmpdir(),
      'tidal-train-smoke-',
    ));
    const browserArguments = [
      '--headless=new',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-first-run',
      `--remote-debugging-port=${cdpPort}`,
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${profileDirectory}`,
      'about:blank',
    ];
    if (process.platform === 'linux') browserArguments.unshift('--no-sandbox');
    browserProcess = spawn(executable, browserArguments, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    browserOutput = captureChildOutput(browserProcess, 'browser output');
    await waitForHttp(`http://127.0.0.1:${cdpPort}/json/version`, {
      child: browserProcess,
      timeoutMs: 45_000,
    });

    target = await createCdpTarget(cdpPort, 'about:blank');
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await Promise.all([
      client.send('Page.enable'),
      client.send('Runtime.enable'),
      client.send('Log.enable'),
    ]);

    const browserErrors = [];
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      browserErrors.push(
        exceptionDetails?.exception?.description
          ?? exceptionDetails?.text
          ?? 'Runtime.exceptionThrown',
      );
    });
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type !== 'error') return;
      browserErrors.push(args?.map((arg) => (
        arg.value ?? arg.description ?? arg.type
      )).join(' ') ?? 'console.error');
    });
    client.on('Log.entryAdded', ({ entry }) => {
      if (entry?.level === 'error') {
        browserErrors.push(entry.text ?? 'Log.entryAdded error');
      }
    });

    const stationPoseResults = [];
    for (const viewport of viewports) {
      assertPreviewAlive(preview, `viewport ${viewport.width}x${viewport.height}`);
      stationPoseResults.push(
        await runViewport(client, viewport, smokeId, browserErrors),
      );
    }
    assertPreviewAlive(preview, 'ordinary-URL isolation check');
    await assertOrdinaryUrlHasNoHook(client, smokeId);
    assert.deepEqual(browserErrors, [], browserErrors.join('\n'));
    console.log('[smoke] ordinary URL PASS - no E2E global');
    const stationPoseFailures = stationPoseResults.filter(
      (result) => !result.passed,
    );
    assert.deepEqual(
      stationPoseFailures,
      [],
      'station train, crew, wake and engine must share one exact vehicle '
        + 'ancestor, and train/crew must share one departure X displacement '
        + `at every viewport (tolerance ±${stationRelativeXTolerancePx}px)`,
    );
    console.log('[smoke] browser smoke ok');
  } catch (error) {
    if (error instanceof Error) {
      error.message += `${previewOutput.diagnostic()}${browserOutput.diagnostic()}`;
    }
    throw error;
  } finally {
    if (client) {
      try {
        await client.send('Page.close');
      } catch {
        // The target may already be closed by the browser process.
      }
      client.close();
    }
    await stopChild(browserProcess);
    await stopChild(preview);
    const expectedPrefix = path.join(os.tmpdir(), 'tidal-train-smoke-');
    if (profileDirectory?.startsWith(expectedPrefix)) {
      await rm(profileDirectory, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
