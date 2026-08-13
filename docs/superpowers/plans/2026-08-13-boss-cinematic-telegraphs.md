# Boss Cinematic Telegraphs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Deep Echo boss's summon, tide, and enraged states into readable in-world Canvas choreography without changing any gameplay value or adding boxed UI.

**Architecture:** A new pure `BossTelegraph` mapper translates the authoritative `EnemyBehaviourState` plus quality/motion inputs into a frozen semantic view. `BattleRenderer` consumes that view to emit deterministic line/ellipse motifs, while `EffectSystem` reuses existing boss events for short captain callouts. Existing real-battle smoke observes the authoritative phases and captures the terminal visuals without introducing a phase mutation hook.

**Tech Stack:** TypeScript 5.7, Vitest 4, Canvas `BattlePainter`, Vite 8, Chrome DevTools Protocol smoke automation.

## Global Constraints

- Do not change boss HP, damage, health thresholds, phase durations, summon cadence, weak-point multiplier, rewards, saves, ads, purchases, or economy.
- Do not add a boss HUD panel, modal, card, bitmap, audio asset, DOM-per-frame node, gameplay event, `RenderBudget` field, or business timer.
- All visuals derive only from existing `EnemyState`, `EnemyBehaviourState`, `timeMs`, `reducedMotion`, and `RenderBudget.backgroundLayers`.
- `boss-summon`, `boss-tide`, and `boss-enraged` map to summon, tide, and enraged presentation respectively; any other enemy or dead/missing behavior returns no telegraph.
- High/medium/low add at most 32/24/18 boss commands per frame and all keep the main phase identity.
- Tide telegraph commands remain at logical `y <= 610`; the real 390x844 battle must retain visible and topmost HUD, interaction, and all three skill controls.
- Reduced motion removes all `timeMs`-driven changes: identical authoritative state at times 0 and 5000 produces deeply equal boss telegraph commands.
- The 390x844 real battle must observe all three authoritative boss phases, a tide warning, weak point open and closed, and still finish two runs as `victory/victory`.
- Ordinary URLs must not expose an E2E global or any new construction/phase mutation hook.
- Every production change follows RED → GREEN TDD, each task is committed separately, and every task receives specification and quality review before the next task starts.

---

### Task 1: Frozen Boss Telegraph Semantic Model

**Files:**
- Create: `web/battle/BossTelegraph.ts`
- Create: `tests/web/battle/BossTelegraph.spec.ts`

**Interfaces:**
- Consumes: `EnemyState` from `web/battle/BattleTypes.ts` and `RenderBudget['backgroundLayers']` from `web/battle/QualityMonitor.ts`.
- Produces: `BossTelegraphPhase`, `BossTelegraphView`, `createBossTelegraphView(input): BossTelegraphView | null` exactly as specified in the design.

- [ ] **Step 1: Write the failing semantic-model tests**

Create `tests/web/battle/BossTelegraph.spec.ts` with a real `EnemyState` fixture and these assertions:

