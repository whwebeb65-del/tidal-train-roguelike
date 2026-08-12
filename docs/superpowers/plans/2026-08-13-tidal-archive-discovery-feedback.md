# Tidal Archive Discovery Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every first tide-beast encounter and selected skill evolution feel collectible through an in-battle discovery ticket, settlement summary, persistent unread seal, and one-visit NEW stamps.

**Architecture:** Upgrade the pure archive slice to a backward-compatible version 2 with validated unread entry keys. Runtime remains the sole persistence owner and returns presentation objects only when a real battle event changes archive state; a pure battle presentation queue owns the 2400ms non-blocking display. Settlement and equipment views consume immutable presentation data and never modify battle or economy rules.

**Tech Stack:** TypeScript 5, Vitest, DOM-string views, CSS, Vite, existing Chrome CDP smoke runner, localStorage repository.

## Global Constraints

- Do not add currency, combat stats, collection rewards, paid content, random content, audio assets, or a new required interaction.
- Discover enemies only from real `enemy-spawned` events and skill evolutions only from real selected `skill-variant upgrade-selected` events.
- Each discovery ticket displays for 2400ms of eligible visible battle time; overlays pause rather than consume that time.
- Version 1 archive saves migrate with historical discoveries intact and `unreadEntryKeys: []`.
- Opening the archive clears persistent unread immediately but preserves NEW stamps for that one archive visit.
- Every decorative pseudo-element uses `pointer-events: none`; reduced motion removes all discovery transforms, transitions, and animations.
- Every enabled action remains at least 44×44 CSS pixels on 360, 390, 412, and 430px viewports.
- Reuse existing enemy and skill art; add no image files and remain inside existing asset budgets.
- Preserve the existing two-victory 390px smoke gate and ordinary-URL E2E isolation.
- Follow RED → GREEN TDD for every behavior change; commit and push every reviewed task.

---

## Target File Structure

- `src/domain/collection/TidalArchiveSystem.ts` — version-2 unread keys, migration, discovery, and mark-read transition.
- `tests/domain/collection/TidalArchiveSystem.spec.ts` — migration, validation, ordering, freezing, and idempotence.
- `web/app/AppStateRepository.ts` / `tests/web/AppStateRepository.spec.ts` — normalized version-2 round-trip and clear coverage.
- `web/app/AppTypes.ts` — immutable discovery presentation and settlement list contract.
- `web/battle/TidalArchiveDiscoveryPresentation.ts` — authoritative name/art mapping for battle and settlement feedback.
- `web/views/TidalArchiveView.ts`, `web/views/EquipmentView.ts` — visit NEW flags and unread tab seal.
- `web/battle/BattleArchiveDiscoveryQueue.ts` — pure 2400ms overlay-aware presentation queue.
- `web/battle/BattleHudModel.ts`, `web/battle/BattleHUD.ts`, `web/scenes/BattleScene.ts` — discovery ticket and settlement luggage tags.
- `web/LegacyGameRuntime.ts`, `src/telemetry/TelemetryEvents.ts` — real-event output, run summary, mark-read lifecycle, and telemetry.
- `web/styles/tidal-archive-discovery.css`, `web/styles.css` — scoped hand-drawn discovery feedback styling.
- Existing focused tests and `scripts/smoke-browser.mjs` — runtime, layout, motion, image, unread, settlement, and release gates.

---

### Task 1: Upgrade the Immutable Archive State to Version 2

**Files:**
- Modify: `src/domain/collection/TidalArchiveSystem.ts`
- Modify: `tests/domain/collection/TidalArchiveSystem.spec.ts`

**Interfaces:**
- Produces: `TidalArchiveEntryKey`, version-2 `TidalArchiveState`, `tidalArchiveEnemyKey`, `tidalArchiveSkillVariantKey`, and `markTidalArchiveRead`.
- Preserves: `createTidalArchiveState`, `normalizeTidalArchiveState`, `discoverTideBeast`, and `discoverSkillVariant` call signatures.

