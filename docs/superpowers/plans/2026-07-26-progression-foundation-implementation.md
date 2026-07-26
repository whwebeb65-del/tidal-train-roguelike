# Progression Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tested, persistence-ready account level, stamina, and permanent skill-mastery domain systems without changing battle behavior yet.

**Architecture:** Pure functions in `src/domain/progression` own all curves and settlement calculations. `PlayerSave` version 4 persists only source-of-truth XP and stamina fields; levels, speed unlocks, permanent multipliers, and skill variants are derived. The later battle and runtime plans consume these exported interfaces.

**Tech Stack:** TypeScript 5.7, Vitest 4, existing `SaveRepository` patterns, no new dependencies.

**Execution Order:** Plan 1 of 4. It has no dependency on the other plans.

## Global Constraints

- Account level and station level remain separate.
- New saves start at account Lv.1, 0 XP, 30/30 stamina, and all three skills at mastery Lv.1 with 0 XP.
- Stamina regenerates 1 point per 10 minutes to a maximum of 30; a normal run costs 5; no purchase or ad refill is added.
- Skill mastery caps at Lv.20; account speed unlocks are 1.5× at Lv.10, 2× at Lv.20, and 3× at Lv.30.
- Skill mastery permanent power is `1 + 0.0075 × (level - 1)`, capped at 1.1425.
- Store clocks as integer epoch milliseconds and handle clock rollback without granting or removing stamina.
- Every domain mutation is pure and returns fresh collections.
- Use TDD, exact focused test commands, and one commit per task.

---

## File Structure

- Create `src/domain/skill/SkillProgressionTypes.ts`: shared skill and variant IDs used by save, progression, and battle code.
- Create `src/domain/progression/SkillMasterySystem.ts`: mastery XP, levels, unlocks, and settlement.
- Create `src/domain/progression/AccountProgressionSystem.ts`: account XP sources, level curve, and speed unlocks.
- Create `src/domain/progression/StaminaSystem.ts`: regeneration and normal-run consumption.
- Modify `src/save/SaveRepository.ts`: save version 4, defaults, deep clone, validation, and v1–v3 migration.
- Create corresponding focused tests under `tests/domain/progression` and extend `tests/save/SaveRepository.spec.ts`.

### Task 1: Shared Skill Progression Types

**Files:**
- Create: `src/domain/skill/SkillProgressionTypes.ts`
- Create: `tests/domain/progression/SkillProgressionTypes.spec.ts`

**Interfaces:**
- Produces: `BATTLE_SKILL_IDS`, `BattleSkillId`, `SKILL_VARIANT_IDS`, `SkillVariantId`, `SKILL_VARIANTS_BY_SKILL`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing catalog test**

```ts
import { describe, expect, it } from 'vitest';
import {
  BATTLE_SKILL_IDS,
  SKILL_VARIANT_IDS,
  SKILL_VARIANTS_BY_SKILL,
} from '../../../src/domain/skill/SkillProgressionTypes';

describe('SkillProgressionTypes', () => {
  it('declares three skills and four unique variants per skill', () => {
    expect(BATTLE_SKILL_IDS).toEqual([
      'tidal-volley',
      'bubble-barrier',
      'extreme-tide',
    ]);
    expect(SKILL_VARIANT_IDS).toHaveLength(12);
    expect(new Set(SKILL_VARIANT_IDS).size).toBe(12);
    for (const skillId of BATTLE_SKILL_IDS) {
      expect(SKILL_VARIANTS_BY_SKILL[skillId]).toHaveLength(4);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm test -- tests/domain/progression/SkillProgressionTypes.spec.ts`

Expected: FAIL because `SkillProgressionTypes.ts` does not exist.

- [ ] **Step 3: Create the complete shared catalog**

```ts
export const BATTLE_SKILL_IDS = [
  'tidal-volley',
  'bubble-barrier',
  'extreme-tide',
] as const;
export type BattleSkillId = (typeof BATTLE_SKILL_IDS)[number];

export const SKILL_VARIANTS_BY_SKILL = {
  'tidal-volley': [
    'split-tide-arrow',
    'reef-piercer',
    'returning-volley',
    'rainstorm-school',
  ],
  'bubble-barrier': [
    'bursting-bubble',
    'reflective-spines',
    'overflow-membrane',
    'emergency-trigger',
  ],
  'extreme-tide': [
    'undertow-eye',
    'lingering-vortex',
    'energy-return',
    'double-crest',
  ],
} as const satisfies Readonly<Record<BattleSkillId, readonly string[]>>;

export const SKILL_VARIANT_IDS = [
  ...SKILL_VARIANTS_BY_SKILL['tidal-volley'],
  ...SKILL_VARIANTS_BY_SKILL['bubble-barrier'],
  ...SKILL_VARIANTS_BY_SKILL['extreme-tide'],
] as const;
export type SkillVariantId = (typeof SKILL_VARIANT_IDS)[number];
```

