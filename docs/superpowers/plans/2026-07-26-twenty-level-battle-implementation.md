# Twenty-Level Battle and Skill Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-checkpoint battle with a deterministic Lv.1–20 run, five-rank active skills, twelve unlockable variants, an eight-minute simulation cap, and the approved balance changes.

**Architecture:** A declarative upgrade catalog describes general upgrades, skill-rank cards, and variants. `UpgradeSystem` produces constrained deterministic offers from a complete run-build snapshot; `BattleEngine` remains the sole authority for damage and timing. Variant mechanics are split into focused helpers so the engine does not become a collection of unrelated name checks.

**Tech Stack:** TypeScript 5.7, Vitest 4, fixed-step simulation, seeded RNG, existing battle entity pools.

**Execution Order:** Plan 2 of 4. Complete the progression foundation plan first.

## Global Constraints

- Runs start at Lv.1 and cap at Lv.20 with exactly 19 cumulative XP thresholds: `50, 110, 180, 260, 350, 450, 565, 695, 840, 1000, 1175, 1365, 1570, 1790, 2025, 2275, 2540, 2820, 3120`.
- Each offer has three unique legal cards: at least one skill card, at least one general card, and one unrestricted card.
- Skills start at Rank 1, cap at Rank 5, and use strength multipliers `1, 1.15, 1.32, 1.52, 1.75` and cooldown multipliers `1, .96, .92, .88, .84`.
- Variants require Rank 2, must be permanently unlocked in the run input, and cap at two per skill per run.
- Ordinary base HP becomes 100, 56, and 225; elite remains 1,200 and Boss remains 4,200.
- Main and default volley projectile speed becomes 480 logical pixels/second.
- Boss starts near 360 seconds; simulation hard-fails at 480 seconds.
- Same seed, input snapshot, and choice history must produce the same run.
- Use TDD and commit after every independently reviewable task.

---

## File Structure

- Modify `web/battle/BattleTypes.ts`: import shared skill IDs; add card, rank, variant, event, frame, and outcome fields.
- Create `web/battle/BattleUpgradeCatalog.ts`: definitions and copy-independent combat metadata.
- Rewrite `web/battle/UpgradeSystem.ts`: constrained deterministic offers and upgrade application.
- Create `web/battle/SkillVariantSystem.ts`: focused volley, barrier, and extreme-tide calculations/state.
- Modify `web/battle/BattleEngine.ts`: run level, ranks, variants, cast/kill summaries, hard cap, and mechanics.
- Modify `web/battle/BattleConfig.ts`, `WaveScheduler.ts`, and create `EnemyGeometry.ts`: curve, pacing, HP, projectile speed, and safe spawns.
- Extend focused tests under `tests/web/battle`.

### Task 1: Battle Card Types and Declarative Catalog

**Files:**
- Modify: `web/battle/BattleTypes.ts`
- Create: `web/battle/BattleUpgradeCatalog.ts`
- Modify: `web/battle/BattleHudModel.ts`
- Create: `tests/web/battle/BattleUpgradeCatalog.spec.ts`

**Interfaces:**
- Consumes: shared `BattleSkillId`, `SkillVariantId`.
- Produces: `BattleUpgradeId`, `BattleBuildState`, `BATTLE_UPGRADE_DEFINITIONS`, `getBattleUpgradeDefinition()`.

- [ ] **Step 1: Write the failing catalog integrity test**

```ts
import { describe, expect, it } from 'vitest';
import {
  BATTLE_UPGRADE_DEFINITIONS,
} from '../../../web/battle/BattleUpgradeCatalog';

describe('BattleUpgradeCatalog', () => {
  it('contains nine general, three rank and twelve variant cards', () => {
    const values = Object.values(BATTLE_UPGRADE_DEFINITIONS);
    expect(values.filter((item) => item.kind === 'general')).toHaveLength(9);
    expect(values.filter((item) => item.kind === 'skill-rank')).toHaveLength(3);
    expect(values.filter((item) => item.kind === 'skill-variant')).toHaveLength(12);
    expect(new Set(values.map((item) => item.id)).size).toBe(24);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- tests/web/battle/BattleUpgradeCatalog.spec.ts`