- [ ] **Step 1: Write failing version-2 migration and unread tests**

Add tests that assert:

```ts
expect(normalizeTidalArchiveState({
  version: 1,
  discoveredEnemyKinds: ['bubble-fin'],
  discoveredSkillVariantIds: ['split-tide-arrow'],
})).toEqual({
  version: 2,
  discoveredEnemyKinds: ['bubble-fin'],
  discoveredSkillVariantIds: ['split-tide-arrow'],
  unreadEntryKeys: [],
});

const firstEnemy = discoverTideBeast(createTidalArchiveState(), 'bubble-fin');
expect(firstEnemy.unreadEntryKeys).toEqual(['enemy:bubble-fin']);
expect(discoverTideBeast(firstEnemy, 'bubble-fin')).toBe(firstEnemy);

const firstVariant = discoverSkillVariant(firstEnemy, 'split-tide-arrow');
expect(firstVariant.unreadEntryKeys).toEqual([
  'enemy:bubble-fin',
  'skill-variant:split-tide-arrow',
]);

const read = markTidalArchiveRead(firstVariant);
expect(read.unreadEntryKeys).toEqual([]);
expect(read.discoveredEnemyKinds).toEqual(['bubble-fin']);
expect(markTidalArchiveRead(read)).toBe(read);
```

Also normalize a version-2 object containing duplicate, unknown, malformed, and undiscovered keys. Expect only discovered legal keys in authoritative enemy-then-variant catalog order. Assert the root and all three arrays are frozen and attempted mutation throws.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/domain/collection/TidalArchiveSystem.spec.ts`

Expected: FAIL because the version is still 1 and unread helpers do not exist.

- [ ] **Step 3: Implement the minimal version-2 domain**

Use these exact public types and helpers:

```ts
export type TidalArchiveEntryKey =
  | `enemy:${TideBeastArchiveId}`
  | `skill-variant:${SkillVariantId}`;

export interface TidalArchiveState {
  readonly version: 2;
  readonly discoveredEnemyKinds: readonly TideBeastArchiveId[];
  readonly discoveredSkillVariantIds: readonly SkillVariantId[];
  readonly unreadEntryKeys: readonly TidalArchiveEntryKey[];
}

export const tidalArchiveEnemyKey = (
  id: TideBeastArchiveId,
): TidalArchiveEntryKey => `enemy:${id}`;

