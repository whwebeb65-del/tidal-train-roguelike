# Daily Tide Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily fixed-seed trial with rotating combat rules, best-score progression, two deterministic reward milestones, assisted-score marking, and shareable results.

**Architecture:** A new engine-independent domain module owns Shanghai-day calculation, deterministic definitions, scoring, idempotent submissions, rollover, and reward claims. A focused Web view module renders trial markup from view models, while `web/main.ts` orchestrates run mode, persistence, combat modifiers, platform calls, and telemetry. Cocos remains request-only so formal scores and assets can move to a server-authoritative API.

**Tech Stack:** TypeScript 5, Vitest 2, Vite 5, DOM/CSS Web MVP, Cocos Creator TypeScript bridge.

## Global Constraints

- Daily cycles use UTC+8 Shanghai natural dates in `YYYY-MM-DD` format.
- The trial unlocks at station level 2 and has no energy, ticket, or attempt limit.
- Trial runs do not grant normal first-clear rewards, repeat-clear rewards, legion contribution, or interaction currency.
- Assisted runs remain valid but receive a 25-point penalty and are marked assisted.
- Trial sharing never directly grants currency or changes score.
- Only existing gears, route marks, and star tickets may be rewarded.
- Formal date, seed, score, recovery record, run idempotency, milestones, and assets are server-authoritative.
- Web state key is exactly `tidal-train-daily-trial-v1`.
- New trial markup lives in `web/views/DailyTrialView.ts`, not as large inline templates in `web/main.ts`.
- The 390px layout must not create horizontal overflow.

---

### Task 1: Daily trial rules, scoring, rollover, and rewards

**Files:**
- Create: `src/domain/challenge/DailyTrialSystem.ts`
- Create: `tests/domain/challenge/DailyTrialSystem.spec.ts`

**Interfaces:**
- Consumes: immutable state and submission values only.
- Produces: `DAILY_TRIAL_RULES`, `DAILY_TRIAL_MILESTONES`, `getChinaDayId`, `getDailyTrialDefinition`, `createDailyTrialState`, `normalizeDailyTrialState`, `submitDailyTrial`, `claimDailyTrialMilestone`, and exported model types.

- [ ] **Step 1: Write the failing domain tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  claimDailyTrialMilestone,
  createDailyTrialState,
  DAILY_TRIAL_RULES,
  getChinaDayId,
  getDailyTrialDefinition,
  normalizeDailyTrialState,
  submitDailyTrial,
} from '../../../src/domain/challenge/DailyTrialSystem';