Expected: FAIL because the catalog is missing.

- [ ] **Step 3: Add the exact public types**

In `BattleTypes.ts`, import and re-export `BattleSkillId` and `SkillVariantId`, retain the nine existing IDs as `BattleGeneralUpgradeId`, and define:

```ts
export type BattleSkillRankUpgradeId =
  | 'rank-tidal-volley'
  | 'rank-bubble-barrier'
  | 'rank-extreme-tide';
export type BattleUpgradeId =
  | BattleGeneralUpgradeId
  | BattleSkillRankUpgradeId
  | SkillVariantId;
export type SkillRanks = Record<BattleSkillId, 1 | 2 | 3 | 4 | 5>;
export type SkillVariantLoadout =
  Record<BattleSkillId, readonly SkillVariantId[]>;
export interface BattleBuildState {
  readonly generalLevels: Readonly<Record<BattleGeneralUpgradeId, number>>;
  readonly skillRanks: Readonly<SkillRanks>;
  readonly skillVariants: Readonly<SkillVariantLoadout>;
}
```

Extend `BattleRunInput` with:

```ts
readonly skillMasteryPower: Readonly<Record<BattleSkillId, number>>;
readonly unlockedSkillVariants: readonly SkillVariantId[];
```

- [ ] **Step 4: Create all 24 catalog definitions**

Use this definition shape:

```ts
export interface BattleUpgradeDefinition {
  readonly id: BattleUpgradeId;
  readonly kind: 'general' | 'skill-rank' | 'skill-variant';
  readonly skillId?: BattleSkillId;
  readonly maxLevel: number;
  readonly requiredRank?: number;
}
```

The nine current cards are `general` with `maxLevel: 3`; the three `rank-*` cards are `skill-rank` with `maxLevel: 4`; each shared variant ID is `skill-variant`, points to its owning skill, has `maxLevel: 1`, and `requiredRank: 2`.

Build the exported record from this complete definition list:

```ts
const definitions: readonly BattleUpgradeDefinition[] = [
  { id: 'multi-barrel', kind: 'general', maxLevel: 3 },
  { id: 'rapid-reload', kind: 'general', maxLevel: 3 },
  { id: 'coral-warhead', kind: 'general', maxLevel: 3 },
  { id: 'echo-chain', kind: 'general', maxLevel: 3 },
  { id: 'precision-lens', kind: 'general', maxLevel: 3 },
  { id: 'bubble-capacitor', kind: 'general', maxLevel: 3 },
  { id: 'tidal-resonance', kind: 'general', maxLevel: 3 },
  { id: 'magnetic-salvage', kind: 'general', maxLevel: 3 },
  { id: 'overload-core', kind: 'general', maxLevel: 3 },
  { id: 'rank-tidal-volley', kind: 'skill-rank', skillId: 'tidal-volley', maxLevel: 4 },
  { id: 'rank-bubble-barrier', kind: 'skill-rank', skillId: 'bubble-barrier', maxLevel: 4 },
  { id: 'rank-extreme-tide', kind: 'skill-rank', skillId: 'extreme-tide', maxLevel: 4 },
  { id: 'split-tide-arrow', kind: 'skill-variant', skillId: 'tidal-volley', maxLevel: 1, requiredRank: 2 },
  { id: 'reef-piercer', kind: 'skill-variant', skillId: 'tidal-volley', maxLevel: 1, requiredRank: 2 },
  { id: 'returning-volley', kind: 'skill-variant', skillId: 'tidal-volley', maxLevel: 1, requiredRank: 2 },
  { id: 'rainstorm-school', kind: 'skill-variant', skillId: 'tidal-volley', maxLevel: 1, requiredRank: 2 },
  { id: 'bursting-bubble', kind: 'skill-variant', skillId: 'bubble-barrier', maxLevel: 1, requiredRank: 2 },
  { id: 'reflective-spines', kind: 'skill-variant', skillId: 'bubble-barrier', maxLevel: 1, requiredRank: 2 },
  { id: 'overflow-membrane', kind: 'skill-variant', skillId: 'bubble-barrier', maxLevel: 1, requiredRank: 2 },
  { id: 'emergency-trigger', kind: 'skill-variant', skillId: 'bubble-barrier', maxLevel: 1, requiredRank: 2 },
  { id: 'undertow-eye', kind: 'skill-variant', skillId: 'extreme-tide', maxLevel: 1, requiredRank: 2 },
  { id: 'lingering-vortex', kind: 'skill-variant', skillId: 'extreme-tide', maxLevel: 1, requiredRank: 2 },
  { id: 'energy-return', kind: 'skill-variant', skillId: 'extreme-tide', maxLevel: 1, requiredRank: 2 },
  { id: 'double-crest', kind: 'skill-variant', skillId: 'extreme-tide', maxLevel: 1, requiredRank: 2 },
];
export const BATTLE_UPGRADE_DEFINITIONS = Object.fromEntries(
  definitions.map((definition) => [definition.id, definition]),
) as Readonly<Record<BattleUpgradeId, BattleUpgradeDefinition>>;
```

