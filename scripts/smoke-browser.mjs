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

async function snapshot(client) {
  return evaluate(client, `${hookExpression}.snapshot()`);
}

async function callHook(client, body) {
  return evaluate(
    client,
    `(async () => { const hook = ${hookExpression}; ${body} })()`,
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

async function assertReducedMotionResilience(client, label) {
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
  await setDisplaySettings(
    client,
    { qualityPreference: 'high', reducedMotion: false },
    `${label} restore motion`,
  );
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

async function finishFullBattle(client, { claimSalvage }) {
  const before = await snapshot(client);
  const listenerBaseline = before.diagnostics.activeListeners;
  const settlementBaseline = before.settlementCount;
  await startNormalBattle(client);
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
  await loadViewport(client, viewport, smokeId);
  await assertNoHorizontalOverflow(client, `${label} launch`);
  await exerciseScenes(client, label);
  await assertMobileReadingSafety(client, label);
  await assertCaptainGuidebook(client, label);
  await inspectHandDrawnStation(client, label);
  await captureQaScreenshot(client, `station-${label}`);
  if (viewport.full) {
    await assertLowQualityResilience(client, label);
    await assertReducedMotionResilience(client, label);
  }
  const stationPose = await measureStationDeparturePose(client, label);

  let detail;
  if (viewport.full) {
    const first = await finishFullBattle(client, { claimSalvage: true });
    const second = await finishFullBattle(client, { claimSalvage: false });
    detail = `two runs ${first.terminalStatus}/${second.terminalStatus}`;
  } else {
    const brief = await runBriefBattle(client, label);
    detail = `auto-fire ${brief.fire.maxProjectiles} projectile(s)`;
  }

  const newErrors = browserErrors.slice(errorBaseline);
  assert.deepEqual(newErrors, [], `${label} browser errors:\n${newErrors.join('\n')}`);
  console.log(`[smoke] ${label} PASS - ${detail}`);
  await resetSaveBetweenViewports(client);
  return stationPose;
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