```ts
import { describe, expect, it } from 'vitest';
import { createBossTelegraphView } from '../../../web/battle/BossTelegraph';
import type { EnemyState } from '../../../web/battle/BattleTypes';

function boss(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 77, kind: 'deep-echo-boss', alive: true,
    lane: 1, x: 195, y: 250, hp: 800, maxHp: 1000,
    shield: 0, speedPerSecond: 0, defenceBroken: false,
    attackCooldownMs: 1000, ageMs: 0,
    behaviour: {
      phase: 'boss-summon', phaseRemainingMs: 8000, cycle: 1,
      targetLane: 1, safeLane: 2, invulnerable: false,
      damageTakenMultiplier: 1, weakPointOpen: false,
    },
    ...overrides,
  };
}

describe('boss telegraph semantic model', () => {
  it('maps the three authoritative phases without inventing gameplay state', () => {
    const summon = createBossTelegraphView({ enemy: boss(), timeMs: 900, reducedMotion: false, backgroundLayers: 4 });
    const tide = createBossTelegraphView({
      enemy: boss({ behaviour: { ...boss().behaviour!, phase: 'boss-tide', phaseRemainingMs: 600 } }),
      timeMs: 900, reducedMotion: false, backgroundLayers: 3,
    });
    const enraged = createBossTelegraphView({
      enemy: boss({ behaviour: { ...boss().behaviour!, phase: 'boss-enraged', phaseRemainingMs: 700, weakPointOpen: true } }),
      timeMs: 900, reducedMotion: false, backgroundLayers: 2,
    });
    expect(summon).toMatchObject({ phase: 'summon', detail: 3, tideWarning: false, weakPointOpen: false });
    expect(tide).toMatchObject({ phase: 'tide', detail: 2, tideWarning: true, safeLane: 2 });
    expect(enraged).toMatchObject({ phase: 'enraged', detail: 1, weakPointOpen: true });
    expect(Object.isFrozen(summon)).toBe(true);
  });

  it('returns null for dead, non-boss, missing-behaviour, and non-boss phases', () => {
    expect(createBossTelegraphView({ enemy: boss({ alive: false }), timeMs: 0, reducedMotion: false, backgroundLayers: 4 })).toBeNull();
    expect(createBossTelegraphView({ enemy: boss({ kind: 'bubble-fin' }), timeMs: 0, reducedMotion: false, backgroundLayers: 4 })).toBeNull();
    expect(createBossTelegraphView({ enemy: boss({ behaviour: undefined }), timeMs: 0, reducedMotion: false, backgroundLayers: 4 })).toBeNull();
    expect(createBossTelegraphView({ enemy: boss({ behaviour: { ...boss().behaviour!, phase: 'advance' } }), timeMs: 0, reducedMotion: false, backgroundLayers: 4 })).toBeNull();
  });

  it('clamps progress and freezes motion for reduced motion', () => {
    const reduced = createBossTelegraphView({ enemy: boss({ behaviour: { ...boss().behaviour!, phaseRemainingMs: 4000 } }), timeMs: 5000, reducedMotion: true, backgroundLayers: 4 });
    const invalid = createBossTelegraphView({ enemy: boss({ behaviour: { ...boss().behaviour!, phaseRemainingMs: Number.NaN } }), timeMs: Number.NaN, reducedMotion: false, backgroundLayers: 4 });
    expect(reduced).toMatchObject({ progress: 0.5, motionPhase: 0 });
    expect(invalid).toMatchObject({ progress: 0, motionPhase: 0 });
    expect(invalid!.progress).toBeGreaterThanOrEqual(0);
    expect(invalid!.progress).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```powershell
npm test -- tests/web/battle/BossTelegraph.spec.ts
```

Expected: FAIL because `web/battle/BossTelegraph.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure mapper**

Create `web/battle/BossTelegraph.ts` with the public interfaces and deterministic helpers:

```ts
import type { EnemyState } from './BattleTypes';
import type { RenderBudget } from './QualityMonitor';

export type BossTelegraphPhase = 'summon' | 'tide' | 'enraged';

export interface BossTelegraphView {
  readonly phase: BossTelegraphPhase;
  readonly detail: 1 | 2 | 3;
  readonly progress: number;
  readonly motionPhase: number;
  readonly safeLane: 0 | 1 | 2;
  readonly tideWarning: boolean;
  readonly weakPointOpen: boolean;
}

export interface BossTelegraphInput {
  readonly enemy: EnemyState;
  readonly timeMs: number;
  readonly reducedMotion: boolean;
  readonly backgroundLayers: RenderBudget['backgroundLayers'];
}

export function createBossTelegraphView(input: BossTelegraphInput): BossTelegraphView | null {
  const behaviour = input.enemy.behaviour;
  if (!input.enemy.alive || input.enemy.kind !== 'deep-echo-boss' || !behaviour) return null;
  const phase = behaviour.phase === 'boss-summon'
    ? 'summon'
    : behaviour.phase === 'boss-tide'
      ? 'tide'
      : behaviour.phase === 'boss-enraged'
        ? 'enraged'
        : null;
  if (!phase) return null;
  const tideWarning = phase === 'tide' && behaviour.phaseRemainingMs <= 1200;
  const durationMs = phase === 'summon'
    ? 8000
    : phase === 'tide'
      ? tideWarning ? 1200 : 3600
      : behaviour.weakPointOpen ? 1400 : 1800;
  const remainingMs = Number.isFinite(behaviour.phaseRemainingMs)
    ? Math.max(0, behaviour.phaseRemainingMs)
    : durationMs;
  const progress = Math.min(1, Math.max(0, 1 - remainingMs / durationMs));
  const safeTimeMs = Number.isFinite(input.timeMs) ? input.timeMs : 0;
  return Object.freeze({
    phase,
    detail: input.backgroundLayers === 4 ? 3 : input.backgroundLayers === 3 ? 2 : 1,
    progress,
    motionPhase: input.reducedMotion ? 0 : ((safeTimeMs / 1800) % 1 + 1) % 1,
    safeLane: behaviour.safeLane,
    tideWarning,
    weakPointOpen: behaviour.weakPointOpen,
  });
}
```

