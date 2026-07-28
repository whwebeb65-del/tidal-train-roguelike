# Progression P4 Task 6 test-gap report

- Baseline reviewed: `94d98f7`; review-fix head: `591b7e2`.
- Added focused regression coverage for immutable battle-event callbacks, unchanged speed rejection, E2E upgrade-resume timing/deduplication, telemetry rank-change selection, and deep snapshot variant isolation.
- Fixed a confirmed aliasing defect: `battle.skillVariants` nested arrays are now copied per E2E snapshot.
- Fixed visibility recovery so a battle scene resumes after a hidden page and pending E2E resume waiters are released only after the formal upgrade-resume state has ended.

Verification:

- Focused: `npm test -- tests/web/GameApp.spec.ts tests/web/battle/BattleScene.spec.ts` — pass (30 tests).
- Full: `npm test` — pass (93 files, 530 tests).
- `npm run typecheck` — pass.
- `npm run build` — pass.
- `npm run check:assets` — pass.
- `git diff --check` — pass.
- `npm run smoke:browser` remains blocked by the existing full-battle elite assertion: `full battle should encounter the elite` in `scripts/smoke-browser.mjs:1656`.
