import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CdpClient,
  createCdpTarget,
  delay,
  findChromeExecutable,
  findFreePort,
  stopChild,
  waitForHttp,
} from './lib/chrome-cdp.mjs';

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

function captureChildOutput(child, label) {
  let output = '';
  const append = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-8_000);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  return () => (output.trim() ? `\n${label}:\n${output.trim()}` : '');
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

async function startNormalBattle(client) {
  await callHook(client, 'await hook.startNormalBattle(); return true;');
  await waitForEvaluation(
    client,
    `${hookExpression}?.snapshot().sceneId === 'battle'`,
    { label: 'normal battle scene', timeoutMs: 20_000 },
  );
}

async function advanceBattle(client, durationMs) {
  await callHook(
    client,
    `hook.advanceBattle(${durationMs}); return hook.snapshot();`,
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
  assert.equal((await snapshot(client)).battle?.status, 'paused');
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
  const fire = await probeAutomaticFire(client);
  const initialSkills = await exercisePauseAndSkills(client);

  let upgrades = 0;
  let normalKillSeen = fire.maxKills > 0;
  let eliteSeen = false;
  let bossIntroSeen = false;
  let extremeTideUsed = false;
  let salvageClaimed = false;
  let reviveUsed = false;
  let terminalStatus = null;
  let terminalBattle = null;

  for (let iteration = 0; iteration < 2_500; iteration += 1) {
    let state = await snapshot(client);
    const battle = state.battle;
    assert.ok(battle, 'full battle must retain a battle snapshot');
    normalKillSeen ||= battle.kills > 0;
    eliteSeen ||= battle.enemies.some(
      (enemy) => enemy.kind === 'storm-ray-elite',
    );
    bossIntroSeen ||= battle.status === 'boss-intro'
      || battle.enemies.some((enemy) => enemy.kind === 'deep-echo-boss');

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
      terminalStatus = battle.status;
      terminalBattle = battle;
      break;
    }
    if (battle.status === 'upgrade') {
      assert.equal(
        await callHook(client, 'return hook.chooseFirstUpgrade();'),
        true,
        'offered upgrade should be selectable',
      );
      upgrades += 1;
      continue;
    }
    if (battle.status === 'paused') {
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
  assert.ok(eliteSeen, 'full battle should encounter the elite');
  assert.ok(
    bossIntroSeen,
    `full battle should reach the boss intro (${terminalDetail})`,
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

async function exerciseScenes(client, label) {
  for (const sceneId of [
    'station',
    'captain',
    'equipment',
    'legion',
    'store',
  ]) {
    await navigateScene(client, sceneId);
    await assertNoHorizontalOverflow(client, `${label} ${sceneId}`);
  }
  await navigateScene(client, 'station');
}

async function runViewport(client, viewport, smokeId, browserErrors) {
  const label = `${viewport.width}x${viewport.height}`;
  const errorBaseline = browserErrors.length;
  await loadViewport(client, viewport, smokeId);
  await assertNoHorizontalOverflow(client, `${label} launch`);
  await exerciseScenes(client, label);

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
  let previewOutput = () => '';
  let browserOutput = () => '';

  try {
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
    await waitForHttp(previewOrigin, { child: preview });

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

    for (const viewport of viewports) {
      await runViewport(client, viewport, smokeId, browserErrors);
    }
    await assertOrdinaryUrlHasNoHook(client, smokeId);
    assert.deepEqual(browserErrors, [], browserErrors.join('\n'));
    console.log('[smoke] ordinary URL PASS - no E2E global');
    console.log('[smoke] browser smoke ok');
  } catch (error) {
    if (error instanceof Error) {
      error.message += `${previewOutput()}${browserOutput()}`;
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
