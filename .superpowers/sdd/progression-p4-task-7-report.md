# P4 Task 7 Release Verification Report

- Capture HEAD: `f5ecfd0`
- Date: 2026-07-28
- Scope: final desktop/mobile release evidence, persistent-progression variants, genuine defeat settlement, and grayscale readability.

## Automated gates

- `npm test`: pass (95 files / 536 tests)
- `npm run typecheck`: pass
- `npm run check:assets`: pass
- `npm run build`: pass
- `npm run smoke:browser`: pass
- `npm audit --audit-level=high`: pass (0 vulnerabilities)
- `git diff --check`: pass

## Capture matrix

All captures are deliberately ignored under `.superpowers/sdd/task-7-visual-qa/`; the repeatable collector is `capture-task-7.mjs` in the same folder.

| State | Desktop evidence |
| --- | --- |
| Station | `station-1440x900.png` |
| Battle-ready | `battle-ready-1440x900.png` |
| Real upgrade offer | `upgrade-1440x900.png` |
| Two acquired variants, running HUD | `two-variants-1440x900.png` |
| Boss | `boss-1440x900.png` |
| Victory settlement | `victory-settlement-1440x900.png` |
| Defeat settlement | `defeat-settlement-1440x900.png` |

Existing mobile evidence remains: station 390×844/430×932, high/low quality and reduced-motion station states, plus a live battle frame.

## Persistent-progression and normal UI journey

The collector installs an external, SaveRepository-v4-compatible local-storage fixture before page startup. It changes only persistent `skillMasteryXp` (900 per skill) to unlock the normal variant catalog; it does not mutate engine statistics or a battle build. The normal battle uses visible upgrade controls and acquired `split-tide-arrow` plus `reef-piercer` during the run. The capture also asserts that `.app-topbar` is absent during battle.

The independent failure fixture remains v4-compatible, has zero mastery, station level 8, and unlocked routes. It selects `deep-tunnel` through the public map UI, enters the public daily-trial route, never casts a skill, and prioritizes low-combat-value legal cards. It reached actual `defeat` with `trainHp: 0` at `140216.67 ms`, then used the visible give-up action to reach the settlement capture. No HP, enemy-damage, or live-engine state was overridden.

## Grayscale review

`grayscale-analysis.json` and one `*-grayscale.png` companion per desktop capture are ignored QA artifacts. Pillow RGB→L output was checked visually. In the two-variant running frame, the skill circles/badges, enemy silhouette, train, and HUD remain separable. In the defeat settlement frame, the title, explanatory copy, zero-reward cells, and return button remain readable.

| Key frame | Mean luminance | Std. dev. |
| --- | ---: | ---: |
| Battle-ready | 42.32 | 40.19 |
| Two variants | 42.04 | 41.54 |
| Boss | 37.74 | 30.95 |
| Defeat settlement | 51.46 | 61.83 |