Extend `UPGRADE_COPY` in `BattleHudModel.ts` with these exact additional cards so the expanded union remains exhaustive:

```ts
'rank-tidal-volley': { name: '浪箭鱼群', effect: '潮汐齐射 Rank +1', synergy: '提高总伤害、缩短冷却并强化徽章' },
'rank-bubble-barrier': { name: '珊甲泡膜', effect: '泡泡屏障 Rank +1', synergy: '提高治疗与护盾并强化徽章' },
'rank-extreme-tide': { name: '涡星潮眼', effect: '极潮爆发 Rank +1', synergy: '提高爆发伤害并强化徽章' },
'split-tide-arrow': { name: '分汐浪箭', effect: '命中后分裂至第二目标，造成 35% 伤害', synergy: '强化多目标清场' },
'reef-piercer': { name: '贯礁箭鳍', effect: '额外穿透一个目标，保留 60% 伤害', synergy: '对密集直线怪潮有效' },
'returning-volley': { name: '回潮齐射', effect: '首轮后追加 4 枚 45% 伤害回旋浪箭', synergy: '补充二次打击' },
'rainstorm-school': { name: '暴雨鱼群', effect: '16 枚 75% 浪箭，冷却增加 20%', synergy: '把齐射进化为终局弹幕' },
'bursting-bubble': { name: '破泡潮鸣', effect: '屏障结束时造成主炮 150% 冲击伤害', synergy: '把防御转为近线清场' },
'reflective-spines': { name: '反棘潮膜', effect: '返还吸收伤害的 35%', synergy: '对高频攻击者有效' },
'overflow-membrane': { name: '过量潮膜', effect: '溢出治疗转为最多 15% 最大生命的护盾', synergy: '满血施放不再浪费治疗' },
'emergency-trigger': { name: '濒海自启', effect: '每局一次，低于 25% 生命自动触发 60% 屏障', synergy: '提供濒死保险' },
'undertow-eye': { name: '引潮眼', effect: '将敌人向中央牵引 2 秒', synergy: '为后续范围攻击聚怪' },
'lingering-vortex': { name: '余涡', effect: '留下 4 秒、总计主炮 200% 伤害的漩涡', synergy: '补充持续伤害' },
'energy-return': { name: '回能潮', effect: '每次击杀返还 2 能量，最多 20', synergy: '加快下一次极潮循环' },
'double-crest': { name: '双潮峰', effect: '1.2 秒后追加 45% 伤害潮击', synergy: '强化延迟爆发' },
```

- [ ] **Step 5: Run test, typecheck, and commit**

Run: `npm test -- tests/web/battle/BattleUpgradeCatalog.spec.ts && npm run typecheck`

Expected: PASS after existing `BattleUpgradeId` fixtures compile against the expanded union.

```bash
git add web/battle/BattleTypes.ts web/battle/BattleUpgradeCatalog.ts web/battle/BattleHudModel.ts tests/web/battle/BattleUpgradeCatalog.spec.ts
git commit -m "feat: declare battle skill rank and variant cards"
```

### Task 2: Constrained Deterministic Offers

**Files:**
- Modify: `web/battle/UpgradeSystem.ts`
- Modify: `tests/web/battle/UpgradeSystem.spec.ts`

