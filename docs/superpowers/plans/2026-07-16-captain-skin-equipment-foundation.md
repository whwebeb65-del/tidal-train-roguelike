# Captain, Skin, and Equipment Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested domain foundation for selectable male/female captains, permanently stacking owned-skin bonuses, four-slot equipment progression, save version 3, deterministic purchases, and shared progression stats.

**Architecture:** Keep captain, skin, equipment, and stat aggregation in small pure TypeScript modules under `src/domain`. Persist only catalog IDs and equipment instances in `PlayerSave`; the UI submits commands and never computes ownership or combat stats itself. Integrate the resulting `ProgressionSnapshot` into the existing combat and settlement paths without changing baseline results for accounts with only the default skin and starter equipment.

**Tech Stack:** TypeScript 5.7, Vitest 2, Vite 5, local-storage-backed repository, existing Mock store and telemetry.

## Global Constraints

- Provide exactly two base captains: `captain-tide-female` and `captain-tide-male`; their base combat values must be identical.
- Owned skin bonuses are account-wide, permanent, additive by stat category, and active in every game mode.
- Count each unique `skinId` once; duplicate grants and duplicate verified callbacks must not add stats again.
- Do not add a fair mode, stat normalization, a skin-bonus cap, paid random skins, or paid random equipment boxes.
- Only equipped equipment contributes stats; equipment is account-wide and survives captain switching.
- Preserve existing results when only `skin-tide-base` is active and the granted starter equipment has not yet been equipped.
- Keep verified-purchase idempotency and the existing `ownedCosmeticIds` migration behavior.
- No real payment SDK, secret, receipt, collection code, or production order credential may enter the repository.

---

## File Structure

Create:

- `src/domain/progression/ProgressionTypes.ts` — shared permanent-stat types and zero/default helpers.
- `src/domain/captain/CaptainCatalog.ts` — immutable captain definitions.
- `src/domain/captain/CaptainProfileSystem.ts` — selection, switching, and equipped-skin state.
- `src/domain/skin/SkinCatalog.ts` — deterministic skin definitions and variants.
- `src/domain/skin/SkinCollectionSystem.ts` — owned-skin normalization and account-wide stat aggregation.
- `src/domain/equipment/EquipmentCatalog.ts` — eight launch equipment definitions and two set definitions.
- `src/domain/equipment/EquipmentSystem.ts` — inventory, equip, upgrade, star, reroll, and set aggregation.
- `src/domain/progression/ProgressionStatService.ts` — final combat/economy snapshot.
- Corresponding focused Vitest files under `tests/domain`.

Modify:

- `src/save/SaveRepository.ts` and `tests/save/SaveRepository.spec.ts` — save version 3 and migration.
- `src/domain/combat/CombatLoopSystem.ts` and its tests — percentage damage and repair modifiers.
- `src/domain/commerce/ProductCatalog.ts`, `PurchaseService.ts`, and tests — deterministic skin/equipment rewards.
- `src/telemetry/TelemetryEvents.ts` and tests — progression event names.
- `web/main.ts` — minimal stat wiring only; visual UI belongs to Plan 2.

## Task 1: Shared progression types and captain profile

**Files:**

- Create: `src/domain/progression/ProgressionTypes.ts`
- Create: `src/domain/captain/CaptainCatalog.ts`
- Create: `src/domain/captain/CaptainProfileSystem.ts`
- Create: `tests/domain/captain/CaptainProfileSystem.spec.ts`

**Interfaces:**

- Produces:
  - `CaptainId`
  - `PermanentStatModifiers`
  - `CaptainProfileState`
  - `selectCaptain(state, captainId)`
  - `equipCaptainSkin(state, captainId, skinId)`
- Consumed by Tasks 2, 4, 5, and Plan 2.

- [ ] **Step 1: Write the failing captain-profile tests**

```ts
import { describe, expect, it } from 'vitest';
import { CAPTAIN_CATALOG } from '../../../src/domain/captain/CaptainCatalog';
import {
  createCaptainProfileState,
  equipCaptainSkin,
  selectCaptain,
} from '../../../src/domain/captain/CaptainProfileSystem';

describe('CaptainProfileSystem', () => {
  it('offers two captains with identical base stats', () => {
    expect(CAPTAIN_CATALOG.map((captain) => captain.id)).toEqual([
      'captain-tide-female',
      'captain-tide-male',
    ]);
    expect(CAPTAIN_CATALOG[0]?.baseStats).toEqual(CAPTAIN_CATALOG[1]?.baseStats);
  });

  it('selects and switches captains without changing equipped skins', () => {
    const initial = createCaptainProfileState();
    const female = selectCaptain(initial, 'captain-tide-female');
    const skinned = equipCaptainSkin(
      female,
      'captain-tide-female',
      'skin-aurora-whale-song',
    );
    const male = selectCaptain(skinned, 'captain-tide-male');

    expect(male.selectedCaptainId).toBe('captain-tide-male');
    expect(male.equippedSkinIds['captain-tide-female']).toBe(
      'skin-aurora-whale-song',
    );
  });

  it('rejects unknown captains', () => {
    expect(() => selectCaptain(
      createCaptainProfileState(),
      'unknown' as never,
    )).toThrow('Unknown captain: unknown');
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npm test -- tests/domain/captain/CaptainProfileSystem.spec.ts
```

Expected: FAIL because the captain modules do not exist.

- [ ] **Step 3: Implement shared types and the captain catalog**

```ts
// src/domain/progression/ProgressionTypes.ts
export interface PermanentStatModifiers {
  readonly maxHpFlat: number;
  readonly maxHpPercent: number;
  readonly damageFlat: number;
  readonly damagePercent: number;
  readonly gearsPercent: number;
  readonly initialMomentum: number;
  readonly repairFlat: number;
}

export function zeroPermanentStatModifiers(): PermanentStatModifiers {
  return {
    maxHpFlat: 0,
    maxHpPercent: 0,
    damageFlat: 0,
    damagePercent: 0,
    gearsPercent: 0,
    initialMomentum: 0,
    repairFlat: 0,
  };
}

export function addPermanentStatModifiers(
  left: PermanentStatModifiers,
  right: PermanentStatModifiers,
): PermanentStatModifiers {
  return {
    maxHpFlat: left.maxHpFlat + right.maxHpFlat,
    maxHpPercent: left.maxHpPercent + right.maxHpPercent,
    damageFlat: left.damageFlat + right.damageFlat,
    damagePercent: left.damagePercent + right.damagePercent,
    gearsPercent: left.gearsPercent + right.gearsPercent,
    initialMomentum: left.initialMomentum + right.initialMomentum,
    repairFlat: left.repairFlat + right.repairFlat,
  };
}
```

