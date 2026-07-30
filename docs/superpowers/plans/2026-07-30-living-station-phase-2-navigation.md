# Living Tidal Station Phase 2: Navigation Districts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn captain, wardrobe, equipment, settings, and bottom navigation surfaces into connected places inside the living tidal station.

**Architecture:** Reuse phase one's `.living-zone` vocabulary, but give each page a dedicated stylesheet and semantic root. Keep native controls, scene IDs, domain view models, asset URLs, and action identifiers stable.

**Tech Stack:** TypeScript string views, scoped CSS, existing chibi art catalog, Vitest, Vite

## Global Constraints

- Phase 1 must be complete and green before this plan starts.
- Do not change captain equality, skin stacking, equipment progression, settings persistence, or scene routing.
- Preserve all `data-action`, `data-nav-scene`, `data-setting`, product, skin, captain, and equipment IDs.
- Do not add dependencies or replace native checkbox/select semantics.
- At 360, 390, 412, and 430 CSS pixels, no horizontal overflow or hidden primary action is allowed.

---

### Task 1: Captain platform and wardrobe carriage

**Files:**
- Modify: `web/views/CaptainSelectionView.ts`
- Modify: `web/views/WardrobeView.ts`
- Create: `web/styles/living-station-captain.css`
- Modify: `web/styles.css`
- Modify: `tests/web/CaptainSelectionView.spec.ts`
- Modify: `tests/web/WardrobeView.spec.ts`

**Interfaces:**
- Consumes: `CAPTAIN_CATALOG`, `CHIBI_ART`, `WardrobeModel`.
- Produces: `.captain-platform`, `.captain-berth`, `.wardrobe-carriage`, `.carriage-mirror`, and `.skin-luggage`.

- [ ] **Step 1: Add failing semantic assertions**

```ts
expect(html).toContain('living-zone captain-platform');
expect(html.match(/captain-berth/g)).toHaveLength(2);
```

```ts
expect(html).toContain('living-zone wardrobe-carriage');
expect(html).toContain('carriage-mirror');
expect(html).toContain('skin-luggage');
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/web/CaptainSelectionView.spec.ts tests/web/WardrobeView.spec.ts`

Expected: failures only on the new place classes.

- [ ] **Step 3: Implement captain selection as one shared platform**

Use:

```ts
return `<section class="captain-select scene living-zone captain-platform">
  <div class="platform-departure-sign">...</div>
  <div class="captain-choice-grid platform-lineup">${cards}</div>
</section>`;
```

Each button becomes `class="captain-choice-card captain-berth"` and keeps `data-action="select-captain"` and `data-captain-id`.

- [ ] **Step 4: Implement wardrobe carriage**

Use `living-zone wardrobe-carriage` on the root, `wardrobe-preview carriage-mirror` on the live preview, and `skin-card skin-luggage` on each skin. Preserve lazy images, ownership logic, purchase actions, equip actions, and collection stats.

Change only visible action copy:

```ts
equipped ? '镜前展示中' : '挂上此套制服'
```

Keep the corresponding `data-action` and disabled rules unchanged.

- [ ] **Step 5: Add and import captain styles**

