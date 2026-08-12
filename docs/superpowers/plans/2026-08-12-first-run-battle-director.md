# First-Run Battle Director Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, non-blocking three-step first-run battle tutorial that advances only from real aim, skill-use, and upgrade-selection actions.

**Architecture:** A pure onboarding domain module owns ordered state. `AppStateRepository` persists it separately from `PlayerSave`; `LegacyGameRuntime` owns the live state and telemetry; `BattleScene` translates successful production actions into tutorial events; `BattleHUD` renders prompt models without reading storage. Browser smoke proves the clean-save path and persistence through the exact E2E gate.

**Tech Stack:** TypeScript 5.7, Vitest 4, JSDOM, Vite 8, CSS, Chrome DevTools Protocol smoke runner.

## Global Constraints

- Show the tutorial only in normal runs, never in daily trials.
- Do not pause simulation or change combat, economy, stamina, reward, or account-progression values.
- Complete a step only after an accepted canvas aim, `skill-used`, or `upgrade-selected` event.
- Persist skip and completion under `tidal-train-first-run-battle-tutorial-v1`; the existing reset action must remove it.
- Every enabled tutorial control is at least 44×44 CSS pixels at 360, 390, 412, and 430px.
- Decorations do not intercept input; reduced-motion mode removes tutorial animation.
- Add no dependency or runtime image asset.
- Follow RED → GREEN for every production change and commit each independently useful task.
- Final gate: `npm test`, `npm run typecheck`, `npm run check:assets`, `npm run build`, `npm audit --audit-level=high`, `npm run smoke:browser`, and `git diff --check`.

---

## File Structure

- Create `src/domain/onboarding/FirstRunBattleTutorial.ts` and its domain spec for ordered state and prompt copy.
- Extend `web/app/AppTypes.ts`, `web/app/AppStateRepository.ts`, and its spec for a separate persistent slice.
- Extend `web/battle/BattleHudModel.ts`, `web/battle/BattleHUD.ts`, and its spec for two model-driven ticket placements.
- Extend `web/scenes/BattleScene.ts` and its spec for real action gating.
- Extend `web/LegacyGameRuntime.ts`, telemetry, E2E hooks, and integration specs for persistence and normal/trial isolation.
- Create `web/styles/battle-tutorial.css`; update the stylesheet entrypoint, style contracts, browser smoke, smoke contract, and README.

---

### Task 1: Pure ordered tutorial rules

**Files:**
- Create: `src/domain/onboarding/FirstRunBattleTutorial.ts`
- Create: `tests/domain/onboarding/FirstRunBattleTutorial.spec.ts`

**Interfaces:**
- Produces: `FirstRunBattleTutorialStepId`, `FirstRunBattleTutorialState`, `FirstRunBattleTutorialPrompt`, `createFirstRunBattleTutorialState()`, `normalizeFirstRunBattleTutorialState(value)`, `getFirstRunBattleTutorialPrompt(state)`, `completeFirstRunBattleTutorialStep(state, stepId)`, `skipFirstRunBattleTutorial(state)`.

- [ ] **Step 1: Write the failing domain tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  completeFirstRunBattleTutorialStep,
  createFirstRunBattleTutorialState,
  getFirstRunBattleTutorialPrompt,
  normalizeFirstRunBattleTutorialState,
  skipFirstRunBattleTutorial,
} from '../../../src/domain/onboarding/FirstRunBattleTutorial';

