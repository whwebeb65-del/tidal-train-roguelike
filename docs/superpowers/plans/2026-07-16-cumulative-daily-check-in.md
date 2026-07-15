# Cumulative Daily Check-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, player-friendly seven-day cumulative check-in loop to the station and document the next retention features by priority.

**Architecture:** An engine-independent retention module validates China day IDs, normalizes persisted state, previews the next claim, and grants deterministic rewards. A pure Web view renders the seven cells, while `web/main.ts` owns local persistence, player-currency updates, notices, and telemetry. Cocos exposes only a claim-request event so production time and assets can remain server-authoritative.

**Tech Stack:** TypeScript 5.7, Vitest 2, Vite 5, DOM string rendering, browser `localStorage`, Cocos Creator TypeScript bridge.

## Global Constraints

- A missed day never resets or reduces progress.
- Use China Standard Time natural-day IDs in valid `YYYY-MM-DD` form.
- One account/day claim; reject same-day repeats and dates earlier than the last claim.
- Use only gears, route marks, and star tickets; do not add a fourth currency.
- Seven active days grant exactly 150 gears, 3 route marks, and 2 star tickets.
- Do not add paid make-up claims, ad multipliers, forced ads, or share-to-claim rewards.
- Production time and asset delivery must be server-authoritative; local storage is prototype-only.
- Do not add runtime dependencies.

---

## File Map

- Create `src/domain/retention/DailyCheckInSystem.ts`: state, rewards, validation, normalization, preview, and claim rules.
- Create `tests/domain/retention/DailyCheckInSystem.spec.ts`: complete rule and corruption coverage.
- Create `web/views/DailyCheckInView.ts`: pure seven-cell HTML rendering.
- Create `tests/web/DailyCheckInView.spec.ts`: view-state and copy coverage.
- Modify `web/main.ts`: persistence, rendering, handler, reset, telemetry.
- Modify `web/styles.css`: desktop/mobile layout and visual states.
- Modify `src/telemetry/TelemetryEvents.ts` and `tests/telemetry/TelemetryClient.spec.ts`: claim event contract.
- Create `assets/scripts/retention/DailyCheckInController.ts`: Cocos request-only bridge.
- Create `docs/product/player-feature-roadmap.md`: prioritized retention/collection/social/season/UGC roadmap.
- Modify `README.md`: feature rules and local verification steps.

### Task 1: Daily check-in domain rules

**Files:**
- Create: `src/domain/retention/DailyCheckInSystem.ts`
- Create: `tests/domain/retention/DailyCheckInSystem.spec.ts`

**Interfaces:**
- Consumes: valid China day IDs supplied by the caller.
- Produces: `DAILY_CHECK_IN_REWARDS`, `createDailyCheckInState`, `normalizeDailyCheckInState`, `getDailyCheckInPreview`, `claimDailyCheckIn`, and exported state/reward/result types.

- [ ] **Step 1: Write failing rule tests**

Create tests that assert the exact reward table and these behaviors:

```ts
const first = claimDailyCheckIn(createDailyCheckInState(), '2026-07-16');
expect(first.reward).toEqual({ gears: 20, routeMarks: 0, starTickets: 0 });
expect(first.state).toEqual({
  version: 1,
  cycleNumber: 1,
  cycleClaimCount: 1,
  totalClaims: 1,
  lastClaimDayId: '2026-07-16',
});

const repeat = claimDailyCheckIn(first.state, '2026-07-16');
expect(repeat.accepted).toBe(false);
expect(repeat.reason).toBe('already-claimed');
expect(repeat.reward).toEqual({ gears: 0, routeMarks: 0, starTickets: 0 });

const delayed = claimDailyCheckIn(first.state, '2026-07-20');
expect(delayed.rewardDay).toBe(2);
expect(delayed.reward).toEqual({ gears: 0, routeMarks: 1, starTickets: 0 });
```

