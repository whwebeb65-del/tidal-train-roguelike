# Captain Growth Guidebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, idempotent six-objective growth guidebook on the station that derives progress from existing game state and routes players to the next useful action.

**Architecture:** A pure domain module owns the objective catalog, normalization, visibility and reward claim rules. `AppStateRepository` persists only claimed objective IDs, while the runtime derives progress from the current save/social state and renders a dedicated view. The existing delegated click handler performs navigation and claims, so no per-card listeners or new frame loops are introduced.

**Tech Stack:** TypeScript, Vitest, Vite, semantic HTML, CSS, existing browser smoke/CDP harness.

## Global Constraints

- No new currency, paid objective, rewarded-ad objective, share requirement or forced modal.
- Show at most three objectives: one current objective plus two previews.
- Objective rewards are fixed exactly as specified in `docs/superpowers/specs/2026-08-10-captain-growth-guidebook-design.md`.
- Progress comes from existing `PlayerSave` and `SocialExpeditionState`; only claimed IDs are persisted separately.
- All enabled controls must be at least 44×44 CSS pixels in production mobile viewports.
- Every behavior change follows RED → GREEN TDD and each independently complete task is committed and pushed to GitHub `main`.

---

### Task 1: Pure guidebook rules and objective catalog

**Files:**
- Create: `src/domain/retention/CaptainGuidebookSystem.ts`
- Create: `tests/domain/retention/CaptainGuidebookSystem.spec.ts`

**Interfaces:**
- Produces: `CaptainGuidebookObjectiveId`, `CaptainGuidebookState`, `CaptainGuidebookProgressSource`, `CAPTAIN_GUIDEBOOK_OBJECTIVES`, `defaultCaptainGuidebookState()`, `normalizeCaptainGuidebookState(raw)`, `getCaptainGuidebookSnapshot(state, source)`, `claimCaptainGuidebookReward(state, source, objectiveId, save)`.
- `CaptainGuidebookProgressSource` reads `firstClearMapIds`, `stationLevel`, equipment levels, highest skill mastery level, `legionId`, and `accountLevel`.

- [ ] **Step 1: Write failing rule tests**

```ts
expect(normalizeCaptainGuidebookState({
  version: 1,
  claimedObjectiveIds: ['first-clear', 'bad', 'first-clear'],
}).claimedObjectiveIds).toEqual(['first-clear']);

expect(getCaptainGuidebookSnapshot(defaultCaptainGuidebookState(), source))
  .toHaveLength(3);

const claimed = claimCaptainGuidebookReward(
  state,
  completedSource,
  'first-clear',
  defaultSave(),
);
expect(claimed.accepted).toBe(true);
expect(claimed.save.gears).toBe(60);
expect(claimCaptainGuidebookReward(
  claimed.state,
  completedSource,
  'first-clear',
  claimed.save,
).accepted).toBe(false);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/domain/retention/CaptainGuidebookSystem.spec.ts`

Expected: FAIL because `CaptainGuidebookSystem` does not exist.

- [ ] **Step 3: Implement the minimal pure rule module**

Define the six IDs in this exact order:

```ts
type CaptainGuidebookObjectiveId =
  | 'first-clear'
  | 'station-level-2'
  | 'equipment-level-2'
  | 'skill-mastery-level-5'
  | 'join-legion'
  | 'account-level-10';
```

Normalize unknown/duplicate IDs, expose only the first unclaimed objective and two following previews, and reject claims unless the target is the first unclaimed objective and its derived progress is complete. Apply rewards through a cloned `PlayerSave`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- tests/domain/retention/CaptainGuidebookSystem.spec.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit and push**

```powershell
git add src/domain/retention/CaptainGuidebookSystem.ts tests/domain/retention/CaptainGuidebookSystem.spec.ts
git commit -m "feat: define captain growth guidebook rules"
git push origin HEAD:main
```

### Task 2: Persist guidebook claims safely

**Files:**
- Modify: `web/app/AppTypes.ts`
- Modify: `web/app/AppStateRepository.ts`
- Modify: `tests/web/AppStateRepository.spec.ts`

**Interfaces:**
- Consumes: `CaptainGuidebookState`, `defaultCaptainGuidebookState`, `normalizeCaptainGuidebookState`.
- Produces: `PersistentAppState.guidebook`, `APP_STORAGE_KEYS.guidebook`, `AppStateRepository.saveGuidebook(next)`.

- [ ] **Step 1: Write failing repository tests**

Add tests proving load defaults to an empty guidebook, malformed JSON normalizes safely, a claimed ID survives reload, and `clear()` removes `tidal-train-captain-guidebook-v1`.

- [ ] **Step 2: Run the repository test and verify RED**

Run: `npm test -- tests/web/AppStateRepository.spec.ts`

Expected: FAIL because the repository has no guidebook state or storage key.

- [ ] **Step 3: Add the state and repository boundary**

Extend `PersistentAppState` with:

```ts
readonly guidebook: CaptainGuidebookState;
```

Add storage key `guidebook: 'tidal-train-captain-guidebook-v1'`, load with `normalizeCaptainGuidebookState(readJson(...))`, save normalized JSON, and rely on the existing `Object.values(APP_STORAGE_KEYS)` clear loop.

- [ ] **Step 4: Run repository, state and type tests**

Run: `npm test -- tests/web/AppStateRepository.spec.ts tests/web/GameApp.spec.ts && npm run typecheck`

Expected: PASS after all fixtures include guidebook state.

- [ ] **Step 5: Commit and push**

