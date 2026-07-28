# P4 Task 7 Release Verification Report

- HEAD: `b773f7d` (with prior release verification commit `8c9e847`)
- Date: 2026-07-28
- Scope: fixed-seed speed equivalence, twenty-level timing gate, responsive battle release QA.

## Automated gates

- `npm test`: pass (95 files / 534 tests)
- `npm run typecheck`: pass
- `npm run check:assets`: pass
- `npm run build`: pass
- `npm run smoke:browser`: pass
- `npm audit --audit-level=high`: pass (0 vulnerabilities)
- `git diff --check`: pass

## Responsive and battle evidence

`smoke:browser` exercised 360x800, 390x844, 412x915 and 430x932. It resets the visible local-save control between viewports, so stamina cannot leak between independent viewport cases. The 390x844 run completes two real HUD-driven normal battles with a stable strategic upgrade selection; both reach Lv20, elite, Boss, and victory.

The smoke assertions cover logical HUD height <=108px, the first authoritative enemy lane >=12px below that HUD, skill target >=56px, horizontal overflow, no browser errors, pause/resume, cooldown/ready skills, upgrades, Boss, victory/defeat settlement paths, and ordinary-URL E2E isolation.

Uncommitted visual captures (intentionally ignored):

| State | Captures |
| --- | --- |
| Station / initial state | `battle-progression-qa/station-{360x800,390x844,412x915,430x932}.png` |
| Rank 1 ready battle | `battle-progression-qa/battle-ready-{360x800,390x844,412x915,430x932}.png` |
| Rank 3/5, two variants, cooldown, pause, upgrade, Boss, victory, defeat | Exercised through the deterministic 390x844 smoke journey and its authoritative snapshot/assertion path. |

## Visual finding and fix

The release review found that the station/account/currency AppShell header was visible during battle and visually stacked above the battle tide-log HUD. The battle phase now applies `app-shell--battle`, hiding that station chrome and leaving one battle HUD. Currency presentation uses text labels instead of `⚙`, `◇`, or `☆` Unicode placeholders.
