# P2 Task 3 Report — Twenty Run Levels and Skill Ranks

## Delivered

- Replaced the three checkpoint thresholds with nineteen strictly increasing XP thresholds for run Levels 1–20.
- Migrated `BattleEngine` upgrade offers and selections to Task 2's pure `BattleBuildState` API. Frames now expose `runLevel`, `skillRanks`, and `skillVariants`.
- Every accepted upgrade clears the offer, advances exactly one run level, and emits complete `upgrade-selected` and `run-level-reached` state payloads.
- Applied permanent mastery × rank-strength multipliers to all skill effects, and base × active × rank cooldown multipliers to active skills. A no-cultivation mastery value of `1` remains the baseline.
- Preserved the legacy `upgradeLevels` projection for HUD and renderer compatibility.

## Task 2 API Adaptation

The Task 3 brief's sample treats `applyBattleUpgrade()` as returning `{ accepted, build }`. Task 2's reviewed final contract instead returns a detached `BattleBuildState` directly, including for rejected no-ops. This task preserves that contract: rank-six rejection is asserted as a detached, equal no-op build, and the engine detects whether the pure build state changed before accepting a choice.

## Verification

- `npm test -- tests/web/battle/BattleEngineUpgrade.spec.ts tests/web/battle/BattleEngineSkills.spec.ts tests/web/battle/UpgradeSystem.spec.ts` — passed (14 tests).
- `npm run typecheck` — passed.
- `npm test` — passed (90 files, 442 tests).
- `git diff --check` — passed.