- [ ] **Step 4: Run focused and type checks GREEN**

Run:

```powershell
npm test -- tests/web/battle/BossTelegraph.spec.ts
npm run typecheck
```

Expected: all Task 1 tests pass and typecheck exits 0.

- [ ] **Step 5: Commit Task 1**

```powershell
git add web/battle/BossTelegraph.ts tests/web/battle/BossTelegraph.spec.ts
git diff --cached --check
git commit -m "feat: model boss cinematic telegraphs"
```

---

### Task 2: Render Three Distinct In-World Boss Phases

**Files:**
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `tests/web/battle/BattleRenderer.spec.ts`

**Interfaces:**
- Consumes: `createBossTelegraphView` and `BossTelegraphView` from Task 1.
- Produces: stable painter commands `boss-summon-beacon`, `boss-summon-echo`, `boss-current-chevron`, `boss-tide-countdown`, `boss-weakpoint-petal`, `boss-weakpoint-countdown`, and `boss-enraged-aura`; preserves `boss-safe-lane`, `boss-danger-lane`, and `boss-weakpoint`.

- [ ] **Step 1: Add failing renderer contracts for all phases and budgets**

Extend `tests/web/battle/BattleRenderer.spec.ts` with helpers that render one boss per phase and assert:

```ts
it.each([
  ['boss-summon', ['boss-summon-beacon', 'boss-summon-echo']],
  ['boss-tide', ['boss-safe-lane', 'boss-danger-lane', 'boss-current-chevron', 'boss-tide-countdown']],
  ['boss-enraged', ['boss-enraged-aura', 'boss-weakpoint-petal', 'boss-weakpoint-countdown']],
] as const)('draws a distinct %s world telegraph', (phase, expectedKinds) => {
  const commands = renderBossPhase(phase, { quality: 'high' });
  expect(commands.map((command) => command.kind)).toEqual(expect.arrayContaining([...expectedKinds]));
});

it('keeps exactly one safe lane, two danger lanes, and all tide geometry above y 610', () => {
  const commands = renderBossPhase('boss-tide', { phaseRemainingMs: 600, safeLane: 1 });
  expect(commands.filter((command) => command.kind === 'boss-safe-lane')).toHaveLength(1);
  expect(commands.filter((command) => command.kind === 'boss-danger-lane')).toHaveLength(2);
  const tide = commands.filter((command) => command.kind.startsWith('boss-') && ['boss-safe-lane', 'boss-danger-lane', 'boss-current-chevron', 'boss-tide-countdown'].includes(command.kind));
  expect(Math.max(...tide.flatMap(commandMaxY))).toBeLessThanOrEqual(610);
});

it('distinguishes open and closed weak points without changing hit geometry', () => {
  const open = renderBossPhase('boss-enraged', { weakPointOpen: true, phaseRemainingMs: 700 });
  const closed = renderBossPhase('boss-enraged', { weakPointOpen: false, phaseRemainingMs: 900 });
  expect(open.some((command) => command.kind === 'boss-weakpoint')).toBe(true);
  expect(closed.some((command) => command.kind === 'boss-weakpoint')).toBe(false);
  expect(open.filter((command) => command.kind === 'boss-weakpoint-petal')).not.toEqual(
    closed.filter((command) => command.kind === 'boss-weakpoint-petal'),
  );
});

it.each([['high', 32], ['medium', 24], ['low', 18]] as const)(
  'keeps %s boss choreography under %i commands while retaining identity',
  (quality, limit) => {
    for (const phase of ['boss-summon', 'boss-tide', 'boss-enraged'] as const) {
      const bossCommands = renderBossPhase(phase, { quality }).filter(isBossTelegraphCommand);
      expect(bossCommands.length).toBeGreaterThan(0);
      expect(bossCommands.length).toBeLessThanOrEqual(limit);
    }
  },
);

it('freezes every boss telegraph command in reduced motion', () => {
  const before = renderBossPhase('boss-tide', { reducedMotion: true, timeMs: 0 });
  const after = renderBossPhase('boss-tide', { reducedMotion: true, timeMs: 5000 });
  expect(onlyBossTelegraphCommands(after)).toEqual(onlyBossTelegraphCommands(before));
  const animated = renderBossPhase('boss-tide', { reducedMotion: false, timeMs: 5000 });
  expect(onlyBossTelegraphCommands(animated)).not.toEqual(onlyBossTelegraphCommands(before));
});
```

