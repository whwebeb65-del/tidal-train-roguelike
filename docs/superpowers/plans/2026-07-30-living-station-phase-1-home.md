# Living Tidal Station Phase 1: Station Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every template-style system panel on the station home and its station-linked trial, campaign, commerce, and legion surfaces with physical 2.5D station props.

**Architecture:** Add a small shared scene-language stylesheet and one station-home stylesheet, both imported after legacy component styles so generic `.system-card` rules cannot win. Keep all domain models and `data-action` attributes intact; views gain semantic place/prop classes while their existing data remains unchanged.

**Tech Stack:** TypeScript string views, scoped CSS, Vitest, Vite, existing browser smoke runner

## Global Constraints

- Do not modify domain systems, game values, save versions, rewards, unlock conditions, or resource settlement.
- Preserve every existing `data-action`, `data-*` identifier, form field, disabled rule, and service call.
- Do not add a replacement universal card component.
- Environment motion must remain within 2–8 CSS pixels and honor `prefers-reduced-motion`.
- At 360, 390, 412, and 430 CSS pixels, `scrollWidth` must not exceed `innerWidth`.
- Keep touch targets at least 44×44 CSS pixels.

---

### Task 1: Shared living-station scene language

**Files:**
- Create: `web/styles/living-station-foundation.css`
- Modify: `web/styles.css`
- Create: `tests/web/LivingStationStyles.spec.ts`

**Interfaces:**
- Consumes: existing CSS tokens from `web/styles/tokens.css`.
- Produces: `.living-zone`, `.station-prop`, `.station-stamp`, `.station-hangtag`, and reduced-motion contracts used by all three phases.

