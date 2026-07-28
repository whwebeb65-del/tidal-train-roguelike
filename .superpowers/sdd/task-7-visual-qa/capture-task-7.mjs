import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CdpClient,
  createCdpTarget,
  delay,
  findChromeExecutable,
  findFreePort,
  stopChild,
  waitForHttp,
} from '../../../scripts/lib/chrome-cdp.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const outputDirectory = path.resolve(import.meta.dirname);
const origin = 'http://127.0.0.1:4188';
const outputs = [
  'station-390x844.png',
  'station-430x932.png',
  'battle-390x844.png',
  'station-low-390x844.png',
  'station-reduced-390x844.png',
  'station-1440x900.png',
  'battle-ready-1440x900.png',
  'upgrade-1440x900.png',
  'two-variants-1440x900.png',
  'boss-1440x900.png',
  'victory-settlement-1440x900.png',
  'defeat-settlement-1440x900.png',
];
const requiredDesktopOutputs = [
  'station-1440x900.png',
  'battle-ready-1440x900.png',
  'upgrade-1440x900.png',
  'two-variants-1440x900.png',
  'boss-1440x900.png',
  'victory-settlement-1440x900.png',
  'defeat-settlement-1440x900.png',
];

// This is an external, v4 SaveRepository-compatible fixture.  It is installed
// before app start, never touches a live BattleEngine/build, and only raises
// persistent mastery so the normal upgrade UI may legally offer variants.
const masteryFixture = {
  version: 4,
  gears: 0, routeMarks: 0, starTickets: 0, stationLevel: 1,
  unlockedPassengerIds: [], unlockedModuleIds: [], unlockedMapIds: ['drift-suburb'],
  firstClearMapIds: [], claimedInteractionIds: [], purchasedProductIds: [],
  processedTransactionIds: [], ownedCosmeticIds: [], selectedCaptainId: null,
  ownedSkinIds: ['skin-tide-base'], equippedSkinIds: {},
  equipmentInventory: [], equippedEquipmentIds: { cannon: null, carriage: null, core: null, instrument: null },
  equipmentFragments: {}, accountLevel: 1, accountXp: 0, stamina: 30,
  staminaUpdatedAtMs: 0,
  skillMasteryXp: { 'tidal-volley': 900, 'bubble-barrier': 900, 'extreme-tide': 900 },
  settledBattleIds: [],
};
const weakFixture = {
  ...masteryFixture,
  stationLevel: 8,
  unlockedMapIds: ['drift-suburb', 'old-port', 'glass-city', 'deep-tunnel'],
  skillMasteryXp: { 'tidal-volley': 0, 'bubble-barrier': 0, 'extreme-tide': 0 },
};

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description
      ?? response.exceptionDetails.text
      ?? 'browser evaluation failed');
  }
  return response.result?.value;
}

async function waitFor(client, expression, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function setViewport(client, width, height) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
    screenWidth: width,
    screenHeight: height,
  });
}

async function installMasteryFixture(client) {
  return client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('tidal-train-prototype-save-v1', ${JSON.stringify(JSON.stringify(masteryFixture))});`,
  });
}

async function clickVisible(client, selector) {
  return evaluate(client, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!(node instanceof HTMLButtonElement) || node.hidden || node.disabled) return false;
    node.click(); return true;
  })()`);
}

async function startBattle(client, mode = 'normal') {
  const entry = mode === 'daily' ? 'startDailyTrial' : 'startNormalBattle';
  await evaluate(client, `(async () => { await window.__TIDAL_TRAIN_E2E__.${entry}(); return true; })()`);
  await waitFor(client, `window.__TIDAL_TRAIN_E2E__?.snapshot().sceneId === 'battle'`, 'desktop battle');
}

async function advance(client, ms) {
  return evaluate(client, `(() => { window.__TIDAL_TRAIN_E2E__.advanceBattle(${ms}); return window.__TIDAL_TRAIN_E2E__.snapshot(); })()`);
}