export const tidalArchiveSkillVariantKey = (
  id: SkillVariantId,
): TidalArchiveEntryKey => `skill-variant:${id}`;
```

Build `ALL_ENTRY_KEYS` from the two authoritative catalogs. During normalization, first normalize discoveries; only accept `unreadEntryKeys` when `record.version === 2`; filter keys through the known-key catalog and a set of keys derived from the normalized discoveries. `makeState` freezes all arrays and the root.

`discoverTideBeast` and `discoverSkillVariant` append their unread key only on a new discovery. Implement:

```ts
export function markTidalArchiveRead(
  state: TidalArchiveState,
): TidalArchiveState {
  if (state.unreadEntryKeys.length === 0) return state;
  return makeState(
    state.discoveredEnemyKinds,
    state.discoveredSkillVariantIds,
    [],
  );
}
```

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npm test -- tests/domain/collection/TidalArchiveSystem.spec.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit and push**

```powershell
git add src/domain/collection/TidalArchiveSystem.ts tests/domain/collection/TidalArchiveSystem.spec.ts
git commit -m "feat: track unread tidal archive discoveries"
git push -u origin agent/tidal-archive-discovery-feedback
```

---

### Task 2: Persist and Present Version-2 Archive Entries

**Files:**
- Modify: `web/app/AppTypes.ts`
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `tests/web/AppStateRepository.spec.ts`
- Create: `web/battle/TidalArchiveDiscoveryPresentation.ts`
- Create: `tests/web/battle/TidalArchiveDiscoveryPresentation.spec.ts`
- Modify: `web/views/TidalArchiveView.ts`
- Modify: `web/views/EquipmentView.ts`
- Modify: `tests/web/TidalArchiveView.spec.ts`
- Modify: `tests/web/EquipmentView.spec.ts`

**Interfaces:**
- Consumes: Task 1 entry keys and mark-read state.
- Produces: `TidalArchiveDiscoveryPresentation`, `getTidalArchiveEnemyDiscovery`, `getTidalArchiveSkillVariantDiscovery`, visit-level `isNew`, and `archiveUnreadCount`.

- [ ] **Step 1: Write failing repository, mapper, and view tests**

Repository tests must save/load version 2 unread keys, migrate raw version 1 to empty unread, filter orphan unread keys, and clear the existing storage key.

Mapper tests must assert exact authoritative output:

```ts
expect(getTidalArchiveEnemyDiscovery('bubble-fin')).toMatchObject({
  key: 'enemy:bubble-fin',
  entryType: 'enemy',
  entryId: 'bubble-fin',
  name: '泡鳍鱼',
});
expect(getTidalArchiveSkillVariantDiscovery('split-tide-arrow')).toMatchObject({
  key: 'skill-variant:split-tide-arrow',
  entryType: 'skill-variant',
  entryId: 'split-tide-arrow',
  name: '分汐浪箭',
});
```

View tests pass `newEntryKeys` and require only matching cards to receive `is-new` and a `NEW` stamp. Equipment tests require `NEW 2` inside the real archive tab when `archiveUnreadCount: 2`, no badge at zero, and unchanged mutation controls on the default workshop panel.

- [ ] **Step 2: Run RED**

Run:

```powershell
npm test -- tests/web/AppStateRepository.spec.ts tests/web/battle/TidalArchiveDiscoveryPresentation.spec.ts tests/web/TidalArchiveView.spec.ts tests/web/EquipmentView.spec.ts
```

Expected: FAIL because presentation mapping and unread view contracts do not exist.

- [ ] **Step 3: Add immutable presentation contracts and authoritative mapping**

In `AppTypes.ts` add:

```ts
export interface TidalArchiveDiscoveryPresentation {
  readonly key: TidalArchiveEntryKey;
  readonly entryType: 'enemy' | 'skill-variant';
  readonly entryId: string;
  readonly name: string;
  readonly artUrl: string;
}
```

Add required `archiveDiscoveries` to `BattleSettlementPresentation` now. Add `archiveDiscoveries: []` to every existing `LegacyGameRuntime` settlement constructor and every test fixture/builder. Do not add an optional fallback that hides missing construction paths.

In `TidalArchiveDiscoveryPresentation.ts`, map enemies by finding their exhaustive `TIDAL_ARCHIVE_ENEMIES` entry and variants through `getBattleUpgradeCopy` plus `BATTLE_VARIANT_GLYPH_URLS`. Freeze returned objects.

- [ ] **Step 4: Add visit NEW and unread badge rendering**

Extend `TidalArchiveViewModelInput` with:

```ts
readonly newEntryKeys?: readonly TidalArchiveEntryKey[];
```

Each enemy/variant card gets `isNew` from the key set. Render `is-new` and `<span class="archive-new-stamp" aria-label="新档案">NEW</span>` only when true. Equipment cards never receive this stamp.

Extend `EquipmentViewModel` with `archiveUnreadCount?: number`; clamp to a non-negative integer and render:

```html
<span class="archive-unread-seal" aria-label="2 条未读档案">NEW 2</span>
```

inside the archive tab only when count is positive.

- [ ] **Step 5: Run GREEN, HUD compatibility, and typecheck**

Run:

```powershell
npm test -- tests/web/AppStateRepository.spec.ts tests/web/battle/TidalArchiveDiscoveryPresentation.spec.ts tests/web/TidalArchiveView.spec.ts tests/web/EquipmentView.spec.ts tests/web/battle/BattleHUD.spec.ts
npm run typecheck
```

Expected: PASS; every settlement fixture explicitly supplies an archive list.

- [ ] **Step 6: Commit and push**

```powershell
git add web/app/AppTypes.ts web/LegacyGameRuntime.ts tests/web/AppStateRepository.spec.ts web/battle/TidalArchiveDiscoveryPresentation.ts tests/web/battle/TidalArchiveDiscoveryPresentation.spec.ts web/views/TidalArchiveView.ts web/views/EquipmentView.ts tests/web/TidalArchiveView.spec.ts tests/web/EquipmentView.spec.ts
git commit -m "feat: present unread tidal archive entries"
git push
```

---

### Task 3: Build the Overlay-Aware 2400ms Battle Queue

**Files:**
- Create: `web/battle/BattleArchiveDiscoveryQueue.ts`
- Create: `tests/web/battle/BattleArchiveDiscoveryQueue.spec.ts`
- Modify: `web/battle/BattleHudModel.ts`
- Modify: `web/battle/BattleHUD.ts`
- Modify: `tests/web/battle/BattleHudModel.spec.ts`
- Modify: `tests/web/battle/BattleHUD.spec.ts`
- Modify: `web/scenes/BattleScene.ts`
- Modify: `tests/web/scenes/BattleScene.spec.ts`

**Interfaces:**
- Consumes: Task 2 `TidalArchiveDiscoveryPresentation`.
- Produces: `BattleArchiveDiscoveryQueue.enqueue(entries)`, `.update(nowMs, eligible)`, `.reset()`, HUD `archiveDiscovery`, and a noninteractive discovery ticket.

- [ ] **Step 1: Write failing pure queue tests**

Create deterministic entries A and B. Assert:

```ts
const queue = new BattleArchiveDiscoveryQueue(2400);
queue.enqueue([a, b]);
expect(queue.update(0, true)).toBe(a);
expect(queue.update(2399, true)).toBe(a);
expect(queue.update(2400, true)).toBe(b);
expect(queue.update(4800, true)).toBeNull();
```

Add a pause case: A is visible for 1000ms, the queue is ineligible from 1000 to 9000, and A remains visible for 1400ms after eligibility resumes. Add duplicate-key suppression within the queue and `reset()`.

- [ ] **Step 2: Run queue RED**

Run: `npm test -- tests/web/battle/BattleArchiveDiscoveryQueue.spec.ts`

Expected: FAIL because the queue does not exist.

- [ ] **Step 3: Implement the pure queue**

Use an internal FIFO, active entry, remaining milliseconds, last timestamp, and a set of queued/active keys. Subtract elapsed time only when `eligible === true`. Activation happens immediately when eligible and the queue is non-empty. Remove keys when their item expires so a later legitimate enqueue can display, while runtime domain idempotence prevents repeated discoveries.

- [ ] **Step 4: Write failing HUD and scene integration tests**

HUD model tests require `archiveDiscovery` only while battle status is `running`, not during upgrade/pause/failure/settlement/tutorial visibility. HUD DOM tests require one `aria-live="polite"` noninteractive aside with art, type copy, name, and hidden state updates.

Scene tests change `onBattleEvents` to return discovery presentations. Drain one discovery and assert it is passed to the HUD; advance 2399ms/2400ms; insert an upgrade overlay interval and prove the display budget pauses.

- [ ] **Step 5: Implement HUD and scene wiring**

Change dependency signature:

```ts
readonly onBattleEvents: (
  events: readonly BattleEvent[],
) => readonly TidalArchiveDiscoveryPresentation[];
```

After freezing and sending engine events, enqueue the returned presentations. During `renderBattle`, calculate eligibility from running status, no visibility pause, no settlement, and no first-run tutorial prompt. Pass `queue.update(lastFrameTimeMs, eligible)` to `createBattleHudModel`.

Add a static HUD aside:

```html
<aside class="battle-archive-discovery" data-archive-discovery aria-live="polite" aria-atomic="true" hidden>
  <img data-archive-discovery-art alt="" />
  <span>NEW ARCHIVE ENTRY</span>
  <small data-archive-discovery-type></small>
  <b data-archive-discovery-name></b>
