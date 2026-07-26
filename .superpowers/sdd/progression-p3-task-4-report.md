# P3 Task 4 HUD Shell Fix Report

## Scope

- Repaired the tide-log header DOM hierarchy so speed and pause controls remain inside one header.
- Disabled the speed control when its cross-stage callback is unavailable, preventing a no-op interaction.
- Added mounted HUD assertions for Rank 5, two variant glyphs, accessible labels, speed display, speed cycling, and the disabled fallback.

## Test support

- Added `jsdom` as a development dependency because the existing Vitest environment had no DOM implementation and this task requires real `mount()` / `update()` coverage.

## Verification

- `npm test -- tests/web/battle/BattleHUD.spec.ts`
- `npm test`
- `npm run typecheck`
- `npm run check:assets`
- `git diff --check`