```ts
// src/domain/captain/CaptainCatalog.ts
import type { PermanentStatModifiers } from '../progression/ProgressionTypes';
import { zeroPermanentStatModifiers } from '../progression/ProgressionTypes';

export type CaptainId = 'captain-tide-female' | 'captain-tide-male';

export interface CaptainDefinition {
  readonly id: CaptainId;
  readonly name: string;
  readonly pronounLabel: string;
  readonly baseSkinId: 'skin-tide-base';
  readonly baseStats: PermanentStatModifiers;
}

export const CAPTAIN_CATALOG: readonly CaptainDefinition[] = [
  {
    id: 'captain-tide-female',
    name: '潮灯列车长',
    pronounLabel: '女列车长',
    baseSkinId: 'skin-tide-base',
    baseStats: zeroPermanentStatModifiers(),
  },
  {
    id: 'captain-tide-male',
    name: '罗盘列车长',
    pronounLabel: '男列车长',
    baseSkinId: 'skin-tide-base',
    baseStats: zeroPermanentStatModifiers(),
  },
];

export function getCaptainDefinition(id: CaptainId): CaptainDefinition {
  const definition = CAPTAIN_CATALOG.find((captain) => captain.id === id);
  if (!definition) throw new Error(`Unknown captain: ${id}`);
  return definition;
}
```

- [ ] **Step 4: Implement captain selection and skin-equipment state**

```ts
// src/domain/captain/CaptainProfileSystem.ts
import {
  CAPTAIN_CATALOG,
  getCaptainDefinition,
  type CaptainId,
} from './CaptainCatalog';

export interface CaptainProfileState {
  readonly selectedCaptainId: CaptainId | null;
  readonly equippedSkinIds: Readonly<Partial<Record<CaptainId, string>>>;
}

export function createCaptainProfileState(): CaptainProfileState {
  return {
    selectedCaptainId: null,
    equippedSkinIds: Object.fromEntries(
      CAPTAIN_CATALOG.map((captain) => [captain.id, captain.baseSkinId]),
    ),
  };
}

export function normalizeCaptainProfileState(
  candidate: CaptainProfileState,
): CaptainProfileState {
  const selectedCaptainId = candidate.selectedCaptainId;
  if (selectedCaptainId !== null) getCaptainDefinition(selectedCaptainId);

  return {
    selectedCaptainId,
    equippedSkinIds: Object.fromEntries(
      CAPTAIN_CATALOG.map((captain) => [
        captain.id,
        candidate.equippedSkinIds[captain.id] ?? captain.baseSkinId,
      ]),
    ),
  };
}

export function selectCaptain(
  state: CaptainProfileState,
  captainId: CaptainId,
): CaptainProfileState {
  getCaptainDefinition(captainId);
  return normalizeCaptainProfileState({
    ...state,
    selectedCaptainId: captainId,
  });
}

export function equipCaptainSkin(
  state: CaptainProfileState,
  captainId: CaptainId,
  skinId: string,
): CaptainProfileState {
  getCaptainDefinition(captainId);
  return normalizeCaptainProfileState({
    ...state,
    equippedSkinIds: {
      ...state.equippedSkinIds,
      [captainId]: skinId,
    },
  });
}
```

- [ ] **Step 5: Run the focused tests**

Run:

```powershell
npm test -- tests/domain/captain/CaptainProfileSystem.spec.ts
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/domain/progression/ProgressionTypes.ts src/domain/captain tests/domain/captain
git commit -m "feat: add selectable tide captains"
```

## Task 2: Skin catalog and permanent collection bonuses

**Files:**

- Create: `src/domain/skin/SkinCatalog.ts`
- Create: `src/domain/skin/SkinCollectionSystem.ts`
- Create: `tests/domain/skin/SkinCollectionSystem.spec.ts`

**Interfaces:**

- Consumes: `CaptainId`, `PermanentStatModifiers`.
- Produces:
  - `SkinId`
  - `SKIN_CATALOG`
  - `normalizeOwnedSkinIds(ids)`
  - `getSkinCollectionModifiers(ids)`
  - `canCaptainWearSkin(captainId, skinId)`

- [ ] **Step 1: Write failing tests for unique, stacking ownership**

```ts
import { describe, expect, it } from 'vitest';
import {
  canCaptainWearSkin,
  getSkinCollectionModifiers,
  normalizeOwnedSkinIds,
} from '../../../src/domain/skin/SkinCollectionSystem';

describe('SkinCollectionSystem', () => {
  it('deduplicates skin ownership and always retains the base skin', () => {
    expect(normalizeOwnedSkinIds([
      'skin-aurora-whale-song',
      'skin-aurora-whale-song',
    ])).toEqual(['skin-tide-base', 'skin-aurora-whale-song']);
  });

  it('adds all unique owned-skin bonuses without a cap', () => {
    const modifiers = getSkinCollectionModifiers([
      'skin-seafoam-departure',
      'skin-aurora-whale-song',
    ]);

    expect(modifiers.maxHpPercent).toBeCloseTo(0.015);
    expect(modifiers.damagePercent).toBeCloseTo(0.005);
    expect(modifiers.gearsPercent).toBeCloseTo(0.005);
  });

  it('allows both captains to wear each launch skin', () => {
    expect(canCaptainWearSkin(
      'captain-tide-female',
      'skin-aurora-whale-song',
    )).toBe(true);
    expect(canCaptainWearSkin(
      'captain-tide-male',
      'skin-aurora-whale-song',
    )).toBe(true);
  });

  it('ignores unknown skin IDs when aggregating stats', () => {
    expect(getSkinCollectionModifiers(['unknown-skin']).maxHpPercent).toBe(0);
  });
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
npm test -- tests/domain/skin/SkinCollectionSystem.spec.ts
```

