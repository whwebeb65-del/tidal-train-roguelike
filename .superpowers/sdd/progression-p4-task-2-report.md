# P4 Task 2 Report — Deterministic Battle Speed

- Commit: `fb1d995` plus follow-up review fix.
- `SimulationRateController` advances the battle only in fixed world steps for
  1×, 1.5×, 2×, and 3× speed, retaining fractional remainder and capping
  catch-up work deterministically.
- `BattleScene` requires injected initial/available speed state and a change
  callback. The current legacy runtime deliberately supplies the safe 1×/`[1]`
  bridge until progression/settings persistence wiring is completed.
- Upgrade auto-choice uses a 6,000 ms wall-clock timer. Visibility pauses retain
  the remaining choice budget; manual, timeout, and E2E choices share the same
  acceptance path and record their source at the engine port boundary.
- Validation: focused speed/scene/fixed-loop tests, full suite, typecheck,
  production build, asset budget check, and whitespace diff check.