**Interfaces:**
- Consumes: `BattleBuildState`, unlocked variants, catalog definitions.
- Produces: `createUpgradeOffer(seed, runLevel, build, unlockedVariants, roll)` and `applyBattleUpgrade(build, upgradeId)`.

- [ ] **Step 1: Replace the old offer test with failing category constraints**

```ts
it('always offers one skill card, one general card and no duplicates', () => {
  const build = createEmptyBattleBuild();
  const offer = createUpgradeOffer(
    17,
    7,
    build,
    ['split-tide-arrow'],
    0,
  );
  const definitions = offer.map(getBattleUpgradeDefinition);
  expect(offer).toHaveLength(3);
  expect(new Set(offer).size).toBe(3);
  expect(definitions.some((item) => item.kind !== 'general')).toBe(true);
  expect(definitions.some((item) => item.kind === 'general')).toBe(true);
  expect(createUpgradeOffer(17, 7, build, ['split-tide-arrow'], 0))
    .toEqual(offer);
});

it('does not offer locked, maxed, under-ranked or third variants', () => {
  const build = createEmptyBattleBuild({
    skillRanks: { 'tidal-volley': 2, 'bubble-barrier': 5, 'extreme-tide': 1 },
    skillVariants: {
      'tidal-volley': ['split-tide-arrow', 'reef-piercer'],
      'bubble-barrier': [],
      'extreme-tide': [],
    },
  });
  const offer = createUpgradeOffer(9, 12, build, ['returning-volley'], 0);
  expect(offer).not.toContain('returning-volley');
  expect(offer).not.toContain('rank-bubble-barrier');
});
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/web/battle/UpgradeSystem.spec.ts`

Expected: FAIL against the old three-general-card API.

- [ ] **Step 3: Implement legal candidate partitioning**

Create `isUpgradeLegal()` that rejects maxed general cards, Rank 5 skills, locked variants, variants below Rank 2, already selected variants, and any third variant for the same skill. Partition legal IDs into `skillCandidates` and `generalCandidates`.

- [ ] **Step 4: Implement stable seeded selection**

Seed `SeededRandom` with:

```ts
seed
  ^ Math.imul(runLevel, 0x9e3779b1)
  ^ Math.imul(roll, 0x85ebca6b)
```

Pick one skill candidate, remove it; pick one general candidate, remove it; pick the third from the remaining union. If one required partition is empty, fill from the remaining legal union. Return no duplicates.

Implement `applyBattleUpgrade()` as a pure function returning a fresh build: general cards increment their existing modifier/level up to 3, rank cards increment the owning skill up to 5, and variant cards append once while respecting Rank 2 and two-per-skill limits.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/web/battle/UpgradeSystem.spec.ts tests/web/battle/BattleUpgradeCatalog.spec.ts`

Expected: PASS.

```bash
git add web/battle/UpgradeSystem.ts tests/web/battle/UpgradeSystem.spec.ts
git commit -m "feat: constrain deterministic battle upgrade offers"
```

### Task 3: Twenty Levels and Skill Ranks in BattleEngine

**Files:**
- Modify: `web/battle/BattleConfig.ts`
- Modify: `web/battle/BattleEngine.ts`
- Modify: `web/battle/BattleTypes.ts`
- Modify: `tests/web/battle/BattleEngineUpgrade.spec.ts`
- Modify: `tests/web/battle/helpers/BattleFixtures.ts`

**Interfaces:**
- Produces frame fields `runLevel`, `skillRanks`, `skillVariants`; richer `upgrade-selected` and `run-level-reached` events.

- [ ] **Step 1: Add failing 20-level engine tests**

```ts
it('starts at level one and exposes nineteen strictly increasing thresholds', () => {
  expect(EXPERIENCE_THRESHOLDS).toEqual([
    50, 110, 180, 260, 350, 450, 565, 695, 840, 1000,
    1175, 1365, 1570, 1790, 2025, 2275, 2540, 2820, 3120,
  ]);
  expect(new BattleEngine(createBattleInput()).frame.runLevel).toBe(1);
});