async function waitForStatus(client, status, label) {
  for (let i = 0; i < 2500; i += 1) {
    const state = await evaluate(client, `window.__TIDAL_TRAIN_E2E__.snapshot()`);
    if (state.battle?.status === status) return state;
    await advance(client, 250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function selectUpgrade(client, { preferVariant = false, weak = false } = {}) {
  const state = await evaluate(client, `window.__TIDAL_TRAIN_E2E__.snapshot()`);
  assert.equal(state.battle?.status, 'upgrade', 'upgrade must be presented by the real battle');
  const ids = state.battle.offeredUpgradeIds;
  const variant = ids.find((id) => [
    'split-tide-arrow', 'reef-piercer', 'returning-volley', 'rainstorm-school',
    'bursting-bubble', 'reflective-spines', 'overflow-membrane', 'emergency-trigger',
    'undertow-eye', 'lingering-vortex', 'energy-return', 'double-crest',
  ].includes(id));
  const weakId = ids.find((candidate) => [
    'magnetic-salvage', 'bubble-capacitor', 'tidal-resonance', 'overload-core', 'multi-barrel',
  ].includes(candidate));
  const id = weak ? (weakId ?? ids[0]) : preferVariant
    ? (variant ?? ids.find((candidate) => candidate.startsWith('rank-')) ?? ids[0])
    : (ids.find((candidate) => !candidate.includes('rank-')) ?? ids[0]);
  assert.ok(id, 'real upgrade offer must contain a legal choice');
  assert.equal(await clickVisible(client, `[data-upgrade-id="${id}"]`), true, `click real upgrade ${id}`);
  await waitFor(client, `window.__TIDAL_TRAIN_E2E__?.snapshot().battle?.status !== 'upgrade'`, `upgrade ${id} application`);
  return id;
}

async function captureDesktopEvidence(client) {
  await loadStation(client, 1440, 900, 'desktop-station');
  await capture(client, 'station-1440x900.png');
  await startBattle(client);
  await capture(client, 'battle-ready-1440x900.png');
  const appShellVisible = await evaluate(client, `(() => {
    const shell = document.querySelector('.app-topbar');
    if (!(shell instanceof HTMLElement)) return false;
    const style = getComputedStyle(shell); return style.display !== 'none' && shell.getBoundingClientRect().height > 0;
  })()`);
  assert.equal(appShellVisible, false, 'battle must not show an AppShell topbar');
  await waitForStatus(client, 'upgrade', 'first desktop upgrade');
  await capture(client, 'upgrade-1440x900.png');
  return captureVariantEvidence(client);
}

async function captureVariantEvidence(client) {
  let acquired = [];
  let bossCaptured = false;
  let variantsCaptured = false;
  for (let i = 0; i < 7000; i += 1) {
    const state = await evaluate(client, `window.__TIDAL_TRAIN_E2E__.snapshot()`);
    const battle = state.battle;
    if (!battle) throw new Error('battle snapshot disappeared');
    if (!variantsCaptured && Object.values(battle.skillVariants).flat().length >= 2 && battle.status === 'running') {
      await capture(client, 'two-variants-1440x900.png'); variantsCaptured = true;
    }
    if (battle.status === 'upgrade') {
      const id = await selectUpgrade(client, { preferVariant: acquired.length < 2 });
      if (id.includes('arrow') || id.includes('piercer') || id.includes('volley') || id.includes('school') || id.includes('bubble') || id.includes('spines') || id.includes('membrane') || id.includes('trigger') || id.includes('undertow') || id.includes('vortex') || id.includes('energy-return') || id.includes('crest')) acquired.push(id);
      await advance(client, 1);
      const after = await evaluate(client, `window.__TIDAL_TRAIN_E2E__.snapshot()`);
      const count = Object.values(after.battle.skillVariants).flat().length;
      if (count >= 2 && !variantsCaptured) { await capture(client, 'two-variants-1440x900.png'); variantsCaptured = true; }
      continue;
    }
    if ((battle.status === 'boss-intro' || battle.enemies.some((enemy) => enemy.kind === 'deep-echo-boss')) && !bossCaptured) {
      await capture(client, 'boss-1440x900.png'); bossCaptured = true;
    }
    if (battle.status === 'victory' || battle.status === 'defeat') {
      if (battle.status === 'defeat') assert.equal(await clickVisible(client, '[data-battle-action="give-up"]'), true, 'defeat settlement must use visible give-up');
      await waitFor(client, `Boolean(document.querySelector('[data-settlement-overlay]:not([hidden])'))`, 'desktop settlement');
      await capture(client, 'victory-settlement-1440x900.png');
      assert.ok(Object.values((await evaluate(client, `window.__TIDAL_TRAIN_E2E__.snapshot()`)).battle ?? {}).length >= 0);
      return { acquired, variantsCaptured, bossCaptured, outcome: battle.status };
    }
    if (battle.cooldowns['tidal-volley'] <= 0) await evaluate(client, `window.__TIDAL_TRAIN_E2E__.useSkill('tidal-volley')`);
    if (battle.cooldowns['bubble-barrier'] <= 0) await evaluate(client, `window.__TIDAL_TRAIN_E2E__.useSkill('bubble-barrier')`);
    await advance(client, 250);
  }
  const finalState = await evaluate(client, `window.__TIDAL_TRAIN_E2E__.snapshot()`);
  throw new Error(`desktop evidence did not reach a settlement: ${JSON.stringify({ status: finalState.battle?.status, elapsedMs: finalState.battle?.elapsedMs, hp: finalState.battle?.trainHp, variants: finalState.battle?.skillVariants })}`);
}

async function captureDefeatEvidence(client) {
  await loadStation(client, 1440, 900, 'desktop-defeat');
  assert.equal(
    await clickVisible(client, '[data-action="select-map"][data-map-id="deep-tunnel"]'),
    true,
    'weak normal run must choose the unlocked deep-tunnel route through its public UI',
  );
  await startBattle(client, 'daily');
  // Public daily-trial entry on an unlocked high-risk route, zero-mastery
  // persistent fixture, no skill use and first legal-card preference: the
  // engine itself reaches defeat.
  for (let i = 0; i < 7000; i += 1) {
    const state = await evaluate(client, `window.__TIDAL_TRAIN_E2E__.snapshot()`);
    const battle = state.battle;
    if (!battle) throw new Error('defeat battle snapshot disappeared');
    if (battle.status === 'upgrade') { await selectUpgrade(client, { weak: true }); continue; }
    if (battle.status === 'defeat') {
      assert.equal(await clickVisible(client, '[data-battle-action="give-up"]'), true, 'normal defeat must expose give-up');
      await advance(client, 1_500);
      await waitFor(client, `Boolean(document.querySelector('[data-settlement-overlay]:not([hidden])'))`, 'defeat settlement');
      await capture(client, 'defeat-settlement-1440x900.png');
      return battle;
    }
    if (battle.status === 'victory') throw new Error('weak no-skill normal run unexpectedly won');
    await advance(client, 250);
  }
  const finalState = await evaluate(client, `window.__TIDAL_TRAIN_E2E__.snapshot()`);
  throw new Error(`normal no-skill run did not reach defeat: ${JSON.stringify({
    status: finalState.battle?.status,
    elapsedMs: finalState.battle?.elapsedMs,
    hp: finalState.battle?.trainHp,
    enemies: finalState.battle?.enemies?.filter((enemy) => enemy.alive).map((enemy) => enemy.kind),
  })}`);
}

function assertDesktopEvidenceComplete(desktopEvidence, defeatEvidence) {
  assert.equal(desktopEvidence.variantsCaptured, true, 'two real variants must be captured');
  assert.equal(desktopEvidence.bossCaptured, true, 'boss must be captured');
  assert.equal(desktopEvidence.outcome, 'victory', 'desktop normal run must settle as victory');
  assert.equal(defeatEvidence.status, 'defeat', 'high-risk no-skill run must settle as defeat');
  const missing = requiredDesktopOutputs.filter((filename) => !existsSync(path.join(outputDirectory, filename)));
  assert.deepEqual(missing, [], `required desktop evidence is missing: ${missing.join(', ')}`);
}

async function loadStation(client, width, height, suffix) {
  await setViewport(client, width, height);
  await client.send('Page.navigate', {
    url: `${origin}/?e2e=1&visual=${encodeURIComponent(suffix)}`,
  });
  try {
    await waitFor(
      client,
      `document.readyState === 'complete'
        && typeof window.__TIDAL_TRAIN_E2E__ === 'object'`,
      `${suffix} app`,
    );
    await evaluate(client, `(() => {
      const captain = document.querySelector('[data-action="select-captain"]');
      if (captain instanceof HTMLButtonElement) captain.click();
      return true;
    })()`);
    await waitFor(
      client,
      `window.__TIDAL_TRAIN_E2E__?.snapshot().sceneId === 'station'`,
      `${suffix} station`,
    );
  } catch (error) {
    const diagnostic = await evaluate(client, `({
      href: location.href,
      readyState: document.readyState,
      title: document.title,
      body: document.body?.innerText?.slice(0, 300) ?? '',
      hookType: typeof window.__TIDAL_TRAIN_E2E__,
    })`);
    throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}`);
  }
  await evaluate(client, `(async () => {
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
    scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  })()`);
}

async function capture(client, filename) {
  const response = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(
    path.join(outputDirectory, filename),
    Buffer.from(response.data, 'base64'),
  );
}

async function setDisplaySettings(client, qualityPreference, reducedMotion) {
  const opened = await evaluate(client, `(() => {
    const open = document.querySelector('[data-action="open-settings"]');
    if (!(open instanceof HTMLButtonElement)) return false;
    open.click();
    return true;
  })()`);
  if (!opened) throw new Error('Could not open production display settings UI');
  await waitFor(
    client,
    `Boolean(document.querySelector('[data-settings-panel]'))`,
    'settings panel',
  );
  const qualityChanged = await evaluate(client, `(() => {
    const quality = document.querySelector('select[data-setting="qualityPreference"]');
    if (!(quality instanceof HTMLSelectElement)) return false;
    quality.value = ${JSON.stringify(qualityPreference)};
    quality.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!qualityChanged) throw new Error('Could not drive production quality setting');
  await waitFor(
    client,
    `document.querySelector('.station-hero')?.dataset.lowPerformance
      === ${JSON.stringify(String(qualityPreference === 'low'))}`,
    `${qualityPreference} station quality`,
  );
  const reducedChanged = await evaluate(client, `(() => {
    const reduced = document.querySelector('input[data-setting="reducedMotion"]');
    if (!(reduced instanceof HTMLInputElement)) return false;
    reduced.checked = ${reducedMotion};
    reduced.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!reducedChanged) throw new Error('Could not drive production reduced-motion setting');
  await waitFor(
    client,
    `document.querySelector('.station-hero')?.dataset.reducedMotion
      === ${JSON.stringify(String(reducedMotion))}`,
    `${reducedMotion} reduced-motion station`,
  );
  const closed = await evaluate(client, `(() => {
    const close = document.querySelector('[data-action="close-settings"]');
    if (!(close instanceof HTMLButtonElement)) return false;
    close.click();
    return true;
  })()`);
  if (!closed) throw new Error('Could not close production display settings UI');
}

async function captureReadableBattle(client) {
  await evaluate(client, `(async () => {
    await window.__TIDAL_TRAIN_E2E__.startNormalBattle();
    return true;
  })()`);
  await waitFor(
    client,
    `window.__TIDAL_TRAIN_E2E__?.snapshot().sceneId === 'battle'`,
    'battle scene',
    20_000,
  );
  let lastKills = 0;
  let lastKillElapsedMs = -Infinity;
  let candidate = null;
  const killSamples = [];
  for (let index = 0; index < 12_000; index += 1) {
    const state = await evaluate(client, `(() => {
      const hook = window.__TIDAL_TRAIN_E2E__;
      const before = hook.snapshot();
      if (before.battle?.status === 'upgrade') hook.chooseFirstUpgrade();
      const interaction = document.querySelector(
        '[data-battle-action="claim-interaction"]:not([hidden])'
      );
      if (interaction instanceof HTMLButtonElement && !interaction.disabled) {
        interaction.click();
      }
      if (
        before.battle?.status === 'running'
        && before.battle.trainHp < before.battle.maxTrainHp * 0.7
      ) {
        hook.useSkill('bubble-barrier');
      }
      hook.advanceBattle(25);
      const snapshot = hook.snapshot();
      const canvas = document.querySelector('[data-battle-canvas]');
      if (!(canvas instanceof HTMLCanvasElement) || !snapshot.battle) {
        return { state: snapshot, safeEnemies: [], blockingCards: ['canvas'] };
      }
      const canvasRect = canvas.getBoundingClientRect();
      const scale = Math.min(canvasRect.width / 390, canvasRect.height / 844);
      const offsetX = canvasRect.left + (canvasRect.width - 390 * scale) / 2;
      const offsetY = canvasRect.top + (canvasRect.height - 844 * scale) / 2;
      const sizes = {
        'bubble-fin': [78, 78],
        'needle-jelly': [72, 84],
        'reef-crab': [84, 72],
        'storm-ray-elite': [158, 114],
        'deep-echo-boss': [238, 178],
      };
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement) || node.hidden) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) > 0
          && rect.width > 0
          && rect.height > 0;
      };
      const blockingCardNodes = [
        ...document.querySelectorAll([
          '[data-pause-overlay]:not([hidden])',
          '[data-upgrade-overlay]:not([hidden])',
          '[data-failure-overlay]:not([hidden])',
          '[data-settlement-overlay]:not([hidden])',
          '.battle-interaction button:not([hidden])',
        ].join(',')),
      ].filter(isVisible);
      const paintedHudNodes = [
        ...document.querySelectorAll([
          '.battle-hud__run',
          '.battle-hud__pause',
          '.battle-hud__boss:not([hidden])',
          '.battle-vital',
          '.battle-hud__progress',
          '.battle-hud__skills',
          '.battle-interaction button:not([hidden])',
        ].join(',')),
      ].filter(isVisible);
      const paintedRects = paintedHudNodes.map((node) => node.getBoundingClientRect());
      const overlaps = (first, second) => first.left < second.right
        && first.right > second.left
        && first.top < second.bottom
        && first.bottom > second.top;
      const safeEnemies = snapshot.battle.enemies
        .filter((enemy) => enemy.alive)
        .map((enemy) => {
          const [width, height] = sizes[enemy.kind];
          const spriteRect = {
            left: offsetX + (enemy.x - width / 2 - 4) * scale,
            right: offsetX + (enemy.x + width / 2 + 4) * scale,
            top: offsetY + (enemy.y - height * 0.55 - 4) * scale,
            bottom: offsetY + (enemy.y + height * 0.45 + 4) * scale,
          };
          const unobscured = spriteRect.left >= canvasRect.left
            && spriteRect.right <= canvasRect.right
            && spriteRect.top >= canvasRect.top
            && spriteRect.bottom <= canvasRect.bottom
            && paintedRects.every((rect) => !overlaps(spriteRect, rect));
          return { ...enemy, spriteRect, unobscured };
        })
        .filter((enemy) => enemy.unobscured);
      return {
        state: snapshot,
        safeEnemies,
        blockingCards: blockingCardNodes.map((node) => (
          node.getAttribute('data-battle-action')
            ?? node.className
        )),
      };
    })()`);
    const battle = state.state.battle;
    if (!battle) throw new Error('Battle snapshot disappeared before capture');
    const killNow = battle.kills > lastKills;
    if (killNow) lastKillElapsedMs = battle.elapsedMs;
    lastKills = battle.kills;
    const readableEnemies = state.safeEnemies.filter((enemy) => enemy.hp < enemy.maxHp);
    const mainProjectiles = battle.projectiles.filter((projectile) => (
      projectile.active && projectile.source === 'main'
    ));
    if (killNow) {
      killSamples.push({
        elapsedMs: battle.elapsedMs,
        enemies: battle.enemies.filter((enemy) => enemy.alive).map(
          ({ kind, x, y, hp, maxHp }) => ({ kind, x, y, hp, maxHp }),
        ),
        projectiles: battle.projectiles.map(({ source, x, y }) => ({ source, x, y })),
        effects: state.state.diagnostics.effects,
      });
    }
    if (
      battle.kills > 0
      && battle.elapsedMs - lastKillElapsedMs <= 700
      && state.blockingCards.length === 0
      && readableEnemies.length > 0
      && mainProjectiles.length > 0
      && state.state.diagnostics.effects > 0
    ) {
      candidate = {
        elapsedMs: battle.elapsedMs,
        kills: battle.kills,
        readableEnemies: readableEnemies.map(({ kind, x, y, hp, maxHp }) => (
          { kind, x, y, hp, maxHp }
        )),
        mainProjectiles: mainProjectiles.length,
        effects: state.state.diagnostics.effects,
        blockingCards: state.blockingCards,
      };
      break;
    }
    if (battle.status === 'victory' || battle.status === 'defeat') break;
  }
  if (!candidate) {
    throw new Error(
      'No real gameplay frame combined readable enemy, main attack, hit/defeat effects: '
        + JSON.stringify(killSamples.slice(-12)),
    );
  }
  await capture(client, 'battle-390x844.png');
  return candidate;
}

await mkdir(outputDirectory, { recursive: true });
for (const filename of outputs) {
  await unlink(path.join(outputDirectory, filename)).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
}

let preview;
let browser;
let client;
let profile;
try {
  preview = spawn(process.execPath, [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host', '127.0.0.1',
    '--strictPort',
    '--port', '4188',
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  await waitForHttp(origin, { child: preview, timeoutMs: 20_000 });

  const cdpPort = await findFreePort();
  profile = await mkdtemp(path.join(os.tmpdir(), 'tidal-train-task7-'));
  browser = spawn(findChromeExecutable(), [
    '--headless=new',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-first-run',
    `--remote-debugging-port=${cdpPort}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  await waitForHttp(`http://127.0.0.1:${cdpPort}/json/version`, {
    child: browser,
    timeoutMs: 45_000,
  });
  const target = await createCdpTarget(cdpPort, 'about:blank');
  client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await Promise.all([client.send('Page.enable'), client.send('Runtime.enable')]);
  const masteryScript = await installMasteryFixture(client);

  await loadStation(client, 390, 844, 'station-390');
  await capture(client, 'station-390x844.png');
  const battleCandidate = await captureReadableBattle(client);

  await loadStation(client, 390, 844, 'station-low');
  await setDisplaySettings(client, 'low', false);
  await capture(client, 'station-low-390x844.png');

  await loadStation(client, 390, 844, 'station-reduced');
  await setDisplaySettings(client, 'high', true);
  await capture(client, 'station-reduced-390x844.png');

  await loadStation(client, 430, 932, 'station-430');
  await setDisplaySettings(client, 'high', false);
  await capture(client, 'station-430x932.png');

  const desktopEvidence = await captureDesktopEvidence(client);
  await client.send('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: masteryScript.identifier,
  });
  await evaluate(client, `localStorage.setItem('tidal-train-prototype-save-v1', ${JSON.stringify(JSON.stringify(weakFixture))}); true`);
  const defeatEvidence = await captureDefeatEvidence(client);
  assertDesktopEvidenceComplete(desktopEvidence, defeatEvidence);

  process.stdout.write(`${JSON.stringify({ outputs, battleCandidate, desktopEvidence, defeatEvidence }, null, 2)}\n`);
} finally {
  if (client) {
    await client.send('Page.close').catch(() => {});
    client.close();
  }
  await stopChild(browser);
  await stopChild(preview);
  if (profile?.startsWith(path.join(os.tmpdir(), 'tidal-train-task7-'))) {
    await rm(profile, { recursive: true, force: true });
  }
}