Expected: FAIL because the skin modules do not exist.

- [ ] **Step 3: Implement the deterministic launch skin catalog**

```ts
// src/domain/skin/SkinCatalog.ts
import type { CaptainId } from '../captain/CaptainCatalog';
import type { PermanentStatModifiers } from '../progression/ProgressionTypes';
import { zeroPermanentStatModifiers } from '../progression/ProgressionTypes';

export type SkinId =
  | 'skin-tide-base'
  | 'skin-seafoam-departure'
  | 'skin-aurora-whale-song';

export type SkinRarity = 'base' | 'common' | 'rare' | 'epic' | 'legendary';

export interface SkinDefinition {
  readonly id: SkinId;
  readonly name: string;
  readonly rarity: SkinRarity;
  readonly wearableBy: readonly CaptainId[];
  readonly variants: Readonly<Record<CaptainId, string>>;
  readonly modifiers: PermanentStatModifiers;
}

const BOTH_CAPTAINS: readonly CaptainId[] = [
  'captain-tide-female',
  'captain-tide-male',
];

export const SKIN_CATALOG: readonly SkinDefinition[] = [
  {
    id: 'skin-tide-base',
    name: '潮汐制服',
    rarity: 'base',
    wearableBy: BOTH_CAPTAINS,
    variants: {
      'captain-tide-female': 'captain-female-base',
      'captain-tide-male': 'captain-male-base',
    },
    modifiers: zeroPermanentStatModifiers(),
  },
  {
    id: 'skin-seafoam-departure',
    name: '海沫启航',
    rarity: 'common',
    wearableBy: BOTH_CAPTAINS,
    variants: {
      'captain-tide-female': 'captain-female-seafoam',
      'captain-tide-male': 'captain-male-seafoam',
    },
    modifiers: {
      ...zeroPermanentStatModifiers(),
      maxHpPercent: 0.005,
    },
  },
  {
    id: 'skin-aurora-whale-song',
    name: '极光鲸歌',
    rarity: 'legendary',
    wearableBy: BOTH_CAPTAINS,
    variants: {
      'captain-tide-female': 'captain-female-aurora',
      'captain-tide-male': 'captain-male-aurora',
    },
    modifiers: {
      ...zeroPermanentStatModifiers(),
      maxHpPercent: 0.01,
      damagePercent: 0.005,
      gearsPercent: 0.005,
    },
  },
];

export function getSkinDefinition(id: string): SkinDefinition | undefined {
  return SKIN_CATALOG.find((skin) => skin.id === id);
}
```

- [ ] **Step 4: Implement ownership normalization and unbounded additive aggregation**

```ts
// src/domain/skin/SkinCollectionSystem.ts
import type { CaptainId } from '../captain/CaptainCatalog';
import {
  addPermanentStatModifiers,
  zeroPermanentStatModifiers,
} from '../progression/ProgressionTypes';
import {
  getSkinDefinition,
  type SkinId,
} from './SkinCatalog';

export function normalizeOwnedSkinIds(ids: readonly string[]): readonly string[] {
  return [...new Set(['skin-tide-base', ...ids.filter((id) => id.length > 0)])];
}

export function getSkinCollectionModifiers(
  ids: readonly string[],
) {
  return normalizeOwnedSkinIds(ids).reduce((total, id) => {
    const definition = getSkinDefinition(id);
    return definition
      ? addPermanentStatModifiers(total, definition.modifiers)
      : total;
  }, zeroPermanentStatModifiers());
}

export function canCaptainWearSkin(
  captainId: CaptainId,
  skinId: SkinId,
): boolean {
  return getSkinDefinition(skinId)?.wearableBy.includes(captainId) ?? false;
}
```

- [ ] **Step 5: Run the tests**

```powershell
npm test -- tests/domain/skin/SkinCollectionSystem.spec.ts
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/domain/skin tests/domain/skin
git commit -m "feat: add stacking captain skin collection"
```

## Task 3: Four-slot equipment catalog and progression

**Files:**

- Create: `src/domain/equipment/EquipmentCatalog.ts`
- Create: `src/domain/equipment/EquipmentSystem.ts`
- Create: `tests/domain/equipment/EquipmentSystem.spec.ts`

**Interfaces:**

- Produces:
  - `EquipmentSlot`
  - `EquipmentInstance`
  - `EquipmentState`
  - `createStarterEquipmentState()`
  - `equipEquipment(state, instanceId)`
  - `upgradeEquipment(state, instanceId)`
  - `starEquipment(state, instanceId)`
  - `rerollEquipment(state, instanceId, nextAffixes)`
  - `getEquipmentModifiers(state)`

- [ ] **Step 1: Write focused failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  createStarterEquipmentState,
  equipEquipment,
  getEquipmentModifiers,
  rerollEquipment,
  starEquipment,
  upgradeEquipment,
} from '../../../src/domain/equipment/EquipmentSystem';

