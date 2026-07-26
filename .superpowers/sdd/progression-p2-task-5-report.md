### P2 Task 5: Extreme Tide Variants — Report

- Implemented `extremeProfile()` for undertow pull, lingering vortex, energy return, and double crest.
- Added simulation-owned pull, fixed 500 ms vortex ticks over 4 seconds, capped per-cast energy refunds, and delayed second crest actions.
- Added deterministic presentation events: `extreme-pull-started`, `extreme-vortex-started`, `extreme-second-crest`, and `extreme-energy-refunded`.
- Preserved unmodified extreme tide energy behavior; all extreme scaling uses the existing mastery × rank multiplier.
- TDD: added failing profile/timing tests, observed RED, then implemented the minimum behavior to pass.

Validation completed:

- `npm test -- tests/web/battle/SkillVariantSystem.spec.ts tests/web/battle/BattleEngineSkills.spec.ts tests/web/battle/BattleQualityDeterminism.spec.ts`
- `npm test` — 91 files, 451 tests passed.
- `npm run typecheck`
- `git diff --check`
