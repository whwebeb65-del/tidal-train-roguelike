# Living Tidal Station Phase 3: Flow Pages and Full-Site Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert route choice, reward choice, trial settlement, victory, failure, notices, and transitions into station-world scenes, then verify the entire non-battle interface as one coherent experience.

**Architecture:** Add one flow stylesheet imported after all legacy flow styles. Update only view markup and presentation copy while retaining route/reward/settlement actions. Finish with a global contract test that inventories every non-battle view and rejects generic system-card roots.

**Tech Stack:** TypeScript string views, scoped CSS, Vitest, Vite, CDP browser smoke

## Global Constraints

- Phases 1 and 2 must be complete and green.
- Do not change route generation, reward choices, settlement transactions, advertisements, revival, sharing, or resource grants.
- Preserve all route node IDs, reward option IDs, actions, disabled states, and analytics behavior.
- The final audit must cover every non-battle view named in the approved design spec.
- Do not claim completion until desktop and 360/390/412/430 mobile visual checks pass.

---

### Task 1: Dispatch-table route and reward choices

**Files:**
- Modify: `web/views/RunSceneView.ts`
- Create: `web/styles/living-station-flow.css`
- Modify: `web/styles.css`
- Modify: `tests/web/RunSceneView.spec.ts`

**Interfaces:**
- Consumes: `RouteCardsModel` and `RewardCardsModel`.
- Produces: `.dispatch-table`, `.route-ticket`, `.cargo-unloading`, and `.reward-crate`.

- [ ] **Step 1: Add failing flow contracts**

```ts
expect(routeHtml).toContain('living-zone dispatch-table');
expect(routeHtml).toContain('route-ticket');
expect(rewardHtml).toContain('living-zone cargo-unloading');
expect(rewardHtml).toContain('reward-crate');
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/web/RunSceneView.spec.ts`

Expected: FAIL on the new scene classes.

- [ ] **Step 3: Implement dispatch-table semantics**

Change the route root to `run scene compact living-zone dispatch-table`, its heading to `dispatch-board`, and each route button to `route-card route-choice route-ticket`. Keep `data-action="route"` and `data-node-id`.

Change the reward root to `run scene compact living-zone cargo-unloading` and each choice to `reward-card choice-card reward-crate`. Keep `data-action="reward"` and `data-option-id`.

- [ ] **Step 4: Add and import flow styles**

Render route tickets on a chart table with risk stamps and connected string lines. Render rewards as opened luggage/wooden cargo pieces; preserve visible type, content ID, and choice explanation. Mobile layouts become one vertical dispatch path.

- [ ] **Step 5: Run and commit**

Run: `npm test -- tests/web/RunSceneView.spec.ts`

```powershell
git add web/views/RunSceneView.ts web/styles.css web/styles/living-station-flow.css tests/web/RunSceneView.spec.ts
git commit -m "style: rebuild route and reward flow as dispatch table"
```

### Task 2: Arrival-platform victory and trial record board

**Files:**
- Modify: `web/views/RunSceneView.ts`
- Modify: `web/views/DailyTrialView.ts`
- Modify: `web/styles/living-station-flow.css`
- Modify: `tests/web/RunSceneView.spec.ts`
- Modify: `tests/web/DailyTrialView.spec.ts`

**Interfaces:**
- Consumes: `SettlementCardModel` and `DailyTrialSettlementViewModel`.
- Produces: `.arrival-platform`, `.reward-luggage`, `.trial-record-board`, and `.score-stamp`.

- [ ] **Step 1: Add failing settlement assertions**

```ts
expect(settlementHtml).toContain('living-zone arrival-platform');
expect(settlementHtml).toContain('reward-luggage');
```

```ts
expect(normal).toContain('living-zone trial-record-board');
expect(normal).toContain('score-stamp');
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/web/RunSceneView.spec.ts tests/web/DailyTrialView.spec.ts`

Expected: failures only on new scene contracts.

- [ ] **Step 3: Implement the arrival platform**

Use `settlement-card settlement scene living-zone arrival-platform` on the victory root and `settlement-rewards reward-luggage` on rewards. Keep double-action HTML, expedition HTML, all reward numbers, and `data-action="back-station"`.

