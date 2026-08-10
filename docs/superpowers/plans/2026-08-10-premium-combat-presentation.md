# Premium Combat Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the live battle presentation through readable atmosphere, differentiated impacts, a staged boss entrance, and a distinctive evolution ritual without changing combat balance or save data.

**Architecture:** Keep gameplay authority in `BattleEngine`. Derive presentation from existing `BattleFrameView` and `BattleEvent` values: a pure atmosphere director provides deterministic palette values, `EffectSystem` converts existing events into bounded pooled effects, `BattleRenderer` paints them, and `BattleHUD` exposes semantic state classes for CSS.

**Tech Stack:** TypeScript, Canvas 2D draw commands, DOM/CSS, Vitest, Vite browser smoke tests.

## Global Constraints

- Do not change damage, health, spawns, the time limit, rewards, saves, payments, or progression.
- Normal combat stays calm; danger and boss states intensify; critical and evolution moments carry the strongest accents.
- Respect `RenderBudget`, `prefers-reduced-motion`, 44 by 44 pixel controls, and the current asset budget.
- Add no production dependency or new first-screen raster asset.
- Push the verified merged result to GitHub `main`.

---

### Task 1: Deterministic Atmosphere and Enemy Grounding

**Files:**
- Create: `web/battle/BattleAtmosphere.ts`
- Create: `tests/web/battle/BattleAtmosphere.spec.ts`
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `tests/web/battle/BattleRenderer.spec.ts`

**Interfaces:**
- Consumes: `BattleFrameView`.
- Produces: `getBattleAtmosphere(frame): BattleAtmosphereView` with `wash`, `horizonGlow`, `vignette`, `danger`, and `boss`.

- [ ] Write tests asserting calm danger `0`, low-health danger above `0.45`, and a living boss intensity of `1`.
- [ ] Run `npx vitest run tests/web/battle/BattleAtmosphere.spec.ts tests/web/battle/BattleRenderer.spec.ts`; expect failure because the director and render commands are absent.
- [ ] Implement the pure director. Boss state is derived from `boss-intro` or a living `deep-echo-boss`; danger is derived from boss state and train HP ratio.
- [ ] Paint bounded `atmosphere-wash`, `horizon-glow`, `danger-vignette`, and one `enemy-contact-shadow` per living enemy. Reduced motion removes pulsing offsets.
- [ ] Re-run the focused tests; expect deterministic command order and all shadows below their sprites.
- [ ] Commit with `style: deepen battle atmosphere and enemy grounding`.

### Task 2: Hierarchical Impacts and Boss Entrance

**Files:**
- Modify: `web/battle/EffectSystem.ts`
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `tests/web/battle/EffectSystem.spec.ts`
- Modify: `tests/web/battle/BattleRenderer.spec.ts`

**Interfaces:**
- Consumes: existing `projectile-hit`, `enemy-armour-broken`, `boss-intro-started`, and `boss-weakpoint-hit` events.
- Produces: bounded `critical-shard`, `armour-spark`, `boss-entrance-ripple`, and `weakpoint-flare` semantics; no new engine event.

- [ ] Write tests that consume a critical projectile hit and boss-intro event, then assert the new semantic particle/ring kinds.
- [ ] Run `npx vitest run tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleRenderer.spec.ts`; expect missing-kind failures.
- [ ] Extend the unions and reuse `EntityPool`; cap critical shards below eight per hit and keep reduced-motion camera amplitude at zero.
- [ ] Render shards as short contrasting strokes, boss ripples as two-color ellipses, and weak-point flares as directional crosses.
- [ ] Run the focused tests plus `tests/web/battle/BattleQualityDeterminism.spec.ts`; expect all pass with gameplay frames unchanged.
- [ ] Commit with `style: stage critical impacts and boss arrival`.

### Task 3: Evolution Ritual and Release Gate

**Files:**
- Modify: `web/battle/BattleHUD.ts`
- Modify: `web/styles/battle-hud.css`
- Modify: `tests/web/battle/BattleHUD.spec.ts`
- Modify: `tests/web/LivingStationStyles.spec.ts`
- Modify: `scripts/smoke-browser.mjs`
- Modify: `tests/smoke/browser-script.spec.ts`

**Interfaces:**
- Consumes: `BattleUpgradeCardView.isEvolution`, upgrade countdown, and reduced-motion preference.
- Produces: `.battle-dialog--evolution`, `.evolution-crest`, and per-card `--reward-index`; existing IDs, actions, timeout selection, reroll, and ARIA labels remain unchanged.

- [ ] Write HUD tests asserting that an evolution offer toggles `.battle-dialog--evolution` and exposes `.evolution-crest`; write CSS/smoke contract tests for reduced motion, card visibility, and 44 pixel controls.
- [ ] Run `npx vitest run tests/web/battle/BattleHUD.spec.ts tests/web/LivingStationStyles.spec.ts tests/smoke/browser-script.spec.ts`; expect semantic-contract failures.
- [ ] Add one decorative crest with three skill-colored orbit marks, toggle it only for a visible evolution offer, stagger card arrival through `--reward-index`, and provide a static reduced-motion state.
- [ ] Extend the existing deterministic level-5 smoke path to assert one visible evolution dialog, three non-clipped cards, no horizontal overflow, and 44 by 44 pixel enabled controls.
- [ ] Re-run the focused tests; expect pass.
- [ ] Run `npm test`, `npm run typecheck`, `npm run check:assets`, `npm run build`, `npm audit --audit-level=high`, `npm run smoke:browser`, and `git diff --check`; expect all pass at 360, 390, 412, and 430 pixel widths.
- [ ] Commit the plan and Task 3 files with `style: turn skill evolution into a battle ritual`.

## Self-Review

- Coverage includes atmosphere, grounding, critical hierarchy, boss entrance, evolution ritual, reduced motion, mobile controls, performance budget, and GitHub delivery.
- No placeholders or deferred implementation steps remain.
- New presentation values derive only from existing `BattleFrameView` and `BattleEvent`; gameplay and persistence schemas remain unchanged.
