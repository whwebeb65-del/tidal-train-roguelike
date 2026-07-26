# Progression Runtime and QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire progression, stamina, battle speed, settlement, telemetry, station presentation, and full regression verification into one idempotent playable flow.

**Architecture:** Runtime takes a frozen progression snapshot at run start, consumes stamina only after battle preparation succeeds, and settles skill/account rewards once through the existing settlement adapter. A small rate controller converts real fixed ticks into 1×/1.5×/2×/3× world steps while UI countdowns remain real-time. Settings version 2 persists only the preferred speed and clamps it to the current account unlock.

**Tech Stack:** TypeScript, Vitest, Vite, existing legacy runtime bridge, localStorage repositories, browser smoke/E2E scripts.

**Execution Order:** Plan 4 of 4. Complete the progression foundation, battle core, and HUD/art plans first.

## Global Constraints

- Normal run costs 5 stamina; failed preparation and local abort cost 0.
- Daily trial cost remains 0 unless a future spec changes it.
- Stamina-spend account XP is granted exactly once with the successful consume.
- Kill and first-clear account XP and skill mastery settle once on both victory/defeat as specified.
- A current run uses a frozen mastery multiplier and unlocked-variant snapshot.
- World simulation, enemies, projectiles, cooldowns, shields, waves, and effects scale together; HUD timers, selection timeout, ads, and audio pitch do not.
- Stored illegal speed is clamped and persisted.
- Active foreground time at 1× is below 10 minutes; simulation hard cap is 480,000 ms.
- No release until all unit, type, asset, build, smoke, audit, diff, visual, and speed-equivalence gates pass.

---

## File Structure

- Modify `web/app/SettingsRepository.ts`, `SettingsPanelView.ts`, and tests for settings v2.
- Create `web/battle/SimulationRateController.ts` and tests.
- Modify `BattleScene.ts`, `BattleHUD.ts`, `LegacyGameRuntime.ts`, and `BattleRunInputFactory.ts`.
- Modify station/app-shell view models and settlement presentation for account/stamina/mastery feedback.
- Extend telemetry types/client tests and E2E snapshots.
- Add deterministic 20-level/8-minute and speed-equivalence integration tests.

### Task 1: Settings Version 2 and Preferred Battle Speed

**Files:**
- Modify: `web/app/SettingsRepository.ts`
- Modify: `web/app/GameApp.ts`
- Modify: `web/views/SettingsPanelView.ts`
- Modify: `tests/web/SettingsRepository.spec.ts`
- Modify: `tests/web/SettingsPanelView.spec.ts`

**Interfaces:**
- Consumes `BattleSpeed`.
- Produces `GameSettings.version: 2` and `preferredBattleSpeed`.

- [ ] **Step 1: Write failing migration and normalization tests**

```ts
it('migrates version one settings with a one-times speed default', () => {
  expect(normalizeGameSettings({
    version: 1,
    musicEnabled: false,
    sfxEnabled: true,
    reducedMotion: false,
    qualityPreference: 'high',
  })).toMatchObject({
    version: 2,
    musicEnabled: false,
    preferredBattleSpeed: 1,
  });
});

it('accepts only supported battle speeds', () => {
  expect(normalizeGameSettings({
    ...defaultGameSettings(),
    preferredBattleSpeed: 3,
  }).preferredBattleSpeed).toBe(3);
  expect(normalizeGameSettings({
    ...defaultGameSettings(),
    preferredBattleSpeed: 9,
  }).preferredBattleSpeed).toBe(1);
});
```

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/web/SettingsRepository.spec.ts tests/web/SettingsPanelView.spec.ts`

Expected: FAIL because settings are version 1 and have no speed.

- [ ] **Step 3: Implement settings v2 migration**

Change storage key to `tidal-train-settings-v2`, read the old key when the new key is absent, normalize versions 1 and 2, and write only version 2. Update `GameApp.updateSettings()` to stamp `version: 2`. Add:

```ts
readonly preferredBattleSpeed: BattleSpeed;
```

with default `1`. Do not expose locked speeds in the general settings panel; the in-battle control owns cycling.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- tests/web/SettingsRepository.spec.ts tests/web/SettingsPanelView.spec.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/SettingsRepository.ts web/app/GameApp.ts web/views/SettingsPanelView.ts tests/web
git commit -m "feat: persist preferred battle speed"
```