it('raises a skill to rank five and rejects a sixth rank', () => {
  let build = createEmptyBattleBuild();
  for (let rank = 2; rank <= 5; rank += 1) {
    const result = applyBattleUpgrade(build, 'rank-tidal-volley');
    expect(result.accepted).toBe(true);
    build = result.build;
    expect(build.skillRanks['tidal-volley']).toBe(rank);
  }
  expect(applyBattleUpgrade(build, 'rank-tidal-volley').accepted).toBe(false);
});
```

- [ ] **Step 2: Run the focused engine tests**

Run: `npm test -- tests/web/battle/BattleEngineUpgrade.spec.ts`

Expected: FAIL because the frame has no run level or ranks.

- [ ] **Step 3: Replace checkpoint state with run-level build state**

Initialize:

```ts
private runLevel = 1;
private readonly skillRanks: SkillRanks = {
  'tidal-volley': 1,
  'bubble-barrier': 1,
  'extreme-tide': 1,
};
private readonly skillVariants: Record<BattleSkillId, SkillVariantId[]> = {
  'tidal-volley': [],
  'bubble-barrier': [],
  'extreme-tide': [],
};
```

Use `EXPERIENCE_THRESHOLDS[this.runLevel - 1]` as the next threshold. On each accepted choice increment `runLevel`, clear the offer, and emit both `upgrade-selected` and `run-level-reached`. At Lv.20 return `nextExperienceThreshold: null`.

- [ ] **Step 4: Apply Rank multipliers at skill use**

Add exact config arrays:

```ts
export const SKILL_STRENGTH_MULTIPLIER = [1, 1.15, 1.32, 1.52, 1.75] as const;
export const SKILL_COOLDOWN_MULTIPLIER = [1, 0.96, 0.92, 0.88, 0.84] as const;
```

The final strength multiplier is `permanentMastery × rankStrength`; cooldown is `base × activeCooldownMultiplier × rankCooldown`.

- [ ] **Step 5: Run engine tests and commit**

Run: `npm test -- tests/web/battle/BattleEngineUpgrade.spec.ts tests/web/battle/BattleEngineSkills.spec.ts tests/web/battle/UpgradeSystem.spec.ts`

Expected: PASS.

```bash
git add web/battle/BattleConfig.ts web/battle/BattleEngine.ts web/battle/BattleTypes.ts tests/web/battle
git commit -m "feat: expand battles to twenty run levels"
```

### Task 4: Volley and Barrier Variants

**Files:**
- Create: `web/battle/SkillVariantSystem.ts`
- Create: `tests/web/battle/SkillVariantSystem.spec.ts`
- Modify: `web/battle/BattleEngine.ts`
- Modify: `web/battle/BattleTypes.ts`
- Modify: `tests/web/battle/BattleEngineSkills.spec.ts`

**Interfaces:**
- Produces pure helpers `volleyProfile()`, `barrierProfile()`, `reflectBarrierDamage()`, `shouldEmergencyTrigger()`.

- [ ] **Step 1: Write failing profile tests**

```ts
it('builds the approved volley mutation profile', () => {
  expect(volleyProfile([
    'split-tide-arrow',
    'rainstorm-school',
  ])).toEqual({
    projectileCount: 16,
    projectileDamageMultiplier: 0.75,
    cooldownMultiplier: 1.2,
    splitMultiplier: 0.35,
    pierceCount: 0,
    pierceRetention: 0.6,
    returningCount: 0,
    returningMultiplier: 0.45,
  });
});