Use `daily-trial-settlement scene living-zone trial-record-board` and `daily-score score-stamp` for trial settlement. Keep share pending, assistance, best score, and back action unchanged.

- [ ] **Step 4: Style physical settlement states**

Use an arrival board, luggage trolley, stamped first-clear ticket, and updated chalk score. A repeated clear uses a worn ticket instead of changing data. Buttons stay visible above the bottom nav.

- [ ] **Step 5: Run and commit**

Run: `npm test -- tests/web/RunSceneView.spec.ts tests/web/DailyTrialView.spec.ts tests/web/BattleSettlementTransaction.spec.ts`

```powershell
git add web/views/RunSceneView.ts web/views/DailyTrialView.ts web/styles/living-station-flow.css tests/web/RunSceneView.spec.ts tests/web/DailyTrialView.spec.ts
git commit -m "style: build arrival and trial settlement scenes"
```

### Task 3: Failure repair bay and contextual notices

**Files:**
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `web/styles/living-station-flow.css`
- Modify: `web/styles/app-shell-v2.css`
- Create: `tests/web/LivingStationFailureView.spec.ts`

**Interfaces:**
- Consumes: existing failure HTML, recovery actions, `notice`, and shell notice rendering.
- Produces: `.repair-bay`, `.damage-report`, `.repair-actions`, and `.station-announcement`.