### Task 2: Deterministic Simulation Rate Controller

**Files:**
- Create: `web/battle/SimulationRateController.ts`
- Create: `tests/web/battle/SimulationRateController.spec.ts`
- Modify: `web/scenes/BattleScene.ts`
- Modify: `tests/web/battle/BattleScene.spec.ts`

**Interfaces:**
- Produces `SimulationRateController.setSpeed()`, `.consume(realStepMs, updateWorld)` and scene dependencies `initialBattleSpeed`, `availableBattleSpeeds`, `onBattleSpeedChanged`.

- [ ] **Step 1: Write failing fractional-rate tests**

```ts
it.each([1, 1.5, 2, 3] as const)(
  'emits fixed world steps totaling %sx simulated time',
  (speed) => {
    const controller = new SimulationRateController(FIXED_STEP_MS, speed);
    let simulated = 0;
    for (let i = 0; i < 120; i += 1) {
      controller.consume(FIXED_STEP_MS, (step) => {
        expect(step).toBe(FIXED_STEP_MS);
        simulated += step;
      });
    }
    expect(simulated).toBeCloseTo(120 * FIXED_STEP_MS * speed, 5);
  },
);
```

Add a test that 1.5× alternates fixed steps without ever passing a 25 ms step into the engine.

Add a `BattleScene` fake-timer test: when an upgrade offer remains open for 5,999 ms no choice occurs; at 6,000 ms the first legal card is selected once with source `timeout`; changing world speed to 3× does not shorten this real-time deadline.

- [ ] **Step 2: Run focused test**

Run: `npm test -- tests/web/battle/SimulationRateController.spec.ts`

Expected: FAIL because the controller is missing.

- [ ] **Step 3: Implement fixed-step accumulation**

```ts
export class SimulationRateController {
  private remainderMs = 0;
  public constructor(
    private readonly fixedStepMs: number,
    private speed: BattleSpeed = 1,
  ) {}
  public setSpeed(speed: BattleSpeed): void {
    this.speed = speed;
  }
  public consume(realStepMs: number, updateWorld: (stepMs: number) => void): void {
    this.remainderMs += realStepMs * this.speed;
    while (this.remainderMs + Number.EPSILON >= this.fixedStepMs) {
      updateWorld(this.fixedStepMs);
      this.remainderMs -= this.fixedStepMs;
    }
  }
}
```

- [ ] **Step 4: Integrate it into `BattleScene`**

Wrap only `updateBattle(FIXED_STEP_MS)` with the rate controller. Keep HUD timers unscaled. Add scene methods `setBattleSpeed()` and model options for current/available speeds. Preserve accumulator across speed changes; reset it on mount/unmount.

Extend `BattleSceneDependencies` with:

```ts
readonly initialBattleSpeed: BattleSpeed;
readonly availableBattleSpeeds: readonly BattleSpeed[];
readonly onBattleSpeedChanged: (speed: BattleSpeed) => void;
readonly monotonicNowMs?: () => number;
```

The HUD callback rejects values outside `availableBattleSpeeds`, updates the controller/model, and invokes `onBattleSpeedChanged()` only after acceptance. The runtime callback persists `preferredBattleSpeed` through `settingsBridge.updateSettings()` and emits telemetry.

When `upgrade-offered` is drained, schedule a real-time 6,000 ms timer:

```ts
this.upgradeChoiceTimerId = this.timerScheduler.set(() => {
  this.upgradeChoiceTimerId = null;
  const first = this.dependencies.engine.frame.offeredUpgradeIds[0];
  if (first) this.acceptUpgrade(first, 'timeout');
}, 6000);
```