Build a seven-date reduce test and assert day seven returns 60 gears plus 1 star ticket, `completedCycle === true`, and total rewards equal `{ gears: 150, routeMarks: 3, starTickets: 2 }`. Claim on an eighth date and assert cycle 2/day 1. Also test malformed dates, an earlier date, invalid persisted counters, null input, and preview states for initial, same-day, and completed-cycle-next-day cases.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/domain/retention/DailyCheckInSystem.spec.ts`

Expected: FAIL because `DailyCheckInSystem.ts` does not exist.

- [ ] **Step 3: Implement the minimal domain module**

Use these public contracts:

```ts
export interface DailyCheckInReward {
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
}

export interface DailyCheckInState {
  readonly version: 1;
  readonly cycleNumber: number;
  readonly cycleClaimCount: number;
  readonly totalClaims: number;
  readonly lastClaimDayId: string | null;
}

export interface DailyCheckInPreview {
  readonly canClaim: boolean;
  readonly reason?: 'already-claimed' | 'day-not-after-last-claim';
  readonly displayCycleNumber: number;
  readonly displayClaimCount: number;
  readonly rewardDay: number;
  readonly reward: DailyCheckInReward;
}
```

Define the rewards in order as `20 gears`, `1 route mark`, `30 gears`, `1 star ticket`, `40 gears`, `2 route marks`, and `60 gears + 1 star ticket`. Validate dates with a regex plus a UTC round trip. A valid persisted state must satisfy `totalClaims === (cycleNumber - 1) * 7 + cycleClaimCount`; zero claims requires `lastClaimDayId === null`, and positive claims require a valid non-null date. Otherwise return the initial state.

`getDailyCheckInPreview` returns a cloned reward. If today equals the last date, return `canClaim: false`; if it is earlier, return `day-not-after-last-claim`. When seven cells were completed and today is later, preview cycle `cycleNumber + 1`, count `0`, reward day `1`. `claimDailyCheckIn` uses the preview, returns zero reward for rejection, and increments total count exactly once on success.

- [ ] **Step 4: Run domain tests and typecheck**

Run: `npm test -- tests/domain/retention/DailyCheckInSystem.spec.ts` and `npm run typecheck`.

Expected: all focused tests PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit the domain slice**

```bash
git add src/domain/retention/DailyCheckInSystem.ts tests/domain/retention/DailyCheckInSystem.spec.ts
git commit -m "feat: add cumulative daily check-in rules"
```

### Task 2: Pure daily check-in view

**Files:**
- Create: `web/views/DailyCheckInView.ts`
- Create: `tests/web/DailyCheckInView.spec.ts`

**Interfaces:**
- Consumes: `DailyCheckInState`, `DAILY_CHECK_IN_REWARDS`, `getDailyCheckInPreview`, and `currentDayId`.
- Produces: `renderDailyCheckIn({ state, currentDayId }): string` with no storage or platform side effects.

- [ ] **Step 1: Write failing view tests**

Assert that the initial view contains `车站值班簿`, `漏签不清零`, seven `daily-check-in-cell` entries, `data-action="claim-daily-check-in"`, and `领取第 1 格`. After a successful first claim on the same date, assert `今日已签到`, a disabled button, and one `claimed` cell. After seven claims on the seventh date, assert `本轮完成` and seven claimed cells. Render that same state on the eighth date and assert `第 2 轮` and `领取第 1 格`.

- [ ] **Step 2: Run the view test and verify RED**

Run: `npm test -- tests/web/DailyCheckInView.spec.ts`

Expected: FAIL because `DailyCheckInView.ts` does not exist.

- [ ] **Step 3: Implement focused rendering**

Render one section with:

```html
<section class="daily-check-in">...</section>
```

Use `claimed`, `current`, `grand`, and `pending` classes. Format rewards without zero-value currencies. For a completed cycle on its claim date, keep showing the completed cycle; only show the next cycle when the date is later and the preview can claim. The action button must be disabled for same-day or rolled-back dates and use explicit Chinese status copy.

- [ ] **Step 4: Run view and domain tests**

Run: `npm test -- tests/web/DailyCheckInView.spec.ts tests/domain/retention/DailyCheckInSystem.spec.ts` and `npm run typecheck`.

Expected: both suites PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit the view slice**

```bash
git add web/views/DailyCheckInView.ts tests/web/DailyCheckInView.spec.ts
git commit -m "feat: add daily check-in station view"
```

### Task 3: Web persistence, rewards, and responsive station integration

**Files:**
- Modify: `web/main.ts`
- Modify: `web/styles.css`

**Interfaces:**
- Consumes: Task 1 rule functions and Task 2 renderer.
- Produces: one local claim flow stored under `tidal-train-daily-checkin-v1` and one `claim-daily-check-in` DOM action.

- [ ] **Step 1: Add state loading and persistence**

Import the domain functions/types and `renderDailyCheckIn`. Add `DAILY_CHECK_IN_SAVE_KEY`, `readDailyCheckInState()`, mutable `dailyCheckInState`, and:

```ts
function commitDailyCheckIn(next: DailyCheckInState): void {
  dailyCheckInState = normalizeDailyCheckInState(next);
  window.localStorage.setItem(DAILY_CHECK_IN_SAVE_KEY, JSON.stringify(dailyCheckInState));
}
```

Malformed JSON must return `createDailyCheckInState()` without touching other saves.

- [ ] **Step 2: Render the panel in the station**

At the start of `renderStation`, compute `currentDayId = getChinaDayId(Date.now())`. Insert `renderDailyCheckIn({ state: dailyCheckInState, currentDayId })` immediately after `.station-footer` and before the daily trial hub.

- [ ] **Step 3: Implement the claim handler**

Call `claimDailyCheckIn(dailyCheckInState, getChinaDayId(Date.now()))`. On rejection, map `already-claimed` to `今日值班奖励已经领取，明天再来。` and clock rollback to `设备日期早于上次签到日期，请校准时间后重试。`. On success, persist state, add all three rewards to `PlayerSave`, show the exact reward in the notice, then render. Task 4 adds the typed success telemetry after registering its event name.

- [ ] **Step 4: Wire actions and reset**

Add `if (action === 'claim-daily-check-in') handleDailyCheckInClaim();`. Extend the reset action to remove `DAILY_CHECK_IN_SAVE_KEY` before reload.

- [ ] **Step 5: Add styles**

Add styles for `.daily-check-in`, heading/status, seven-column grid, cell states, reward marks, and action area. At `max-width: 760px`, use two columns with the seventh cell spanning both columns, make the action full width, and keep all text wrapping within the viewport. Respect the existing reduced-motion block.

- [ ] **Step 6: Run focused tests, typecheck, and build**

Run: `npm test -- tests/domain/retention/DailyCheckInSystem.spec.ts tests/web/DailyCheckInView.spec.ts`, `npm run typecheck`, and `npm run build`.

Expected: tests PASS, TypeScript reports no errors, and Vite writes a successful production build.

- [ ] **Step 7: Commit Web integration**

```bash
git add web/main.ts web/styles.css
git commit -m "feat: integrate persistent daily check-in"
```

### Task 4: Telemetry and Cocos production boundary

**Files:**
- Modify: `src/telemetry/TelemetryEvents.ts`
- Modify: `tests/telemetry/TelemetryClient.spec.ts`
- Create: `assets/scripts/retention/DailyCheckInController.ts`

**Interfaces:**
- Consumes: Web handler success and Cocos UI click.
- Produces: `daily_check_in_claimed` telemetry name and `daily-check-in-claim-requested` Cocos event.

- [ ] **Step 1: Write the telemetry type test first**

Add a test that tracks:

```ts
telemetry.track({
  name: 'daily_check_in_claimed',
  runId: 'station',
  timestampMs: 14,
  payload: { cycleNumber: 1, rewardDay: 1, totalClaims: 1, completedCycle: false },
});
```

Assert the flushed event name is exactly `daily_check_in_claimed`.

- [ ] **Step 2: Add the event name and run the test**

Add the name to `PrototypeEventName`, then run `npm test -- tests/telemetry/TelemetryClient.spec.ts`.

Expected: telemetry tests PASS.

- [ ] **Step 3: Add the Cocos request-only controller**

Create:

```ts
import { _decorator, Component, EventTarget } from 'cc';