</aside>
```

It contains no button, link, tabindex, or pointer handler.

- [ ] **Step 6: Run GREEN and typecheck**

Run:

```powershell
npm test -- tests/web/battle/BattleArchiveDiscoveryQueue.spec.ts tests/web/battle/BattleHudModel.spec.ts tests/web/battle/BattleHUD.spec.ts tests/web/scenes/BattleScene.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit and push**

```powershell
git add web/battle/BattleArchiveDiscoveryQueue.ts tests/web/battle/BattleArchiveDiscoveryQueue.spec.ts web/battle/BattleHudModel.ts web/battle/BattleHUD.ts tests/web/battle/BattleHudModel.spec.ts tests/web/battle/BattleHUD.spec.ts web/scenes/BattleScene.ts tests/web/scenes/BattleScene.spec.ts
git commit -m "feat: show queued battle archive discoveries"
git push
```

---

### Task 4: Connect Real Discoveries, Settlement Summary, and Read Lifecycle

**Files:**
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `src/telemetry/TelemetryEvents.ts`
- Modify: `tests/web/GameApp.spec.ts`
- Modify: `tests/web/BattleSettlementTransaction.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–3 domain transitions, presentation mappers, queue-return signature, settlement contract, and view inputs.
- Produces: real discovery output, per-run immutable settlement list, archive mark-read action, and `tidal_archive_entries_read`.

- [ ] **Step 1: Write failing normal and daily runtime tests**

Extend real GameApp E2E coverage to assert:

1. Before first spawn, unread is empty and no discovery ticket presentation was returned.
2. The first real normal `enemy-spawned` produces one returned presentation, persisted unread key, run summary entry, and existing discovery telemetry.
3. Duplicate same-kind spawn changes none of those counts.
4. A real selected Lv.5 skill variant adds one variant presentation/key/summary entry; merely offered remains absent.
5. A real daily-trial spawn follows the same behavior.
6. Gears, route marks, star tickets, inventory/equipment, skins, mastery, and the complete `BattleRunInput` remain unchanged by feedback state.

After returning to equipment, assert archive tab shows `NEW 2`. Click the real archive tab and require persisted unread `[]`, one `tidal_archive_entries_read` with `{ count: 2 }`, both matching cards marked `is-new`, and no economic telemetry. Switch to workshop, leave/re-enter equipment/archive, and require no NEW stamps.

Settlement transaction fixtures must preserve exact empty `archiveDiscoveries` for old/repeated settlements.

- [ ] **Step 2: Run RED**

Run:

```powershell
npm test -- tests/web/GameApp.spec.ts tests/web/BattleSettlementTransaction.spec.ts
```

Expected: FAIL because runtime returns no presentation, summaries are absent, and unread is not cleared on open.

- [ ] **Step 3: Return presentations only on real state changes**

Change `commitArchiveDiscovery` to return `TidalArchiveDiscoveryPresentation | null`. Compare state identity before saving; on change, persist, track the existing discovery event, build the authoritative presentation, append it once to `activeRunArchiveDiscoveries`, and return it.

`trackBattleEvents` collects and returns only non-null presentations. Keep the existing two authoritative event predicates unchanged.

Reset `activeRunArchiveDiscoveries = []` only when a new battle successfully begins, not on a failed departure attempt.

- [ ] **Step 4: Attach the immutable run list to every settlement**

Create:

```ts
function withArchiveDiscoveries(
  presentation: BattleSettlementPresentation,
): BattleSettlementPresentation {
  return Object.freeze({
    ...presentation,
    archiveDiscoveries: Object.freeze([...activeRunArchiveDiscoveries]),
  });
}
```

Use it for normal, daily trial, give-up/failure, and already-settled fallback construction. The active settlement stores the list; repeat settlement and ad double operations preserve the same array content and never create discoveries.

- [ ] **Step 5: Implement unread clear and one-visit NEW state**

Add runtime-only `archiveVisitNewKeys: readonly TidalArchiveEntryKey[] = []`.

On `show-tidal-archive`, copy the current unread array, call `markTidalArchiveRead`, persist only when identity changes, track `tidal_archive_entries_read` once with the exact count, select archive panel, and render. Pass copied keys into the archive view model. Pass current persistent count to `renderEquipment` so the workshop tab shows the seal.

On `show-equipment-workshop` and any navigation away from equipment, clear the visit keys. Reopening archive with no unread yields no card stamps and no read telemetry.

- [ ] **Step 6: Run GREEN, complete integration, and typecheck**

Run:

```powershell
npm test -- tests/web/GameApp.spec.ts tests/web/BattleSettlementTransaction.spec.ts tests/web/AppStateRepository.spec.ts tests/web/EquipmentView.spec.ts tests/web/battle/BattleHUD.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit and push**

