# Battle Radio Notices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized battle paper notice with a compact train-radio strip and give all four rewarded-ad actions premium, diegetic copy without changing reward, recovery, placement, or telemetry behavior.

**Architecture:** Keep `AppShell.setBattleChrome()` as the only battle-state signal and keep one live-region notice node. `AppShell.setNotice()` chooses its timeout from the shell state, CSS redraws the node only under `.app-shell--battle`, `BattleHUD` owns visible action labels and honest accessible labels, and `LegacyGameRuntime` changes only player-facing result messages.

**Tech Stack:** TypeScript, Vitest + jsdom, CSS, Vite, Playwright-compatible Chrome smoke harness, GitHub Actions/Pages.

## Global Constraints

- Preserve `data-battle-action`, callbacks, `hidden` rules, rewarded placements, pending-action guards, opportunity counts, rewards, recovery state, and telemetry event names/payloads.
- Keep station notices at 4200ms and battle notices at 2400ms. Empty notices hide immediately, and a new notice resets the timer.
- Keep `role="status"`, `aria-atomic="true"`, pointer pass-through, overlay/tutorial suppression, safe-area offsets, and reduced-motion support.
- Use strict red-green-refactor: run each focused test before implementation and confirm it fails for the intended reason.
- Use `apply_patch` for source and documentation changes. Make one focused commit per task.
- Do not add a new ad SDK, currency, permanent-upgrade hook, or economy rule.

---

### Task 1: Make the AppShell notice battle-aware

**Files:**
- Modify: `tests/web/AppShell.spec.ts`
- Modify: `tests/web/LivingStationFailureView.spec.ts`
- Modify: `web/app/AppShell.ts`
- Modify: `web/styles/app-shell-v2.css`

- [ ] **Step 1: Add failing timer and DOM tests**

In `tests/web/AppShell.spec.ts`, add `// @vitest-environment jsdom`, import `afterEach`, `vi`, and `mountAppShell`, and restore real timers in `afterEach`. Add coverage that mounts the shell, asserts the station notice is visible through 4199ms and hidden at 4200ms, switches to battle chrome, asserts visibility through 2399ms and hiding at 2400ms, and proves a second message restarts the battle timer. Assert text is written into `[data-notice-copy]` while the live-region root remains `role="status"`.

```ts
it('uses a shorter battle radio timer and restarts it for new copy', () => {
  vi.useFakeTimers();
  const root = document.createElement('div');
  const shell = mountAppShell(root, { gears: 0, routeMarks: 0, starTickets: 0 });

  shell.setNotice('车站公告');
  vi.advanceTimersByTime(4199);
  expect(shell.noticeHost.classList.contains('is-visible')).toBe(true);
  vi.advanceTimersByTime(1);
  expect(shell.noticeHost.classList.contains('is-visible')).toBe(false);

  shell.setBattleChrome(true);
  shell.setNotice('第一条电台短讯');
  vi.advanceTimersByTime(2300);
  shell.setNotice('第二条电台短讯');
  vi.advanceTimersByTime(2399);
  expect(shell.noticeHost.classList.contains('is-visible')).toBe(true);
  expect(shell.noticeHost.querySelector('[data-notice-copy]')?.textContent)
    .toBe('第二条电台短讯');
  vi.advanceTimersByTime(1);
  expect(shell.noticeHost.classList.contains('is-visible')).toBe(false);
});
```

Update the CSS contract in both test files to require the battle radio marker, `max-width: 236px`, a maximum/minimum block size no greater than 46px, two-line clamp, left/safe-area anchoring, noninteractive behavior, overlay/tutorial suppression, and a battle-specific reduced-motion branch with no translation.

- [ ] **Step 2: Run the focused tests and confirm red**

Run:

```powershell
npx vitest run tests/web/AppShell.spec.ts tests/web/LivingStationFailureView.spec.ts
```

Expected: failure because `[data-notice-copy]`, the 2400ms battle timeout, and battle-radio CSS do not exist, and the old contract still reports a 340px paper notice.

- [ ] **Step 3: Implement battle-aware notice timing and stable copy node**

In `web/app/AppShell.ts`, add named constants and render a child span:

```ts
const STATION_NOTICE_DURATION_MS = 4200;
const BATTLE_NOTICE_DURATION_MS = 2400;

<div id="app-notice" class="notice app-notice station-announcement"
  role="status" aria-atomic="true"><span data-notice-copy></span></div>
```

Resolve `noticeCopy` once in `mountAppShell()`. In `setNotice()`, clear the old timer, set `noticeCopy.textContent`, toggle visibility, return without scheduling for an empty string, and select the duration with:

```ts
const isBattle = root.firstElementChild?.classList
  .contains('app-shell--battle') ?? false;
const duration = isBattle
  ? BATTLE_NOTICE_DURATION_MS
  : STATION_NOTICE_DURATION_MS;
```