describe('EquipmentSystem', () => {
  it('grants four starter pieces without changing baseline stats', () => {
    const state = createStarterEquipmentState();
    expect(state.inventory).toHaveLength(4);
    expect(Object.values(state.equippedEquipmentIds).filter(Boolean)).toHaveLength(0);
    expect(getEquipmentModifiers(state).maxHpPercent).toBe(0);
    expect(getEquipmentModifiers(state).repairFlat).toBe(0);
  });

  it('equips only into the matching slot', () => {
    const state = createStarterEquipmentState();
    const next = equipEquipment(state, 'starter:tide-cannon');
    expect(next.equippedEquipmentIds.cannon).toBe('starter:tide-cannon');
  });

  it('activates two-piece and four-piece bonuses after equipping the set', () => {
    let state = createStarterEquipmentState();
    for (const instance of state.inventory) {
      state = equipEquipment(state, instance.instanceId);
    }
    expect(getEquipmentModifiers(state).maxHpPercent).toBeCloseTo(0.03);
    expect(getEquipmentModifiers(state).repairFlat).toBe(8);
  });

  it('upgrades, stars, and rerolls one instance immutably', () => {
    const state = { ...createStarterEquipmentState(), gears: 500 };
    const upgraded = upgradeEquipment(state, 'starter:tide-cannon');
    const starred = starEquipment(
      { ...upgraded.state, fragments: { 'tide-cannon': 10 } },
      'starter:tide-cannon',
    );
    const rerolled = rerollEquipment(
      { ...starred.state, gears: 500 },
      'starter:tide-cannon',
      [{ id: 'damage-percent', value: 0.01 }],
    );

    expect(upgraded.accepted).toBe(true);
    expect(upgraded.state.inventory[0]?.level).toBe(2);
    expect(starred.accepted).toBe(true);
    expect(starred.state.inventory[0]?.stars).toBe(1);
    expect(rerolled.accepted).toBe(true);
    expect(rerolled.state.inventory[0]?.affixes).toEqual([
      { id: 'damage-percent', value: 0.01 },
    ]);
  });
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
npm test -- tests/domain/equipment/EquipmentSystem.spec.ts
```

Expected: FAIL because the equipment modules do not exist.

- [ ] **Step 3: Implement the launch catalog**

Create `EquipmentCatalog.ts` with these exact exported types and catalog data:

```ts
import type { PermanentStatModifiers } from '../progression/ProgressionTypes';
import { zeroPermanentStatModifiers } from '../progression/ProgressionTypes';

export type EquipmentSlot = 'cannon' | 'carriage' | 'core' | 'instrument';
export type EquipmentRarity = 'common' | 'rare' | 'epic';
export type EquipmentSetId = 'tide-guard' | 'coral-assault';
export type EquipmentAffixId =
  | 'max-hp-percent'
  | 'damage-percent'
  | 'gears-percent'
  | 'initial-momentum'
  | 'repair-flat';

export interface EquipmentAffix {
  readonly id: EquipmentAffixId;
  readonly value: number;
}

export interface EquipmentDefinition {
  readonly id: string;
  readonly name: string;
  readonly slot: EquipmentSlot;
  readonly rarity: EquipmentRarity;
  readonly setId: EquipmentSetId;
  readonly baseModifiers: PermanentStatModifiers;
}

function modifiers(
  overrides: Partial<PermanentStatModifiers>,
): PermanentStatModifiers {
  return { ...zeroPermanentStatModifiers(), ...overrides };
}

export const EQUIPMENT_CATALOG: readonly EquipmentDefinition[] = [
  { id: 'tide-cannon', name: '潮泡主炮', slot: 'cannon', rarity: 'common', setId: 'tide-guard', baseModifiers: modifiers({ damageFlat: 2 }) },
  { id: 'pearl-carriage', name: '珍珠车体', slot: 'carriage', rarity: 'common', setId: 'tide-guard', baseModifiers: modifiers({ maxHpFlat: 12 }) },
  { id: 'still-current-core', name: '静流动力核', slot: 'core', rarity: 'common', setId: 'tide-guard', baseModifiers: modifiers({ initialMomentum: 5 }) },
  { id: 'seafoam-instrument', name: '海沫潮汐仪', slot: 'instrument', rarity: 'common', setId: 'tide-guard', baseModifiers: modifiers({ repairFlat: 2 }) },
  { id: 'coral-cannon', name: '珊瑚主炮', slot: 'cannon', rarity: 'rare', setId: 'coral-assault', baseModifiers: modifiers({ damageFlat: 4 }) },
  { id: 'lightwave-carriage', name: '轻浪车体', slot: 'carriage', rarity: 'rare', setId: 'coral-assault', baseModifiers: modifiers({ maxHpFlat: 6 }) },
  { id: 'surge-core', name: '急流动力核', slot: 'core', rarity: 'rare', setId: 'coral-assault', baseModifiers: modifiers({ initialMomentum: 10 }) },
  { id: 'pursuit-instrument', name: '追潮仪', slot: 'instrument', rarity: 'rare', setId: 'coral-assault', baseModifiers: modifiers({ gearsPercent: 0.01 }) },
];

export const EQUIPMENT_SET_BONUSES = {
  'tide-guard': {
    twoPiece: modifiers({ maxHpPercent: 0.03 }),
    fourPiece: modifiers({ repairFlat: 6 }),
  },
  'coral-assault': {
    twoPiece: modifiers({ damagePercent: 0.03 }),
    fourPiece: modifiers({ initialMomentum: 15 }),
  },
} as const;

export function getEquipmentDefinition(id: string): EquipmentDefinition {
  const definition = EQUIPMENT_CATALOG.find((item) => item.id === id);
  if (!definition) throw new Error(`Unknown equipment: ${id}`);
  return definition;
}
```

- [ ] **Step 4: Implement immutable equipment operations**

In `EquipmentSystem.ts`, define:

```ts
import {
  addPermanentStatModifiers,
  zeroPermanentStatModifiers,
} from '../progression/ProgressionTypes';
import {
  EQUIPMENT_SET_BONUSES,
  getEquipmentDefinition,
  type EquipmentAffix,
  type EquipmentAffixId,
  type EquipmentSlot,
} from './EquipmentCatalog';

export interface EquipmentInstance {
  readonly instanceId: string;
  readonly definitionId: string;
  readonly level: number;
  readonly stars: number;
  readonly affixes: readonly EquipmentAffix[];
}

export interface EquipmentState {
  readonly inventory: readonly EquipmentInstance[];
  readonly equippedEquipmentIds: Readonly<Record<EquipmentSlot, string | null>>;
  readonly fragments: Readonly<Record<string, number>>;
  readonly gears: number;
}

export interface EquipmentMutationResult {
  readonly accepted: boolean;
  readonly reason?: 'not-found' | 'max-level' | 'max-stars' | 'insufficient-gears' | 'insufficient-fragments' | 'invalid-affixes';
  readonly state: EquipmentState;
}

const SLOTS: readonly EquipmentSlot[] = ['cannon', 'carriage', 'core', 'instrument'];
const VALID_AFFIXES: readonly EquipmentAffixId[] = [
  'max-hp-percent',
  'damage-percent',
  'gears-percent',
  'initial-momentum',
  'repair-flat',
];

export function createStarterEquipmentState(): EquipmentState {
  const definitions = ['tide-cannon', 'pearl-carriage', 'still-current-core', 'seafoam-instrument'];
  const inventory = definitions.map((definitionId) => ({
    instanceId: `starter:${definitionId}`,
    definitionId,
    level: 1,
    stars: 0,
    affixes: [],
  }));
  return {
    inventory,
    equippedEquipmentIds: {
      cannon: null,
      carriage: null,
      core: null,
      instrument: null,
    },
    fragments: {},
    gears: 0,
  };
}

function replaceInstance(
  state: EquipmentState,
  instanceId: string,
  update: (instance: EquipmentInstance) => EquipmentInstance,
): EquipmentState {
  return {
    ...state,
    inventory: state.inventory.map((instance) =>
      instance.instanceId === instanceId ? update(instance) : instance),
  };
}

export function equipEquipment(
  state: EquipmentState,
  instanceId: string,
): EquipmentState {
  const instance = state.inventory.find((item) => item.instanceId === instanceId);
  if (!instance) throw new Error(`Equipment instance not found: ${instanceId}`);
  const definition = getEquipmentDefinition(instance.definitionId);
  return {
    ...state,
    equippedEquipmentIds: {
      ...state.equippedEquipmentIds,
      [definition.slot]: instanceId,
    },
  };
}

export function upgradeEquipment(
  state: EquipmentState,
  instanceId: string,
): EquipmentMutationResult {
  const instance = state.inventory.find((item) => item.instanceId === instanceId);
  if (!instance) return { accepted: false, reason: 'not-found', state };
  if (instance.level >= 20) return { accepted: false, reason: 'max-level', state };
  const cost = instance.level * 20;
  if (state.gears < cost) return { accepted: false, reason: 'insufficient-gears', state };
  return {
    accepted: true,
    state: replaceInstance(
      { ...state, gears: state.gears - cost },
      instanceId,
      (current) => ({ ...current, level: current.level + 1 }),
    ),
  };
}

export function starEquipment(
  state: EquipmentState,
  instanceId: string,
): EquipmentMutationResult {
  const instance = state.inventory.find((item) => item.instanceId === instanceId);
  if (!instance) return { accepted: false, reason: 'not-found', state };
  if (instance.stars >= 5) return { accepted: false, reason: 'max-stars', state };
  const cost = (instance.stars + 1) * 10;
  const fragments = state.fragments[instance.definitionId] ?? 0;
  if (fragments < cost) return { accepted: false, reason: 'insufficient-fragments', state };
  return {
    accepted: true,
    state: replaceInstance(
      {
        ...state,
        fragments: {
          ...state.fragments,
          [instance.definitionId]: fragments - cost,
        },
      },
      instanceId,
      (current) => ({ ...current, stars: current.stars + 1 }),
    ),
  };
}

export function rerollEquipment(
  state: EquipmentState,
  instanceId: string,
  nextAffixes: readonly EquipmentAffix[],
): EquipmentMutationResult {
  const instance = state.inventory.find((item) => item.instanceId === instanceId);
  if (!instance) return { accepted: false, reason: 'not-found', state };
  const valid = nextAffixes.length <= 2
    && nextAffixes.every((affix) =>
      VALID_AFFIXES.includes(affix.id)
      && Number.isFinite(affix.value)
      && affix.value > 0);
  if (!valid) return { accepted: false, reason: 'invalid-affixes', state };
  const cost = 50;
  if (state.gears < cost) return { accepted: false, reason: 'insufficient-gears', state };
  return {
    accepted: true,
    state: replaceInstance(
      { ...state, gears: state.gears - cost },
      instanceId,
      (current) => ({ ...current, affixes: [...nextAffixes] }),
    ),
  };
}

function scaleModifiers(
  modifiers: ReturnType<typeof zeroPermanentStatModifiers>,
  scale: number,
): ReturnType<typeof zeroPermanentStatModifiers> {
  return {
    maxHpFlat: modifiers.maxHpFlat * scale,
    maxHpPercent: modifiers.maxHpPercent * scale,
    damageFlat: modifiers.damageFlat * scale,
    damagePercent: modifiers.damagePercent * scale,
    gearsPercent: modifiers.gearsPercent * scale,
    initialMomentum: modifiers.initialMomentum * scale,
    repairFlat: modifiers.repairFlat * scale,
  };
}

function affixModifiers(
  affix: EquipmentAffix,
): ReturnType<typeof zeroPermanentStatModifiers> {
  const result = zeroPermanentStatModifiers();
  switch (affix.id) {
    case 'max-hp-percent':
      return { ...result, maxHpPercent: affix.value };
    case 'damage-percent':
      return { ...result, damagePercent: affix.value };
    case 'gears-percent':
      return { ...result, gearsPercent: affix.value };
    case 'initial-momentum':
      return { ...result, initialMomentum: affix.value };
    case 'repair-flat':
      return { ...result, repairFlat: affix.value };
  }
}

export function getEquipmentModifiers(
  state: EquipmentState,
): ReturnType<typeof zeroPermanentStatModifiers> {
  let total = zeroPermanentStatModifiers();
  const setCounts = new Map<keyof typeof EQUIPMENT_SET_BONUSES, number>();
  const equippedInstanceIds = new Set(
    SLOTS.map((slot) => state.equippedEquipmentIds[slot])
      .filter((instanceId): instanceId is string => instanceId !== null),
  );

  for (const instanceId of equippedInstanceIds) {
    const instance = state.inventory.find((item) => item.instanceId === instanceId);
    if (!instance) continue;
    const definition = getEquipmentDefinition(instance.definitionId);
    const scale = 1 + (instance.level - 1) * 0.05 + instance.stars * 0.1;
    total = addPermanentStatModifiers(
      total,
      scaleModifiers(definition.baseModifiers, scale),
    );
    for (const affix of instance.affixes) {
      total = addPermanentStatModifiers(total, affixModifiers(affix));
    }
    setCounts.set(
      definition.setId,
      (setCounts.get(definition.setId) ?? 0) + 1,
    );
  }

  for (const [setId, count] of setCounts) {
    const bonus = EQUIPMENT_SET_BONUSES[setId];
    if (count >= 2) {
      total = addPermanentStatModifiers(total, bonus.twoPiece);
    }
    if (count >= 4) {
      total = addPermanentStatModifiers(total, bonus.fourPiece);
    }
  }

  return total;
}
```

This implementation looks up each equipped instance once, ignores duplicate slot references, applies the exact level/star scale, adds affixes and set bonuses, and never rounds intermediate modifiers.

- [ ] **Step 5: Run equipment tests**

```powershell
npm test -- tests/domain/equipment/EquipmentSystem.spec.ts
```

Expected: all equipment tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/domain/equipment tests/domain/equipment
git commit -m "feat: add four-slot equipment progression"
```

## Task 4: Save version 3 and migration

**Files:**

- Modify: `src/save/SaveRepository.ts`
- Modify: `tests/save/SaveRepository.spec.ts`

**Interfaces:**

- Consumes: `CaptainId`, `EquipmentInstance`, `EquipmentSlot`.
- Produces: `PlayerSave` version 3 with all progression fields.

- [ ] **Step 1: Replace migration expectations with version 3 tests**

Add these tests:

```ts
it('migrates a version 2 save into captain, skin, and equipment progress', () => {
  const migrated = normalizePlayerSave({
    version: 2,
    gears: 250,
    routeMarks: 12,
    starTickets: 3,
    stationLevel: 2,
    unlockedPassengerIds: ['otter-mechanic'],
    unlockedModuleIds: ['pressure-cannon'],
    unlockedMapIds: ['drift-suburb', 'coral-furnace'],
    firstClearMapIds: ['drift-suburb'],
    claimedInteractionIds: ['run-1:salvage-a:0'],
    purchasedProductIds: ['starter-star-ticket-pack'],
    processedTransactionIds: ['tx-old-1'],
    ownedCosmeticIds: ['deep-sea-engine'],
  });

  expect(migrated.version).toBe(3);
  expect(migrated.selectedCaptainId).toBeNull();
  expect(migrated.ownedSkinIds).toEqual(['skin-tide-base']);
  expect(migrated.equipmentInventory).toHaveLength(4);
  expect(Object.values(migrated.equippedEquipmentIds).filter(Boolean)).toHaveLength(0);
  expect(migrated.equipmentFragments).toEqual({});
  expect(migrated.ownedCosmeticIds).toEqual(['deep-sea-engine']);
});

it('deep copies progression collections', () => {
  const repository = createMemorySaveRepository();
  const save = repository.load();
  save.ownedSkinIds.push('skin-aurora-whale-song');
  save.equipmentFragments['tide-cannon'] = 10;
  repository.save(save);
  save.ownedSkinIds.push('mutation');
  save.equipmentFragments['tide-cannon'] = 999;

  expect(repository.load().ownedSkinIds).toEqual([
    'skin-tide-base',
    'skin-aurora-whale-song',
  ]);
  expect(repository.load().equipmentFragments['tide-cannon']).toBe(10);
});
```

Update existing assertions from `version: 2` to `version: 3`.

- [ ] **Step 2: Run and verify failure**

```powershell
npm test -- tests/save/SaveRepository.spec.ts
```

Expected: FAIL because save version 3 fields do not exist.

- [ ] **Step 3: Implement version 3**

Update `PlayerSave` to include:

```ts
readonly version: 3;
readonly selectedCaptainId: CaptainId | null;
readonly ownedSkinIds: string[];
readonly equippedSkinIds: Partial<Record<CaptainId, string>>;
readonly equipmentInventory: EquipmentInstance[];
readonly equippedEquipmentIds: Record<EquipmentSlot, string | null>;
readonly equipmentFragments: Record<string, number>;
```

Use `createCaptainProfileState()` and `createStarterEquipmentState()` in `defaultSave()`.

In `normalizePlayerSave(candidate)`:

1. Accept versions 1, 2, and 3.
2. First build the existing version-2 commerce fields.
3. For version 1 or 2, inject the default captain profile, `['skin-tide-base']`, starter inventory/loadout, and `{}` fragments.
4. For version 3, normalize skin IDs through `normalizeOwnedSkinIds`.
5. Clone every array, nested affix array, `equippedSkinIds`, `equippedEquipmentIds`, and `equipmentFragments`.
6. Reject invalid selected captain IDs, duplicate equipment instance IDs, slot mismatches, levels outside 1–20, stars outside 0–5, and negative fragment values.

- [ ] **Step 4: Run save tests and full typecheck**

```powershell
npm test -- tests/save/SaveRepository.spec.ts
npm run typecheck
```

Expected: save tests PASS; typecheck may identify version-2 literals in existing tests and code.

- [ ] **Step 5: Update remaining version literals**

Use:

```powershell
rg -n "version: 2|readonly version: 2" src tests web
```

Update only `PlayerSave` version expectations and fixtures. Keep comments describing historical version 2 migration.

- [ ] **Step 6: Commit**

```powershell
git add src/save/SaveRepository.ts tests/save
git commit -m "feat: migrate saves to captain progression v3"
```

## Task 5: Shared progression snapshot and combat/economy integration

**Files:**

- Create: `src/domain/progression/ProgressionStatService.ts`
- Create: `tests/domain/progression/ProgressionStatService.spec.ts`
- Modify: `src/domain/combat/CombatLoopSystem.ts`
- Modify: `tests/domain/combat/CombatLoopSystem.spec.ts`
- Modify: `web/main.ts`

**Interfaces:**

- Produces:

```ts
interface ProgressionSnapshot {
  readonly maxPlayerHp: number;
  readonly damageFlat: number;
  readonly damageMultiplier: number;
  readonly gearsMultiplier: number;
  readonly initialMomentum: number;
  readonly repairBonus: number;
  readonly skinModifiers: PermanentStatModifiers;
  readonly equipmentModifiers: PermanentStatModifiers;
}
```

- [ ] **Step 1: Write progression snapshot tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  createStarterEquipmentState,
  equipEquipment,
} from '../../../src/domain/equipment/EquipmentSystem';
import { createProgressionSnapshot } from '../../../src/domain/progression/ProgressionStatService';

describe('ProgressionStatService', () => {
  it('preserves baseline with only the base skin and no equipment modifiers', () => {
    const snapshot = createProgressionSnapshot({
      baseMaxHp: 100,
      ownedSkinIds: ['skin-tide-base'],
      equipmentState: {
        inventory: [],
        equippedEquipmentIds: {
          cannon: null,
          carriage: null,
          core: null,
          instrument: null,
        },
        fragments: {},
        gears: 0,
      },
    });

    expect(snapshot.maxPlayerHp).toBe(100);
    expect(snapshot.damageMultiplier).toBe(1);
    expect(snapshot.gearsMultiplier).toBe(1);
  });

  it('combines equipped gear and every owned skin', () => {
    let equipmentState = createStarterEquipmentState();
    for (const instance of equipmentState.inventory) {
      equipmentState = equipEquipment(equipmentState, instance.instanceId);
    }
    const snapshot = createProgressionSnapshot({
      baseMaxHp: 100,
      ownedSkinIds: [
        'skin-seafoam-departure',
        'skin-aurora-whale-song',
      ],
      equipmentState,
    });

    expect(snapshot.maxPlayerHp).toBe(117);
    expect(snapshot.damageFlat).toBe(2);
    expect(snapshot.damageMultiplier).toBeCloseTo(1.005);
    expect(snapshot.initialMomentum).toBe(5);
    expect(snapshot.repairBonus).toBe(8);
  });
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
npm test -- tests/domain/progression/ProgressionStatService.spec.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement `createProgressionSnapshot`**

```ts
import type { EquipmentState } from '../equipment/EquipmentSystem';
import { getEquipmentModifiers } from '../equipment/EquipmentSystem';
import { getSkinCollectionModifiers } from '../skin/SkinCollectionSystem';
import type { PermanentStatModifiers } from './ProgressionTypes';

export interface ProgressionSnapshot {
  readonly maxPlayerHp: number;
  readonly damageFlat: number;
  readonly damageMultiplier: number;
  readonly gearsMultiplier: number;
  readonly initialMomentum: number;
  readonly repairBonus: number;
  readonly skinModifiers: PermanentStatModifiers;
  readonly equipmentModifiers: PermanentStatModifiers;
}

export function createProgressionSnapshot(input: {
  readonly baseMaxHp: number;
  readonly ownedSkinIds: readonly string[];
  readonly equipmentState: EquipmentState;
}): ProgressionSnapshot {
  const skinModifiers = getSkinCollectionModifiers(input.ownedSkinIds);
  const equipmentModifiers = getEquipmentModifiers(input.equipmentState);
  return {
    maxPlayerHp: Math.floor(
      (input.baseMaxHp + equipmentModifiers.maxHpFlat)
      * (1 + equipmentModifiers.maxHpPercent + skinModifiers.maxHpPercent),
    ),
    damageFlat: equipmentModifiers.damageFlat,
    damageMultiplier:
      1 + equipmentModifiers.damagePercent + skinModifiers.damagePercent,
    gearsMultiplier:
      1 + equipmentModifiers.gearsPercent + skinModifiers.gearsPercent,
    initialMomentum: equipmentModifiers.initialMomentum,
    repairBonus: equipmentModifiers.repairFlat,
    skinModifiers,
    equipmentModifiers,
  };
}
```

- [ ] **Step 4: Extend combat options with multiplier and repair bonus**

Change `CombatActionOptions` to include:

```ts
readonly damageMultiplier?: number;
readonly repairBonus?: number;
```

Validate `damageMultiplier` as finite and `>= 1`, and `repairBonus` as finite and `>= 0`.

Apply:

```ts
if (rawDamage > 0) {
  rawDamage = Math.floor((rawDamage + damageBonus) * damageMultiplier);
}
if (rawHeal > 0) {
  rawHeal += repairBonus;
}
```

Add a combat test proving a base 25 attack with `damageBonus: 2` and `damageMultiplier: 1.1` deals `29`, and a calm-water repair with `repairBonus: 8` heals `32`.

- [ ] **Step 5: Integrate the snapshot into `web/main.ts`**

Add a helper that converts `PlayerSave` into `EquipmentState`:

```ts
function getEquipmentStateFromSave(): EquipmentState {
  return {
    inventory: save.equipmentInventory,
    equippedEquipmentIds: save.equippedEquipmentIds,
    fragments: save.equipmentFragments,
    gears: save.gears,
  };
}

function getProgressionSnapshot(): ProgressionSnapshot {
  return createProgressionSnapshot({
    baseMaxHp: 100,
    ownedSkinIds: save.ownedSkinIds,
    equipmentState: getEquipmentStateFromSave(),
  });
}
```

Use the snapshot in:

- `resetBattleState`: `maxPlayerHp`, current HP, and initial momentum.
- `renderBattleActions` and `handleCombatAction`: `damageFlat`, `damageMultiplier`, and `repairBonus`.
- normal victory gear settlement and ad double settlement: multiply gear rewards with `Math.floor(base * gearsMultiplier)`.

Do not apply the gear multiplier to star tickets or route marks.

- [ ] **Step 6: Run focused and full tests**

```powershell
npm test -- tests/domain/progression/ProgressionStatService.spec.ts tests/domain/combat/CombatLoopSystem.spec.ts
npm test
npm run typecheck
```

Expected: focused tests PASS; full suite and typecheck PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/domain/progression src/domain/combat tests/domain/progression tests/domain/combat web/main.ts
git commit -m "feat: apply permanent progression to combat"
```

## Task 6: Deterministic skin/equipment purchases and telemetry

**Files:**

- Modify: `src/domain/commerce/ProductCatalog.ts`
- Modify: `src/domain/commerce/PurchaseService.ts`
- Modify: `tests/domain/commerce/PurchaseService.spec.ts`
- Modify: `src/telemetry/TelemetryEvents.ts`
- Modify: `tests/telemetry/TelemetryClient.spec.ts`
- Modify: `web/views/CommerceView.ts`
- Modify: `tests/web/CommerceView.spec.ts`

**Interfaces:**

- `ProductReward` adds `skinIds`, `equipmentDefinitionIds`, and `equipmentFragments`.
- Existing cosmetic rewards remain valid.

- [ ] **Step 1: Write failing purchase tests**

Add:

```ts
it('grants both captain variants through one unique skin ID', () => {
  const result = settlePurchase(defaultSave(), {
    productId: 'aurora-whale-song-skin',
    result: { status: 'verified', transactionId: 'tx-skin' },
  });

  expect(result.accepted).toBe(true);
  expect(result.save.ownedSkinIds).toContain('skin-aurora-whale-song');
  expect(result.reward.skinIds).toEqual(['skin-aurora-whale-song']);
});

it('does not duplicate skin ownership after a duplicate callback', () => {
  const first = settlePurchase(defaultSave(), {
    productId: 'aurora-whale-song-skin',
    result: { status: 'verified', transactionId: 'tx-skin' },
  });
  const duplicate = settlePurchase(first.save, {
    productId: 'aurora-whale-song-skin',
    result: { status: 'verified', transactionId: 'tx-skin' },
  });

  expect(duplicate.accepted).toBe(false);
  expect(duplicate.save.ownedSkinIds.filter(
    (id) => id === 'skin-aurora-whale-song',
  )).toHaveLength(1);
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
npm test -- tests/domain/commerce/PurchaseService.spec.ts
```

Expected: FAIL because the product and reward fields do not exist.

- [ ] **Step 3: Extend product rewards and add deterministic products**

Set `ProductReward` to:

```ts
export interface ProductReward {
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
  readonly cosmeticIds: readonly string[];
  readonly skinIds: readonly string[];
  readonly equipmentDefinitionIds: readonly string[];
  readonly equipmentFragments: Readonly<Record<string, number>>;
}
```

Every existing product must explicitly provide empty values for the new fields.

Add:

```ts
{
  id: 'aurora-whale-song-skin',
  name: '极光鲸歌列车长套装',
  displayPrice: '¥30',
  description: '固定解锁男女列车长「极光鲸歌」款式，并永久计入典藏皮肤属性。',
  oneTime: true,
  reward: {
    gears: 0,
    routeMarks: 0,
    starTickets: 0,
    cosmeticIds: [],
    skinIds: ['skin-aurora-whale-song'],
    equipmentDefinitionIds: [],
    equipmentFragments: {},
  },
}
```

Add a deterministic `coral-assault-equipment-pack` Mock product that grants the four coral equipment definitions once. Use display price `¥18`.

- [ ] **Step 4: Extend settlement without breaking idempotency**

In `settlePurchase`:

1. Deduplicate `skinIds` into `save.ownedSkinIds`.
2. For each equipment definition ID, create one instance ID `${transactionId}:${definitionId}` at level 1, 0 stars, no affixes.
3. Add fragment values by definition ID.
4. Keep transaction and one-time product checks before all grants.
5. Return cloned nested reward data.

- [ ] **Step 5: Update commerce rendering**

Render fixed rewards as:

- `男女列车长皮肤`
- `确定性装备 × N`
- `装备碎片 × N`

Replace the old global copy “不卖随机胜率” with:

```text
确定性内容 · 属性购买前完整展示
```

Do not use “非战力外观” for skin products.

- [ ] **Step 6: Add telemetry names**

Append these exact names to `PrototypeEventName`:

```ts
| 'captain_selection_viewed'
| 'captain_selected'
| 'captain_switched'
| 'wardrobe_viewed'
| 'skin_clicked'
| 'skin_purchase_started'
| 'skin_purchase_result'
| 'skin_equipped'
| 'skin_collection_bonus_viewed'
| 'equipment_viewed'
| 'equipment_equipped'
| 'equipment_upgraded'
| 'equipment_starred'
| 'equipment_rerolled'
| 'equipment_set_activated'
```

Extend the telemetry test with one representative skin event and one equipment event; verify `flush()` clones payloads and contains no secret fields.

- [ ] **Step 7: Run all commerce and telemetry tests**

```powershell
npm test -- tests/domain/commerce/PurchaseService.spec.ts tests/web/CommerceView.spec.ts tests/telemetry/TelemetryClient.spec.ts
npm run typecheck
```

Expected: all focused tests PASS; typecheck PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/domain/commerce src/telemetry web/views/CommerceView.ts tests/domain/commerce tests/web/CommerceView.spec.ts tests/telemetry
git commit -m "feat: sell deterministic skins and equipment"
```

## Task 7: Foundation verification checkpoint

**Files:**

- Modify only if a verification failure reveals a defect in Plan 1 files.

- [ ] **Step 1: Run the complete automated gate**

```powershell
npm test
npm run typecheck
npm run build
git diff --check
```

Expected:

- 0 failed tests.
- TypeScript exits 0.
- Vite production build exits 0.
- `git diff --check` reports no whitespace errors.

- [ ] **Step 2: Inspect ownership and progression behavior in the browser**

Run:

```powershell
npm run dev
```

Using the local URL printed by Vite, verify:

1. An old version-2 local save migrates without losing currencies, maps, check-in, campaign, daily trial, or commerce ownership.
2. Baseline combat still starts at the current values when no paid skin is owned.
3. A mocked verified Aurora purchase adds exactly one skin ID.
4. Starting a run after purchase raises the displayed max HP and damage.
5. Refreshing the page preserves the purchase and stats.

- [ ] **Step 3: Commit any verification fix**

If no files changed, do not create an empty commit. If a defect was fixed:

```powershell
git add src tests web
git commit -m "fix: stabilize progression foundation"
```

- [ ] **Step 4: Record checkpoint**

```powershell
git status --short
git log -7 --oneline
```

Expected: clean worktree and one commit for each completed foundation task.