```powershell
git add web/LegacyGameRuntime.ts src/telemetry/TelemetryEvents.ts tests/web/GameApp.spec.ts tests/web/BattleSettlementTransaction.spec.ts
git commit -m "feat: connect archive discovery feedback lifecycle"
git push
```

---

### Task 5: Render Settlement Luggage Tags and Hand-Drawn Feedback Styling

**Files:**
- Create: `web/styles/tidal-archive-discovery.css`
- Modify: `web/styles.css`
- Modify: `web/battle/BattleHUD.ts`
- Modify: `tests/web/battle/BattleHUD.spec.ts`
- Modify: `tests/web/LivingStationStyles.spec.ts`

**Interfaces:**
- Consumes: settlement `archiveDiscoveries`, battle discovery aside, unread seal, and NEW card classes.
- Produces: settlement summary DOM and scoped responsive/motion-safe visual treatment.

- [ ] **Step 1: Write failing settlement and style contracts**

HUD tests render two settlement discoveries and require:

```html
<section class="settlement-archive-luggage" data-settlement-archive>
  <h3>本局新档案</h3>
  <article data-settlement-archive-entry="enemy:bubble-fin"><img alt="泡鳍鱼" /><small>潮兽目击</small><b>泡鳍鱼</b></article>
  <article data-settlement-archive-entry="skill-variant:split-tide-arrow"><img alt="分汐浪箭" /><small>技能进化</small><b>分汐浪箭</b></article>
</section>
```