describe('FirstRunBattleTutorial', () => {
  it('starts at aim and advances only in catalog order', () => {
    const initial = createFirstRunBattleTutorialState();
    expect(getFirstRunBattleTutorialPrompt(initial)?.stepId).toBe('aim');
    expect(completeFirstRunBattleTutorialStep(initial, 'skill')).toBe(initial);
    const aimed = completeFirstRunBattleTutorialStep(initial, 'aim');
    const skilled = completeFirstRunBattleTutorialStep(aimed, 'skill');
    const complete = completeFirstRunBattleTutorialStep(skilled, 'upgrade');
    expect(getFirstRunBattleTutorialPrompt(aimed)?.stepId).toBe('skill');
    expect(getFirstRunBattleTutorialPrompt(skilled)?.stepId).toBe('upgrade');
    expect(getFirstRunBattleTutorialPrompt(complete)).toBeNull();
    expect(completeFirstRunBattleTutorialStep(complete, 'upgrade')).toBe(complete);
  });

  it('normalizes only a contiguous known prefix', () => {
    expect(normalizeFirstRunBattleTutorialState({
      version: 99,
      completedStepIds: ['aim', 'skill', 'bad', 'aim', 'upgrade'],
      skipped: false,
    })).toEqual({ version: 1, completedStepIds: ['aim', 'skill'], skipped: false });
    expect(normalizeFirstRunBattleTutorialState(null))
      .toEqual(createFirstRunBattleTutorialState());
  });

  it('skips idempotently without forging completed steps', () => {
    const initial = createFirstRunBattleTutorialState();
    const skipped = skipFirstRunBattleTutorial(initial);
    expect(skipped).toEqual({ version: 1, completedStepIds: [], skipped: true });
    expect(getFirstRunBattleTutorialPrompt(skipped)).toBeNull();
    expect(skipFirstRunBattleTutorial(skipped)).toBe(skipped);
  });
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/domain/onboarding/FirstRunBattleTutorial.spec.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the state machine**

```ts
export type FirstRunBattleTutorialStepId = 'aim' | 'skill' | 'upgrade';
export type FirstRunBattleTutorialPlacement = 'battle' | 'upgrade';

export interface FirstRunBattleTutorialState {
  readonly version: 1;
  readonly completedStepIds: readonly FirstRunBattleTutorialStepId[];
  readonly skipped: boolean;
}

export interface FirstRunBattleTutorialPrompt {
  readonly stepId: FirstRunBattleTutorialStepId;
  readonly stepNumber: number;
  readonly totalSteps: 3;
  readonly placement: FirstRunBattleTutorialPlacement;
  readonly title: string;
  readonly body: string;
}

const PROMPTS = [
  { stepId: 'aim', placement: 'battle', title: '先盯住一只潮兽', body: '主炮会自动开火；点一下战场，可以让炮口优先追打那个方向。' },
  { stepId: 'skill', placement: 'battle', title: '把技能用在潮头上', body: '下方三枚技能各管爆发、防护和清场；亮起时点任意一枚试试。' },
  { stepId: 'upgrade', placement: 'upgrade', title: '挑一件真正改变打法的货', body: '这是本局强化，离站后重置；带“技能进化”的选项会改变技能机制。' },
] as const;
```

Normalization collects a contiguous prefix of the catalog. Invalid and repeated transitions return the same object reference; new arrays and states are frozen.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm test -- tests/domain/onboarding/FirstRunBattleTutorial.spec.ts`

Expected: PASS, 3 tests.

```powershell
git add -- src/domain/onboarding/FirstRunBattleTutorial.ts tests/domain/onboarding/FirstRunBattleTutorial.spec.ts
git commit -m "feat: define first-run battle tutorial rules"
```

---

### Task 2: Persist the tutorial slice safely

**Files:**
- Modify: `web/app/AppTypes.ts`
- Modify: `web/app/AppStateRepository.ts`
- Modify: `tests/web/AppStateRepository.spec.ts`

**Interfaces:**
- Consumes: Task 1 state and normalizer.
- Produces: `PersistentAppState.firstRunBattleTutorial`, `APP_STORAGE_KEYS.firstRunBattleTutorial`, `AppStateRepository.saveFirstRunBattleTutorial(next)`.

- [ ] **Step 1: Add failing persistence assertions**

```ts
expect(initial.firstRunBattleTutorial).toEqual({
  version: 1,
  completedStepIds: [],
  skipped: false,
});
repository.saveFirstRunBattleTutorial({
  version: 1,
  completedStepIds: ['aim'],
  skipped: false,
});
expect(repository.load().firstRunBattleTutorial.completedStepIds)
  .toEqual(['aim']);
```

Also prove malformed `['aim', 'skill', 'bad', 'upgrade']` becomes `['aim', 'skill']`, while fully reversed known IDs become the empty safe default. The existing `Object.values(APP_STORAGE_KEYS)` loop must prove `clear()` removes the key.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/AppStateRepository.spec.ts`

Expected: FAIL because the slice, key, and save method are missing.

- [ ] **Step 3: Implement repository wiring**

Add the type to `PersistentAppState`, add:

```ts
firstRunBattleTutorial: 'tidal-train-first-run-battle-tutorial-v1',
```

Load with `normalizeFirstRunBattleTutorialState(readJson(storage, APP_STORAGE_KEYS.firstRunBattleTutorial))`. Save through:

```ts
saveFirstRunBattleTutorial(next: FirstRunBattleTutorialState): void {
  storage.setItem(
    APP_STORAGE_KEYS.firstRunBattleTutorial,
    JSON.stringify(normalizeFirstRunBattleTutorialState(next)),
  );
},
```

- [ ] **Step 4: Run GREEN and commit**

Run: `npm test -- tests/web/AppStateRepository.spec.ts tests/domain/onboarding/FirstRunBattleTutorial.spec.ts`

```powershell
git add -- web/app/AppTypes.ts web/app/AppStateRepository.ts tests/web/AppStateRepository.spec.ts
git commit -m "feat: persist first-run battle tutorial"
```

---

### Task 3: Render model-driven tutorial tickets

**Files:**
- Modify: `web/battle/BattleHudModel.ts`
- Modify: `web/battle/BattleHUD.ts`
- Modify: `tests/web/battle/BattleHUD.spec.ts`

**Interfaces:**
- Consumes: `FirstRunBattleTutorialPrompt`.
- Produces: `BattleHudModel.firstRunTutorialPrompt`, `BattleHudModelOptions.firstRunTutorialPrompt`, `BattleHudCallbacks.onSkipTutorial()`.

- [ ] **Step 1: Write failing HUD tests**

Add `onSkipTutorial: vi.fn()` to the fixture. Test an `aim` prompt shows only the battle placement, an `upgrade` prompt shows only the inline upgrade placement, `null` hides both, and clicking the visible `data-battle-action="skip-tutorial"` calls once.

```ts
hud.update(createBattleHudModel(createFrameFixture(), {
  ...createHudModelOptionsFixture(),
  firstRunTutorialPrompt: {
    stepId: 'aim', stepNumber: 1, totalSteps: 3,
    placement: 'battle', title: '先盯住一只潮兽', body: '主炮会自动开火。',
  },
}));
expect(host.querySelector<HTMLElement>('[data-battle-tutorial="battle"]')?.hidden).toBe(false);
expect(host.querySelector<HTMLElement>('[data-battle-tutorial="upgrade"]')?.hidden).toBe(true);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/battle/BattleHUD.spec.ts`

Expected: FAIL because model, DOM, and callback fields are missing.

- [ ] **Step 3: Add two semantic surfaces**

Add one ticket beside the skill dock and one before the upgrade grid. Each uses:

```html
<aside class="battle-tutorial-ticket" data-battle-tutorial="battle" aria-live="polite" hidden>
  <span data-tutorial-progress></span>
  <strong data-tutorial-title></strong>
  <p data-tutorial-body></p>
  <button type="button" data-battle-action="skip-tutorial">跳过引导</button>
</aside>
```

During `update`, show only the matching placement, assign copy through `textContent`, and set `data-step`. Handle `skip-tutorial` in the delegated click handler.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm test -- tests/web/battle/BattleHUD.spec.ts`

```powershell
git add -- web/battle/BattleHudModel.ts web/battle/BattleHUD.ts tests/web/battle/BattleHUD.spec.ts
git commit -m "feat: render first-run battle direction"
```

---

### Task 4: Advance from successful production actions

**Files:**
- Modify: `web/scenes/BattleScene.ts`
- Modify: `tests/web/battle/BattleScene.spec.ts`

**Interfaces:**
- Consumes: prompt/step types and HUD additions.
- Produces optional dependencies `getFirstRunTutorialPrompt()`, `onFirstRunTutorialStep(stepId)`, `onSkipFirstRunTutorial()`.

- [ ] **Step 1: Add failing real-action tests**

Extend pointer coverage to prove `aim` is reported only when `setMainCannonAim` returns true. Queue real engine events and fire the manual scheduler to prove only `skill-used` and `upgrade-selected` report their IDs. Invoke the HUD skip callback and expect only `onSkipFirstRunTutorial`.

```ts
expect(onFirstRunTutorialStep).toHaveBeenCalledWith('aim');
engine.events.push({ type: 'skill-used', skillId: 'tidal-volley' });
scheduler.fire(16);
expect(onFirstRunTutorialStep).toHaveBeenCalledWith('skill');
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/battle/BattleScene.spec.ts`

- [ ] **Step 3: Connect real actions**

Pass `getFirstRunTutorialPrompt?.() ?? null` into the HUD model. Call the aim callback only inside the successful `setMainCannonAim` branch. In `handleEvents`, report `skill-used` and `upgrade-selected`. Forward skip from HUD and render immediately.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm test -- tests/web/battle/BattleScene.spec.ts tests/web/battle/BattleHUD.spec.ts`

```powershell
git add -- web/scenes/BattleScene.ts tests/web/battle/BattleScene.spec.ts
git commit -m "feat: connect tutorial to real battle actions"
```

---

### Task 5: Runtime persistence, telemetry, trial isolation, and QA state

**Files:**
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `src/telemetry/TelemetryEvents.ts`
- Modify: `web/battle/BattleE2EHooks.ts`
- Modify: `tests/web/LegacyGameRuntimeE2E.spec.ts`
- Modify: `tests/web/GameApp.spec.ts`

**Interfaces:**
- Consumes: repository and BattleScene additions.
- Produces: `BattleE2ESnapshot.verification.firstRunTutorialStep`, runtime persistence, `first_run_tutorial_step_completed`, `first_run_tutorial_skipped`, `first_run_tutorial_completed`.

- [ ] **Step 1: Write failing integration tests**

Start from empty storage, enter a normal battle, observe `aim`, perform three real actions, verify storage contains `['aim', 'skill', 'upgrade']`, then start a second run and expect no ticket. Start a daily trial from incomplete state and expect no ticket. Require the snapshot field while retaining the ordinary URL no-hook assertion.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/GameApp.spec.ts tests/web/LegacyGameRuntimeE2E.spec.ts`

- [ ] **Step 3: Implement runtime ownership**

```ts
let firstRunBattleTutorialState = initialState.firstRunBattleTutorial;

function completeFirstRunTutorial(stepId: FirstRunBattleTutorialStepId): void {
  const previousPrompt = getFirstRunBattleTutorialPrompt(firstRunBattleTutorialState);
  const next = completeFirstRunBattleTutorialStep(firstRunBattleTutorialState, stepId);
  if (next === firstRunBattleTutorialState) return;
  firstRunBattleTutorialState = next;
  appStateRepository.saveFirstRunBattleTutorial(next);
  track('first_run_tutorial_step_completed', { stepId });
  if (previousPrompt?.stepId === 'upgrade' && getFirstRunBattleTutorialPrompt(next) === null) {
    track('first_run_tutorial_completed');
  }
}
```

The BattleScene prompt provider returns `null` unless `runMode === 'normal'`. Skip stores the skipped state and records the current step once. Add the three telemetry literals. Include current step or `null` in the read-only, exact-gated E2E snapshot.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm test -- tests/web/GameApp.spec.ts tests/web/LegacyGameRuntimeE2E.spec.ts tests/web/battle/BattleScene.spec.ts`

```powershell
git add -- web/LegacyGameRuntime.ts src/telemetry/TelemetryEvents.ts web/battle/BattleE2EHooks.ts tests/web/LegacyGameRuntimeE2E.spec.ts tests/web/GameApp.spec.ts
git commit -m "feat: persist first-run battle direction"
```

---

### Task 6: Hand-drawn styling and mobile release proof

**Files:**
- Create: `web/styles/battle-tutorial.css`
- Modify: `web/styles.css`
- Modify: `tests/web/LivingStationStyles.spec.ts`
- Modify: `scripts/smoke-browser.mjs`
- Modify: `tests/smoke/browser-script.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: tutorial DOM and E2E snapshot.
- Produces: responsive visual treatment and permanent browser gate.

- [ ] **Step 1: Write failing CSS and smoke contracts**

Assert the new import; 44×44 skip controls; pseudo-elements with `pointer-events: none`; 370px safe-inset rules; reduced-motion `animation: none`; and smoke source names `assertFirstRunBattleTutorial`, `firstRunTutorialStep`, and the second-run persistence assertion.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/LivingStationStyles.spec.ts tests/smoke/browser-script.spec.ts`

- [ ] **Step 3: Implement the visual system**

```css
.battle-tutorial-ticket {
  position: absolute;
  z-index: 14;
  left: max(12px, env(safe-area-inset-left));
  bottom: calc(112px + env(safe-area-inset-bottom));
  width: min(330px, calc(100% - 24px));
  padding: 12px 54px 12px 15px;
  border: 2px solid #733c2e;
  background: #f3dfb1;
  color: #173b49;
  box-shadow: 5px 7px 0 rgb(15 49 59 / 48%);
  transform: rotate(-0.5deg);
  animation: battle-tutorial-breathe 2.8s ease-in-out infinite;
}
.battle-tutorial-ticket::before,
.battle-tutorial-ticket::after { pointer-events: none; }
.battle-tutorial-ticket [data-battle-action="skip-tutorial"] {
  min-width: 44px;
  min-height: 44px;
}
@media (prefers-reduced-motion: reduce) {
  .battle-tutorial-ticket { animation: none; transform: none; }
}
```

The upgrade placement is relative, full-width, and before reward cards so it cannot cover options or reroll.

- [ ] **Step 4: Extend browser smoke**

At the first 390×844 clean-save run: assert `aim`, copy, 44×44, no overflow, and no skill overlap; dispatch a real canvas `pointerdown` and wait for `skill`; use a real skill and advance 40ms to reach `upgrade`; reach the upgrade overlay, assert no card/reroll overlap, choose one, and wait for `null`; return and start a second normal run with no ticket. Preserve ordinary-URL E2E isolation and the existing two-victory run.

- [ ] **Step 5: Run focused GREEN**

Run: `npm test -- tests/web/LivingStationStyles.spec.ts tests/smoke/browser-script.spec.ts`

Run: `npm run build && npm run smoke:browser`

Expected: PASS at 360×800, 390×844, 412×915, and 430×932.

- [ ] **Step 6: Document behavior and run the full gate**

Add a README section explaining normal-mode-only, non-blocking, skip-safe persistence and reset. Do not claim measured retention gains.

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
npm audit --audit-level=high
npm run smoke:browser
git diff --check
```

- [ ] **Step 7: Commit and publish**

```powershell
git add -- web/styles/battle-tutorial.css web/styles.css tests/web/LivingStationStyles.spec.ts scripts/smoke-browser.mjs tests/smoke/browser-script.spec.ts README.md
git commit -m "style: guide the first battle without blocking play"
git push origin HEAD:main
```

Verify the GitHub Pages deployment for the pushed SHA succeeds before the next optimization audit.

---

## Self-Review Record

- Spec coverage: ordered actions, trial isolation, skip, persistence, production path, two HUD placements, responsive/reduced-motion behavior, telemetry, browser proof, reset, and release gates each map to a task.
- Placeholder scan: no `TBD`, `TODO`, “implement later”, or unspecified error-handling step remains.
- Type consistency: the same step, prompt, repository, BattleScene callback, and E2E field names are used throughout.
- Scope: this is one independently releasable onboarding subsystem; collection/catalog work remains a separate future batch.
- Execution choice: inline execution is selected because the user delegated decisions and asked not to be queried between batches.
