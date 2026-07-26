# Hand-Drawn Battle HUD and Skill Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the obscuring glass-card HUD and Unicode skills with a compact hand-drawn tide-log HUD, polished color-coded skill badges, Rank evolution, and variant glyphs.

**Architecture:** Runtime art is split into three reusable 256×256 base badges and twelve 64×64 variant glyphs. `BattleHudModel` exposes semantic rank, variant, cooldown, and speed data; `BattleHUD` renders stable accessible DOM; CSS composes rank and state layers without duplicating full images. Combat effects react to engine events but never own combat rules.

**Tech Stack:** TypeScript, CSS, transparent WebP assets, built-in image generation during the asset task, Vitest DOM tests, existing asset loader and effect pools.

**Execution Order:** Plan 3 of 4. Complete the progression foundation and battle-core plans first.

## Global Constraints

- No Unicode placeholder may remain as a skill icon.
- Skill identity colors are electric cyan/orange for volley, emerald/gold for barrier, and coral/gold-white for extreme tide.
- Base badges remain recognizable at 72 CSS pixels and in grayscale.
- Runtime assets are three 256×256 transparent WebP badges and twelve 64×64 transparent WebP glyphs; total new skill-art target is at most 650 KB.
- Top HUD visual bottom is at or above logical `y = 108`; enemy content has at least 12 logical pixels of separation.
- Skill tap targets are at least 56×56 CSS pixels.
- Reduced-motion and low-quality modes retain all state information.
- Asset failure never blocks skill use.
- Use TDD and commit after each task.

---

## File Structure

- Create 15 WebP files under `web/assets/chibi/skills`.
- Modify `web/assets/BattleArtCatalog.ts` and `scripts/check-asset-budget.mjs`.
- Modify `web/battle/BattleHudModel.ts`, `BattleHUD.ts`, and `web/styles/battle-hud.css`.
- Modify `web/battle/EffectSystem.ts` and focused tests for Rank/variant presentation.
- Extend smoke tests for asset presence, alpha, MIME, and budget.

### Task 1: Generate Production Skill Art

**Files:**
- Create: `web/assets/chibi/skills/tidal-volley-badge.webp`
- Create: `web/assets/chibi/skills/bubble-barrier-badge.webp`
- Create: `web/assets/chibi/skills/extreme-tide-badge.webp`
- Create: twelve `*-glyph.webp` files named exactly after the shared variant IDs.
- Test: `tests/smoke/battle-assets.spec.ts`

**Interfaces:**
- Consumes: approved art direction and shared variant IDs.
- Produces: transparent source assets for the catalog.
- Required skill during execution: `imagegen`.

- [ ] **Step 1: Add failing asset existence and dimension assertions**

```ts
const skillAssets = [
  ['tidal-volley-badge.webp', 256, 256],
  ['bubble-barrier-badge.webp', 256, 256],
  ['extreme-tide-badge.webp', 256, 256],
  ['split-tide-arrow-glyph.webp', 64, 64],
  ['reef-piercer-glyph.webp', 64, 64],
  ['returning-volley-glyph.webp', 64, 64],
  ['rainstorm-school-glyph.webp', 64, 64],
  ['bursting-bubble-glyph.webp', 64, 64],
  ['reflective-spines-glyph.webp', 64, 64],
  ['overflow-membrane-glyph.webp', 64, 64],
  ['emergency-trigger-glyph.webp', 64, 64],
  ['undertow-eye-glyph.webp', 64, 64],
  ['lingering-vortex-glyph.webp', 64, 64],
  ['energy-return-glyph.webp', 64, 64],
  ['double-crest-glyph.webp', 64, 64],
] as const;
```

For each file assert it exists, is WebP, has the exact dimensions, and contains alpha pixels.

- [ ] **Step 2: Run the smoke test**

Run: `npm test -- tests/smoke/battle-assets.spec.ts`

Expected: FAIL listing the 15 missing files.

- [ ] **Step 3: Generate the three base badges with the image-generation skill**

Use one generation per badge, with transparent/chroma-key output and these exact visual briefs:

```text
Shared style: premium mobile game skill badge for the hand-painted 2D game
"Last Train: Tidal Train"; deep navy imperfect ink outline, layered opaque
paint shapes, subtle paper grain, readable at 72 px, isolated centered emblem,
no text, no letters, no UI frame, no square background, no photorealism,
no glossy 3D, no generic vector icon, chroma-key solid magenta background.

Tidal Volley: three overlapping arrow-fish surging diagonally upward, electric
cyan bodies, white foam ribbons, vivid orange arrow fins, strongest silhouette
points forward, energetic attack pose.

Bubble Barrier: brave round coral-armored puffer inside two translucent bubble
membranes, saturated emerald turquoise, warm gold highlights, clear protective
silhouette and calm determined face.

Extreme Tide: whirl-star tide priest surrounding a bright rotating tidal eye,
coral red outer star, gold-white core, deep cyan spiral, explosive radial
silhouette clearly more powerful than the other two.
```