Require it hidden for an empty list and located after settlement progression but before action buttons.

Style tests require the stylesheet import, scoped selectors, all feedback pseudos in a consolidated `pointer-events: none` rule, mobile width containment, wrapping settlement tags, and reduced-motion overrides including element and pseudo transforms/animations/transitions.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/battle/BattleHUD.spec.ts tests/web/LivingStationStyles.spec.ts`

Expected: FAIL because summary markup and stylesheet do not exist.

- [ ] **Step 3: Render settlement discovery luggage tags**

Add the static hidden section to the settlement dialog. HUD update empties/rebuilds its children from immutable presentation entries using DOM APIs, non-empty image alt text, a type label, and name. Hide the whole section when the list is empty. Do not use `innerHTML` with presentation strings.

- [ ] **Step 4: Add the scoped hand-drawn stylesheet**

Import after `tidal-archive.css`. Style:

- battle ticket in the right-side safe region with cream paper, red stamp, enemy teal or variant purple/gold edge;
- unread seal within the existing archive tab without shrinking the 46px physical tab height;
- card NEW stamp with no layout shift;
- settlement luggage tags that wrap at mobile widths and keep actions visible;
- image-failure-safe text layout;
- pseudo pointer safety and `prefers-reduced-motion: reduce` static overrides.

Selectors must begin with `.app-shell--battle`, `.otter-workshop`, `.tidal-archive-carriage`, or `.battle-overlay--settlement` as appropriate. Do not add global button/card rules.

- [ ] **Step 5: Run GREEN, build, and focused visual contracts**

Run:

```powershell
npm test -- tests/web/battle/BattleHUD.spec.ts tests/web/LivingStationStyles.spec.ts
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit and push**