Manual choice calls the same `acceptUpgrade(id, 'manual')` helper and clears the timer. Reroll replaces the cards without restarting the deadline. Unmount, settlement, and accepted choice clear the timer exactly once. Visibility pause stores the remaining delay using an injected monotonic clock, clears the timer, and resumes with that remaining delay when the page becomes visible; hidden time therefore does not consume the six-second choice budget.

- [ ] **Step 5: Run scene tests and commit**

Run: `npm test -- tests/web/battle/SimulationRateController.spec.ts tests/web/battle/BattleScene.spec.ts tests/web/battle/FixedStepLoop.spec.ts`

Expected: PASS.

```bash
git add web/battle/SimulationRateController.ts web/scenes/BattleScene.ts tests/web/battle
git commit -m "feat: add deterministic battle speed scaling"
```

### Task 3: Frozen Run Progression Input and Stamina Consumption

**Files:**
- Modify: `web/battle/BattleRunInputFactory.ts`
- Modify: `tests/web/battle/BattleRunInputFactory.spec.ts`
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `tests/web/GameApp.spec.ts`

**Interfaces:**
- Consumes save v4, mastery system, stamina system, account speed unlocks.
- Produces a `BattleRunInput` frozen mastery/variant snapshot and `activeRunStaminaSpent`.

- [ ] **Step 1: Add failing run-input snapshot test**

```ts
expect(createBattleRunInput({
  ...baseInput,
  skillMasteryXp: {
    'tidal-volley': 20,
    'bubble-barrier': 0,
    'extreme-tide': Number.MAX_SAFE_INTEGER,
  },
})).toMatchObject({
  skillMasteryPower: {
    'tidal-volley': 1.0075,
    'bubble-barrier': 1,
    'extreme-tide': 1.1425,
  },
});
expect(result.unlockedSkillVariants).toContain('double-crest');
```

Add runtime tests that local abort and asset failure do not spend stamina; ready normal start spends exactly 5; daily trial spends 0; insufficient stamina stays at station.

Add a clock-injected station-sync test that 20 stamina last updated 20 minutes ago is displayed and saved as 22 while preserving the next partial-regeneration baseline.

Add a start test where account Lv.9 has stored 3× and is clamped/persisted to 1×, while Lv.20 starts at stored 2× and exposes `[1, 1.5, 2]`.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/web/battle/BattleRunInputFactory.spec.ts tests/web/GameApp.spec.ts`

Expected: FAIL because run input and runtime do not know mastery/stamina.

- [ ] **Step 3: Freeze mastery data in the run input**

Accept `skillMasteryXp`, derive levels, permanent multipliers, and the union of unlocked variants. Copy every returned record/array.

- [ ] **Step 4: Consume stamina after preparation succeeds**

Add an injectable `nowMs: () => number` runtime dependency defaulting to `Date.now`. At station sync, call `recoverStamina()` and commit only when stamina or its baseline changes. After `preparation.status === 'ready'`, call `spendNormalRunStamina()` only for normal mode. On failure show `还需要 5 点体力才能发车。`. On success capture `activeRunAccountStart`, build a candidate save containing the stamina deduction and 50 account XP, create `BattleRunInput` and `BattleEngine` from that candidate, then commit the candidate only after engine construction succeeds. Record `activeRunStaminaSpent = 5`. This prevents constructor failure from consuming stamina and lets a level gained from the spend unlock speed for the new run.

At battle-scene creation derive:

```ts
const speeds = availableBattleSpeeds(save.accountLevel);
const preferred = settingsBridge.getSettings().preferredBattleSpeed;
const initialBattleSpeed = speeds.includes(preferred)
  ? preferred
  : maximumBattleSpeed(save.accountLevel);
if (initialBattleSpeed !== preferred) {
  settingsBridge.updateSettings({ preferredBattleSpeed: initialBattleSpeed });
}
```

Pass `initialBattleSpeed`, `speeds`, and the persistence callback into `BattleScene`.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/web/battle/BattleRunInputFactory.spec.ts tests/web/GameApp.spec.ts tests/save/SaveRepository.spec.ts`

Expected: PASS.

```bash
git add web/battle/BattleRunInputFactory.ts web/LegacyGameRuntime.ts tests/web
git commit -m "feat: consume stamina and freeze run progression"
```

