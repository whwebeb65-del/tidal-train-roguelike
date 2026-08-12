# Tidal Archive Carriage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, hand-drawn archive inside the equipment carriage that records real tide-beast encounters and selected skill evolutions while deriving equipment discoveries from the existing inventory.

**Architecture:** A pure immutable domain slice owns the two persistent discovery lists. `AppStateRepository` persists that slice, `LegacyGameRuntime` updates it only from existing authoritative battle events, and the equipment scene exposes an ephemeral workshop/archive panel switch. A focused archive catalog/view reuses existing battle and equipment catalogs and art; no battle or economy rule reads archive state.

**Tech Stack:** TypeScript 5, Vitest, DOM-string views, CSS, Vite, existing Chrome CDP smoke runner, localStorage repository.

## Global Constraints

- Do not add currency, collection rewards, stat bonuses, achievements, or paid random content.
- Do not add a sixth bottom-navigation item or change equipment progression rules.
- Tide beasts become discovered only from real `enemy-spawned` events.
- Skill evolutions become discovered only from real selected `skill-variant` upgrades.
- Equipment discovery is derived only from `PlayerSave.equipmentInventory`.
- Every enabled tab or action remains at least 44×44 CSS pixels on 360, 390, 412, and 430px viewports.
- Reuse current art assets; add no image files and keep existing asset budgets.
- `prefers-reduced-motion: reduce` removes archive transforms and animations.
- All code changes follow RED → GREEN TDD and every completed task is committed.
- Final release must pass `npm test`, `npm run typecheck`, `npm run check:assets`, `npm run build`, `npm audit --audit-level=high`, `npm run smoke:browser`, and `git diff --check`.

---

## Target File Structure

- `src/domain/collection/TidalArchiveSystem.ts` — archive ID catalog, immutable state, normalization, and idempotent discovery transitions.
- `tests/domain/collection/TidalArchiveSystem.spec.ts` — domain safety and transition contracts.
- `web/app/AppStateRepository.ts` and `web/app/AppTypes.ts` — persistent archive slice and clear behavior.
- `tests/web/AppStateRepository.spec.ts` — storage round-trip and malformed recovery.
- `web/battle/BattleUpgradeCopy.ts` — extracted authoritative upgrade name/effect/synergy copy shared by HUD and archive.
- `web/battle/BattleHudModel.ts` — consumes extracted copy without behavior drift.
- `web/views/TidalArchiveCatalog.ts` — UI-only archive descriptions, source hints, art mappings, and equipment display labels.
- `web/views/TidalArchiveView.ts` — pure three-ledger archive renderer.
- `web/views/EquipmentView.ts` — workshop/archive ticket tabs and conditional body.
- `web/LegacyGameRuntime.ts` — ephemeral panel selection, authoritative event discovery, persistence, and telemetry.
- `src/telemetry/TelemetryEvents.ts` — archive view/discovery event names.
- `web/styles/tidal-archive.css` and `web/styles.css` — physical archive-carriage styling and import.
- `tests/web/TidalArchiveView.spec.ts`, `tests/web/EquipmentView.spec.ts`, `tests/web/GameApp.spec.ts`, `tests/web/LivingStationStyles.spec.ts`, `tests/smoke/browser-script.spec.ts`, `scripts/smoke-browser.mjs` — view, runtime, styling, and browser release coverage.

---

### Task 1: Immutable Archive Domain

**Files:**
- Create: `src/domain/collection/TidalArchiveSystem.ts`
- Create: `tests/domain/collection/TidalArchiveSystem.spec.ts`
- Modify: `web/battle/BattleTypes.ts:20-31`

**Interfaces:**
- Produces: `TIDE_BEAST_ARCHIVE_IDS`, `TideBeastArchiveId`, `TidalArchiveState`, `createTidalArchiveState()`, `normalizeTidalArchiveState(value)`, `discoverTideBeast(state, id)`, and `discoverSkillVariant(state, id)`.
- `EnemyKind` becomes an alias of `TideBeastArchiveId`; all existing battle call sites remain source compatible.