it('builds barrier break, reflect, overflow and emergency flags', () => {
  expect(barrierProfile([
    'bursting-bubble',
    'reflective-spines',
    'overflow-membrane',
    'emergency-trigger',
  ])).toMatchObject({
    breakDamageMultiplier: 1.5,
    reflectRatio: 0.35,
    overflowShieldCapRatio: 0.15,
    emergencyEffectRatio: 0.6,
  });
});
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/web/battle/SkillVariantSystem.spec.ts`

Expected: FAIL because the helper is missing.

- [ ] **Step 3: Implement complete pure profiles**

Define zero-effect defaults and map each of the eight volley/barrier variant IDs to the exact spec values. The result must not mutate the input arrays.

- [ ] **Step 4: Integrate engine mechanics**

Extend projectile state with `pierceRemaining` and `splitMultiplier`. On hit, perform piercing before deactivation and create one deterministic secondary projectile when split is active. After a volley completes, schedule returning projectiles through an engine-owned delayed-action queue keyed by simulation time.

Track barrier origin, last attacker, absorbed damage, and whether the emergency trigger was consumed. On expiry or depletion emit `barrier-burst` and apply 1.5× main-cannon damage to enemies ahead of the train. Reflect 35% of absorbed damage to the attacker. Convert heal overflow to shield up to 15% max HP. Trigger one 60%-strength automatic barrier when HP first crosses below 25%.

- [ ] **Step 5: Run focused engine tests and commit**

Run: `npm test -- tests/web/battle/SkillVariantSystem.spec.ts tests/web/battle/BattleEngineSkills.spec.ts tests/web/battle/BattleEnginePooling.spec.ts`

Expected: PASS with no leaked projectiles or delayed actions.

```bash
git add web/battle/SkillVariantSystem.ts web/battle/BattleEngine.ts web/battle/BattleTypes.ts tests/web/battle
git commit -m "feat: add volley and barrier skill variants"
```

### Task 5: Extreme Tide Variants

**Files:**
- Modify: `web/battle/SkillVariantSystem.ts`
- Modify: `web/battle/BattleEngine.ts`
- Modify: `web/battle/BattleTypes.ts`
- Modify: `tests/web/battle/SkillVariantSystem.spec.ts`
- Modify: `tests/web/battle/BattleEngineSkills.spec.ts`

**Interfaces:**
- Produces `extremeProfile()` and simulation events for pull, vortex, refunded energy, and second crest.

- [ ] **Step 1: Add failing extreme profile and timing tests**

```ts
it('builds all extreme tide variant values', () => {
  expect(extremeProfile([
    'undertow-eye',
    'lingering-vortex',
    'energy-return',
    'double-crest',
  ])).toEqual({
    pullDurationMs: 2000,
    vortexDurationMs: 4000,
    vortexTotalDamageMultiplier: 2,
    energyPerKill: 2,
    energyRefundCap: 20,
    secondCrestDelayMs: 1200,
    secondCrestDamageRatio: 0.45,
  });
});
```

Add an engine test that advances exactly 1,200 ms after casting and observes one second-crest hit, advances 4,000 ms and observes deterministic vortex ticks, and verifies total energy refund never exceeds 20.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/web/battle/SkillVariantSystem.spec.ts tests/web/battle/BattleEngineSkills.spec.ts`

Expected: FAIL because extreme variants have no behavior.

- [ ] **Step 3: Implement simulation-owned timed effects**

Represent active pull and vortex effects as engine state with remaining milliseconds and accumulated tick time. Apply pull by moving living enemies toward lane center without crossing the defence line. Apply vortex damage in fixed 500 ms ticks totaling 2× main-cannon damage over 4 seconds. Associate kills with the active extreme cast and cap returned energy at 20. Add the second crest to the delayed-action queue at 1,200 ms for 45% of the first hit.

- [ ] **Step 4: Emit presentation events without moving authority to rendering**

Add `extreme-pull-started`, `extreme-vortex-started`, `extreme-second-crest`, and `extreme-energy-refunded` events. Events carry durations and amounts only; renderer/effects cannot alter engine state.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/web/battle/BattleEngineSkills.spec.ts tests/web/battle/SkillVariantSystem.spec.ts tests/web/battle/BattleQualityDeterminism.spec.ts`

Expected: PASS.

```bash
git add web/battle/SkillVariantSystem.ts web/battle/BattleEngine.ts web/battle/BattleTypes.ts tests/web/battle
git commit -m "feat: add extreme tide skill variants"
```

### Task 6: Eight-Minute Wave, Balance, and Safe Spawn Geometry

**Files:**
- Modify: `web/battle/BattleConfig.ts`
- Modify: `web/battle/WaveScheduler.ts`
- Create: `web/battle/EnemyGeometry.ts`
- Modify: `web/battle/BattleEngine.ts`
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `tests/web/battle/WaveScheduler.spec.ts`
- Modify: `tests/web/battle/BattleEngineBoss.spec.ts`
- Modify: `tests/web/battle/BattleRenderer.spec.ts`

**Interfaces:**
- Produces `ENEMY_GEOMETRY`, `enemySpawnY(kind, hudBottomY)`.

- [ ] **Step 1: Write failing balance and geometry tests**

```ts
expect(ENEMY_CONFIG['bubble-fin'].hp).toBe(100);
expect(ENEMY_CONFIG['needle-jelly'].hp).toBe(56);
expect(ENEMY_CONFIG['reef-crab'].hp).toBe(225);
expect(ENEMY_CONFIG['storm-ray-elite'].hp).toBe(1200);
expect(ENEMY_CONFIG['deep-echo-boss'].hp).toBe(4200);
expect(MAIN_PROJECTILE_SPEED).toBe(480);