### Task 4: Idempotent Skill and Account Settlement

**Files:**
- Modify: `web/battle/BattleTypes.ts`
- Modify: `web/battle/BattleEngine.ts`
- Modify: `web/app/AppTypes.ts`
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `tests/web/battle/BattleIntegration.spec.ts`
- Modify: `tests/web/BattleSettlementAdapter.spec.ts`

**Interfaces:**
- Outcome adds `killCounts`, `skillCastCounts`, `hardCapReached`.
- Settlement presentation adds account/mastery result summaries.

- [ ] **Step 1: Add failing outcome and duplicate-settlement tests**

```ts
expect(outcome.killCounts).toEqual({
  normal: expect.any(Number),
  elite: expect.any(Number),
  boss: expect.any(Number),
});
expect(outcome.skillCastCounts['tidal-volley']).toBe(2);
```

Call `settleBattleOutcome(outcome)` twice and assert account XP, mastery XP, and first-clear bonus are persisted once.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/web/battle/BattleIntegration.spec.ts tests/web/BattleSettlementAdapter.spec.ts`

Expected: FAIL because the outcome lacks progression summaries.

- [ ] **Step 3: Record engine summaries**

Increment skill cast counts only when `useSkill()` succeeds. Increment normal/elite/Boss kill buckets in the authoritative kill path. Copy these records into `BattleOutcome`; set `hardCapReached` only for the 480,000 ms failure.

- [ ] **Step 4: Settle through the existing adapter once**

For normal victory and defeat, call `settleSkillMastery()`. Calculate account kill/first-clear XP with `staminaSpent: 0` because spend XP was already granted at launch. Apply both results in the same `commit()` as currency/first-clear changes. The reader-facing settlement breakdown includes the recorded 50 stamina XP plus kill/first-clear XP and compares the final account state with `activeRunAccountStart`; it must not grant the 50 a second time. Preserve the adapter’s cached presentation so a duplicate callback performs no domain mutation.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/web/battle/BattleIntegration.spec.ts tests/web/BattleSettlementAdapter.spec.ts tests/domain/progression`

Expected: PASS.

```bash
git add web/battle/BattleTypes.ts web/battle/BattleEngine.ts web/app/AppTypes.ts web/LegacyGameRuntime.ts tests
git commit -m "feat: settle account and skill progression once"
```

### Task 5: Station and Settlement Progression Presentation

**Files:**
- Modify: `web/app/AppShell.ts`
- Modify: `web/views/StationHeroView.ts`
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `web/styles/app-shell-v2.css`
- Modify: `web/styles/handdrawn-station.css`
- Modify: `tests/web/AppShell.spec.ts`
- Modify: `tests/web/StationHeroView.spec.ts`

**Interfaces:**
- Consumes account level/xp, stamina state, next speed unlock, mastery settlement.

- [ ] **Step 1: Add failing presentation tests**

Assert the station/app shell shows `账号 Lv.`, current/next account XP, `体力 25 / 30`, and `下一倍速：Lv.20 · 2×`. Assert settlement lists account XP gained and each used skill’s mastery gain/level-up without adding a new modal.

- [ ] **Step 2: Run view tests**

Run: `npm test -- tests/web/AppShell.spec.ts tests/web/StationHeroView.spec.ts`

Expected: FAIL because account and stamina are absent.

- [ ] **Step 3: Extend view models and copy**

Add a compact torn-ticket strip beneath the existing station identity containing account level/XP, stamina, and next speed unlock. Keep the existing station-level stamp separate. In settlement add two compact rows beneath currencies: account progression and skill mastery progression.

- [ ] **Step 4: Add hand-drawn responsive styles**

