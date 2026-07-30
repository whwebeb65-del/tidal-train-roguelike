# Daily Check-In Shellless Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the enclosing system-card appearance from the daily check-in and blend its 2.5D night-market scene into the page without mobile overflow.

**Architecture:** Keep the existing HTML and reward logic stable. Override the generic card shell at the feature root, turn the stage into a full-bleed transparent scene strip, and use stage pseudo-elements as soft page-colored edge fades; retain borders only on scene props.

**Tech Stack:** TypeScript string views, CSS, Vitest, Vite, browser smoke checks

## Global Constraints

- Do not change reward values, claim state, copy hierarchy, or button behavior.
- Do not add dependencies or new image assets.
- Preserve `prefers-reduced-motion`.
- At 360, 390, 412, and 430 CSS pixels, `scrollWidth` must not exceed `innerWidth`.

---

### Task 1: Add the shellless visual contract

**Files:**
- Modify: `tests/web/DailyCheckInView.spec.ts`
- Test: `tests/web/DailyCheckInView.spec.ts`

**Interfaces:**
- Consumes: `web/styles/legacy.css` as UTF-8 text.
- Produces: regression assertions for the feature-scoped shell and fade layers.

- [x] **Step 1: Write the failing test**

Add a test that extracts the `.daily-check-in` rule and expects `border: 0`, `border-radius: 0`, `background: transparent`, `box-shadow: none`, and `overflow: visible`. Also assert that `.daily-check-in-stage::before` and `.daily-check-in-stage::after` exist.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/web/DailyCheckInView.spec.ts`

Expected: FAIL because the current root uses a border, rounded corners, solid background, and hidden overflow.

### Task 2: Blend the scene into the page

**Files:**
- Modify: `web/styles/legacy.css`
- Test: `tests/web/DailyCheckInView.spec.ts`

**Interfaces:**
- Consumes: existing `.daily-check-in*` selectors and station art layers.
- Produces: a transparent feature root, a slightly full-bleed stage, and non-interactive edge fades.

- [x] **Step 1: Implement the minimal shellless CSS**

Set the feature root to transparent with no border/radius/shadow and visible overflow. Expand the stage horizontally with negative inline margin, remove rectangular clipping, and add page-colored `::before`/`::after` fades with `pointer-events: none`.

- [x] **Step 2: Keep the scene props above the fades**

Use explicit z-index ordering so the fades soften background art without covering the sign, stall, mascot, action, or focusable button.

- [x] **Step 3: Constrain the mobile bleed**

In the existing mobile media query, reduce stage inline bleed and ensure the section width cannot create horizontal scrolling.

- [x] **Step 4: Run focused tests**

Run: `npm test -- tests/web/DailyCheckInView.spec.ts`

Expected: 7 tests pass.

### Task 3: Verify and review the finished scene

**Files:**
- Modify only if verification reveals a scoped defect.

**Interfaces:**
- Consumes: built application.
- Produces: regression evidence for code, assets, layout, and mobile behavior.

- [x] **Step 1: Run automated verification**

Run: `npm test && npm run typecheck && npm run check:assets && npm run build`

Expected: all commands exit 0.

- [x] **Step 2: Run browser smoke verification**

Run: `npm run smoke:browser`

Expected: 360, 390, 412, and 430 pixel checks pass with no horizontal overflow.

- [x] **Step 3: Inspect the diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only the approved spec, plan, test, and CSS files are modified.

- [x] **Step 4: Commit**

Run: `git add docs/superpowers/specs/2026-07-30-daily-check-in-shellless-scene-design.md docs/superpowers/plans/2026-07-30-daily-check-in-shellless-scene.md tests/web/DailyCheckInView.spec.ts web/styles/legacy.css && git commit -m "style: blend daily check-in into station scene"`