Remove the chroma key, visually inspect each original, resize with high-quality Lanczos filtering, and encode the runtime outputs as lossless-alpha WebP at 256×256.

- [ ] **Step 4: Generate three four-glyph sheets and crop the twelve glyphs**

Use one 2×2 sheet per skill family. Every cell must be isolated, text-free, high-contrast, and share the base badge’s colors. Briefs:

```text
Volley sheet: branching arrow-fish wake; coral-piercing spear fin; returning
boomerang wave; dense rain of tiny arrow-fish.

Barrier sheet: bursting bubble shock ring; reflective coral spines; layered
overflow membrane; emergency heart inside an auto-opening bubble.

Extreme sheet: inward-pulling tide eye; lingering spiral pool; energy droplet
returning to a core; two stacked tidal crests.
```

Crop cells to square transparent files, inspect at 64×64, and use the exact filenames from Step 1.

- [ ] **Step 5: Run asset tests and commit**

Run: `npm test -- tests/smoke/battle-assets.spec.ts`

Expected: PASS with exact dimensions and alpha.

```bash
git add web/assets/chibi/skills tests/smoke/battle-assets.spec.ts
git commit -m "art: add production skill badges and variant glyphs"
```

### Task 2: Asset Catalog and Budget

**Files:**
- Modify: `web/assets/BattleArtCatalog.ts`
- Modify: `scripts/check-asset-budget.mjs`
- Modify: `tests/smoke/asset-budget.spec.ts`
- Modify: `tests/smoke/battle-assets.spec.ts`

**Interfaces:**
- Produces catalog IDs `skillTidalVolley`, `skillBubbleBarrier`, `skillExtremeTide`, and `variantGlyphs`.

- [ ] **Step 1: Add failing catalog and combined-budget assertions**

```ts
expect(BATTLE_ART_URLS.skillTidalVolley).toContain('tidal-volley-badge');
expect(BATTLE_ART_URLS.skillBubbleBarrier).toContain('bubble-barrier-badge');
expect(BATTLE_ART_URLS.skillExtremeTide).toContain('extreme-tide-badge');
expect(Object.keys(BATTLE_VARIANT_GLYPH_URLS)).toHaveLength(12);
expect(totalSkillAssetBytes).toBeLessThanOrEqual(650 * 1024);
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- tests/smoke/asset-budget.spec.ts tests/smoke/battle-assets.spec.ts`

Expected: FAIL because the catalog and budget script do not include skill art.

- [ ] **Step 3: Register exact URLs**

Export:

```ts
export const BATTLE_VARIANT_GLYPH_URLS:
  Readonly<Record<SkillVariantId, string>> = {
  'split-tide-arrow': new URL('./chibi/skills/split-tide-arrow-glyph.webp', import.meta.url).href,
  'reef-piercer': new URL('./chibi/skills/reef-piercer-glyph.webp', import.meta.url).href,
  'returning-volley': new URL('./chibi/skills/returning-volley-glyph.webp', import.meta.url).href,
  'rainstorm-school': new URL('./chibi/skills/rainstorm-school-glyph.webp', import.meta.url).href,
  'bursting-bubble': new URL('./chibi/skills/bursting-bubble-glyph.webp', import.meta.url).href,
  'reflective-spines': new URL('./chibi/skills/reflective-spines-glyph.webp', import.meta.url).href,
  'overflow-membrane': new URL('./chibi/skills/overflow-membrane-glyph.webp', import.meta.url).href,
  'emergency-trigger': new URL('./chibi/skills/emergency-trigger-glyph.webp', import.meta.url).href,
  'undertow-eye': new URL('./chibi/skills/undertow-eye-glyph.webp', import.meta.url).href,
  'lingering-vortex': new URL('./chibi/skills/lingering-vortex-glyph.webp', import.meta.url).href,
  'energy-return': new URL('./chibi/skills/energy-return-glyph.webp', import.meta.url).href,
  'double-crest': new URL('./chibi/skills/double-crest-glyph.webp', import.meta.url).href,
};
```

Add the three badges to `BATTLE_ART_URLS` and critical battle art IDs. Glyphs may load with the HUD bundle; a failed glyph uses the CSS fallback rune.

- [ ] **Step 4: Add the skill directory budget**

