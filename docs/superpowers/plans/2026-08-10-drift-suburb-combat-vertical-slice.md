# Drift Suburb Combat Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Drift Suburb into a deterministic ten-minute combat vertical slice with three role-driven enemies, readable elite and boss mechanics, and stronger audiovisual feedback.

**Architecture:** Keep `BattleEngine` authoritative and fixed-step. Put deterministic behaviour decisions in a focused `EnemyBehaviourSystem`, declare all tuning in `BattleConfig`, and expose semantic events/state to the existing renderer, effects, and audio adapters. No behaviour may depend on wall-clock time or visual assets.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, Web Audio, Vite, Chrome CDP smoke tests.

## Global Constraints

- Preserve the existing 20-level/19-choice run, progression, stamina, speed unlock, save, and settlement rules.
- Preserve exact deterministic equivalence at 1×, 1.5×, 2×, and 3×.
- Keep the hard battle cap at ten simulated minutes or less.
- Keep all interaction targets and warnings readable at 360, 390, 412, and 430 CSS pixels.
- New runtime image assets must total no more than 450KB; missing assets cannot break simulation or input.
- Use RED→GREEN TDD for every production behaviour change.

---

### Task 1: Enemy vocabulary and deterministic wave schedule

**Files:**
- Modify: `web/battle/BattleTypes.ts`
- Modify: `web/battle/BattleConfig.ts`
- Modify: `web/battle/EnemyGeometry.ts`
- Modify: `web/battle/WaveScheduler.ts`
- Test: `tests/web/battle/WaveScheduler.spec.ts`
- Test: `tests/web/battle/EnemyGeometry.spec.ts`

**Interfaces:**
- Produces enemy IDs `tide-shell-hatchling`, `lantern-ray`, and `tide-parasite-snail` in `EnemyKind`.
- Produces a schedule whose `SpawnInstruction.kind` accepts every non-elite/non-boss kind.

- [ ] **Step 1: Write failing catalog and timing tests**

Add assertions that all three new kinds have config, geometry, labels, safe spawn positions, and appear only in their intended time windows. Assert total scheduled experience remains at least `EXPERIENCE_THRESHOLDS.at(-1) * 1.08 / 0.9`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/web/battle/WaveScheduler.spec.ts tests/web/battle/EnemyGeometry.spec.ts`

Expected: failures for missing enemy union members/config/geometry and absent wave entries.

- [ ] **Step 3: Add minimal types, tuning, geometry, labels, and schedule**

Use explicit config entries and distribute enemies as follows: hatchlings from wave 1, lantern rays from wave 3, parasite snails from wave 5. Rebalance existing counts so the scheduler stays within the existing pool/performance envelope while preserving the experience floor.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- tests/web/battle/WaveScheduler.spec.ts tests/web/battle/EnemyGeometry.spec.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit and push**

Commit: `feat: add drift suburb enemy roles`

Push: `git push origin HEAD:main`

### Task 2: Deterministic enemy behaviour system

**Files:**
- Create: `web/battle/EnemyBehaviourSystem.ts`
- Create: `tests/web/battle/EnemyBehaviourSystem.spec.ts`
- Modify: `web/battle/BattleTypes.ts`
- Modify: `web/battle/BattleEngine.ts`
- Test: `tests/web/battle/BattleIntegration.spec.ts`
- Test: `tests/web/battle/BattleSpeedEquivalence.spec.ts`

**Interfaces:**
- Produces `advanceEnemyBehaviour(input): EnemyBehaviourIntent` as a pure function.
- `EnemyBehaviourIntent` may request lane movement, ranged charge/fire, support shield, elite charge phases, boss summons, tide-lane attacks, or weak-point phase changes.
- `EnemyState.behaviour` stores only simulation continuation state.

- [ ] **Step 1: Write failing pure behaviour tests**

Cover deterministic hatchling lane changes, lantern charge cancellation, single-layer snail shielding, elite telegraph→charge→exposed order, and boss phase monotonicity/unique safe lane.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/web/battle/EnemyBehaviourSystem.spec.ts`

Expected: module or exported symbol missing.

- [ ] **Step 3: Implement the pure behaviour reducer**

Implement a discriminated intent type and a seeded, step-based reducer. It must reject non-finite/negative deltas and never access DOM, audio, `Date`, or storage.

- [ ] **Step 4: Write failing engine integration tests**

Assert ranged damage is cancelled when the ray dies during warning, shields target only legal live units, elite invulnerability/exposure modifies damage at boundary frames, and boss weak-point hits gain damage and energy only while open.

- [ ] **Step 5: Integrate intents into `BattleEngine`**

Apply intents in stable enemy-ID order before ordinary movement/attacks. Emit semantic events for all telegraphs, fires, shields, phase changes, dangerous lanes, and weak-point hits. Pause states must freeze behaviour timers.

- [ ] **Step 6: Run focused integration and speed tests**

Run: `npm test -- tests/web/battle/EnemyBehaviourSystem.spec.ts tests/web/battle/BattleIntegration.spec.ts tests/web/battle/BattleSpeedEquivalence.spec.ts`

Expected: PASS with equivalent terminal outcomes at every unlocked speed.

- [ ] **Step 7: Commit and push**

Commit: `feat: add deterministic tide beast behaviours`

Push: `git push origin HEAD:main`