const { ccclass } = _decorator;

export interface DailyCheckInPorts {
  onDailyCheckInClaimRequested(): void;
}

@ccclass('DailyCheckInController')
export class DailyCheckInController extends Component implements DailyCheckInPorts {
  public readonly events = new EventTarget();

  public onDailyCheckInClaimRequested(): void {
    this.events.emit('daily-check-in-claim-requested');
  }
}
```

- [ ] **Step 4: Emit typed telemetry from the Web success path**

After both the check-in state and player reward are committed, add:

```ts
track('daily_check_in_claimed', {
  cycleNumber: result.state.cycleNumber,
  rewardDay: result.rewardDay,
  totalClaims: result.state.totalClaims,
  gears: result.reward.gears,
  routeMarks: result.reward.routeMarks,
  starTickets: result.reward.starTickets,
  completedCycle: result.completedCycle,
});
```

Do not emit this event for rejected claims.

- [ ] **Step 5: Verify and commit platform boundaries**

Run: `npm test -- tests/telemetry/TelemetryClient.spec.ts`, `npm run typecheck`, and `git diff --check`.

Expected: all commands succeed.

```bash
git add src/telemetry/TelemetryEvents.ts tests/telemetry/TelemetryClient.spec.ts assets/scripts/retention/DailyCheckInController.ts web/main.ts
git commit -m "feat: expose daily check-in platform bridge"
```

### Task 5: Player roadmap, documentation, and final regression

**Files:**
- Create: `docs/product/player-feature-roadmap.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: implemented feature behavior and official Douyin mini-game policy boundaries.
- Produces: an ordered roadmap and reproducible playtest checklist.