describe('DailyTrialSystem', () => {
  it('rolls the Shanghai day at UTC 16:00', () => {
    expect(getChinaDayId(Date.UTC(2026, 6, 15, 15, 59, 59))).toBe('2026-07-15');
    expect(getChinaDayId(Date.UTC(2026, 6, 15, 16, 0, 0))).toBe('2026-07-16');
  });

  it('creates a stable positive seed and rotating rule', () => {
    expect(getDailyTrialDefinition('2026-07-16')).toEqual(getDailyTrialDefinition('2026-07-16'));
    expect(getDailyTrialDefinition('2026-07-16').seed).toBeGreaterThan(0);
    expect(getDailyTrialDefinition('2026-07-17').seed).not.toBe(getDailyTrialDefinition('2026-07-16').seed);
  });

  it('exposes the three exact combat rules', () => {
    expect(DAILY_TRIAL_RULES).toEqual([
      expect.objectContaining({ id: 'armored-current', enemyHpBonus: 20, maxPlayerHpDelta: 0, initialMomentumBonus: 20, damageBonus: 0 }),
      expect.objectContaining({ id: 'glass-express', enemyHpBonus: 10, maxPlayerHpDelta: -20, initialMomentumBonus: 0, damageBonus: 5 }),
      expect.objectContaining({ id: 'rescue-window', enemyHpBonus: 10, maxPlayerHpDelta: 0, initialMomentumBonus: 30, damageBonus: 0 }),
    ]);
  });

  it('scores defeat, victory, remaining hp, and assistance', () => {
    const state = createDailyTrialState('2026-07-16');
    const defeat = submitDailyTrial(state, { runId: 'r1', outcome: 'defeat', completedNodes: 0, remainingHp: 0, assisted: false });
    const victory = submitDailyTrial(defeat.state, { runId: 'r2', outcome: 'victory', completedNodes: 4, remainingHp: 80, assisted: false });
    const assisted = submitDailyTrial(victory.state, { runId: 'r3', outcome: 'victory', completedNodes: 4, remainingHp: 80, assisted: true });
    expect(defeat.score).toBe(20);
    expect(victory.score).toBe(240);
    expect(assisted.score).toBe(215);
    expect(assisted.state.bestScore).toBe(240);
  });

  it('submits one run id once and only raises best score', () => {
    const first = submitDailyTrial(createDailyTrialState('2026-07-16'), { runId: 'same', outcome: 'defeat', completedNodes: 0, remainingHp: 0, assisted: false });
    const duplicate = submitDailyTrial(first.state, { runId: 'same', outcome: 'victory', completedNodes: 4, remainingHp: 100, assisted: false });
    expect(duplicate).toMatchObject({ accepted: false, reason: 'run-already-submitted', score: 0 });
    expect(duplicate.state).toEqual(first.state);
  });

  it('claims participation and mastery once at their thresholds', () => {
    const participationState = submitDailyTrial(createDailyTrialState('2026-07-16'), { runId: 'r1', outcome: 'defeat', completedNodes: 0, remainingHp: 0, assisted: false }).state;
    const participation = claimDailyTrialMilestone(participationState, 'participation');
    expect(participation.reward).toEqual({ gears: 30, routeMarks: 0, starTickets: 0 });
    expect(claimDailyTrialMilestone(participation.state, 'participation').reason).toBe('already-claimed');
    expect(claimDailyTrialMilestone(participation.state, 'mastery').reason).toBe('threshold-not-reached');
  });

  it('resets stale days and sanitizes malformed state', () => {
    const normalized = normalizeDailyTrialState({ version: 1, dayId: '2026-07-15', attempts: 9, bestScore: 999 }, '2026-07-16');
    expect(normalized).toEqual(createDailyTrialState('2026-07-16'));
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/domain/challenge/DailyTrialSystem.spec.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the exact domain model and formulas**

```ts
export type DailyTrialRuleId = 'armored-current' | 'glass-express' | 'rescue-window';
export type DailyTrialMilestoneId = 'participation' | 'mastery';
export type DailyTrialOutcome = 'victory' | 'extract' | 'defeat';
export interface DailyTrialReward { readonly gears: number; readonly routeMarks: number; readonly starTickets: number }
export interface DailyTrialRule { readonly id: DailyTrialRuleId; readonly name: string; readonly description: string; readonly enemyHpBonus: number; readonly maxPlayerHpDelta: number; readonly initialMomentumBonus: number; readonly damageBonus: number }
export interface DailyTrialDefinition { readonly dayId: string; readonly seed: number; readonly rule: DailyTrialRule }
export interface DailyTrialState { readonly version: 1; readonly dayId: string; readonly attempts: number; readonly bestScore: number; readonly submittedRunIds: readonly string[]; readonly claimedMilestoneIds: readonly DailyTrialMilestoneId[] }
export interface DailyTrialSubmissionInput { readonly runId: string; readonly outcome: DailyTrialOutcome; readonly completedNodes: number; readonly remainingHp: number; readonly assisted: boolean }
export interface DailyTrialSubmissionResult { readonly accepted: boolean; readonly reason?: 'run-already-submitted'; readonly score: number; readonly improved: boolean; readonly assisted: boolean; readonly state: DailyTrialState }
export interface DailyTrialClaimResult { readonly accepted: boolean; readonly reason?: 'threshold-not-reached' | 'already-claimed' | 'unknown-milestone'; readonly reward: DailyTrialReward; readonly state: DailyTrialState }
```

Use `new Date(timestampMs + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)` after validating a finite timestamp. Validate day IDs with `/^\d{4}-\d{2}-\d{2}$/` and a real UTC calendar round-trip. Use an FNV-style unsigned hash and calculate `seed = hash % 999999 + 1`, `rule = DAILY_TRIAL_RULES[hash % 3]`.

Use exact score code:

```ts
const base = { victory: 120, extract: 70, defeat: 20 }[input.outcome];
const raw = base + input.completedNodes * 20 + Math.floor(Math.min(input.remainingHp, 100) / 2);
const score = Math.max(20, raw - (input.assisted ? 25 : 0));
```

Milestones are `participation` at 20 for 30 gears and `mastery` at 180 for 2 route marks. Failed claims return zero reward. Duplicate submissions return score 0 and a cloned state.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/domain/challenge/DailyTrialSystem.spec.ts`

Expected: all daily trial tests pass.

- [ ] **Step 5: Commit domain rules**

```powershell
git add src/domain/challenge/DailyTrialSystem.ts tests/domain/challenge/DailyTrialSystem.spec.ts
git commit -m "feat: add daily tide trial rules"
```

### Task 2: Focused daily trial Web views

**Files:**
- Create: `web/views/DailyTrialView.ts`
- Create: `tests/web/DailyTrialView.spec.ts`

**Interfaces:**
- Consumes: `DailyTrialDefinition`, `DailyTrialState`, milestone definitions, and explicit view-model values.
- Produces: `renderDailyTrialHub`, `renderDailyTrialRunBanner`, and `renderDailyTrialSettlement` HTML strings without storage or platform side effects.

- [ ] **Step 1: Write failing rendering tests**

Test these exact behaviors:

```ts
expect(renderDailyTrialHub({ stationLevel: 1, state, definition })).toContain('车站 Lv.2 开放');
expect(renderDailyTrialHub({ stationLevel: 2, state, definition })).toContain('开始今日试炼');
expect(renderDailyTrialRunBanner({ definition })).toContain(definition.rule.name);
expect(renderDailyTrialSettlement({ score: 20, bestScore: 20, attempts: 1, improved: true, assisted: false, sharePending: false })).toContain('分享同种子试炼');
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/web/DailyTrialView.spec.ts`

Expected: FAIL because `DailyTrialView.ts` does not exist.

- [ ] **Step 3: Implement pure render functions**

The hub must render `DAILY / <dayId>`, seed, rule name/description, attempts, best score, both milestone progress and buttons with `data-action="claim-daily-trial"`, plus a start button `data-action="start-daily-trial"`. Lv.1 renders the same preview with a disabled `车站 Lv.2 开放` button.

The run banner renders rule values as compact chips. The settlement renders score, best score, attempt count, `刷新最佳` when improved, `救援成绩 · -25` when assisted, a share button `data-action="share-daily-trial"`, and `回到车站`.

- [ ] **Step 4: Verify GREEN and typecheck**

Run: `npm test -- tests/web/DailyTrialView.spec.ts` and `npm run typecheck`.

Expected: both pass.

- [ ] **Step 5: Commit focused views**

```powershell
git add web/views/DailyTrialView.ts tests/web/DailyTrialView.spec.ts
git commit -m "feat: add daily trial view components"
```

### Task 3: Web run-mode, combat, persistence, score, and rewards

**Files:**
- Modify: `web/main.ts`
- Modify: `web/styles.css`

**Interfaces:**
- Consumes: Task 1 rules and Task 2 renderers.
- Produces: complete playable daily-trial Web flow.

- [ ] **Step 1: Add persistent daily state and run state**

Add `DAILY_TRIAL_SAVE_KEY`, `readDailyTrialState`, `commitDailyTrial`, and:

```ts
let dailyTrialState = readDailyTrialState();
let runMode: 'normal' | 'daily-trial' = 'normal';
let lastDailySubmission: DailyTrialSubmissionResult | null = null;
let dailyTrialSharePending = false;
```

Create `syncDailyTrialDay()` that normalizes against `getChinaDayId(Date.now())`, persists only on rollover, and returns `getDailyTrialDefinition(state.dayId)`.

- [ ] **Step 2: Render the station hub and daily run context**

Insert `renderDailyTrialHub(...)` after the station footer and before the founder center. In combat and boss scenes, insert `renderDailyTrialRunBanner(...)` only when `runMode === 'daily-trial'`. Replace the interaction cards with a fairness note during daily runs.

- [ ] **Step 3: Start normal and daily runs with distinct seeds**

Change `startRun(mode: 'normal' | 'daily-trial' = 'normal')`. Daily mode rejects station levels below 2, uses the daily seed, and sets notice copy with date and rule. Normal mode keeps random seeds. Register `start-daily-trial` and keep the existing `start-run` normal.

- [ ] **Step 4: Apply trial rules to battle state and action damage**

In `resetBattleState`, combine squad bonuses with the active daily rule:

```ts
enemyHp: baseEnemyHp + rule.enemyHpBonus
maxPlayerHp: Math.max(1, 100 + squad.maxPlayerHpBonus + rule.maxPlayerHpDelta)
initialMomentum: Math.min(100, squad.initialMomentum + rule.initialMomentumBonus)
```

Use `squad.damageBonus + rule.damageBonus` in both action labels and `resolveCombatAction` options. Normal runs use zero-valued trial bonuses.

- [ ] **Step 5: Submit daily score without normal rewards**

At the beginning of `settleRun`, branch daily mode to `settleDailyTrial(victory)`. Submit:

```ts
{
  runId,
  outcome: victory ? 'victory' : 'defeat',
  completedNodes: combatClears + (victory ? 1 : 0),
  remainingHp: victory ? battleState.playerHp : 0,
  assisted: recoveryState.adReviveUsed || recoveryState.shareReviveUsed,
}
```

Persist the returned state, store the result, render the daily settlement, and do not call first-clear or expedition functions.

- [ ] **Step 6: Add milestone claim and share handlers**

`handleClaimDailyTrial(milestoneId)` applies accepted rewards to `PlayerSave`, persists state, and maps threshold/duplicate/unknown errors to Chinese copy. `handleShareDailyTrial()` uses `shareType: 'daily-trial'`, the daily seed, rule ID, best score in `depth`, and no direct reward.

- [ ] **Step 7: Clear daily state and style all breakpoints**

Remove `DAILY_TRIAL_SAVE_KEY` in the reset branch. Add `.daily-trial-hub`, `.daily-trial-heading`, `.daily-trial-rule`, `.daily-trial-stats`, `.daily-trial-milestones`, `.daily-trial-banner`, and `.daily-trial-settlement` styles. At 760px, use one column and full-width actions.

- [ ] **Step 8: Run full tests, typecheck, and build**

Run: `npm test`, `npm run typecheck`, `npm run build`.

Expected: all exit 0.

- [ ] **Step 9: Commit the playable daily trial**

```powershell
git add web/main.ts web/styles.css
git commit -m "feat: integrate playable daily tide trial"
```

### Task 4: Platform contract, telemetry, and Cocos bridge

**Files:**
- Modify: `src/platform/PlatformContracts.ts`
- Modify: `src/telemetry/TelemetryEvents.ts`
- Modify: `tests/telemetry/TelemetryClient.spec.ts`
- Modify: `web/main.ts`
- Create: `assets/scripts/challenge/DailyTrialController.ts`

**Interfaces:**
- Consumes: Web daily-trial outcomes and platform share results.
- Produces: typed analytics, `daily-trial` share payloads, and request-only Cocos events.

- [ ] **Step 1: Extend typed events and share payload**

Add `daily-trial` to `SharePayload.shareType` and add:

```ts
| 'daily_trial_started'
| 'daily_trial_submitted'
| 'daily_trial_reward_claimed'
| 'daily_trial_shared'
```

Extend telemetry tests to record and flush all four names.

- [ ] **Step 2: Track Web lifecycle events**

Start records `dayId`, `seed`, `ruleId`; submit records `outcome`, `score`, `bestScore`, `assisted`; reward records milestone and reward currencies; share records result, seed, and best score.

- [ ] **Step 3: Add request-only Cocos controller**

Create methods and an `EventTarget` matching project conventions:

```ts
onDailyTrialStartRequested(): void
onDailyTrialSubmitRequested(runId: string): void
onDailyTrialRewardClaimRequested(milestoneId: DailyTrialMilestoneId): void
onDailyTrialShareRequested(): void
```

Emit `daily-trial-start-requested`, `daily-trial-submit-requested`, `daily-trial-reward-claim-requested`, and `daily-trial-share-requested`. Do not calculate rewards in Cocos.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/telemetry/TelemetryClient.spec.ts`, `npm run typecheck`, `git diff --check`.

Then commit:

```powershell
git add src/platform/PlatformContracts.ts src/telemetry/TelemetryEvents.ts tests/telemetry/TelemetryClient.spec.ts web/main.ts assets/scripts/challenge/DailyTrialController.ts
git commit -m "feat: expose daily trial platform bridge"
```

### Task 5: Documentation and final regression

**Files:**
- Modify: `README.md`
- Modify: `docs/testing/prototype-playtest-script.md`

**Interfaces:**
- Consumes: completed implementation.
- Produces: accurate operating and validation instructions.

- [ ] **Step 1: Document player value and formal-server limits**

Add Lv.2 unlock, daily seed/rules, score formula, two milestones, no ordinary rewards, assisted penalty, share behavior, storage key, and server-authoritative limits to README.

- [ ] **Step 2: Add deterministic playtest steps**

Document: clear save; claim launch gift; upgrade to Lv.2; record day/seed/rule; start trial; verify applied stats and hidden interaction currency; fail without revival; confirm score 20; return and claim 30 gears; repeat claim; refresh persistence; share without wallet change; check 390px.

- [ ] **Step 3: Run full automated verification**

Run in parallel:

```powershell
npm test
npm run typecheck
npm run build
git diff --check
```

- [ ] **Step 4: Run desktop and 390x844 browser regression**

Verify the exact playtest path, stable daily definition across refresh, no ordinary trial rewards, idempotent milestone claim, share without currency, responsive layout, and zero console errors.

- [ ] **Step 5: Commit and audit the branch**

```powershell
git add README.md docs/testing/prototype-playtest-script.md
git commit -m "docs: add daily tide trial playtest"
git status --short
```

Expected: clean worktree.