Update `check-asset-budget.mjs` to recurse into `chibi/skills`, enforce exact files, sum all 15, and fail above `650 * 1024`. Add three badges to `battleScreen`; do not add all glyphs to first-screen bytes.

- [ ] **Step 5: Run and commit**

Run: `npm run check:assets && npm test -- tests/smoke/asset-budget.spec.ts tests/smoke/battle-assets.spec.ts`

Expected: PASS.

```bash
git add web/assets/BattleArtCatalog.ts scripts/check-asset-budget.mjs tests/smoke
git commit -m "feat: register skill art and enforce its budget"
```

### Task 3: Semantic HUD Model for Rank, Variants, and Speed

**Files:**
- Modify: `web/battle/BattleHudModel.ts`
- Modify: `tests/web/battle/BattleHUD.spec.ts`
- Modify: `tests/web/battle/helpers/BattleFixtures.ts`

**Interfaces:**
- Consumes frame `runLevel`, `skillRanks`, `skillVariants`; `BattleSpeed`, available speeds.
- Produces model fields `runLevelLabel`, `skill.rank`, `skill.variantIds`, `skill.iconUrl`, `speed.current`, `speed.available`, `speed.nextUnlockLevel`.

- [ ] **Step 1: Write failing model assertions**

```ts
const model = createBattleHudModel(createFrameFixture({
  runLevel: 7,
  skillRanks: {
    'tidal-volley': 3,
    'bubble-barrier': 2,
    'extreme-tide': 5,
  },
  skillVariants: {
    'tidal-volley': ['split-tide-arrow'],
    'bubble-barrier': [],
    'extreme-tide': ['undertow-eye', 'double-crest'],
  },
}), {
  ...defaultHudOptions(),
  battleSpeed: 1.5,
  availableBattleSpeeds: [1, 1.5],
  nextSpeedUnlockLevel: 20,
});
expect(model.runLevelLabel).toBe('Lv.7');
expect(model.skills[0]).toMatchObject({
  rank: 3,
  variantIds: ['split-tide-arrow'],
});
expect(model.speed).toEqual({
  current: 1.5,
  available: [1, 1.5],
  nextUnlockLevel: 20,
});
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/web/battle/BattleHUD.spec.ts`

Expected: FAIL because semantic progression fields do not exist.

- [ ] **Step 3: Extend model interfaces and creation**

Add:

```ts
export interface BattleSkillModel {
  // retain existing fields
  readonly rank: number;
  readonly variantIds: readonly SkillVariantId[];
  readonly iconUrl: string;
}
export interface BattleSpeedModel {
  readonly current: BattleSpeed;
  readonly available: readonly BattleSpeed[];
  readonly nextUnlockLevel: number | null;
}
```

Use catalog URLs for icons. Derive next unlock as 10, 20, 30, or `null`, and show run XP against the next of 19 thresholds.
Delete `BattleBossBarModel`, `bossBar`, and `BOSS_LABELS` from the HUD model because the renderer now owns enemy-following names and health.

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/web/battle/BattleHUD.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/battle/BattleHudModel.ts tests/web/battle/BattleHUD.spec.ts tests/web/battle/helpers/BattleFixtures.ts
git commit -m "feat: expose skill evolution and battle speed in HUD model"
```

### Task 4: Replace the HUD Shell and Interaction

**Files:**
- Modify: `web/battle/BattleHUD.ts`
- Modify: `tests/web/battle/BattleHUD.spec.ts`

**Interfaces:**
- Adds callback `onBattleSpeed(speed: BattleSpeed): void`.
- Renders semantic data attributes used by CSS and E2E.

- [ ] **Step 1: Add failing shell and update tests**

Assert:

```ts
expect(html).not.toContain('≈');
expect(html).not.toContain('◌');
expect(html).not.toContain('✦');
expect(html).toContain('data-hud-run-level');
expect(html).toContain('data-battle-action="speed"');
expect(html).toContain('data-skill-rank');
expect(html).toContain('data-skill-variants');
expect(html).not.toContain('data-boss-bar');
```

Mount the HUD, update with Rank 5 and two variants, and assert the button has `data-rank="5"`, two glyph images, a non-empty accessible label, and a speed button labeled `1.5×`.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/web/battle/BattleHUD.spec.ts`

Expected: FAIL against the old Unicode shell.

- [ ] **Step 3: Build the compact tide-log top bar**

Render one `.battle-hud__tide-log` containing:

```html
<div class="battle-hud__run">
  <strong data-hud-wave></strong>
  <span data-hud-time></span>
  <b data-hud-run-level></b>
</div>
<div class="battle-hud__rails">
  <!-- compact HP/shield and energy tracks -->
</div>
<button data-battle-action="speed"></button>
<button data-battle-action="pause" aria-label="暂停战斗">Ⅱ</button>
```