- [ ] **Step 1: Write the failing domain tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  createTidalArchiveState,
  discoverSkillVariant,
  discoverTideBeast,
  normalizeTidalArchiveState,
} from '../../../src/domain/collection/TidalArchiveSystem';

describe('TidalArchiveSystem', () => {
  it('normalizes known entries in catalog order and filters corrupt values', () => {
    expect(normalizeTidalArchiveState({
      version: 99,
      discoveredEnemyKinds: ['deep-echo-boss', 'bad', 'bubble-fin', 'bubble-fin'],
      discoveredSkillVariantIds: ['double-crest', 'bad', 'split-tide-arrow'],
    })).toEqual({
      version: 1,
      discoveredEnemyKinds: ['bubble-fin', 'deep-echo-boss'],
      discoveredSkillVariantIds: ['split-tide-arrow', 'double-crest'],
    });
    expect(normalizeTidalArchiveState(null)).toEqual(createTidalArchiveState());
  });

  it('discovers each real entry once without mutating prior snapshots', () => {
    const initial = createTidalArchiveState();
    const enemy = discoverTideBeast(initial, 'bubble-fin');
    const variant = discoverSkillVariant(enemy, 'split-tide-arrow');
    expect(initial.discoveredEnemyKinds).toEqual([]);
    expect(variant.discoveredEnemyKinds).toEqual(['bubble-fin']);
    expect(variant.discoveredSkillVariantIds).toEqual(['split-tide-arrow']);
    expect(discoverTideBeast(enemy, 'bubble-fin')).toBe(enemy);
    expect(discoverSkillVariant(variant, 'split-tide-arrow')).toBe(variant);
    expect(Object.isFrozen(variant)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and observe RED**

Run: `npm test -- tests/domain/collection/TidalArchiveSystem.spec.ts`

Expected: FAIL because `TidalArchiveSystem.ts` does not exist.

- [ ] **Step 3: Implement the immutable domain slice**

```ts
import {
  SKILL_VARIANT_IDS,
  type SkillVariantId,
} from '../skill/SkillProgressionTypes';

export const TIDE_BEAST_ARCHIVE_IDS = [
  'bubble-fin', 'needle-jelly', 'reef-crab', 'tide-shell-hatchling',
  'lantern-ray', 'tide-parasite-snail', 'storm-ray-elite', 'deep-echo-boss',
] as const;
export type TideBeastArchiveId = (typeof TIDE_BEAST_ARCHIVE_IDS)[number];

export interface TidalArchiveState {
  readonly version: 1;
  readonly discoveredEnemyKinds: readonly TideBeastArchiveId[];
  readonly discoveredSkillVariantIds: readonly SkillVariantId[];
}

function makeState(
  enemies: readonly TideBeastArchiveId[],
  variants: readonly SkillVariantId[],
): TidalArchiveState {
  return Object.freeze({
    version: 1,
    discoveredEnemyKinds: Object.freeze([...enemies]),
    discoveredSkillVariantIds: Object.freeze([...variants]),
  });
}

export function createTidalArchiveState(): TidalArchiveState {
  return makeState([], []);
}

export function normalizeTidalArchiveState(value: unknown): TidalArchiveState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createTidalArchiveState();
  }
  const record = value as Record<string, unknown>;
  const enemySet = new Set(Array.isArray(record.discoveredEnemyKinds)
    ? record.discoveredEnemyKinds : []);
  const variantSet = new Set(Array.isArray(record.discoveredSkillVariantIds)
    ? record.discoveredSkillVariantIds : []);
  return makeState(
    TIDE_BEAST_ARCHIVE_IDS.filter((id) => enemySet.has(id)),
    SKILL_VARIANT_IDS.filter((id) => variantSet.has(id)),
  );
}

export function discoverTideBeast(
  state: TidalArchiveState,
  id: TideBeastArchiveId,
): TidalArchiveState {
  if (state.discoveredEnemyKinds.includes(id)) return state;
  return normalizeTidalArchiveState({
    ...state,
    discoveredEnemyKinds: [...state.discoveredEnemyKinds, id],
  });
}

export function discoverSkillVariant(
  state: TidalArchiveState,
  id: SkillVariantId,
): TidalArchiveState {
  if (state.discoveredSkillVariantIds.includes(id)) return state;
  return normalizeTidalArchiveState({
    ...state,
    discoveredSkillVariantIds: [...state.discoveredSkillVariantIds, id],
  });
}
```

In `BattleTypes.ts`, import `TideBeastArchiveId` and replace the literal `EnemyKind` union with `export type EnemyKind = TideBeastArchiveId;`.

- [ ] **Step 4: Run focused and compatibility tests**

Run: `npm test -- tests/domain/collection/TidalArchiveSystem.spec.ts tests/web/battle/EnemyGeometry.spec.ts tests/web/battle/BattleEngineEnemyBehaviours.spec.ts`

Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/collection/TidalArchiveSystem.ts tests/domain/collection/TidalArchiveSystem.spec.ts web/battle/BattleTypes.ts
git commit -m "feat: define tidal archive discoveries"
```

---

### Task 2: Persist the Archive Slice

**Files:**
- Modify: `web/app/AppTypes.ts`
- Modify: `web/app/AppStateRepository.ts`
- Modify: `tests/web/AppStateRepository.spec.ts`

**Interfaces:**
- Consumes: `TidalArchiveState` and `normalizeTidalArchiveState` from Task 1.
- Produces: `PersistentAppState.tidalArchive`, `APP_STORAGE_KEYS.tidalArchive`, and `AppStateRepository.saveTidalArchive(next)`.

- [ ] **Step 1: Add failing repository assertions**

Extend the default/clear test with:

```ts
expect(initial.tidalArchive).toEqual({
  version: 1,
  discoveredEnemyKinds: [],
  discoveredSkillVariantIds: [],
});
repository.saveTidalArchive({
  version: 1,
  discoveredEnemyKinds: ['bubble-fin'],
  discoveredSkillVariantIds: ['split-tide-arrow'],
});
expect(repository.load().tidalArchive.discoveredEnemyKinds)
  .toEqual(['bubble-fin']);
```

Add a malformed-state test with unknown, duplicate, and reversed known IDs and assert catalog-order filtering. The existing `Object.values(APP_STORAGE_KEYS)` clear loop must prove the archive key is removed while the unrelated key remains.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/AppStateRepository.spec.ts`

Expected: type/runtime failure because the archive slice is absent.

- [ ] **Step 3: Add the repository contract**

Add to `PersistentAppState`:

```ts
readonly tidalArchive: TidalArchiveState;
```

Add to `APP_STORAGE_KEYS`:

```ts
tidalArchive: 'tidal-train-tidal-archive-v1',
```

Load with:

```ts
tidalArchive: normalizeTidalArchiveState(
  readJson(storage, APP_STORAGE_KEYS.tidalArchive),
),
```

Save with:

```ts
saveTidalArchive(next: TidalArchiveState): void {
  storage.setItem(
    APP_STORAGE_KEYS.tidalArchive,
    JSON.stringify(normalizeTidalArchiveState(next)),
  );
},
```

- [ ] **Step 4: Run repository tests and typecheck**

Run: `npm test -- tests/web/AppStateRepository.spec.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add web/app/AppTypes.ts web/app/AppStateRepository.ts tests/web/AppStateRepository.spec.ts
git commit -m "feat: persist tidal archive progress"
```

---

### Task 3: Build the Authoritative Archive View

**Files:**
- Create: `web/battle/BattleUpgradeCopy.ts`
- Create: `web/views/TidalArchiveCatalog.ts`
- Create: `web/views/TidalArchiveView.ts`
- Create: `tests/web/TidalArchiveView.spec.ts`
- Modify: `web/battle/BattleHudModel.ts`
- Modify: `web/views/EquipmentView.ts`
- Modify: `tests/web/EquipmentView.spec.ts`

**Interfaces:**
- Produces: `BattleUpgradeCopy`, `getBattleUpgradeCopy(id)`, `TIDAL_ARCHIVE_ENEMIES`, `buildTidalArchiveViewModel(input)`, `TidalArchiveViewModel`, `renderTidalArchive(model)`, and `EquipmentPanel = 'workshop' | 'archive'`.
- `renderEquipment` receives `{ state, panel, archive }`; default `panel` remains `workshop` for existing callers.

- [ ] **Step 1: Write failing archive renderer tests**

```ts
const model = buildTidalArchiveViewModel({
  archive: {
    version: 1,
    discoveredEnemyKinds: ['bubble-fin'],
    discoveredSkillVariantIds: ['split-tide-arrow'],
  },
  equipmentInventory: createStarterEquipmentState().inventory,
  skillMasteryXp: createSkillMasteryXp(),
});
const html = renderTidalArchive(model);
expect(html).toContain('tidal-archive-carriage');
expect(html.match(/data-archive-enemy=/g)).toHaveLength(8);
expect(html.match(/data-archive-variant=/g)).toHaveLength(12);
expect(html.match(/data-archive-equipment=/g)).toHaveLength(8);
expect(html).toContain('data-archive-enemy="bubble-fin"');
expect(html).toContain('is-discovered');
expect(html).toContain('未记录潮兽');
expect(html).toContain('分汐浪箭');
expect(html).toContain('命中后分裂至第二目标');
expect(html).toContain('4 / 8');
expect(html).not.toContain('收藏奖励');
```

Extend `EquipmentView.spec.ts` to assert both `show-equipment-workshop` and `show-tidal-archive` ticket actions, `aria-pressed`, and that `panel: 'archive'` renders the archive root but not equipment mutation buttons.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/TidalArchiveView.spec.ts tests/web/EquipmentView.spec.ts`

Expected: FAIL because the catalog/view and panel contract do not exist.

- [ ] **Step 3: Extract upgrade copy without behavior changes**

Move the complete `UPGRADE_COPY` record from `BattleHudModel.ts` into `BattleUpgradeCopy.ts`, export it through:

```ts
export interface BattleUpgradeCopy {
  readonly name: string;
  readonly effect: string;
  readonly synergy: string;
}

export const BATTLE_UPGRADE_COPY: Readonly<Record<BattleUpgradeId, BattleUpgradeCopy>> = {
  'multi-barrel': { name: '多管潮炮', effect: '主炮弹道 +1，单发倍率调整为 72%', synergy: '适合命中、暴击和溅射构筑' },
  'rapid-reload': { name: '急速装填', effect: '主炮射击间隔 -12%', synergy: '提高所有命中特效触发频率' },
  'coral-warhead': { name: '珊瑚弹头', effect: '获得 54 范围溅射，溅射伤害 +35%', synergy: '怪潮密集时收益更高' },
  'echo-chain': { name: '回声弹射', effect: '弹射次数 +1，弹射继承 45% 伤害', synergy: '补足多目标清场能力' },
  'precision-lens': { name: '精准透镜', effect: '暴击率 +8%', synergy: '配合多弹道快速放大收益' },
  'bubble-capacitor': { name: '泡泡电容', effect: '屏障量 +25%，修复比例 +4%', synergy: '强化付费装备与生存构筑' },
  'tidal-resonance': { name: '潮汐共振', effect: '主动技能冷却 -15%', synergy: '更频繁使用齐射和屏障' },
  'magnetic-salvage': { name: '磁吸打捞', effect: '吸附速度 +40%，经验收益 +10%', synergy: '更快进入下一次三选一' },
  'overload-core': { name: '过载核心', effect: '能量获取 +25%，极潮伤害 +20%', synergy: '加速大招循环并提高爆发' },
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
};

export function getBattleUpgradeCopy(id: BattleUpgradeId): BattleUpgradeCopy {
  return BATTLE_UPGRADE_COPY[id];
}
```

Replace `UPGRADE_COPY[id]` in `BattleHudModel.ts` with `getBattleUpgradeCopy(id)`. Do not change any battle copy.

- [ ] **Step 4: Implement the archive catalog and view model**

Create eight typed enemy records with `id`, `name`, `artUrl`, `role`, `counter`, and `source`. Map art URLs explicitly to `BATTLE_ART_URLS`. Build twelve skill records from `SKILL_VARIANT_IDS`, `getBattleUpgradeCopy`, `BATTLE_VARIANT_GLYPH_URLS`, `SKILL_VARIANTS_BY_SKILL`, and mastery milestones `[1, 5, 10, 15]`. Build eight equipment records from `EQUIPMENT_CATALOG`, inventory membership, and the existing modifier summary rules.

The view model must expose three summaries and ordered entries:

```ts
export interface TidalArchiveViewModel {
  readonly enemySummary: { readonly discovered: number; readonly total: 8 };
  readonly variantSummary: { readonly discovered: number; readonly total: 12 };
  readonly equipmentSummary: { readonly discovered: number; readonly total: 8 };
  readonly enemies: readonly TidalArchiveEnemyCard[];
  readonly variants: readonly TidalArchiveVariantCard[];
  readonly equipment: readonly TidalArchiveEquipmentCard[];
}
```

Locked entries retain `source`, `skillName`/`requiredMasteryLevel`, or `slotName`/`setName`, but their private name/effect fields render as locked copy.

- [ ] **Step 5: Render the physical three-ledger archive**

`renderTidalArchive` must use one `<section class="tidal-archive-carriage living-zone">` root containing exactly one `archive-manifest` header and three ledger sections named `archive-ledger--beasts`, `archive-ledger--variants`, and `archive-ledger--equipment`, in that order. Each ledger renders its complete catalog with stable data attributes.

Every card receives `is-discovered` or `is-locked` and a stable data attribute. Images always have non-empty `alt` when discovered and empty `alt` with `aria-hidden="true"` when locked.

In `EquipmentView.ts`, render two ticket buttons under the sign:

```html
<div class="workshop-tabs" aria-label="工坊区域">
  <button data-action="show-equipment-workshop" aria-pressed="${panel === 'workshop'}">维修工作台</button>
  <button data-action="show-tidal-archive" aria-pressed="${panel === 'archive'}">潮汐档案</button>
</div>
```

Render the existing `equipment-layout` for `workshop`; render `renderTidalArchive(archive)` for `archive`.

- [ ] **Step 6: Run view, HUD, and type tests**

Run: `npm test -- tests/web/TidalArchiveView.spec.ts tests/web/EquipmentView.spec.ts tests/web/battle/BattleHUD.spec.ts && npm run typecheck`

Expected: PASS; existing upgrade card copy remains identical.

- [ ] **Step 7: Commit**

```powershell
git add web/battle/BattleUpgradeCopy.ts web/battle/BattleHudModel.ts web/views/TidalArchiveCatalog.ts web/views/TidalArchiveView.ts web/views/EquipmentView.ts tests/web/TidalArchiveView.spec.ts tests/web/EquipmentView.spec.ts
git commit -m "feat: build the tidal archive carriage"
```

---

### Task 4: Connect Real Discoveries and Panel Actions

**Files:**
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `src/telemetry/TelemetryEvents.ts`
- Modify: `tests/web/GameApp.spec.ts`

**Interfaces:**
- Consumes: Task 1 discovery transitions, Task 2 repository save, Task 3 view builder/renderer.
- Produces: real `enemy-spawned` and `skill-variant upgrade-selected` persistence, `show-equipment-workshop` / `show-tidal-archive` actions, `tidal_archive_viewed`, and `tidal_archive_entry_discovered` telemetry.

- [ ] **Step 1: Write failing real-runtime tests**

Create a GameApp E2E test with empty archive storage and a selected captain. Start a normal battle, advance until the first enemy is present, and assert the archive storage contains that enemy kind exactly once. Continue to the first evolution offer with a deterministic E2E seed, select a `skill-variant` card through its real HUD button or controller path, and assert the selected ID is stored once. Confirm gears, route marks, star tickets, equipment inventory, and battle input stats match their pre-discovery values.

Return to station, navigate to equipment, click `[data-action="show-tidal-archive"]`, and assert `.tidal-archive-carriage`, `aria-pressed="true"`, and the discovered cards. Re-render and assert discovery telemetry counts remain one per entry.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/GameApp.spec.ts`

Expected: FAIL because runtime discovery and panel actions are absent.

- [ ] **Step 3: Add runtime state and idempotent persistence helpers**

Initialize:

```ts
let tidalArchiveState = initialState.tidalArchive;
let equipmentPanel: EquipmentPanel = 'workshop';
let archiveViewTracked = false;
```

Implement:

```ts
function commitArchiveDiscovery(
  entryType: 'enemy' | 'skill-variant',
  entryId: string,
  next: TidalArchiveState,
): void {
  if (next === tidalArchiveState) return;
  tidalArchiveState = next;
  appStateRepository.saveTidalArchive(next);
  track('tidal_archive_entry_discovered', { entryType, entryId });
}
```

At the start of each `trackBattleEvents` iteration:

```ts
if (event.type === 'enemy-spawned') {
  commitArchiveDiscovery(
    'enemy',
    event.kind,
    discoverTideBeast(tidalArchiveState, event.kind),
  );
}
if (
  event.type === 'upgrade-selected'
  && getBattleUpgradeDefinition(event.upgradeId).kind === 'skill-variant'
) {
  const variantId = event.upgradeId as SkillVariantId;
  commitArchiveDiscovery(
    'skill-variant',
    variantId,
    discoverSkillVariant(tidalArchiveState, variantId),
  );
}
```

- [ ] **Step 4: Wire the view and actions**

Build the model in `renderEquipmentScreen` from `tidalArchiveState`, `save.equipmentInventory`, and `save.skillMasteryXp`. Track `tidal_archive_viewed` once per runtime session when the archive panel first renders, with three integer counts.

In `onClick`:

```ts
if (action === 'show-equipment-workshop') {
  equipmentPanel = 'workshop';
  render();
  return;
}
if (action === 'show-tidal-archive') {
  equipmentPanel = 'archive';
  render();
  return;
}
```

Add both telemetry names to `PrototypeEventName`.

- [ ] **Step 5: Run focused integration and type checks**

Run: `npm test -- tests/web/GameApp.spec.ts tests/web/EquipmentView.spec.ts tests/web/AppStateRepository.spec.ts && npm run typecheck`

Expected: PASS; no player asset changes from discovery.

- [ ] **Step 6: Commit**

```powershell
git add web/LegacyGameRuntime.ts src/telemetry/TelemetryEvents.ts tests/web/GameApp.spec.ts
git commit -m "feat: record real tidal archive discoveries"
```

---

### Task 5: Hand-Drawn Archive Styling and Browser Gate

**Files:**
- Create: `web/styles/tidal-archive.css`
- Modify: `web/styles.css`
- Modify: `tests/web/LivingStationStyles.spec.ts`
- Modify: `tests/smoke/browser-script.spec.ts`
- Modify: `scripts/smoke-browser.mjs`

**Interfaces:**
- Consumes: semantic archive classes/data attributes from Task 3 and actions from Task 4.
- Produces: responsive visual treatment and permanent browser release regression coverage.

- [ ] **Step 1: Write failing style and smoke-source contracts**

Style tests must assert:

```ts
expect(entry).toContain('@import "./styles/tidal-archive.css";');
expect(archiveCss).toMatch(/\.workshop-tabs button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
expect(archiveCss).toMatch(/\.archive-card::before,[\s\S]*?\.archive-card::after\s*\{[^}]*pointer-events:\s*none;/s);
expect(archiveCss).toMatch(/@media \(max-width: 430px\)[\s\S]*?\.archive-card-grid/s);
expect(archiveCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation:\s*none;[\s\S]*?transform:\s*none;/s);
```

Smoke source test must require `assertTidalArchiveCarriage`, `show-tidal-archive`, `data-archive-enemy`, and `archive images must load`.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/LivingStationStyles.spec.ts tests/smoke/browser-script.spec.ts`

Expected: FAIL because the stylesheet and smoke helper do not exist.

- [ ] **Step 3: Implement physical archive styling**

Create a cream-paper manifest with ticket tabs, three differently colored ledger headers, irregular clipped cards, discovered/locked art states, tape/rope/stamp pseudo-elements, safe overflow rules, 44×44 tabs, and explicit reduced-motion overrides. Keep all selectors scoped under `.otter-workshop` or `.tidal-archive-carriage`.

Import it after `living-station-workshop.css` so archive-specific rules win without global overrides.

- [ ] **Step 4: Add real browser archive verification**

Implement `assertTidalArchiveCarriage(client, label)`:

1. Navigate to `equipment` and click the real `show-tidal-archive` button.
2. Assert root and active `aria-pressed` state.
3. Assert exact card counts 8/12/8.
4. Assert every visible enabled tab is at least 44×44.
5. Assert `document.documentElement.scrollWidth <= innerWidth + 1` and every archive card lies within the viewport after `scrollIntoView({ block: 'center' })`.
6. Assert every archive `<img>` has `complete === true && naturalWidth > 0`; error text must contain `archive images must load`.
7. On the 390 full path, record the initial discovered-enemy count, run a real battle until an enemy spawns, return to equipment/archive, and assert the count increased while currencies did not change from discovery alone.
8. Switch back to the real workshop tab and assert mutation controls are still present.

Call the helper from each viewport scene pass; run the post-battle growth portion only for the full viewport to keep runtime bounded.

- [ ] **Step 5: Run focused tests, build, and browser smoke**

Run:

```powershell
npm test -- tests/web/LivingStationStyles.spec.ts tests/smoke/browser-script.spec.ts
npm run typecheck
npm run build
npm run smoke:browser
```

Expected: all four mobile viewports PASS; 390 completes two full battles; ordinary URL exposes no E2E global.

- [ ] **Step 6: Commit**

```powershell
git add web/styles/tidal-archive.css web/styles.css tests/web/LivingStationStyles.spec.ts tests/smoke/browser-script.spec.ts scripts/smoke-browser.mjs
git commit -m "style: furnish the tidal archive carriage"
```

---

### Task 6: Documentation, Independent Review, and Release

**Files:**
- Modify: `README.md`
- Modify only if reusable verified experience exists: `C:\Users\asus\Desktop\workspace\全局复利与踩坑日志.md`

**Interfaces:**
- Produces: player-facing archive instructions and a reviewed, release-ready main branch.

- [ ] **Step 1: Document player behavior and boundaries**

Add `## 潮汐档案车厢` to `README.md` describing the equipment-page entry, three ledgers, real discovery triggers, reset behavior, and explicit no-reward/no-random-payment boundary. Do not claim retention improvement without production evidence.

- [ ] **Step 2: Run the complete release gate**

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
npm audit --audit-level=high
npm run smoke:browser
git diff --check
git status --short
```

Expected: all commands PASS, audit reports zero high vulnerabilities, and only intentional release files are modified before commit.

- [ ] **Step 3: Commit and push the feature branch**

```powershell
git add README.md
git commit -m "docs: explain the tidal archive carriage"
git push -u origin agent/tidal-archive-carriage
```

- [ ] **Step 4: Request an independent read-only code review**

Review the full base-to-head range against `docs/superpowers/specs/2026-08-12-tidal-archive-carriage-design.md`. Fix every Critical and Important issue with new RED→GREEN tests; rerun the entire release gate after the last fix.

- [ ] **Step 5: Fast-forward main and verify the merged result**

From the main checkout:

```powershell
git pull --ff-only origin main
git merge --ff-only agent/tidal-archive-carriage
npm test
git push origin master:main
```

Expected: main points to the reviewed feature head and 110+ test files all pass on the merged checkout.

- [ ] **Step 6: Watch the exact GitHub Pages workflow**

Use `gh run list --commit <HEAD_SHA>` to obtain the exact run and `gh run watch <RUN_ID> --exit-status --interval 5`. Do not report deployment complete until both build and deploy jobs succeed.

- [ ] **Step 7: Clean up only the owned worktree**

Verify both checkouts are clean, resolve the exact `.worktrees/tidal-archive-carriage` path, remove it from the main checkout, prune worktrees, and delete the merged local feature branch. Do not force-delete and do not remove any host-owned worktree.