Implement `renderBossPhase`, `commandMaxY`, `isBossTelegraphCommand`, and `onlyBossTelegraphCommands` in the test using the existing `createPresentationFixture`, `getRenderBudget`, and `createRecordingPainter`. The test fixture must use real `EnemyState.behaviour`; it must not mock the mapper.

Use these concrete helpers (add the corresponding `EnemyBehaviourPhase`, `EnemyState`, and `QualityLevel` type imports):

```ts
const BOSS_TELEGRAPH_KINDS = new Set([
  'boss-summon-beacon', 'boss-summon-echo',
  'boss-safe-lane', 'boss-danger-lane', 'boss-current-chevron',
  'boss-tide-countdown', 'boss-enraged-aura', 'boss-weakpoint',
  'boss-weakpoint-petal', 'boss-weakpoint-countdown',
]);

function renderBossPhase(
  phase: Extract<EnemyBehaviourPhase, 'boss-summon' | 'boss-tide' | 'boss-enraged'>,
  options: {
    readonly quality?: QualityLevel;
    readonly timeMs?: number;
    readonly reducedMotion?: boolean;
    readonly phaseRemainingMs?: number;
    readonly safeLane?: 0 | 1 | 2;
    readonly weakPointOpen?: boolean;
  } = {},
): BattleDrawCommand[] {
  const boss: EnemyState = {
    id: 77, kind: 'deep-echo-boss', lane: 1, x: 195, y: 250,
    hp: 800, maxHp: 1000, shield: 0, speedPerSecond: 0,
    defenceBroken: false, attackCooldownMs: 1000, ageMs: 0, alive: true,
    behaviour: {
      phase,
      phaseRemainingMs: options.phaseRemainingMs ?? (phase === 'boss-summon' ? 4000 : phase === 'boss-tide' ? 600 : 700),
      cycle: 3, targetLane: 1, safeLane: options.safeLane ?? 1,
      invulnerable: false,
      damageTakenMultiplier: phase === 'boss-enraged' ? 1.1 : 1,
      weakPointOpen: options.weakPointOpen ?? phase === 'boss-enraged',
    },
  };
  const input = createPresentationFixture({
    frame: { enemies: [boss], projectiles: [], loot: [] },
    timeMs: options.timeMs ?? 900,
    reducedMotion: options.reducedMotion ?? false,
  });
  const painter = createRecordingPainter();
  new BattleRenderer(painter).render({
    ...input,
    renderBudget: getRenderBudget(options.quality ?? 'high'),
  });
  return painter.commands;
}

function isBossTelegraphCommand(command: BattleDrawCommand): boolean {
  return BOSS_TELEGRAPH_KINDS.has(command.kind);
}

function onlyBossTelegraphCommands(commands: readonly BattleDrawCommand[]) {
  return commands.filter(isBossTelegraphCommand);
}

function commandMaxY(command: BattleDrawCommand): readonly number[] {
  if ('points' in command) return command.points.map((point) => point.y);
  if ('radiusY' in command) return [command.y + command.radiusY + (command.lineWidth ?? 0) / 2];
  return [];
}
```

- [ ] **Step 2: Run the focused renderer test and observe RED**

Run:

```powershell
npm test -- tests/web/battle/BattleRenderer.spec.ts
```

Expected: FAIL because the new semantic command kinds are absent and the old tide lines extend to 686.

- [ ] **Step 3: Replace the generic boss marks with bounded deterministic choreography**

In `web/battle/BattleRenderer.ts`:

1. Import `createBossTelegraphView` and `BossTelegraphView`.
2. Pass `BattleRenderInput` into `drawEnemyBehaviour`.
3. Create `drawBossSummonTelegraph`, `drawBossTideTelegraph`, and `drawBossEnragedTelegraph` private methods.
4. Use only `painter.line` and `painter.ellipse`; no DOM or new painter primitive.
5. Use these palette constants once near the renderer constants:

```ts
const BOSS_TELEGRAPH_COLORS = Object.freeze({
  summonPrimary: '#8a7dff',
  summonSecondary: '#78e8ff',
  safePrimary: '#6fffd4',
  safeSecondary: '#d8fff3',
  dangerPrimary: '#ff6f67',
  dangerSecondary: '#ffb07a',
  weakOpenPrimary: '#fff2a2',
  weakOpenSecondary: '#ff8d73',
  weakClosedPrimary: '#786ee8',
  weakClosedSecondary: '#78cfff',
});
```

6. Summon: always draw three `boss-summon-beacon` ellipses around the boss; add `view.detail` concentric `boss-summon-echo` ellipses. Apply `motionPhase` only to radius/alpha offsets.
7. Tide: draw one safe and two danger lane curves between Y 150 and 600, then `view.detail` directional chevrons per lane. In the real 1200ms warning draw exactly four `boss-tide-countdown` notches, with the number of bright notches derived from `Math.ceil(view.progress * 4)`. Every point must remain at Y <= 610.
8. Enraged: draw a bounded `boss-enraged-aura`, four two-segment `boss-weakpoint-petal` lines, and four `boss-weakpoint-countdown` notches around the fixed visual center `enemy.x, y + height * 0.05`. Open uses the open palette and expanded petals; closed uses the closed palette and folded petals. Call existing `getBossWeakPoint` only to draw the actual hit circle when the rule says it is open.
9. Do not change `BossWeakPointSystem`, `EnemyBehaviourSystem`, `BattleEngine`, or any numbers outside renderer geometry.

- [ ] **Step 4: Run renderer and integration tests GREEN**

Run:

```powershell
npm test -- tests/web/battle/BossTelegraph.spec.ts tests/web/battle/BattleRenderer.spec.ts tests/web/battle/BossWeakPointSystem.spec.ts tests/web/battle/BattleIntegration.spec.ts
npm run typecheck
```

Expected: all tests pass; boss hit geometry tests remain unchanged.

- [ ] **Step 5: Commit Task 2**

```powershell
git add web/battle/BattleRenderer.ts tests/web/battle/BattleRenderer.spec.ts
git diff --cached --check
git commit -m "style: choreograph deep echo boss phases"
```

---

### Task 3: Captain Callouts and Causal Pixel Evidence

**Files:**
- Modify: `web/battle/EffectSystem.ts`
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `tests/web/battle/EffectSystem.spec.ts`
- Modify: `tests/web/battle/BattleRenderer.spec.ts`
- Modify: `tests/smoke/battle-pixel-evidence.spec.ts`

**Interfaces:**
- Consumes: existing `boss-phase-changed` and `boss-tide-warning` events; Task 2 renderer command kinds.
- Produces: exact captain copy plus `boss-callout-stroke` and `boss-callout-knot` for cinematic titles beginning with `船长：`; deterministic local pixel evidence for all three boss phases and reduced motion.

- [ ] **Step 1: Add failing callout tests**

In `tests/web/battle/EffectSystem.spec.ts`, consume existing events and assert exact text without creating a new event:

```ts
it.each([
  ['boss-summon', '船长：回响集结 · 留意援军'],
  ['boss-tide', '船长：断潮来袭 · 顺流换道'],
  ['boss-enraged', '船长：潮眼暴露 · 集中火力'],
] as const)('uses a captain callout for %s', (phase, title) => {
  const effects = createEffects();
  effects.consume([{ type: 'boss-phase-changed', phase }], createFrameFixture());
  expect(effects.view.cinematic.title).toBe(title);
});

it('keeps the real tide-warning duration and gives the safe lane a captain callout', () => {
  const effects = createEffects();
  effects.consume([{ type: 'boss-tide-warning', safeLane: 1, durationMs: 1200 }], createFrameFixture());
  expect(effects.view.cinematic.title).toBe('船长：绿色潮线是安全航道');
  effects.update(1199);
  expect(effects.view.cinematic.title).not.toBeNull();
  effects.update(1);
  expect(effects.view.cinematic.title).toBeNull();
});
```

In `tests/web/battle/BattleRenderer.spec.ts`, render a cinematic view with a captain title and assert two `boss-callout-stroke` commands plus one `boss-callout-knot`; render an unrelated title and assert none of those commands.

- [ ] **Step 2: Add failing boss pixel fixtures**

Extend `tests/smoke/battle-pixel-evidence.spec.ts` using the existing `rasterizeMotif`, `coloredPixelCount`, and `largestFilledRectangle`. Build real `BattleRenderer` fixtures for:

```ts
const bossPixelCases = [
  ['summon beacon', 'boss-summon', 'boss-summon-beacon', '#8a7dff', { x: 54, y: 220, width: 282, height: 150 }],
  ['safe tide current', 'boss-tide', 'boss-safe-lane', '#6fffd4', { x: 120, y: 150, width: 150, height: 460 }],
  ['danger tide current', 'boss-tide', 'boss-danger-lane', '#ff6f67', { x: 30, y: 150, width: 330, height: 460 }],
  ['open tide eye', 'boss-enraged-open', 'boss-weakpoint-petal', '#fff2a2', { x: 140, y: 180, width: 110, height: 150 }],
  ['closed tide eye', 'boss-enraged-closed', 'boss-weakpoint-petal', '#786ee8', { x: 140, y: 180, width: 110, height: 150 }],
] as const;
```

Each case must assert positive expected-color pixels in the local region, a largest filled rectangle below 35% of the battle area, and failure for the same geometry with alpha 0 or an unrelated color. Add a reduced-motion case that renders the same state at `timeMs=0` and `timeMs=5000`, rasterizes the boss commands, and asserts the pixel buffers are identical.

Use this real-renderer fixture and the existing `createRecordingPainter` rather than manufacturing draw commands:

```ts
type BossPixelState = 'boss-summon' | 'boss-tide' | 'boss-enraged-open' | 'boss-enraged-closed';

function renderBossPixelState(
  state: BossPixelState,
  options: { readonly reducedMotion?: boolean; readonly timeMs?: number } = {},
): readonly BattleDrawCommand[] {
  const phase = state.startsWith('boss-enraged') ? 'boss-enraged' : state;
  const weakPointOpen = state === 'boss-enraged-open';
  const input = createPresentationFixture({
    frame: {
      projectiles: [], loot: [],
      enemies: [{
        id: 91, kind: 'deep-echo-boss', lane: 1, x: 195, y: 250,
        hp: 800, maxHp: 1000, shield: 0, speedPerSecond: 0,
        defenceBroken: false, attackCooldownMs: 1000, ageMs: 0, alive: true,
        behaviour: {
          phase, phaseRemainingMs: phase === 'boss-summon' ? 4000 : 600,
          cycle: 3, targetLane: 1, safeLane: 1, invulnerable: false,
          damageTakenMultiplier: phase === 'boss-enraged' ? 1.1 : 1,
          weakPointOpen,
        },
      }],
    },
    reducedMotion: options.reducedMotion ?? false,
    timeMs: options.timeMs ?? 900,
  });
  const painter = createRecordingPainter();
  new BattleRenderer(painter).render(input);
  return painter.commands;
}
```

For each case, obtain `visible = renderBossPixelState(state)`, then build `transparent` by shallow-copying only matching `kind` commands with `alpha: 0`. Assert `coloredPixelCount(rasterizeMotif(transparent, kind, color), region) === 0` and `coloredPixelCount(rasterizeMotif(visible, kind, '#000001'), region) === 0`. For reduced motion, compare `onlyBossTelegraphCommands(renderBossPixelState('boss-tide', { reducedMotion: true, timeMs: 0 }))` with the same call at 5000 before rasterizing the safe and danger colors.

- [ ] **Step 3: Run callout and pixel tests and observe RED**

Run:

```powershell
npm test -- tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleRenderer.spec.ts tests/smoke/battle-pixel-evidence.spec.ts
```

Expected: FAIL on old boss copy, absent hand-drawn callout commands, and missing pixel fixtures/expected colors.

- [ ] **Step 4: Implement the minimal callout and hand-drawn title treatment**

In `web/battle/EffectSystem.ts`, replace only the four boss title strings with the exact copy from Step 1; keep `1400` and `event.durationMs` unchanged.

In `BattleRenderer.drawCinematicOverlay`, immediately before the existing title text, conditionally draw when `title.startsWith('船长：')`:

```ts
this.painter.line({
  kind: 'boss-callout-stroke', layer: 'cinematic-overlay',
  points: [{ x: 76, y: 145 }, { x: 148, y: 139 }, { x: 236, y: 142 }, { x: 314, y: 135 }],
  stroke: '#78e8ff', lineWidth: 4, curve: true, alpha: 0.72,
});
this.painter.line({
  kind: 'boss-callout-stroke', layer: 'cinematic-overlay',
  points: [{ x: 90, y: 177 }, { x: 162, y: 182 }, { x: 238, y: 178 }, { x: 300, y: 184 }],
  stroke: '#fff2a2', lineWidth: 3, curve: true, alpha: 0.64,
});
this.painter.ellipse({
  kind: 'boss-callout-knot', layer: 'cinematic-overlay',
  x: 62, y: 160, radiusX: 7, radiusY: 7,
  stroke: '#ff8d73', lineWidth: 3, alpha: 0.9,
});
```

Do not add a filled rectangle. If the exact fixed geometry conflicts with the existing title baseline in the test render, preserve the command names/colors and adjust only the four Y values within 132..188.

- [ ] **Step 5: Run focused, pixel, and asset checks GREEN**

Run:

```powershell
npm test -- tests/web/battle/BossTelegraph.spec.ts tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleRenderer.spec.ts tests/smoke/battle-pixel-evidence.spec.ts
npm run typecheck
npm run check:assets
```

Expected: all focused tests pass and asset totals remain unchanged.

- [ ] **Step 6: Commit Task 3**

```powershell
git add web/battle/EffectSystem.ts web/battle/BattleRenderer.ts tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleRenderer.spec.ts tests/smoke/battle-pixel-evidence.spec.ts
git diff --cached --check
git commit -m "style: add captain boss phase callouts"
```

---

### Task 4: Real-Battle Boss Phase Gate

**Files:**
- Modify: `scripts/smoke-browser.mjs`
- Modify: `tests/smoke/browser-script.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: authoritative `snapshot().battle.enemies[].behaviour`, existing `captureQaScreenshot`, `finishFullBattle`, DOM geometry helpers, and Task 2 Canvas output.
- Produces: a real 390x844 three-phase audit with screenshots and terminal assertions; no new E2E hook key.

- [ ] **Step 1: Write the failing smoke source contract**

Extend `tests/smoke/browser-script.spec.ts` with one source test that requires:

```ts
it('binds boss cinematic evidence to all real phases and protected controls', () => {
  const source = readFileSync('scripts/smoke-browser.mjs', 'utf8');
  expect(source).toContain('bossPhasesSeen');
  expect(source).toContain("'boss-summon'");
  expect(source).toContain("'boss-tide'");
  expect(source).toContain("'boss-enraged'");
  expect(source).toContain('bossTideWarningSeen');
  expect(source).toContain('bossWeakPointStatesSeen');
  expect(source).toContain('assertBossTelegraphPresentation');
  expect(source).toContain("captureQaScreenshot(client, `390x844-boss-${phase}`)");
  expect(source).toContain("['open', 'closed']");
  expect(source).not.toContain('setBossPhase');
});
```

- [ ] **Step 2: Run the source contract and observe RED**

Run:

```powershell
npm test -- tests/smoke/browser-script.spec.ts
```

Expected: FAIL because the phase sets and presentation audit do not exist.

- [ ] **Step 3: Add a real DOM/Canvas presentation audit without a mutation hook**

In `scripts/smoke-browser.mjs`, add `assertBossTelegraphPresentation(client, label)` that evaluates the real page and returns:

```js
{
  canvasVisible,
  hudVisible,
  skillCount,
  skillsTopmost,
  interactionVisible,
  horizontalOverflow,
}
```

The audit must require:

- the battle canvas and battle HUD have non-zero rectangles;
- all three enabled skill buttons are visible, at least 44x44, and `elementFromPoint` at each center belongs to that button;
- any visible battle interaction is topmost at its center;
- `document.documentElement.scrollWidth <= innerWidth`;
- no direct canvas/DOM mutation and no E2E hook surface change.

- [ ] **Step 4: Bind the existing full battle loop to authoritative boss states**

Inside `finishFullBattle`, initialize:

```js
const bossPhasesSeen = new Set();
const bossWeakPointStatesSeen = new Set();
let bossTideWarningSeen = false;
```

On every loop, read the alive Deep Echo boss from the already-captured snapshot. For each authoritative boss phase:

- add `behaviour.phase` to `bossPhasesSeen`;
- set `bossTideWarningSeen` when phase is `boss-tide` and `phaseRemainingMs <= 1200`;
- add `'open'` or `'closed'` during `boss-enraged`;
- on the first sample of each phase, call `assertBossTelegraphPresentation` and `captureQaScreenshot(client, `390x844-boss-${phase}`)`;
- on the first open and first closed enraged sample, capture `390x844-boss-eye-open` and `390x844-boss-eye-closed`.

At the end of the full battle, assert:

```js
assert.deepEqual([...bossPhasesSeen].sort(), ['boss-enraged', 'boss-summon', 'boss-tide']);
assert.equal(bossTideWarningSeen, true);
assert.deepEqual([...bossWeakPointStatesSeen].sort(), ['closed', 'open']);
```

Keep the existing two-run `victory/victory` assertion literal and unchanged. Do not add `setBossPhase`, direct state mutation, force victory, or a phase-only fixture.

- [ ] **Step 5: Document the in-world boss language**

Add a short README bullet under the battle presentation section:

```md
- **Boss 世界预兆**：深海回响的召唤浮标、断潮流向与潮眼开合均直接画进战场；低画质保留主语义，减少动态使用静态剪影，规则数值保持不变。
```

- [ ] **Step 6: Run focused tests and a fresh-build real browser gate**

Run in this order because `smoke:browser` previews `dist` and does not build it:

```powershell
npm test -- tests/smoke/browser-script.spec.ts tests/web/battle/BossTelegraph.spec.ts tests/web/battle/BattleRenderer.spec.ts tests/web/battle/EffectSystem.spec.ts tests/smoke/battle-pixel-evidence.spec.ts
npm run typecheck
npm run build
npm run smoke:browser
```

Expected: 360/390/412/430 all PASS, 390 prints literal `two runs victory/victory`, all three boss phase screenshots are written from real states, and ordinary URL reports no E2E global.

- [ ] **Step 7: Run the complete release gate**

Run:

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
npm audit --audit-level=high
npm run smoke:browser
git diff --check
```