Remove the old `battle-hud__vitals`, `battle-hud__progress`, and six-slot upgrade icon strip.
Remove the duplicate DOM Boss bar; enemy names and health follow the canvas enemies from `BattleRenderer`.

- [ ] **Step 4: Build image-backed skill badges**

Each skill button contains base image, Rank ring, up to two glyph images, cooldown tide mask, shortcut, one-line name, and screen-reader status. Clicking speed cycles through `model.speed.available`; clicking a skill keeps the existing callback behavior.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/web/battle/BattleHUD.spec.ts tests/web/battle/BattleScene.spec.ts`

Expected: PASS.

```bash
git add web/battle/BattleHUD.ts tests/web/battle/BattleHUD.spec.ts
git commit -m "feat: replace battle HUD with tide-log skill badges"
```

### Task 5: Hand-Drawn Layout, Rank Evolution, and Accessibility CSS

**Files:**
- Modify: `web/styles/battle-hud.css`
- Modify: `web/styles/responsive.css`
- Modify: `tests/smoke/battle-pixel-evidence.spec.ts`

**Interfaces:**
- Consumes semantic data attributes from Task 4.

- [ ] **Step 1: Add failing CSS evidence assertions**

Assert compiled source contains:

```ts
expect(css).toContain('.battle-hud__tide-log');
expect(css).toContain('max-height: 108px');
expect(css).toContain('.battle-skill[data-rank="3"]');
expect(css).toContain('.battle-skill[data-rank="5"]');
expect(css).toContain('@media (prefers-reduced-motion: reduce)');
expect(css).not.toContain('backdrop-filter');
```

- [ ] **Step 2: Run the smoke test**

Run: `npm test -- tests/smoke/battle-pixel-evidence.spec.ts`

Expected: FAIL against the old stacked glass-card CSS.

- [ ] **Step 3: Implement the top and bottom geometry**

Use an absolute top bar no taller than 108 logical/CSS-scaled pixels, irregular `clip-path`, opaque deep-sea blue paint, navy outline, coral speed stamp, and two compact rail meters. Bottom badges are 72, 80, and 86 pixels, staggered, with `min-width/min-height: 56px`.

- [ ] **Step 4: Implement state layers**

Rank 2/4 increase saturation and add ticks; Rank 3 adds a second outline; Rank 5 adds full ring and core highlight. Cooldown uses a dark pseudo-element with `clip-path`/conic gradient and never grayscale. Ready pulse runs once via class transition. Reduced motion disables rotation, breathing, and looping scale.

- [ ] **Step 5: Run smoke/browser tests and commit**

Run: `npm test -- tests/smoke/battle-pixel-evidence.spec.ts tests/web/battle/BattleHUD.spec.ts && npm run build`

Expected: PASS.

```bash
git add web/styles/battle-hud.css web/styles/responsive.css tests/smoke/battle-pixel-evidence.spec.ts
git commit -m "style: add hand-drawn battle HUD and rank states"
```

### Task 6: Rank and Variant Presentation Effects

**Files:**
- Modify: `web/battle/EffectSystem.ts`
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `tests/web/battle/EffectSystem.spec.ts`
- Modify: `tests/web/battle/BattleRenderer.spec.ts`

**Interfaces:**
- Consumes engine variant events and skill Rank from frame.

- [ ] **Step 1: Add failing effect evidence tests**

For Rank 1 versus Rank 5 casts, assert Rank 5 allocates more but bounded particles. For each new extreme/barrier event, assert the effect view contains the expected ring, trail, or pull/vortex marker. In reduced motion assert the event produces one static ring and no looping particles.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleRenderer.spec.ts`

Expected: FAIL because variant events are ignored.

- [ ] **Step 3: Add bounded presentation mappings**

Map volley Rank to 3/5/7 trail accents, barrier Rank to 1/2/3 membrane rings, and extreme Rank to 8/12/16 radial strokes. Add distinct coral-pierce, reflection, vortex, pull, and second-crest effects. Respect existing particle pools and quality budgets.

- [ ] **Step 4: Add low-quality and reduced-motion degradation**

Low quality keeps one trail/ring per major event. Reduced motion removes rotation, camera shake, continuous vortex particles, and breathing, while retaining a static colored silhouette and damage feedback.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleRenderer.spec.ts tests/web/battle/BattleQualityDeterminism.spec.ts`

Expected: PASS with pool usage inside existing limits.

```bash
git add web/battle/EffectSystem.ts web/battle/BattleRenderer.ts tests/web/battle
git commit -m "feat: visualize skill ranks and variants"
```