- [ ] **Step 1: Write the failing source contract**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('living station failure and notices', () => {
  it('uses repair-bay semantics without changing recovery actions', () => {
    const source = readFileSync(
      new URL('../../web/LegacyGameRuntime.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('failure-panel repair-bay');
    expect(source).toContain('damage-report');
    expect(source).toContain('repair-actions');
    expect(source).toContain('data-action="give-up"');
  });

  it('styles notices as station announcements', () => {
    const css = readFileSync(
      new URL('../../web/styles/app-shell-v2.css', import.meta.url),
      'utf8',
    );
    expect(css).toContain('.app-notice.station-announcement');
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/web/LivingStationFailureView.spec.ts`

Expected: 2 failures.

- [ ] **Step 3: Add repair-bay classes without changing recovery behavior**

Add `repair-bay` to the failure root, `damage-report` to the failure-stat cluster, and `repair-actions` to the existing recovery action container. Preserve revive, repair, give-up, ad, disabled, and back-station actions exactly.

- [ ] **Step 4: Style the failure and notice surfaces**

Render failure as a dim repair shed with a damaged-train silhouette, hanging repair sheet, and caution tape. Render `.app-notice` as a small station loudspeaker announcement slip; add `station-announcement` in the shell markup if the class is not already present. Do not turn errors into animation-only feedback.

- [ ] **Step 5: Run and commit**

Run: `npm test -- tests/web/LivingStationFailureView.spec.ts tests/web/BattleSettlementTransaction.spec.ts tests/web/battle/BattleSettlementAdapter.spec.ts tests/web/AppShell.spec.ts`

```powershell
git add web/LegacyGameRuntime.ts web/styles/living-station-flow.css web/styles/app-shell-v2.css tests/web/LivingStationFailureView.spec.ts
git commit -m "style: turn failure and notices into repair bay"
```

### Task 4: Whole-site non-battle visual inventory

**Files:**
- Create: `tests/web/LivingStationCoverage.spec.ts`
- Modify view/style files only if the inventory finds uncovered roots.

**Interfaces:**
- Consumes: all non-battle view sources and living-station styles.
- Produces: a permanent guard against partial redesign.

- [ ] **Step 1: Write the coverage test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const view = (name: string) =>
  readFileSync(new URL(`../../web/views/${name}`, import.meta.url), 'utf8');

describe('living station non-battle coverage', () => {
  it.each([
    ['DailyCheckInView.ts', 'daily-check-in'],
    ['DailyTrialView.ts', 'tide-trial-yard'],
    ['LaunchCampaignView.ts', 'founder-ticket-office'],
    ['CommerceView.ts', 'supply-market'],
    ['SocialHubView.ts', 'lighthouse-dock'],
    ['CaptainSelectionView.ts', 'captain-platform'],
    ['WardrobeView.ts', 'wardrobe-carriage'],
    ['EquipmentView.ts', 'otter-workshop'],
    ['SettingsPanelView.ts', 'conductor-cabinet'],
    ['RunSceneView.ts', 'dispatch-table'],
  ])('%s exposes %s', (file, className) => {
    expect(view(file)).toContain(className);
  });

  it('does not leave generic system-card roots in redesigned views', () => {
    for (const file of [
      'DailyTrialView.ts',
      'LaunchCampaignView.ts',
      'CommerceView.ts',
      'SocialHubView.ts',
    ]) {
      expect(view(file)).not.toContain('class="system-card ');
    }
  });
});
```

- [ ] **Step 2: Run and verify the inventory**

Run: `npm test -- tests/web/LivingStationCoverage.spec.ts`

Expected: all inventory rows pass after phases 1–3; any failure identifies an unfinished page and must be fixed before proceeding.

- [ ] **Step 3: Commit**

```powershell
git add tests/web/LivingStationCoverage.spec.ts
git commit -m "test: guard living station visual coverage"
```

### Task 5: Full-site responsive and accessibility polish

**Files:**
- Modify: `web/styles/living-station-foundation.css`
- Modify: `web/styles/living-station-home.css`
- Modify: `web/styles/living-station-districts.css`
- Modify: `web/styles/living-station-captain.css`
- Modify: `web/styles/living-station-workshop.css`
- Modify: `web/styles/living-station-flow.css`
- Modify: `scripts/smoke-browser.mjs`

**Interfaces:**
- Consumes: every redesigned non-battle place.
- Produces: bounded viewport, touch target, reduced-motion, image loading, and interaction assertions.

- [ ] **Step 1: Extend browser smoke assertions**

Add checks for each mobile viewport:

```js
assert(document.documentElement.scrollWidth <= window.innerWidth, 'living station overflow');
for (const button of document.querySelectorAll('.living-zone button:not([disabled])')) {
  const rect = button.getBoundingClientRect();
  assert(rect.height >= 44, `small touch target: ${button.textContent?.trim()}`);
}
assert(document.querySelectorAll('.living-zone').length >= 1, 'missing living zone');
```

Also navigate through station, captain, equipment, legion, and store scenes and assert each expected place root appears.

- [ ] **Step 2: Run smoke and verify RED if any responsive gap exists**

Run: `npm run smoke:browser`

Expected: any uncovered overflow or small target fails with a named assertion.

- [ ] **Step 3: Fix only reported responsive defects**

Use each area stylesheet's mobile media query; do not add generic global width overrides. Ensure decorative pseudo-elements cannot extend document width and use `pointer-events: none`.

- [ ] **Step 4: Run smoke and verify GREEN**

Run: `npm run smoke:browser`

Expected: 360×800, 390×844, 412×915, and 430×932 pass.

- [ ] **Step 5: Commit**

```powershell
git add web/styles/living-station-foundation.css web/styles/living-station-home.css web/styles/living-station-districts.css web/styles/living-station-captain.css web/styles/living-station-workshop.css web/styles/living-station-flow.css scripts/smoke-browser.mjs
git commit -m "style: polish living station across viewports"
```

### Task 6: Final verification and completion gate

**Files:**
- Modify only if verification exposes a full-site defect.

**Interfaces:**
- Consumes: all three implementation phases.
- Produces: final evidence for the approved full-site redesign.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test && npm run typecheck && npm run check:assets && npm run build && npm audit`

Expected: all commands exit 0 and audit reports 0 vulnerabilities.

- [ ] **Step 2: Run full browser smoke**

Run: `npm run smoke:browser`

Expected: all viewport, navigation, interaction, storage, and living-station assertions pass.

- [ ] **Step 3: Perform visual review**

Inspect 1024×800 and 390×844 screenshots for station home, trial, campaign, store, legion, captain, wardrobe, equipment, settings, route choice, reward choice, victory, trial settlement, and failure. Confirm there is no surviving full-area template card and no key text/action is obscured.

- [ ] **Step 4: Verify reduced motion**

Emulate `prefers-reduced-motion: reduce` and confirm living-zone loop animations are disabled while actions and states remain visible.

- [ ] **Step 5: Check repository state**

Run: `git diff --check && git status --short && git log --oneline --max-count=12`

Expected: clean diff checks, only intentional changes, and phase commits visible.