- [ ] **Step 4: Redraw only the battle-state notice as a radio strip**

In `web/styles/app-shell-v2.css`, keep all station announcement declarations intact. Replace the old battle 210px-bottom / 340px-width declarations with a compact `.app-shell--battle .app-notice.station-announcement` block anchored at the lower left. Use a dark translucent ocean-blue surface, warm gold hairline, small `RADIO` stamp in `::before`, two radio-wave cuts in `::after`, `width: min(236px, calc(100% - 96px))`, a total height no greater than 46px, `pointer-events: none`, and a two-line clamp on `[data-notice-copy]`. Preserve safe-area insets and the existing overlay/tutorial hide rules.

Add a battle-specific reduced-motion override:

```css
@media (prefers-reduced-motion: reduce) {
  .app-shell--battle .app-notice.station-announcement,
  .app-shell--battle .app-notice.station-announcement.is-visible {
    transition: none;
    transform: none;
  }
}
```

- [ ] **Step 5: Run focused and regression tests**

Run:

```powershell
npx vitest run tests/web/AppShell.spec.ts tests/web/LivingStationFailureView.spec.ts
npx vitest run tests/web/ResponsiveLayout.spec.ts tests/web/battle/BattleHUD.spec.ts
npm run typecheck
```

Expected: all pass with no TypeScript diagnostics.

- [ ] **Step 6: Commit**

```powershell
git add tests/web/AppShell.spec.ts tests/web/LivingStationFailureView.spec.ts web/app/AppShell.ts web/styles/app-shell-v2.css
git commit -m "feat: turn battle notices into radio strips"
```

---

### Task 2: Give rewarded battle actions diegetic, honest labels

**Files:**
- Modify: `tests/web/battle/BattleHUD.spec.ts`
- Modify: `web/battle/BattleHUD.ts`
- Modify: `web/styles/battle-hud.css`

- [ ] **Step 1: Add a failing rewarded-label contract**

Add a test that parses `renderBattleHudShell()` and verifies these exact visible labels on the existing action nodes:

```text
补给短片 · 重整技能
补给短片 · 重开货箱
救援短片 · 紧急修复
补给短片 · 双倍托运
```

For each node, also assert its `aria-label` contains `观看激励广告`, and confirm the skill-refresh, reroll, and double-settlement actions remain initially hidden while revive remains present in its failure panel. Assert the four original `data-battle-action` values are unchanged and raw visible strings such as `广告刷新技能` are absent.

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```powershell
npx vitest run tests/web/battle/BattleHUD.spec.ts
```

Expected: failure on the four new visible labels and missing explicit accessible labels.

- [ ] **Step 3: Change markup copy only**

In `web/battle/BattleHUD.ts`, keep classes, order, data actions, and hidden attributes unchanged. Add honest accessible labels:

```html
aria-label="观看激励广告，重整技能冷却"
aria-label="观看激励广告，重开本次升级货箱"
aria-label="观看激励广告，紧急修复并复活列车"
aria-label="观看激励广告，领取本次重复通关双倍奖励"
```

Use the four visible labels from Step 1.

- [ ] **Step 4: Polish the compact refresh control without moving its hit target**