Use existing navy ink, warm paper, coral stamp, and minimum 44 px interactive controls. At 360 px collapse XP detail to `Lv.N · X%` while keeping stamina and next unlock accessible via `aria-label`.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/web/AppShell.spec.ts tests/web/StationHeroView.spec.ts tests/web/battle/BattleHUD.spec.ts`

Expected: PASS.

```bash
git add web/app/AppShell.ts web/views/StationHeroView.ts web/LegacyGameRuntime.ts web/styles tests/web
git commit -m "feat: show account stamina and mastery progression"
```

### Task 6: Telemetry and E2E Observability

**Files:**
- Modify: `src/telemetry/TelemetryEvents.ts`
- Modify: `tests/telemetry/TelemetryClient.spec.ts`
- Modify: `web/battle/BattleE2EHooks.ts`
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `tests/web/battle/BattleE2EHooks.spec.ts`

**Interfaces:**
- Produces the eight approved progression/speed telemetry names and E2E snapshot fields.

- [ ] **Step 1: Add failing event-name and snapshot tests**

Add exact event names:

```ts
'run_level_reached'
'upgrade_selected'
'skill_rank_changed'
'skill_variant_acquired'
'skill_mastery_settled'
'account_xp_settled'
'battle_speed_changed'
'battle_hard_cap_reached'
```

E2E snapshot must expose run level, ranks, variants, speed, account level/xp, stamina, and hard-cap status without exposing direct personal data.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/telemetry/TelemetryClient.spec.ts tests/web/battle/BattleE2EHooks.spec.ts`

Expected: FAIL because events and fields are missing.

- [ ] **Step 3: Emit idempotent runtime events**

Track level/rank/variant from drained engine events; speed on accepted changes; mastery/account only from the first accepted settlement; hard cap only from the authoritative engine event. Payloads use primitive values only.

- [ ] **Step 4: Extend clone/snapshot helpers**

Deep-copy ranks, variants, kill counts, and cast counts. Add E2E method to set any currently unlocked speed and return false for locked speeds.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/telemetry/TelemetryClient.spec.ts tests/web/battle/BattleE2EHooks.spec.ts tests/web/battle/BattleIntegration.spec.ts`

Expected: PASS.

```bash
git add src/telemetry web/battle/BattleE2EHooks.ts web/LegacyGameRuntime.ts tests
git commit -m "feat: observe battle progression and speed"
```

### Task 7: Fixed-Seed Equivalence, Ten-Minute Gate, and Release Verification

**Files:**
- Create: `tests/web/battle/BattleSpeedEquivalence.spec.ts`
- Create: `tests/web/battle/TwentyLevelRun.spec.ts`
- Modify: `scripts/smoke-browser.mjs`
- Modify: `tests/smoke/browser-script.spec.ts`
- Create: `.superpowers/sdd/battle-progression-qa/` screenshots during execution; do not commit this directory.

**Interfaces:**
- Consumes all prior plans.
- Produces release evidence only.

- [ ] **Step 1: Add failing deterministic equivalence test**

Run the same fixed seed and scripted choices at 1×, 1.5×, 2×, and 3×. Compare outcome, kills, HP, energy, levels, ranks, variants, and emitted reward-relevant events. Ignore presentation timestamps only.

- [ ] **Step 2: Add the full-run timing test**

Advance a normal first-map run, selecting the first legal card at every offer. Assert 19 selections, Lv.20 before/around Boss, simulation ends by 480,000 ms, and active foreground budget is at most `480_000 + 19 * 6_000 = 594_000` ms.

- [ ] **Step 3: Run all automated gates**

Run:

```bash
npm test
npm run typecheck
npm run check:assets
npm run build
npm run smoke:browser
npm audit --audit-level=high
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Perform mobile visual QA**

Capture 360×800, 390×844, 412×915, and 430×932 at Rank 1, Rank 3, Rank 5, two variants, cooldown, ready, Boss, pause, upgrade, victory, and defeat. Verify top HUD bottom ≤108 logical pixels, 12-pixel enemy gap, 56-pixel skill targets, no horizontal overflow, no Unicode icons, and readable grayscale silhouettes.

- [ ] **Step 5: Commit the final verification changes**

```bash
git add tests/web/battle/BattleSpeedEquivalence.spec.ts tests/web/battle/TwentyLevelRun.spec.ts scripts/smoke-browser.mjs tests/smoke/browser-script.spec.ts
git commit -m "test: verify twenty-level battles across speed tiers"
```