```powershell
git add web/styles/tidal-archive-discovery.css web/styles.css web/battle/BattleHUD.ts tests/web/battle/BattleHUD.spec.ts tests/web/LivingStationStyles.spec.ts
git commit -m "style: celebrate new tidal archive entries"
git push
```

---

### Task 6: Permanent Browser Gate, Documentation, Review, and Release

**Files:**
- Modify: `scripts/smoke-browser.mjs`
- Modify: `tests/smoke/browser-script.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete feedback lifecycle from Tasks 1–5.
- Produces: permanent real-browser regression coverage and a reviewed deployed main branch.

- [ ] **Step 1: Write failing smoke-source contracts**

Require the source to contain `assertTidalArchiveDiscoveryFeedback`, `data-archive-discovery`, `data-settlement-archive`, `archive-unread-seal`, `archive-new-stamp`, `unreadEntryKeys`, and an explicit assertion that both 390 full-run terminal states are `victory`.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/smoke/browser-script.spec.ts`

Expected: FAIL because the new helper is absent.

- [ ] **Step 3: Add real Chrome lifecycle verification**

On the 390 full path with empty archive storage and the existing first-run tutorial state pre-completed through its exact E2E-gated local fixture:

1. Start a real battle and pause after the first authoritative enemy spawn.
2. Assert a visible `.battle-archive-discovery` with loaded image, correct enemy key/name, no interactive descendants, `pointer-events: none`, and no overlap with top HUD, speed/pause, skills, or canvas aim region.
3. Advance to real settlement and assert `[data-settlement-archive]` contains the same entry while reward/currency values remain governed by the existing settlement checks.
4. Return to station/equipment and assert the archive tab has `.archive-unread-seal`.
5. Open archive and assert storage `unreadEntryKeys` is empty while the matching card has `.archive-new-stamp`.
6. Switch to workshop, leave/re-enter equipment/archive, and assert no seal or NEW stamp.
7. Under CDP reduced-motion emulation, create another isolated discovery state and assert discovery elements/pseudos have no transform, transition, or animation while text remains visible.

For 360/412/430, seed a legal unread state through localStorage, open equipment/archive, and verify seal/card layout, image loading, no horizontal overflow, viewport containment, and all enabled actions ≥44×44. Restore normal media emulation after each audit.

Keep ordinary URL no-E2E coverage and explicit 390 `victory/victory` assertions.

- [ ] **Step 4: Document the feedback behavior**

Extend the README archive section with one paragraph: first discoveries create a non-blocking battle ticket, appear in that run's settlement, and remain marked NEW in the equipment archive until opened. State that this feedback grants no rewards or stats.

- [ ] **Step 5: Run the complete release gate**

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

Expected: all pass; audit reports zero high vulnerabilities; 390 reports `victory/victory`; ordinary URL has no E2E global.

- [ ] **Step 6: Commit, push, and request independent review**

```powershell
git add scripts/smoke-browser.mjs tests/smoke/browser-script.spec.ts README.md
git commit -m "test: guard tidal archive discovery feedback"
git push
```

Request a read-only full-range review against `docs/superpowers/specs/2026-08-13-tidal-archive-discovery-feedback-design.md`. Fix every Critical and Important finding with a new test and rerun the complete release gate.

- [ ] **Step 7: Fast-forward main and deploy**

From the main checkout, pull `origin/main`, fast-forward merge `agent/tidal-archive-discovery-feedback`, run `npm test`, then push `master:main`. Obtain the exact Pages run with `gh run list --commit <HEAD_SHA>` and wait via `gh run watch <RUN_ID> --exit-status --interval 5` until both build and deploy succeed.

- [ ] **Step 8: Clean up only the owned worktree**

Verify main and feature worktree tracked state are clean. Resolve the exact `.worktrees/tidal-archive-discovery-feedback` path, remove it from the main checkout, prune worktrees, and delete only the merged local feature branch. Do not force-delete or remove a host-owned worktree.