### Task 3: Render silhouettes, warnings, armour, and weak points

**Files:**
- Modify: `web/battle/AssetLoader.ts`
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `web/battle/BattleDrawTypes.ts`
- Modify: `web/battle/LayeredSpriteRig.ts`
- Test: `tests/web/battle/BattleRenderer.spec.ts`
- Test: `tests/web/battle/LayeredSpriteRig.spec.ts`

**Interfaces:**
- Consumes semantic `EnemyState.behaviour` without deriving game rules.
- Renders asset-backed sprites when present and distinct silhouette fallbacks otherwise.

- [ ] **Step 1: Write failing renderer contracts**

Assert distinct draw recipes for the three new enemies, a readable lane telegraph, shield ring, elite exposure mark, and boss weak-point ring. Assert warnings stay below `HUD_SAFE_BOTTOM_Y` and above the skill dock.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/web/battle/BattleRenderer.spec.ts tests/web/battle/LayeredSpriteRig.spec.ts`

Expected: missing draw recipes or semantic operations.

- [ ] **Step 3: Implement minimal visual recipes**

Reuse existing sprite layers where compatible, adding unique attachments/colors and Canvas fallback silhouettes. Draw telegraphs from engine state; never infer timers from animation frames.

- [ ] **Step 4: Run focused tests, typecheck, and asset budget**

Run: `npm test -- tests/web/battle/BattleRenderer.spec.ts tests/web/battle/LayeredSpriteRig.spec.ts && npm run typecheck && npm run check:assets`

Expected: PASS.

- [ ] **Step 5: Commit and push**

Commit: `style: render readable tide beast mechanics`

Push: `git push origin HEAD:main`

### Task 4: Combat juice and authored sound distinctions

**Files:**
- Modify: `web/battle/EffectSystem.ts`
- Modify: `web/audio/AudioManager.ts`
- Modify: `web/audio/SfxSynth.ts`
- Modify: `web/audio/AudioTypes.ts`
- Test: `tests/web/battle/EffectSystem.spec.ts`
- Test: `tests/web/audio/SfxSynth.spec.ts`
- Test: `tests/web/audio/AudioManager.spec.ts`

**Interfaces:**
- Consumes only `BattleEvent` and `BattleFrameView`.
- Adds distinct effect/sound cues for ranged charge/fire, support shield, elite warning/exposure, boss phase, tide lane, and weak-point hit.

- [ ] **Step 1: Write failing event-to-feedback tests**

Assert each semantic event produces a distinct particle/ring/title recipe and a distinct SFX envelope/frequency signature. Assert reduced motion suppresses camera motion and looping transforms but retains warnings.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/web/battle/EffectSystem.spec.ts tests/web/audio/SfxSynth.spec.ts tests/web/audio/AudioManager.spec.ts`

Expected: missing event mappings or sound IDs.

- [ ] **Step 3: Implement bounded effects and sound cues**

Keep camera shake at or below the existing amplitude cap, merge dense low-value kill sounds, and prioritize warnings/weak-point confirmation under low-quality budgets.

- [ ] **Step 4: Run focused and full unit tests**

Run: `npm test -- tests/web/battle/EffectSystem.spec.ts tests/web/audio/SfxSynth.spec.ts tests/web/audio/AudioManager.spec.ts && npm test`

Expected: PASS.

- [ ] **Step 5: Commit and push**

Commit: `style: strengthen combat impact and warnings`

Push: `git push origin HEAD:main`

### Task 5: Release regression and visual proof

**Files:**
- Modify: `scripts/browser-smoke.mjs`
- Modify: `tests/web/BattleBrowserSmokeContract.spec.ts`
- Create: `.superpowers/sdd/combat-vertical-slice-visual-qa/` (local evidence, not committed)
- Create: `.superpowers/sdd/combat-vertical-slice-report.md` (local report, not committed)

**Interfaces:**
- Smoke observes real production renderer/state and does not inject fake DOM states.

- [ ] **Step 1: Write failing smoke-contract tests**

Require four mobile viewports to observe new enemy kinds, an elite telegraph/exposure state, and each Boss phase signal while preserving manual-aim, 44×44, overflow, error, and two-victory assertions.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm test -- tests/web/BattleBrowserSmokeContract.spec.ts`

Expected: missing new smoke assertions.

- [ ] **Step 3: Extend bounded E2E observability**

Expose read-only semantic state through the existing exact `e2e=1` gate. Do not add production URL side effects or direct state mutation.

- [ ] **Step 4: Run all release gates**

Run: `npm test`, `npm run typecheck`, `npm run check:assets`, `npm run build`, `npm run smoke:browser`, `npm audit --audit-level=high`, and `git diff --check`.

Expected: all PASS, audit reports zero high-severity vulnerabilities.

- [ ] **Step 5: Capture visual evidence**

Capture 390×844 and 1024×800 evidence for the three new enemies, elite telegraph/exposure, all Boss phases, reduced motion, and victory. Record overflow and control-obstruction measurements.

- [ ] **Step 6: Commit and push the release guard**

Commit: `test: guard drift suburb combat vertical slice`

Push: `git push origin HEAD:main`

- [ ] **Step 7: Confirm GitHub Pages deployment**

Verify the pushed commit is deployed and the public URL loads the new build without console or asset errors.