Expected: every command exits 0; no asset total changes; full Chrome smoke passes after the fresh build.

- [ ] **Step 8: Commit Task 4**

```powershell
git add scripts/smoke-browser.mjs tests/smoke/browser-script.spec.ts README.md
git diff --cached --check
git commit -m "test: guard real boss cinematic phases"
```

---

### Task 5: Whole-Branch Review, Merge, Push, and Public Verification

**Files:**
- Review only: all files changed since the branch base
- Local ignored evidence: `.superpowers/sdd/`

**Interfaces:**
- Consumes: Tasks 1–4 commits and their reports.
- Produces: reviewed `main`, exact remote SHA, successful matching GitHub Pages run, and verified public hashed assets.

- [ ] **Step 1: Generate the whole-branch review package and run an independent review**

Use the `requesting-code-review` reviewer against `git merge-base master HEAD..HEAD`. The review must check all global constraints, phase geometry, actual Canvas draw order, reduced-motion determinism, no gameplay-number change, no E2E phase mutation, and real-smoke evidence. Fix every Critical or Important finding through RED → GREEN and re-review until Ready is Yes.

- [ ] **Step 2: Re-run final release gates on the reviewed head**

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
npm audit --audit-level=high
npm run smoke:browser
git diff --check
```

Expected: all commands exit 0 and the smoke uses the freshly built `dist`.

- [ ] **Step 3: Merge locally and verify the merged result**

From the main checkout:

```powershell
git checkout master
git merge --ff-only agent/boss-cinematic-telegraphs
npm test
npm run typecheck
npm run build
```

Expected: fast-forward succeeds and merged tests/typecheck/build pass.

- [ ] **Step 4: Push the exact merged head to GitHub main**

```powershell
git push origin master:main
```

Record `git rev-parse HEAD` and verify `git ls-remote origin refs/heads/main` returns the exact same SHA.

- [ ] **Step 5: Wait for the exact matching GitHub Pages workflow**

Use `gh run list --workflow deploy-pages.yml --branch main` and `gh run watch <run-id> --exit-status`. The accepted run must have `headSha` equal to the pushed SHA; an older successful run does not count.

- [ ] **Step 6: Verify the public deployment and clean the owned worktree**

Fetch `https://whwebeb65-del.github.io/tidal-train-roguelike/`, resolve its hashed JS/CSS asset URLs, and verify HTTP 200 plus the production markers `boss-summon-beacon`, `boss-current-chevron`, and `boss-weakpoint-petal` in the deployed JS. Only after exact deployment success, remove the project-owned `.worktrees/boss-cinematic-telegraphs` worktree, prune, and delete the local feature branch. Keep the remote feature branch unless explicitly asked to remove it.
