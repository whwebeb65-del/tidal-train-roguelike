# P3 Task 6 — Rank and Variant Presentation Effects

## Delivered

- Rank-bounded effects: volley uses 3/5/7 trails, barrier uses 1/2/3 membranes, and extreme tide uses 8/12/16 radial strokes.
- Variant cues use distinct presentation shapes: coral pierce, reflection, pull, vortex, and second crest.
- Low quality retains exactly one major trail or ring per cast. Reduced motion replaces animated effects with a static coloured silhouette and keeps damage feedback without camera shake, spin, breathing, or continuous vortex particles.
- All particles and rings remain pooled and bounded by the existing render budgets; presentation never affects combat simulation.

## Verification

- Focused effect, renderer, and quality-determinism tests pass (49 tests).
- Full suite passes (91 files, 491 tests).
- `npm run typecheck`, `npm run check:assets`, `npm run build`, and `git diff --check` pass.

## Commit

`becdd48 feat: visualize skill ranks and variants` is the implementation baseline. The follow-up fix commit records the low-quality ring and renderer-shape corrections.