- [ ] **Step 1: Write the failing stylesheet contract test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('living station styles', () => {
  it('imports the scene language after generic progression styles', () => {
    const entry = readFileSync(new URL('../../web/styles.css', import.meta.url), 'utf8');
    expect(entry.indexOf('progression.css')).toBeLessThan(
      entry.indexOf('living-station-foundation.css'),
    );
  });

  it('defines shellless places, physical props and reduced motion', () => {
    const css = readFileSync(
      new URL('../../web/styles/living-station-foundation.css', import.meta.url),
      'utf8',
    );
    expect(css).toContain('.living-zone');
    expect(css).toContain('border: 0');
    expect(css).toContain('background: transparent');
    expect(css).toContain('.station-prop');
    expect(css).toContain('.station-stamp');
    expect(css).toContain('.station-hangtag');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/web/LivingStationStyles.spec.ts`

Expected: FAIL because the stylesheet and import do not exist.

- [ ] **Step 3: Implement the shared contracts**

Append the import at the end of `web/styles.css`:

```css
@import "./styles/living-station-foundation.css";
```

Create the stylesheet with these complete base contracts:

```css
.living-zone {
  position: relative;
  isolation: isolate;
  margin-block: clamp(34px, 6vw, 72px);
  padding: 0;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.station-prop { position: relative; z-index: 2; }
.station-stamp {
  display: inline-flex;
  padding: 4px 7px;
  border: 3px solid currentColor;
  border-radius: 4px;
  font: 900 9px/1 monospace;
  transform: rotate(-4deg);
}
.station-hangtag {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  padding: 8px 11px;
  color: #2f3634;
  border: 3px solid #3b3028;
  border-radius: 6px 10px 7px 8px;
  background: #f1d17b;
  box-shadow: 5px 7px #06121973;
}

@media (prefers-reduced-motion: reduce) {
  .living-zone *, .living-zone *::before, .living-zone *::after {
    animation: none !important;
    transition-duration: .01ms !important;
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/web/LivingStationStyles.spec.ts`

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add web/styles.css web/styles/living-station-foundation.css tests/web/LivingStationStyles.spec.ts
git commit -m "style: add living station scene language"
```

### Task 2: Route board and station upgrade work order

**Files:**
- Modify: `web/LegacyGameRuntime.ts`
- Create: `web/styles/living-station-home.css`
- Modify: `web/styles.css`
- Create: `tests/web/LivingStationHome.spec.ts`

**Interfaces:**
- Consumes: `MAP_PROGRESSION`, the current map actions, `save.stationLevel`, and `nextLevelCost`.
- Produces: `.station-route-yard`, `.route-sign`, and `.station-work-order`; all existing map and upgrade actions remain unchanged.

- [ ] **Step 1: Write the failing markup test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('living station home composition', () => {
  it('uses a route yard and work order instead of generic route cards and footer', () => {
    const source = readFileSync(
      new URL('../../web/LegacyGameRuntime.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('station-route-yard');
    expect(source).toContain('route-sign');
    expect(source).toContain('station-work-order');
    expect(source).not.toContain('<div class="station-footer">');
    expect(source).toContain('data-action="upgrade-station"');
    expect(source).toContain('data-action="select-map"');
    expect(source).toContain('data-action="unlock-map"');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/web/LivingStationHome.spec.ts`

Expected: FAIL on the missing semantic classes.

- [ ] **Step 3: Replace the station-only structural classes**

Use the following exact shell shapes while retaining the existing interpolated content and actions:

```ts
return `<article class="route-sign ${unlocked ? 'is-open' : 'is-locked'} ${selected ? 'is-current' : ''}">
  <div class="route-sign__lamp" aria-hidden="true"></div>
  <div class="map-copy"><small>站台 ${map.minStationLevel}</small><h3>${map.name}</h3><p>${map.feature}</p></div>${action}
</article>`;
```

```ts
<div class="station-route-yard living-zone">
  <div class="station-route-yard__heading"><h2>航线发车牌</h2><span>已开放 ${save.unlockedMapIds.length}/${MAP_PROGRESSION.length}</span></div>
  <div class="map-grid">${mapCards}</div>
</div>
<div class="station-work-order station-prop">
  <div><span class="station-stamp">站务维修</span><b>车站 Lv.${save.stationLevel}</b><small>下一次升级需要 ${nextLevelCost} 齿轮</small></div>
  <button class="secondary" data-action="upgrade-station" ${save.gears < nextLevelCost ? 'disabled' : ''}>提交升级工单</button>
</div>
```

Import `living-station-home.css` after the foundation stylesheet and style the route yard as an open rail-sign cluster, with no enclosing panel. Make locked signs use a chain/seal pseudo-element and current signs use one signal lamp. Style `.station-work-order` as a rotated paper-and-metal maintenance slip.

- [ ] **Step 4: Add the station-home stylesheet contract**

Extend `LivingStationHome.spec.ts`:

```ts
it('keeps the route yard shellless and supplies mobile layout rules', () => {
  const css = readFileSync(
    new URL('../../web/styles/living-station-home.css', import.meta.url),
    'utf8',
  );
  expect(css).toContain('.station-route-yard');
  expect(css).toContain('.route-sign.is-current');
  expect(css).toContain('.station-work-order');
  expect(css).toContain('@media (max-width: 760px)');
});
```

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- tests/web/LivingStationHome.spec.ts`

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```powershell
git add web/LegacyGameRuntime.ts web/styles.css web/styles/living-station-home.css tests/web/LivingStationHome.spec.ts
git commit -m "style: turn station routes into physical signage"
```

### Task 3: Tide trial challenge board

**Files:**
- Modify: `web/views/DailyTrialView.ts`
- Modify: `web/styles/living-station-home.css`
- Modify: `tests/web/DailyTrialView.spec.ts`

**Interfaces:**
- Consumes: `DailyTrialHubViewModel` unchanged.
- Produces: `.tide-trial-yard`, `.trial-chalkboard`, `.trial-signal-lights`, and `.trial-score-tags`.

- [ ] **Step 1: Write the failing semantic test**

Add to `DailyTrialView.spec.ts`:

```ts
it('renders the trial as a physical challenge board', () => {
  const html = renderDailyTrialHub({ stationLevel: 2, state, definition });
  expect(html).toContain('living-zone tide-trial-yard');
  expect(html).toContain('trial-chalkboard');
  expect(html).toContain('trial-signal-lights');
  expect(html).toContain('trial-score-tags');
  expect(html).not.toContain('system-card system-card--trial');
  expect(html).toContain('data-action="start-daily-trial"');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/web/DailyTrialView.spec.ts`

Expected: 1 new failure on `tide-trial-yard`.

- [ ] **Step 3: Implement the trial place**

Change only presentation classes and action copy:

```ts
const startAction = unlocked
  ? '<button class="trial-bell" data-action="start-daily-trial">敲钟开始试炼</button>'
  : '<button class="trial-bell" disabled>车站 Lv.2 点亮信号</button>';
```

```ts
return `<section class="deferred-section living-zone tide-trial-yard ${unlocked ? '' : 'is-locked'}">
  <div class="daily-trial-heading">...</div>
  <div class="trial-chalkboard station-prop">...</div>
  <div class="daily-trial-modifiers trial-hangtags">...</div>
  <div class="daily-trial-stats trial-score-tags">...</div>
  <div class="daily-trial-milestones trial-signal-lights">${milestones}</div>
</section>`;
```

Render each milestone as `article class="daily-trial-milestone signal-post ..."`, retain its button and identifiers, and style reached/claimed/locked states as lit, stamped, and unlit signals.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- tests/web/DailyTrialView.spec.ts`

Expected: all DailyTrialView tests pass.

- [ ] **Step 5: Commit**

```powershell
git add web/views/DailyTrialView.ts web/styles/living-station-home.css tests/web/DailyTrialView.spec.ts
git commit -m "style: rebuild daily trial as challenge board"
```

### Task 4: Founder ticket booth and gift-code checkpoint

**Files:**
- Modify: `web/views/LaunchCampaignView.ts`
- Modify: `web/styles/living-station-home.css`
- Modify: `tests/web/LaunchCampaignView.spec.ts`

**Interfaces:**
- Consumes: `LaunchCampaignViewModel` unchanged.
- Produces: `.founder-ticket-office`, `.founder-window`, `.launch-luggage-cart`, and `.gift-code-checkpoint`.

- [ ] **Step 1: Replace the old generic-class expectation with a failing place contract**

```ts
expect(html).toContain('living-zone founder-ticket-office');
expect(html).toContain('founder-window');
expect(html).toContain('launch-luggage-cart');
expect(html).toContain('gift-code-checkpoint');
expect(html).not.toContain('class="system-card');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/web/LaunchCampaignView.spec.ts`

Expected: FAIL because the view still renders generic system cards.

- [ ] **Step 3: Implement the ticket-office structure**

Use these exact roots while retaining reward text, input attributes, actions, and disabled conditions:

```ts
return `<section class="deferred-section living-zone founder-ticket-office">
  <header class="ticket-office-sign station-prop">...</header>
  <div class="founder-counter">
    <article class="founder-window">...</article>
    <article class="launch-luggage-cart">...</article>
  </div>
  <div class="campaign-badges founder-passport">...</div>
  <form id="gift-code-form" class="gift-code-form gift-code-checkpoint" autocomplete="off">...</form>
</section>`;
```

Change enabled action copy to `领取候车票`, `打开先行者行李`, `卸下开服礼`, and `检票兑换`; do not change their `data-action` values.

- [ ] **Step 4: Run the view test**

Run: `npm test -- tests/web/LaunchCampaignView.spec.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add web/views/LaunchCampaignView.ts web/styles/living-station-home.css tests/web/LaunchCampaignView.spec.ts
git commit -m "style: turn launch campaign into ticket office"
```

### Task 5: Supply market and lighthouse dock

**Files:**
- Modify: `web/views/CommerceView.ts`
- Modify: `web/views/SocialHubView.ts`
- Create: `web/styles/living-station-districts.css`
- Modify: `web/styles.css`
- Modify: `tests/web/CommerceView.spec.ts`
- Modify: `tests/web/SocialHubView.spec.ts`

**Interfaces:**
- Consumes: `CommerceStoreModel` and `SocialHubViewModel` unchanged.
- Produces: `.supply-market`, `.supply-crate`, `.lighthouse-dock`, `.expedition-chart`, and `.support-platform`.

- [ ] **Step 1: Add failing view contracts**

```ts
expect(html).toContain('living-zone supply-market');
expect(html).toContain('supply-crate');
expect(html).not.toContain('system-card--commerce');
```

```ts
expect(html).toContain('living-zone lighthouse-dock');
expect(html).toContain('support-platform');
expect(html).not.toContain('system-card--social');
```

- [ ] **Step 2: Run both tests and verify RED**

Run: `npm test -- tests/web/CommerceView.spec.ts tests/web/SocialHubView.spec.ts`

Expected: both files fail only on new presentation contracts.

- [ ] **Step 3: Implement the district roots**

Commerce:

```ts
return `<section class="deferred-section living-zone supply-market">
  <div class="market-awning">...</div>
  <div class="commerce-grid supply-crate-grid">${cards}</div>
  <div class="note market-receipt">...</div>
</section>`;
```

Each product article becomes `class="commerce-card supply-crate ..."`; retain purchase identifiers and deterministic content.

Social:

```ts
return `<section class="deferred-section living-zone lighthouse-dock">
  <div class="dock-flag">...</div>
  <div class="expedition-progress expedition-chart">...</div>
  <div class="expedition-milestones beacon-line">${milestones}</div>
  <div class="support-grid support-platform">${supports}</div>
</section>`;
```

The not-joined state uses the same `lighthouse-dock` root with `.dock-gate.is-locked`; retain `data-action="join-legion"`.

- [ ] **Step 4: Add and import district styles**

Import `living-station-districts.css` after `living-station-home.css`. Define physical crate, awning, dock, beacon, and crew-line styles. Add mobile rules that use one readable column without a surrounding panel.

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- tests/web/CommerceView.spec.ts tests/web/SocialHubView.spec.ts tests/web/LivingStationStyles.spec.ts`

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add web/views/CommerceView.ts web/views/SocialHubView.ts web/styles.css web/styles/living-station-districts.css tests/web/CommerceView.spec.ts tests/web/SocialHubView.spec.ts
git commit -m "style: build supply market and lighthouse dock"
```

### Task 6: Phase-one verification

**Files:**
- Modify only if verification reveals a phase-one defect.

**Interfaces:**
- Consumes: the completed station-home visual layer.
- Produces: phase-one regression evidence; does not claim the full overhaul complete.

- [ ] **Step 1: Run automated checks**

Run: `npm test && npm run typecheck && npm run check:assets && npm run build`

Expected: all commands exit 0.

- [ ] **Step 2: Run real browser smoke**

Run: `npm run smoke:browser`

Expected: 360, 390, 412, and 430 pixel checks pass with no horizontal overflow.

- [ ] **Step 3: Manually inspect key states**

Inspect unlocked and locked trial, unclaimed and claimed campaign, pending and owned products, and joined and unjoined legion at 390×844 and 1024×800. Confirm physical status cues do not cover reward values or actions.

- [ ] **Step 4: Check the diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only phase-one files are changed.