- [ ] **Step 1: Write the roadmap**

Order the proposals as:

1. P1 new-player growth handbook: system guidance and milestone objectives.
2. P1 passenger/module codex and set collection: long-term collection with cosmetic completion rewards.
3. P2 asynchronous legion boss: shared daily damage with server-authoritative settlement.
4. P2 friend assist/ghost train: asynchronous same-seed comparison without synchronous matchmaking.
5. P2 seasonal themed route/pass: deterministic rewards after retention metrics are stable.
6. P3 creator challenge seeds: shareable challenges only after UGC filtering and reporting exist.

For every proposal record player value, target metric, implementation cost, monetization fit, and compliance boundary. Explicitly prohibit rewarded sharing, forced ad blocking, cash rewards, undisclosed paid random draws, and unmoderated UGC.

- [ ] **Step 2: Update README behavior and playtest**

Document the seven rewards, no-reset behavior, storage key, prototype/server boundary, and a manual sequence: reset, claim 20 gears, repeat claim blocked, refresh persistence, mobile width check.

- [ ] **Step 3: Run the complete automated verification**

Run: `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`.

Expected: all test files pass, TypeScript reports no errors, Vite builds successfully, and no whitespace errors are found.

- [ ] **Step 4: Run desktop and mobile browser regression**

Start `npm run dev -- --port 4174`. In the browser, clear local saves, verify the initial header currencies are zero, claim day one, verify gears become 20, verify the button is disabled, refresh, and verify both the 20 gears and claimed state persist. Set viewport to 390 × 844 and assert `document.documentElement.scrollWidth <= window.innerWidth`. Check the console for errors.

- [ ] **Step 5: Commit docs and final audit**

```bash
git add docs/product/player-feature-roadmap.md README.md
git commit -m "docs: add check-in playtest and player roadmap"
git status --short --branch
git log -6 --oneline
```

Expected: the feature branch is clean and the latest commits represent the rule, view, Web integration, platform bridge, and docs slices.

## Plan Self-Review

- Spec coverage: rewards, cumulative progression, idempotency, clock rollback, persistence, responsive UI, telemetry, Cocos boundary, server authority, docs, and browser checks each have an assigned task.
- Scope: only the daily check-in is implemented; independent retention/social/season systems remain roadmap proposals.
- Type consistency: `DailyCheckInState`, `DailyCheckInPreview`, `claimDailyCheckIn`, `renderDailyCheckIn`, `daily_check_in_claimed`, and `daily-check-in-claim-requested` use the same names across tasks.
- Placeholder scan: the plan contains no deferred implementation steps or unspecified error handling.