In `web/styles/battle-hud.css`, keep the current refresh control placement and minimum 44px hit target. Replace the flat warning-yellow treatment with a compact radio-supply chip using deep navy, warm-gold border, readable cream copy, and a subtle signal pulse disabled by reduced motion. Do not change hidden behavior or introduce pointer interception above the battle canvas.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
npx vitest run tests/web/battle/BattleHUD.spec.ts tests/web/battle/BattleScene.spec.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add tests/web/battle/BattleHUD.spec.ts web/battle/BattleHUD.ts web/styles/battle-hud.css
git commit -m "feat: restyle rewarded battle supplies"
```

---

### Task 3: Rewrite rewarded result notices without changing behavior

**Files:**
- Modify: `tests/web/GameApp.spec.ts`
- Modify: `web/LegacyGameRuntime.ts`

- [ ] **Step 1: Add failing player-visible notice assertions**

Extend the existing rewarded revive, skill refresh, upgrade reroll, and double-settlement tests in `tests/web/GameApp.spec.ts`. Keep their placement, telemetry, retry, reward, and persistence assertions. Add DOM assertions for each completed path and at least one cancelled/failed path per shared wording family:

```text
补给短片播放完成
已退出补给短片
补给短片暂时无法播放
```

Also add a source contract that the four legacy beginnings `广告完成`, `已取消广告`, and `广告播放失败` are absent from rewarded result assignments while unrelated explanatory text such as the revive-assisted scoring rule may remain.

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```powershell
npx vitest run tests/web/GameApp.spec.ts
```

Expected: failure because runtime notices still use raw ad-system wording.

- [ ] **Step 3: Rewrite only the result strings**

In `web/LegacyGameRuntime.ts`, change the four rewarded flows to the following pattern while leaving every branch and state mutation intact:

```ts
// cancelled
'已退出补给短片，……机会仍然保留。'
// failed
'补给短片暂时无法播放，……机会仍然保留。'
// completed
'补给短片播放完成，……'
```

For revive, say the revival opportunity was not consumed; for skill refresh, mention both active-skill cooldowns; for reroll, mention three cargo choices; for double settlement, retain the exact awarded gear and route-mark amounts. Do not touch any `showRewardedAd` call, `rewarded_ad_*`, recovery state, pending tokens, rewards, or render timing.

- [ ] **Step 4: Run focused and recovery regressions**

Run:

```powershell
npx vitest run tests/web/GameApp.spec.ts tests/web/RewardedAds.spec.ts tests/web/BattleRecovery.spec.ts
npm run typecheck
```

Expected: all pass and all prior reward/retry assertions remain green.

- [ ] **Step 5: Commit**

```powershell
git add tests/web/GameApp.spec.ts web/LegacyGameRuntime.ts
git commit -m "feat: rewrite rewarded supply notices"
```

---

### Task 4: Add real-browser geometry evidence and ship

**Files:**
- Modify: `tests/smoke/browser-script.spec.ts`
- Modify: `scripts/smoke-browser.mjs`
- Create: `.superpowers/sdd/battle-radio-notices-2026-08-28/` evidence generated by the smoke harness

- [ ] **Step 1: Add a failing smoke-source contract**

In `tests/smoke/browser-script.spec.ts`, require a named `assertBattleRadioNotice` helper and evidence stems for all four mobile viewports. Require the helper to inspect the visible notice, its computed `::before` content, bounding box, skill-button rectangles, interaction-card rectangle when present, viewport overflow, and `pointer-events`.

- [ ] **Step 2: Run the focused contract and confirm red**

Run:

```powershell
npx vitest run tests/smoke/browser-script.spec.ts
```

Expected: failure because the helper and battle-radio evidence do not exist.

- [ ] **Step 3: Implement geometry checks and evidence capture**

In `scripts/smoke-browser.mjs`, add `assertBattleRadioNotice(page, viewportName)`. During the ready battle capture at 360×800, 390×844, 412×915, and 430×932:

- verify the notice is visible when the route-start message is emitted;
- verify computed `::before` content contains `RADIO`;
- verify width is at most 238 CSS px and height at most 48 CSS px (2px raster tolerance);
- verify `pointer-events: none`;
- verify the notice rectangle does not overlap any visible skill button or interaction claim card;
- verify document scroll width does not exceed viewport width;
- capture a PNG and JSON sidecar containing viewport, notice rect, compared rects, computed styles, and assertions.

Keep the existing two-victory, Boss, ordinary-URL isolation, and reward-flow assertions untouched.

- [ ] **Step 4: Run full local release gates**

Run:

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
npm run smoke:browser
```

Expected: every command exits 0 and the four new radio sidecars report all assertions true.

- [ ] **Step 5: Inspect representative mobile evidence**

Open the 360×800 and 430×932 radio PNGs. Confirm the strip reads as part of the battle world, preserves target/skill visibility, has no clipped CJK copy, and does not cover the interaction card. If visual review finds a defect, add or tighten the automated assertion before changing CSS.

- [ ] **Step 6: Commit, merge, push, and verify Pages**

```powershell
git add tests/smoke/browser-script.spec.ts scripts/smoke-browser.mjs .superpowers/sdd
git commit -m "test: guard battle radio geometry"
git status --short
git push origin HEAD:main
```

Wait for the GitHub Actions workflow triggered by the pushed commit. Require Test, Typecheck, Assets, Build, Browser smoke, and Pages deployment to succeed. Fetch the public `index.html`, resolve the emitted JS/CSS asset names, and compare their SHA256 hashes with local `dist` before reporting completion.

---

## Final Review Checklist

- [ ] Four rewarded buttons use the exact approved diegetic labels and explicit `观看激励广告` accessible names.
- [ ] All data actions, placements, callbacks, retries, rewards, recovery state, and telemetry are unchanged.
- [ ] Station notice is still paper-styled for 4200ms; battle radio is at most 236×46 CSS px for 2400ms.
- [ ] Empty and replacement notice behavior is covered by fake timers.
- [ ] Overlay/tutorial suppression, pointer pass-through, safe areas, two-line clamp, and reduced motion are covered.
- [ ] Four mobile viewports, two victories, Boss evidence, ordinary URL isolation, and full release gates pass.
- [ ] Every path and test command is concrete, and every named API already exists or is created by an earlier step.
