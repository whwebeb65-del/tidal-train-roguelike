# P4 Task 1 — Settings Version 2 and Preferred Battle Speed

## Delivered

- Migrated settings persistence from `tidal-train-settings-v1` to `tidal-train-settings-v2`.
- Version-one records migrate with `preferredBattleSpeed: 1`; version-two records retain supported speed values.
- Invalid stored speed values normalize to `1` and the corrected version-two record is persisted.
- `GameApp.updateSettings()` stamps version `2`.
- The general settings panel retains its audio, quality, and reduced-motion controls and directs battle-speed changes to the in-battle control, where unlock filtering belongs.

## TDD

- RED: added migration, speed normalization, legacy-key migration, persisted-correction, and panel-contract tests; the focused suite failed because production settings were version one, had no speed field, and did not migrate or rewrite records.
- GREEN: implemented the smallest v2 migration and normalization path, then re-ran the focused tests successfully.

## Verification

- Focused settings tests: 2 files / 7 tests passed.
- Full suite: 91 files / 495 tests passed.
- `npm run typecheck` passed.
- `npm run check:assets` passed.
- `npm run build` passed.
- `git diff --check` passed.
- Self-review confirmed only the five task-scoped implementation/test files changed, migration writes only v2, and audio, quality, and reduced-motion behavior remains intact.

## Account Unlock Clamp Follow-up

The account-level legal maximum is intentionally not determined by this settings-only task. Per the implementation plan, P4 Task 3 owns deriving the account-legal speed at run setup and must persist a preferred value that exceeds that account's unlocked maximum through `settingsBridge.updateSettings()`.

## Commit

`fdfba87 feat: persist preferred battle speed`
