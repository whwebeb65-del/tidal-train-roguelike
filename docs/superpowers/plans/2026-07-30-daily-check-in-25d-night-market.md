# Daily Check-In 2.5D Night Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mechanical seven-card daily check-in panel with the approved 2.5D “潮汐夜摊” while preserving all check-in behavior.

**Architecture:** Keep `DailyCheckInSystem` and the existing claim action unchanged. Extend the pure HTML view with layered `CHIBI_ART` assets and reward-art modifiers, then replace only the daily-check-in CSS block with a responsive, reduced-motion-safe stage.

**Tech Stack:** TypeScript, HTML strings, CSS, Vitest, Vite

## Global Constraints

- Reuse existing `CHIBI_ART`; add no image assets or dependencies.
- Preserve `.daily-check-in-cell` and `data-action="claim-daily-check-in"`.
- Preserve reward values, save behavior, date rollback behavior and disabled states.
- Continuous motion uses only `transform`, `opacity` and `filter`; disable it under `prefers-reduced-motion`.
- At widths below 760px, use two reward columns and make day seven span both.

---

### Task 1: Render the layered night-market scene

**Files:**
- Modify: `tests/web/DailyCheckInView.spec.ts`
- Modify: `web/views/DailyCheckInView.ts`

**Interfaces:**
- Consumes: `CHIBI_ART` from `web/assets/ChibiArtCatalog.ts`
- Produces: HTML classes `daily-check-in-stage`, `daily-check-in-layer`, `daily-check-in-stall`, `daily-check-in-reward-art`, `reward-art--gears`, `reward-art--route-marks`, `reward-art--star-tickets`, `daily-check-in-mascot`

- [x] **Step 1: Write the failing view test**

Add assertions to the initial-render test:

```ts
expect(html).toContain('daily-check-in-stage');
expect(html).toContain(CHIBI_ART.station.sky);
expect(html).toContain(CHIBI_ART.station.horizon);
expect(html).toContain(CHIBI_ART.station.platform);
expect(html).toContain(CHIBI_ART.station.foreground);
expect(html).toContain(CHIBI_ART.otter);
expect(countClass(html, 'daily-check-in-reward-art')).toBe(7);
expect(html).toContain('reward-art--gears');
expect(html).toContain('reward-art--route-marks');
expect(html).toContain('reward-art--star-tickets');
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/web/DailyCheckInView.spec.ts`

Expected: FAIL because `daily-check-in-stage` and reward-art markup do not exist.

- [x] **Step 3: Add asset-backed scene markup**

Import `CHIBI_ART`. Add a helper that returns the first nonzero reward type:

```ts
function getRewardArtClass(reward: DailyCheckInReward): string {
  if (reward.starTickets > 0) return 'reward-art--star-tickets';
  if (reward.routeMarks > 0) return 'reward-art--route-marks';
  return 'reward-art--gears';
}
```

Render empty-alt scene layer images, a reward-art element inside each existing `.daily-check-in-cell`, the water-otter image with `alt="水獭检修员"`, and a short speech line. Do not change the existing button or status calculations.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/web/DailyCheckInView.spec.ts`

Expected: 5 tests PASS.

### Task 2: Replace card-grid styling with the 2.5D stall

**Files:**
- Modify: `web/styles/legacy.css`

**Interfaces:**
- Consumes: markup classes produced by Task 1
- Produces: desktop 4+3 stall layout, mobile two-column layout, layered depth and reduced-motion fallback

- [x] **Step 1: Add a static stylesheet contract test**

Create a test in `tests/web/DailyCheckInView.spec.ts` that reads `web/styles/legacy.css` and asserts the stylesheet contains:

```ts
expect(css).toContain('.daily-check-in-stage');
expect(css).toContain('.daily-check-in-layer--foreground');
expect(css).toContain('@keyframes daily-check-in-otter-idle');
expect(css).toContain('@media (prefers-reduced-motion: reduce)');
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/web/DailyCheckInView.spec.ts`

Expected: FAIL because the new scene selectors and keyframes are absent.

- [x] **Step 3: Implement the scene styles**

Replace the existing daily-check-in block with:

- A dark fallback surface and five absolutely positioned art layers.
- A wood-stall reward area using a four-column grid where day five starts column one and day seven spans two columns.
- Dedicated CSS shapes for gear, route-mark and star-ticket rewards.
- A gold-highlighted current reward, stamped claimed reward and wider day-seven crate.
- A positioned otter, speech panel and station-sign claim button.
- Motion keyframes with 2—8 px amplitude.
- Mobile rules at the existing 760px breakpoint that hide foreground, use two reward columns and keep the action full width.

- [x] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/web/DailyCheckInView.spec.ts
npm run typecheck
```

Expected: focused tests PASS and TypeScript exits 0.

### Task 3: Full regression and browser acceptance

**Files:**
- Modify only if a regression is found in the files already listed.

**Interfaces:**
- Consumes: completed view and CSS
- Produces: verified production build with unchanged check-in behavior

- [x] **Step 1: Run the release checks**

Run:

```bash
npm test
npm run typecheck
npm run check:assets
npm run build
npm run smoke:browser
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 2: Inspect desktop and mobile**

Start `npm run dev -- --port 63257`, open the station page, and verify:

- Desktop: all seven rewards, otter, speech, stage layers and claim button are visible without overlap.
- 360px: no horizontal overflow; day seven spans both columns; foreground is hidden; button remains full width.
- Reduced motion: parallax, bulb swing, otter idle and reward pulse are absent.
- Claim once: exactly one cell becomes claimed and the button becomes disabled on the same date.

- [x] **Step 3: Commit the verified slice**

```bash
git add docs/superpowers/specs/2026-07-30-daily-check-in-25d-night-market-design.md docs/superpowers/plans/2026-07-30-daily-check-in-25d-night-market.md tests/web/DailyCheckInView.spec.ts web/views/DailyCheckInView.ts web/styles/legacy.css
git commit -m "feat: redesign daily check-in as 2.5d night market"
```