- [ ] **Step 4: Run the focused test**

Run: `npm test -- tests/domain/progression/SkillProgressionTypes.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/skill/SkillProgressionTypes.ts tests/domain/progression/SkillProgressionTypes.spec.ts
git commit -m "feat: add shared skill progression catalog"
```

### Task 2: Skill Mastery Domain

**Files:**
- Create: `src/domain/progression/SkillMasterySystem.ts`
- Create: `tests/domain/progression/SkillMasterySystem.spec.ts`

**Interfaces:**
- Consumes: `BattleSkillId`, `SkillVariantId`, `BATTLE_SKILL_IDS`, `SKILL_VARIANTS_BY_SKILL`.
- Produces: `SkillMasteryXp`, `createSkillMasteryXp()`, `skillMasteryLevelFromXp()`, `skillMasteryPowerMultiplier()`, `unlockedSkillVariants()`, `settleSkillMastery()`.

- [ ] **Step 1: Write failing curve and settlement tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  createSkillMasteryXp,
  settleSkillMastery,
  skillMasteryLevelFromXp,
  skillMasteryPowerMultiplier,
  unlockedSkillVariants,
} from '../../../src/domain/progression/SkillMasterySystem';

describe('SkillMasterySystem', () => {
  it('uses the 20 + 8n curve and caps level and power at twenty', () => {
    expect(skillMasteryLevelFromXp(0)).toBe(1);
    expect(skillMasteryLevelFromXp(19)).toBe(1);
    expect(skillMasteryLevelFromXp(20)).toBe(2);
    expect(skillMasteryLevelFromXp(Number.MAX_SAFE_INTEGER)).toBe(20);
    expect(skillMasteryPowerMultiplier(20)).toBeCloseTo(1.1425);
  });

  it('caps cast XP per skill and adds first-clear XP only to used skills', () => {
    const result = settleSkillMastery(createSkillMasteryXp(), {
      castCounts: {
        'tidal-volley': 99,
        'bubble-barrier': 2,
        'extreme-tide': 1,
      },
      firstClear: true,
    });
    expect(result.gainedXp).toEqual({
      'tidal-volley': 100,
      'bubble-barrier': 50,
      'extreme-tide': 50,
    });
    expect(result.nextXp).toEqual(result.gainedXp);
  });

  it('unlocks one ordered variant at mastery 5, 10, 15 and 20', () => {
    expect(unlockedSkillVariants('tidal-volley', 4)).toEqual([]);
    expect(unlockedSkillVariants('tidal-volley', 10)).toEqual([
      'split-tide-arrow',
      'reef-piercer',
    ]);
    expect(unlockedSkillVariants('tidal-volley', 20)).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/domain/progression/SkillMasterySystem.spec.ts`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the complete pure mastery system**

```ts
import {
  BATTLE_SKILL_IDS,
  SKILL_VARIANTS_BY_SKILL,
  type BattleSkillId,
  type SkillVariantId,
} from '../skill/SkillProgressionTypes';

export type SkillMasteryXp = Record<BattleSkillId, number>;
export type SkillCastCounts = Record<BattleSkillId, number>;

const MAX_LEVEL = 20;
const CAST_XP: Readonly<Record<BattleSkillId, number>> = {
  'tidal-volley': 5,
  'bubble-barrier': 5,
  'extreme-tide': 10,
};
const CAST_XP_CAP = 60;
const FIRST_CLEAR_XP = 40;
const MILESTONES = [5, 10, 15, 20] as const;

export function createSkillMasteryXp(): SkillMasteryXp {
  return Object.fromEntries(
    BATTLE_SKILL_IDS.map((id) => [id, 0]),
  ) as SkillMasteryXp;
}

export function skillMasteryLevelFromXp(totalXp: number): number {
  let remaining = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (level < MAX_LEVEL) {
    const required = 20 + 8 * (level - 1);
    if (remaining < required) break;
    remaining -= required;
    level += 1;
  }
  return level;
}

export function skillMasteryPowerMultiplier(level: number): number {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return 1 + 0.0075 * (safeLevel - 1);
}

export function unlockedSkillVariants(
  skillId: BattleSkillId,
  level: number,
): readonly SkillVariantId[] {
  const count = MILESTONES.filter((milestone) => level >= milestone).length;
  return SKILL_VARIANTS_BY_SKILL[skillId].slice(0, count);
}

export function settleSkillMastery(
  currentXp: Readonly<SkillMasteryXp>,
  input: {
    readonly castCounts: Readonly<SkillCastCounts>;
    readonly firstClear: boolean;
  },
): {
  readonly nextXp: SkillMasteryXp;
  readonly gainedXp: SkillMasteryXp;
} {
  const gainedXp = createSkillMasteryXp();
  const nextXp = createSkillMasteryXp();
  for (const skillId of BATTLE_SKILL_IDS) {
    const casts = Math.max(0, Math.floor(input.castCounts[skillId] ?? 0));
    const castGain = Math.min(CAST_XP_CAP, casts * CAST_XP[skillId]);
    const firstClearGain = input.firstClear && casts > 0 ? FIRST_CLEAR_XP : 0;
    gainedXp[skillId] = castGain + firstClearGain;
    nextXp[skillId] = Math.max(
      0,
      Math.floor(currentXp[skillId] ?? 0),
    ) + gainedXp[skillId];
  }
  return { nextXp, gainedXp };
}
```

- [ ] **Step 4: Run focused and progression tests**

Run: `npm test -- tests/domain/progression/SkillMasterySystem.spec.ts tests/domain/progression/SkillProgressionTypes.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/progression/SkillMasterySystem.ts tests/domain/progression/SkillMasterySystem.spec.ts
git commit -m "feat: add permanent skill mastery progression"
```

### Task 3: Account Level and Speed Unlock Domain

**Files:**
- Create: `src/domain/progression/AccountProgressionSystem.ts`
- Create: `tests/domain/progression/AccountProgressionSystem.spec.ts`

**Interfaces:**
- Produces: `AccountProgress`, `BattleAccountXpInput`, `accountXpToNextLevel()`, `grantAccountXp()`, `calculateBattleAccountXp()`, `availableBattleSpeeds()`, `maximumBattleSpeed()`.

- [ ] **Step 1: Write failing XP and unlock tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  accountXpToNextLevel,
  availableBattleSpeeds,
  calculateBattleAccountXp,
  grantAccountXp,
} from '../../../src/domain/progression/AccountProgressionSystem';

describe('AccountProgressionSystem', () => {
  it('uses the fast early curve and carries XP across multiple levels', () => {
    expect(accountXpToNextLevel(1)).toBe(80);
    expect(accountXpToNextLevel(9)).toBe(160);
    expect(accountXpToNextLevel(10)).toBe(170);
    expect(grantAccountXp({ level: 1, xp: 70 }, 30)).toEqual({
      level: 2,
      xp: 20,
      levelsGained: 1,
    });
  });

  it('awards account XP from kills, first clear, and stamina', () => {
    expect(calculateBattleAccountXp({
      normalKills: 100,
      eliteKills: 1,
      bossKills: 1,
      firstClear: true,
      staminaSpent: 5,
    })).toEqual({
      normalKills: 100,
      eliteKills: 15,
      bossKills: 30,
      firstClear: 120,
      staminaSpent: 50,
      total: 315,
    });
  });

  it('unlocks speed tiers at levels 10, 20 and 30', () => {
    expect(availableBattleSpeeds(9)).toEqual([1]);
    expect(availableBattleSpeeds(10)).toEqual([1, 1.5]);
    expect(availableBattleSpeeds(20)).toEqual([1, 1.5, 2]);
    expect(availableBattleSpeeds(30)).toEqual([1, 1.5, 2, 3]);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module**

Run: `npm test -- tests/domain/progression/AccountProgressionSystem.spec.ts`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the complete account system**

```ts
export type BattleSpeed = 1 | 1.5 | 2 | 3;
export interface AccountProgress {
  readonly level: number;
  readonly xp: number;
}
export interface AccountProgressResult extends AccountProgress {
  readonly levelsGained: number;
}
export interface BattleAccountXpInput {
  readonly normalKills: number;
  readonly eliteKills: number;
  readonly bossKills: number;
  readonly firstClear: boolean;
  readonly staminaSpent: number;
}

export function accountXpToNextLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return safe < 10
    ? 80 + 10 * (safe - 1)
    : 170 + 20 * (safe - 10);
}

export function grantAccountXp(
  current: AccountProgress,
  amount: number,
): AccountProgressResult {
  let level = Math.max(1, Math.floor(current.level));
  let xp = Math.max(0, Math.floor(current.xp))
    + Math.max(0, Math.floor(amount));
  let levelsGained = 0;
  while (xp >= accountXpToNextLevel(level)) {
    xp -= accountXpToNextLevel(level);
    level += 1;
    levelsGained += 1;
  }
  return { level, xp, levelsGained };
}

export function calculateBattleAccountXp(
  input: BattleAccountXpInput,
): Readonly<Record<keyof BattleAccountXpInput | 'total', number>> {
  const result = {
    normalKills: Math.max(0, Math.floor(input.normalKills)),
    eliteKills: Math.max(0, Math.floor(input.eliteKills)) * 15,
    bossKills: Math.max(0, Math.floor(input.bossKills)) * 30,
    firstClear: input.firstClear ? 120 : 0,
    staminaSpent: Math.max(0, Math.floor(input.staminaSpent)) * 10,
  };
  return { ...result, total: Object.values(result).reduce((a, b) => a + b, 0) };
}

export function availableBattleSpeeds(level: number): readonly BattleSpeed[] {
  if (level >= 30) return [1, 1.5, 2, 3];
  if (level >= 20) return [1, 1.5, 2];
  if (level >= 10) return [1, 1.5];
  return [1];
}

export function maximumBattleSpeed(level: number): BattleSpeed {
  return availableBattleSpeeds(level).at(-1) ?? 1;
}
```

- [ ] **Step 4: Run the focused test**

Run: `npm test -- tests/domain/progression/AccountProgressionSystem.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/progression/AccountProgressionSystem.ts tests/domain/progression/AccountProgressionSystem.spec.ts
git commit -m "feat: add account level and speed unlock curves"
```

### Task 4: Stamina Domain

**Files:**
- Create: `src/domain/progression/StaminaSystem.ts`
- Create: `tests/domain/progression/StaminaSystem.spec.ts`

**Interfaces:**
- Produces: `StaminaState`, `recoverStamina()`, `spendNormalRunStamina()`, constants `MAX_STAMINA`, `NORMAL_RUN_STAMINA_COST`, `STAMINA_REGEN_MS`.

- [ ] **Step 1: Write failing recovery and spend tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  recoverStamina,
  spendNormalRunStamina,
} from '../../../src/domain/progression/StaminaSystem';

describe('StaminaSystem', () => {
  it('recovers one point per ten minutes and preserves remainder time', () => {
    expect(recoverStamina(
      { stamina: 20, staminaUpdatedAtMs: 1_000 },
      1_231_000,
    )).toEqual({ stamina: 22, staminaUpdatedAtMs: 1_201_000 });
  });

  it('caps at thirty and normalizes clock rollback without granting stamina', () => {
    expect(recoverStamina(
      { stamina: 29, staminaUpdatedAtMs: 1_000 },
      1_801_000,
    )).toEqual({ stamina: 30, staminaUpdatedAtMs: 1_801_000 });
    expect(recoverStamina(
      { stamina: 9, staminaUpdatedAtMs: 5_000 },
      4_000,
    )).toEqual({ stamina: 9, staminaUpdatedAtMs: 4_000 });
  });

  it('spends exactly five stamina or returns an unchanged failure', () => {
    expect(spendNormalRunStamina(
      { stamina: 5, staminaUpdatedAtMs: 100 },
    )).toEqual({
      accepted: true,
      spent: 5,
      state: { stamina: 0, staminaUpdatedAtMs: 100 },
    });
    expect(spendNormalRunStamina(
      { stamina: 4, staminaUpdatedAtMs: 100 },
    ).accepted).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/domain/progression/StaminaSystem.spec.ts`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the complete stamina system**

```ts
export const MAX_STAMINA = 30;
export const NORMAL_RUN_STAMINA_COST = 5;
export const STAMINA_REGEN_MS = 10 * 60 * 1000;

export interface StaminaState {
  readonly stamina: number;
  readonly staminaUpdatedAtMs: number;
}

export function recoverStamina(
  state: StaminaState,
  nowMs: number,
): StaminaState {
  const now = Math.max(0, Math.floor(nowMs));
  const current = Math.max(0, Math.min(MAX_STAMINA, Math.floor(state.stamina)));
  if (now <= state.staminaUpdatedAtMs || current >= MAX_STAMINA) {
    return { stamina: current, staminaUpdatedAtMs: now };
  }
  const recovered = Math.floor((now - state.staminaUpdatedAtMs) / STAMINA_REGEN_MS);
  const stamina = Math.min(MAX_STAMINA, current + recovered);
  return {
    stamina,
    staminaUpdatedAtMs: stamina >= MAX_STAMINA
      ? now
      : state.staminaUpdatedAtMs + recovered * STAMINA_REGEN_MS,
  };
}

export function spendNormalRunStamina(state: StaminaState): {
  readonly accepted: boolean;
  readonly spent: number;
  readonly state: StaminaState;
} {
  if (state.stamina < NORMAL_RUN_STAMINA_COST) {
    return { accepted: false, spent: 0, state: { ...state } };
  }
  return {
    accepted: true,
    spent: NORMAL_RUN_STAMINA_COST,
    state: {
      stamina: state.stamina - NORMAL_RUN_STAMINA_COST,
      staminaUpdatedAtMs: state.staminaUpdatedAtMs,
    },
  };
}
```

- [ ] **Step 4: Run the focused test**

Run: `npm test -- tests/domain/progression/StaminaSystem.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/progression/StaminaSystem.ts tests/domain/progression/StaminaSystem.spec.ts
git commit -m "feat: add deterministic stamina recovery"
```

### Task 5: Save Version 4 Migration

**Files:**
- Modify: `src/save/SaveRepository.ts`
- Modify: `tests/save/SaveRepository.spec.ts`

**Interfaces:**
- Consumes: `SkillMasteryXp`, `createSkillMasteryXp()`.
- Produces: `PlayerSave` version 4 with `accountLevel`, `accountXp`, `stamina`, `staminaUpdatedAtMs`, `skillMasteryXp`.

- [ ] **Step 1: Add failing default, deep-copy, validation, and v3 migration tests**

```ts
it('creates version four progression defaults', () => {
  expect(defaultSave()).toMatchObject({
    version: 4,
    accountLevel: 1,
    accountXp: 0,
    stamina: 30,
    skillMasteryXp: {
      'tidal-volley': 0,
      'bubble-barrier': 0,
      'extreme-tide': 0,
    },
  });
});

it('migrates version three saves without losing existing progress', () => {
  const current = defaultSave();
  const migrated = normalizePlayerSave({
    ...current,
    version: 3,
    accountLevel: undefined,
    accountXp: undefined,
    stamina: undefined,
    staminaUpdatedAtMs: undefined,
    skillMasteryXp: undefined,
  });
  expect(migrated.version).toBe(4);
  expect(migrated.gears).toBe(current.gears);
  expect(migrated.accountLevel).toBe(1);
});

it('deep copies skill mastery and rejects invalid persistent progression', () => {
  const repository = createMemorySaveRepository();
  const save = repository.load();
  save.skillMasteryXp['tidal-volley'] = 20;
  repository.save(save);
  save.skillMasteryXp['tidal-volley'] = 999;
  expect(repository.load().skillMasteryXp['tidal-volley']).toBe(20);
  expect(() => repository.save({
    ...repository.load(),
    stamina: 31,
  })).toThrow('Stamina must be between 0 and 30');
});
```

- [ ] **Step 2: Run save tests**

Run: `npm test -- tests/save/SaveRepository.spec.ts`

Expected: FAIL because the save is still version 3 and fields are missing.

- [ ] **Step 3: Extend `PlayerSave`, defaults, cloning, validation, and normalization**

Add these fields to `PlayerSave`:

```ts
readonly version: 4;
readonly accountLevel: number;
readonly accountXp: number;
readonly stamina: number;
readonly staminaUpdatedAtMs: number;
readonly skillMasteryXp: SkillMasteryXp;
```

Use these exact defaults:

```ts
version: 4,
accountLevel: 1,
accountXp: 0,
stamina: 30,
staminaUpdatedAtMs: 0,
skillMasteryXp: createSkillMasteryXp(),
```

Add this exact clone fragment:

```ts
accountLevel: save.accountLevel,
accountXp: save.accountXp,
stamina: save.stamina,
staminaUpdatedAtMs: save.staminaUpdatedAtMs,
skillMasteryXp: { ...save.skillMasteryXp },
```

Accept versions 1–4 in `normalizePlayerSave()`. For version 4 read the five new fields; for versions 1–3 use the defaults above. Validate account level as a positive integer, account XP and skill XP as finite non-negative numbers, stamina as an integer in `0..30`, timestamp as a finite non-negative number, and require exactly the three known skill keys.

- [ ] **Step 4: Run save and all progression tests**

Run: `npm test -- tests/save/SaveRepository.spec.ts tests/domain/progression`

Expected: PASS.

- [ ] **Step 5: Run typecheck and commit**

Run: `npm run typecheck`

Expected: PASS after all existing version assertions and fixtures are updated to version 4.

```bash
git add src/save/SaveRepository.ts tests/save/SaveRepository.spec.ts tests
git commit -m "feat: migrate player progression save to version four"
```