for (const kind of Object.keys(ENEMY_GEOMETRY) as EnemyKind[]) {
  const y = enemySpawnY(kind, 108);
  const top = y - ENEMY_GEOMETRY[kind].height * 0.52;
  expect(top).toBeGreaterThanOrEqual(120);
}
```

Wave test: sum scheduled enemy experience and the elite’s 120 XP; expect at least `3370`, with every ordinary spawn before `345_000`.

Renderer test: every living enemy emits one `enemy-name`, `enemy-hp-track`, and `enemy-hp` command above its sprite, and the topmost command remains at or below the safe battlefield edge.

- [ ] **Step 2: Run balance tests**

Run: `npm test -- tests/web/battle/WaveScheduler.spec.ts tests/web/battle/BattleEngineBoss.spec.ts tests/web/battle/BattleRenderer.spec.ts`

Expected: FAIL against the current four-wave, 160-second schedule.

- [ ] **Step 3: Create shared enemy geometry and update balance constants**

Move the renderer’s current width/height table into `EnemyGeometry.ts`. Implement:

```ts
export const HUD_SAFE_BOTTOM_Y = 108;
export const ENEMY_HUD_GAP = 12;
export function enemySpawnY(kind: EnemyKind, hudBottomY = HUD_SAFE_BOTTOM_Y): number {
  return Math.ceil(
    hudBottomY + ENEMY_HUD_GAP + ENEMY_GEOMETRY[kind].height * 0.52,
  );
}
```

Update HP and projectile speed to the approved exact values.

Export an `ENEMY_LABELS` record with `泡鳍怪`, `针水母`, `礁蟹`, `雷鳐督军`, and `深海回响`. Draw the label and HP line from the same bob-adjusted enemy anchor. Remove the duplicate Boss health/name bar from the DOM HUD in the visual plan; canvas-following enemy information is authoritative.

- [ ] **Step 4: Replace the wave schedule and boss timing**

Use six waves ending by 345 seconds with these counts:

```ts
[
  { bubble: 25, jelly: 0, crab: 0 },
  { bubble: 25, jelly: 15, crab: 0 },
  { bubble: 20, jelly: 20, crab: 10 },
  { bubble: 24, jelly: 20, crab: 15 },
  { bubble: 28, jelly: 24, crab: 18 },
  { bubble: 30, jelly: 24, crab: 20 },
]
```

Spawn elite at 300,000 ms, begin Boss intro at 360,000 ms after the elite is defeated, enter high pressure at Boss/simulation 420,000 ms, emit enrage at 450,000 ms, and call `finish(false)` at 480,000 ms if victory has not occurred.

- [ ] **Step 5: Run focused battle suite and commit**

Run: `npm test -- tests/web/battle/WaveScheduler.spec.ts tests/web/battle/BattleEngineBoss.spec.ts tests/web/battle/BattleEngineAutoFire.spec.ts tests/web/battle/BattleRenderer.spec.ts`

Expected: PASS, including scheduled XP budget and hard cap.

```bash
git add web/battle/BattleConfig.ts web/battle/WaveScheduler.ts web/battle/EnemyGeometry.ts web/battle/BattleEngine.ts web/battle/BattleRenderer.ts tests/web/battle
git commit -m "feat: rebalance battle pacing and enemy safe spawns"
```