Create a shared carriage interior with window light, hanging rail, mirror glow, luggage seals, and a mobile vertical lineup. Keep the actual captain art unobstructed and supply reduced-motion rules.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- tests/web/CaptainSelectionView.spec.ts tests/web/WardrobeView.spec.ts`

```powershell
git add web/views/CaptainSelectionView.ts web/views/WardrobeView.ts web/styles.css web/styles/living-station-captain.css tests/web/CaptainSelectionView.spec.ts tests/web/WardrobeView.spec.ts
git commit -m "style: build captain platform and wardrobe carriage"
```

### Task 2: Otter maintenance workshop

**Files:**
- Modify: `web/views/EquipmentView.ts`
- Create: `web/styles/living-station-workshop.css`
- Modify: `web/styles.css`
- Modify: `tests/web/EquipmentView.spec.ts`

**Interfaces:**
- Consumes: `EquipmentViewModel`, all current equipment actions, and set-bonus calculations.
- Produces: `.otter-workshop`, `.tool-wall`, `.workbench-item`, `.parts-bin`, and `.maintenance-tag`.

- [ ] **Step 1: Add the failing contract**

```ts
expect(html).toContain('living-zone otter-workshop');
expect(html).toContain('tool-wall');
expect(html).toContain('workbench-item');
expect(html).toContain('parts-bin');
expect(html).toContain('maintenance-tag');
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/web/EquipmentView.spec.ts`

Expected: FAIL on missing workshop classes.

- [ ] **Step 3: Implement semantic workshop classes**

Use:

```ts
return `<section class="equipment scene living-zone otter-workshop">
  <div class="run-heading workshop-sign">...</div>
  <div class="equipment-layout">
    <aside class="tool-wall">...</aside>
    <div class="equipment-inventory parts-bin">${groups}</div>
  </div>
</section>`;
```

Each equipment card becomes `equipment-card workbench-item`; each slot becomes `equipment-slot maintenance-tag`; each set bonus becomes `set-bonus workshop-blueprint`. Keep all four action identifiers and costs unchanged.

- [ ] **Step 4: Add and import workshop styles**

Render the left side as a perforated tool wall, inventory as a timber workbench, stars as stamped rivets, and active set bonuses as lit blueprints. Empty groups use an empty hook and the existing `暂无装备` text.

- [ ] **Step 5: Run and commit**

Run: `npm test -- tests/web/EquipmentView.spec.ts`

```powershell
git add web/views/EquipmentView.ts web/styles.css web/styles/living-station-workshop.css tests/web/EquipmentView.spec.ts
git commit -m "style: rebuild equipment as otter workshop"
```

### Task 3: Conductor control cabinet settings

**Files:**
- Modify: `web/views/SettingsPanelView.ts`
- Replace presentation rules in: `web/styles/settings-panel.css`
- Modify: `tests/web/SettingsPanelView.spec.ts`

**Interfaces:**
- Consumes: `SettingsPanelModel` and native checkbox/select inputs.
- Produces: `.conductor-cabinet`, `.cabinet-gauge`, `.cabinet-switch`, and `.sealed-maintenance-note`.

- [ ] **Step 1: Add failing settings-place assertions**

```ts
expect(html).toContain('settings-sheet conductor-cabinet');
expect(html).toContain('cabinet-gauge');
expect(html).toContain('cabinet-switch');
expect(html).toContain('sealed-maintenance-note');
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/web/SettingsPanelView.spec.ts`

Expected: FAIL on the four new classes.

- [ ] **Step 3: Add cabinet semantics without changing form behavior**

Add `conductor-cabinet` to the dialog, `cabinet-gauge` to section headings, `cabinet-switch` to toggle rows, and `sealed-maintenance-note` to the footer. Preserve `role="dialog"`, `aria-modal`, labels, checkboxes, select options, close actions, and backdrop.

- [ ] **Step 4: Replace the white rounded sheet styling**

Use a dark painted-metal control cabinet with brass frame, screw/rivet pseudo-elements, lever-like toggles, and a paper maintenance seal. The backdrop remains a modal boundary. Keep the dialog scrollable and all controls at least 44 pixels high.

- [ ] **Step 5: Run and commit**

Run: `npm test -- tests/web/SettingsPanelView.spec.ts tests/web/SettingsRepository.spec.ts`

```powershell
git add web/views/SettingsPanelView.ts web/styles/settings-panel.css tests/web/SettingsPanelView.spec.ts
git commit -m "style: turn settings into conductor control cabinet"
```

### Task 4: Station wayfinding bottom navigation

**Files:**
- Modify: `web/styles/app-shell-v2.css`
- Modify: `web/styles/shell.css`
- Modify: `tests/web/AppShell.spec.ts`

**Interfaces:**
- Consumes: the existing five scene IDs and nav buttons.
- Produces: a station wayfinding rail that preserves routing and accessibility.

- [ ] **Step 1: Add a failing source-style contract**

```ts
const css = [
  readFileSync(new URL('../../web/styles/shell.css', import.meta.url), 'utf8'),
  readFileSync(new URL('../../web/styles/app-shell-v2.css', import.meta.url), 'utf8'),
].join('\n');
expect(css).toContain('.app-hub-nav::before');
expect(css).toContain('.hub-nav__item[aria-current="page"]');
expect(css).toContain('min-height: 44px');
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/web/AppShell.spec.ts`

Expected: FAIL on wayfinding selectors.

- [ ] **Step 3: Implement the wayfinding rail**

Keep the existing five buttons and labels. Style the nav background as a metal station direction rail, icons as small location seals, and the active item as a lit hanging sign. Do not change scene IDs, click routing, focus order, or safe-area padding.

- [ ] **Step 4: Run and commit**

Run: `npm test -- tests/web/AppShell.spec.ts tests/web/SceneRouter.spec.ts tests/web/FeatureScenes.spec.ts`

```powershell
git add web/styles/app-shell-v2.css web/styles/shell.css tests/web/AppShell.spec.ts
git commit -m "style: turn bottom navigation into station wayfinding"
```

### Task 5: Phase-two verification

**Files:**
- Modify only if verification reveals a navigation-district defect.

**Interfaces:**
- Consumes: all phase-two districts.
- Produces: verified captain, wardrobe, workshop, settings, and navigation layouts.

- [ ] **Step 1: Run automated checks**

Run: `npm test && npm run typecheck && npm run check:assets && npm run build`

Expected: all exit 0.

- [ ] **Step 2: Run browser smoke**

Run: `npm run smoke:browser`

Expected: all four mobile viewport flows pass.

- [ ] **Step 3: Inspect desktop and mobile states**

At 1024×800 and 390×844, verify both captain choices, owned/locked/pending skins, four equipment slots, empty equipment groups, all settings inputs, and every bottom-nav destination.

- [ ] **Step 4: Check the diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only phase-two files are changed.