```powershell
git add web/app/AppTypes.ts web/app/AppStateRepository.ts tests/web/AppStateRepository.spec.ts tests/web/GameApp.spec.ts
git commit -m "feat: persist captain guidebook claims"
git push origin HEAD:main
```

### Task 3: Render the hand-drawn station guidebook

**Files:**
- Create: `web/views/CaptainGuidebookView.ts`
- Create: `web/styles/captain-guidebook.css`
- Create: `tests/web/CaptainGuidebookView.spec.ts`
- Modify: `web/styles.css`
- Modify: `tests/web/LivingStationCoverage.spec.ts`
- Modify: `tests/web/LivingStationStyles.spec.ts`

**Interfaces:**
- Consumes: `CaptainGuidebookObjectiveSnapshot[]` returned by the rule module.
- Produces: `renderCaptainGuidebook(model)` with `.captain-guidebook.living-zone`, `data-guidebook-objective`, `data-action="claim-guidebook"`, and `data-guidebook-destination` hooks.

- [ ] **Step 1: Write failing renderer and CSS contract tests**

Assert the current objective renders progress/reward plus either `盖章领奖` or a destination button, two later objectives render as previews, claimed IDs never render again, the root is a `living-zone`, controls have a 44px minimum, and reduced-motion disables stamp/float animations.

- [ ] **Step 2: Run the view/style tests and verify RED**

Run: `npm test -- tests/web/CaptainGuidebookView.spec.ts tests/web/LivingStationStyles.spec.ts tests/web/LivingStationCoverage.spec.ts`

Expected: FAIL because the view and style sheet do not exist.

- [ ] **Step 3: Implement semantic markup and freeform station styling**

Render one main paper work order and two offset preview tickets. Use CSS custom properties, pseudo-element tape/stamps with `pointer-events:none`, asymmetric rotation, a responsive single-column layout below 720px, `min-width/min-height:44px` controls, and a `prefers-reduced-motion: reduce` block that sets animations and transforms to none.

- [ ] **Step 4: Run focused renderer/style tests and build**

Run: `npm test -- tests/web/CaptainGuidebookView.spec.ts tests/web/LivingStationStyles.spec.ts tests/web/LivingStationCoverage.spec.ts && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit and push**

```powershell
git add web/views/CaptainGuidebookView.ts web/styles/captain-guidebook.css web/styles.css tests/web/CaptainGuidebookView.spec.ts tests/web/LivingStationStyles.spec.ts tests/web/LivingStationCoverage.spec.ts
git commit -m "style: add hand-drawn captain guidebook"
git push origin HEAD:main
```

### Task 4: Connect progress, rewards, navigation and release guards

**Files:**
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `src/telemetry/TelemetryEvents.ts`
- Modify: `tests/web/GameApp.spec.ts`
- Modify: `tests/telemetry/TelemetryClient.spec.ts`
- Modify: `scripts/smoke-browser.mjs`
- Modify: `tests/smoke/browser-script.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: guidebook state/repository, `getCaptainGuidebookSnapshot`, `claimCaptainGuidebookReward`, and `renderCaptainGuidebook`.
- Produces runtime delegated actions `claim-guidebook` and `guidebook-destination`; telemetry events `guidebook_objective_viewed` and `guidebook_reward_claimed`.

- [ ] **Step 1: Write failing integration and smoke-contract tests**

Test that the station HTML contains the guidebook before the route yard, a completed first objective claim persists and adds exactly 60 gears once, destination `equipment` navigates through the existing router, telemetry accepts both event names, and browser smoke contains `assertCaptainGuidebook` with 44×44/no-overflow checks.

- [ ] **Step 2: Run integration tests and verify RED**

Run: `npm test -- tests/web/GameApp.spec.ts tests/telemetry/TelemetryClient.spec.ts tests/smoke/browser-script.spec.ts`

Expected: FAIL because runtime rendering/actions and telemetry names are absent.

- [ ] **Step 3: Implement runtime data flow**

Initialize `guidebookState` from `initialState.guidebook`. Build progress from:

```ts
{
  firstClearMapIds: save.firstClearMapIds,
  stationLevel: save.stationLevel,
  highestEquipmentLevel: Math.max(0, ...save.equipmentInventory.map((item) => item.level)),
  highestSkillMasteryLevel: Math.max(
    ...Object.values(save.skillMasteryXp).map(skillMasteryLevelFromXp),
  ),
  legionId: socialState.legionId,
  accountLevel: save.accountLevel,
}
```

Render the view directly after `renderStationHero`. Claims save both player and guidebook state before re-rendering, report a station announcement, and emit `guidebook_reward_claimed`. Destination actions map `battle` to existing departure, `station` to the current station, and `equipment`/`legion` to existing hub navigation.

- [ ] **Step 4: Add real browser validation**

`assertCaptainGuidebook` must verify the root exists on every viewport, one current objective and no more than two previews are visible, enabled buttons are at least 44×44, the root does not overflow horizontally, and the first objective advances after a full battle/claim in the 390×844 path.

- [ ] **Step 5: Run all release gates**

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
npm audit --audit-level=high
npm run smoke:browser
git diff --check
```

Expected: all commands PASS; four mobile viewports pass; 390×844 completes two real battles.

- [ ] **Step 6: Commit and push**

```powershell
git add web/LegacyGameRuntime.ts src/telemetry/TelemetryEvents.ts tests/web/GameApp.spec.ts tests/telemetry/TelemetryClient.spec.ts scripts/smoke-browser.mjs tests/smoke/browser-script.spec.ts README.md
git commit -m "feat: connect captain guidebook journey"
git push origin HEAD:main
```
