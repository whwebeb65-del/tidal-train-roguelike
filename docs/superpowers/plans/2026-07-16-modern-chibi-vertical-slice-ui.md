# Modern Chibi Vertical Slice UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prototype’s visual shell with the approved restrained modern premium chibi direction and ship playable captain selection, station, combat, route, reward, settlement, wardrobe, and equipment screens.

**Architecture:** Keep all gameplay and progression decisions in the domain modules completed by Plan 1. Add small pure HTML view functions under `web/views`, a typed art manifest, and an event-delegated controller in `web/main.ts`. Use layered raster art only for characters, train, creatures, and backgrounds; UI structure, text, states, hit targets, and responsive behavior remain real HTML/CSS.

**Tech Stack:** TypeScript, Vite asset URLs, semantic HTML, CSS Grid/Flexbox, generated WebP/PNG art, Vitest string-render tests.

## Global Constraints

- Follow the approved restrained modern chibi art direction: 3.5-head captains, pearl bubble train, open ocean/sky, muted seafoam, restrained coral accents, minimal glow.
- Do not reuse full-screen concept mockups as the runtime interface.
- Preserve female captain identity; create a distinct but equal male captain.
- Keep at least 44 × 44 CSS pixel touch targets and no horizontal overflow from 360–430 px.
- Keep current combat, reward, route, check-in, campaign, legion, gift-code, ad, and purchase behavior.
- Use event-driven rerenders; do not introduce a continuous business `requestAnimationFrame`.
- Images must have meaningful alt text or be marked decorative.
- Support `prefers-reduced-motion`.
- Plan 1 must be complete before this plan begins.

---

## File Structure

Create:

- `web/assets/chibi/` — production art assets only.
- `web/assets/ChibiArtCatalog.ts` — explicit Vite-resolved asset URLs.
- `web/views/CaptainSelectionView.ts`
- `web/views/StationHeroView.ts`
- `web/views/CombatSceneView.ts`
- `web/views/RunSceneView.ts`
- `web/views/WardrobeView.ts`
- `web/views/EquipmentView.ts`
- Focused tests under `tests/web`.
- `web/styles/tokens.css`
- `web/styles/shell.css`
- `web/styles/scenes.css`
- `web/styles/progression.css`
- `web/styles/responsive.css`

Modify:

- `web/styles.css` — import-only entry point.
- `web/main.ts` — orchestration, hub navigation, commands, and progression rendering.
- `web/index.html` and root `index.html` — title, theme color, and metadata.

## Task 1: Produce layered runtime art and the typed art catalog

**Files:**

- Create: `web/assets/chibi/station-ocean-bg.webp`
- Create: `web/assets/chibi/bubble-train.webp`
- Create: `web/assets/chibi/captain-female-base.webp`
- Create: `web/assets/chibi/captain-male-base.webp`
- Create: `web/assets/chibi/captain-female-seafoam.webp`
- Create: `web/assets/chibi/captain-male-seafoam.webp`
- Create: `web/assets/chibi/captain-female-aurora.webp`
- Create: `web/assets/chibi/captain-male-aurora.webp`
- Create: `web/assets/chibi/otter-mechanic.webp`
- Create: `web/assets/chibi/jellyfish-medic.webp`
- Create: `web/assets/chibi/puffer-dragon.webp`
- Create: `web/assets/chibi/crystal-crab.webp`
- Create: `web/assets/chibi/tidal-boss.webp`
- Create: `web/assets/ChibiArtCatalog.ts`
- Create: `scripts/prepare_chibi_art.py`

**Interfaces:**

- Produces `CHIBI_ART` with stable keys consumed by every new view.

- [ ] **Step 1: Generate the clean background**

Use the built-in image generation tool with this exact production prompt:

```text
Use case: stylized-concept
Asset type: layered mobile game background, no characters and no UI
Primary request: a restrained modern premium chibi tidal-train station environment, wide open pearl-blue ocean, calm sky, a few distant floating coral islands, one liquid rail platform sweeping into the distance, large simple shapes, generous empty center and lower foreground for separately layered characters and train
Style/medium: polished 2.5D cel-painted mobile game background, sophisticated and clean, cute but not childish
Color palette: midnight indigo shadows, pearl white, muted seafoam, tiny restrained coral accents
Lighting/mood: soft clear ocean daylight, minimal bloom
Constraints: no characters, no train, no text, no UI, no logos, no watermark, no steampunk, no old European city, no bubble confetti, no dense coral decoration
```

Copy the selected output into `web/assets/chibi/station-ocean-bg-source.png`.

- [ ] **Step 2: Generate opaque subjects on a removable key background**

For each subject in the following table, issue one built-in image generation call. Use the shared prompt and replace only `<SUBJECT>`:

```text
Use case: stylized-concept
Asset type: mobile game layered character or creature asset
Primary request: <SUBJECT>
Style/medium: restrained modern premium chibi 2.5D cel-painted game asset, clean silhouette, about 3.5-head proportions for human captains, precise production-ready costume shapes, cute but young-adult and not preschool-like
Color palette: midnight indigo, pearl ivory, muted seafoam, restrained coral accents
Composition/framing: single isolated full-body subject, centered, generous padding, front three-quarter view
Background: perfectly flat solid #ff00ff chroma-key, no shadows, gradients, floor, texture, or reflections
Constraints: one subject only, no text, no logo, no watermark, no steampunk, do not use #ff00ff in the subject
```

| Output | `<SUBJECT>` |
|---|---|
| `bubble-train` | the iconic pearl-white capsule tide train with transparent-looking blue bubble windows and manta-fin roof, no characters |
| `captain-female-base` | approved female tide captain, short wavy midnight-blue hair, sea-green eyes, indigo-and-ivory jacket, coral scarf, tide lantern |
| `captain-male-base` | equal male tide captain, tousled deep-indigo hair with one muted seafoam streak, amber-teal eyes, indigo-and-ivory coat, coral neckerchief, tide compass gauntlet |
| `captain-female-seafoam` | female captain in a simple seafoam departure jacket, same face and silhouette |
| `captain-male-seafoam` | male captain in a simple seafoam departure jacket, same face and silhouette |
| `captain-female-aurora` | female captain in the refined Aurora Whale Song cape and upgraded lantern, indigo, pearl, aurora teal, restrained lavender |
| `captain-male-aurora` | male captain in the refined Aurora Whale Song cape and upgraded compass gauntlet, same palette |
| `otter-mechanic` | round sea-otter mechanic with goggles, compact wrench backpack, navy work jacket |
| `jellyfish-medic` | cute mostly opaque blue jellyfish medic with white cap and compact medical satchel |
| `puffer-dragon` | large quirky puffer-dragon tide beast, pearl scales, muted coral antlers, clean readable silhouette |
| `crystal-crab` | tiny round crystal crab minion with seafoam shell and coral legs |
| `tidal-boss` | large original manta-puffer hybrid boss with indigo fins and one coral crown, readable silhouette |

- [ ] **Step 3: Remove the key and resize**

For every subject source:

```powershell
python "$env:USERPROFILE\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py" `
  --input "web/assets/chibi/<name>-source.png" `
  --out "web/assets/chibi/<name>.png" `
  --auto-key border `
  --soft-matte `
  --transparent-threshold 12 `
  --opaque-threshold 220 `
  --despill
```

Validate transparent corners and no magenta fringe. If one subject has a one-pixel fringe, retry once with `--edge-contract 1`.

Create the deterministic resize/conversion helper:

```py
# scripts/prepare_chibi_art.py
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", type=int)
    parser.add_argument("--height", type=int)
    parser.add_argument("--max-edge", type=int)
    parser.add_argument("--quality", type=int, default=82)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = Path(args.input)
    output = Path(args.output)
    image = Image.open(source).convert("RGBA")

    if args.width and args.height:
        image = ImageOps.fit(
            image,
            (args.width, args.height),
            method=Image.Resampling.LANCZOS,
        )
    elif args.max_edge:
        image.thumbnail(
            (args.max_edge, args.max_edge),
            Image.Resampling.LANCZOS,
        )
    else:
        raise SystemExit("provide --width/--height or --max-edge")

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(
        output,
        format="WEBP",
        quality=args.quality,
        method=6,
        exact=True,
    )


if __name__ == "__main__":
    main()
```

Verify Pillow, then run:

```powershell
python -c "from PIL import Image; print(Image.__version__)"
python scripts/prepare_chibi_art.py --input web/assets/chibi/station-ocean-bg-source.png --output web/assets/chibi/station-ocean-bg.webp --width 1440 --height 1920 --quality 82

$captains = @(
  'captain-female-base',
  'captain-male-base',
  'captain-female-seafoam',
  'captain-male-seafoam',
  'captain-female-aurora',
  'captain-male-aurora'
)
$captains | ForEach-Object {
  python scripts/prepare_chibi_art.py --input "web/assets/chibi/$_.png" --output "web/assets/chibi/$_.webp" --max-edge 1200 --quality 86
}

$smallSubjects = @('otter-mechanic', 'jellyfish-medic', 'puffer-dragon', 'crystal-crab', 'tidal-boss')
$smallSubjects | ForEach-Object {
  python scripts/prepare_chibi_art.py --input "web/assets/chibi/$_.png" --output "web/assets/chibi/$_.webp" --max-edge 800 --quality 84
}

python scripts/prepare_chibi_art.py --input web/assets/chibi/bubble-train.png --output web/assets/chibi/bubble-train.webp --max-edge 1440 --quality 86
```

Open every final WebP after conversion, confirm alpha is preserved, then remove only the reviewed `*-source.png` and intermediate keyed PNG files with `Remove-Item -LiteralPath`.

- [ ] **Step 4: Add the explicit art catalog**

```ts
// web/assets/ChibiArtCatalog.ts
export const CHIBI_ART = {
  stationBackground: new URL('./chibi/station-ocean-bg.webp', import.meta.url).href,
  train: new URL('./chibi/bubble-train.webp', import.meta.url).href,
  captains: {
    'captain-tide-female': {
      'skin-tide-base': new URL('./chibi/captain-female-base.webp', import.meta.url).href,
      'skin-seafoam-departure': new URL('./chibi/captain-female-seafoam.webp', import.meta.url).href,
      'skin-aurora-whale-song': new URL('./chibi/captain-female-aurora.webp', import.meta.url).href,
    },
    'captain-tide-male': {
      'skin-tide-base': new URL('./chibi/captain-male-base.webp', import.meta.url).href,
      'skin-seafoam-departure': new URL('./chibi/captain-male-seafoam.webp', import.meta.url).href,
      'skin-aurora-whale-song': new URL('./chibi/captain-male-aurora.webp', import.meta.url).href,
    },
  },
  otter: new URL('./chibi/otter-mechanic.webp', import.meta.url).href,
  jellyfish: new URL('./chibi/jellyfish-medic.webp', import.meta.url).href,
  pufferDragon: new URL('./chibi/puffer-dragon.webp', import.meta.url).href,
  crystalCrab: new URL('./chibi/crystal-crab.webp', import.meta.url).href,
  tidalBoss: new URL('./chibi/tidal-boss.webp', import.meta.url).href,
} as const;
```

- [ ] **Step 5: Verify art files and build resolution**

```powershell
Get-ChildItem web\assets\chibi | Select-Object Name,Length
npm run build
```

Expected: every final file exists, no `-source.png` remains, and Vite resolves every asset URL.

- [ ] **Step 6: Commit**

```powershell
git add web/assets scripts/prepare_chibi_art.py
git commit -m "art: add restrained chibi game assets"
```

## Task 2: Install the theme tokens and application shell

**Files:**

- Create: `web/styles/tokens.css`
- Create: `web/styles/shell.css`
- Create: `web/styles/scenes.css`
- Create: `web/styles/progression.css`
- Create: `web/styles/responsive.css`
- Replace: `web/styles.css`
- Modify: `web/index.html`
- Modify: `index.html`

**Interfaces:**

- Produces shared classes used by every Plan 2 and Plan 3 view.

- [ ] **Step 1: Replace the stylesheet entry point**

```css
/* web/styles.css */
@import "./styles/tokens.css";
@import "./styles/shell.css";
@import "./styles/scenes.css";
@import "./styles/progression.css";
@import "./styles/responsive.css";
```

- [ ] **Step 2: Define exact design tokens**

```css
/* web/styles/tokens.css */
:root {
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #f7fbff;
  background: #071d2b;
  font-synthesis: none;
  line-height: 1.4;
  --ocean-950: #03101a;
  --ocean-900: #071d2b;
  --ocean-800: #0d2b3a;
  --ocean-700: #174356;
  --pearl-100: #f7f4ec;
  --pearl-200: #e7edf0;
  --seafoam-300: #9ce8e1;
  --seafoam-500: #55bfb9;
  --coral-400: #ef8b77;
  --lavender-400: #a89bdc;
  --ink: #08202a;
  --panel: rgb(10 34 47 / 88%);
  --panel-solid: #0a222f;
  --line: rgb(151 209 213 / 30%);
  --radius-sm: 12px;
  --radius-md: 18px;
  --radius-lg: 26px;
  --shadow-soft: 0 18px 50px rgb(0 8 15 / 38%);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  min-width: 320px;
  background:
    radial-gradient(circle at 15% 0%, #175064 0, transparent 32%),
    linear-gradient(160deg, var(--ocean-900), var(--ocean-950));
}
button, input { font: inherit; }
button { color: inherit; border: 0; cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .48; }
```

- [ ] **Step 3: Build the shell classes**

`shell.css` must contain real styles for:

- `.app-shell`
- `.topbar`
- `.brand`
- `.currency`
- `.hub-nav`
- `.hub-nav__item`
- `.primary`
- `.secondary`
- `.chip`
- `.notice`
- `footer`
- `:focus-visible`

Use solid blue-white enamel panels, one-pixel low-contrast borders, no heavy blur on mobile, and no gold gradients.

- [ ] **Step 4: Add scene and progression class families**

`scenes.css` must define:

- `.station-hero`, `.station-hero__background`, `.station-hero__train`
- `.captain-art`, `.companion-art`
- `.combat-stage`, `.combat-stage__enemy`, `.combat-stage__party`
- `.route-card`, `.reward-card`, `.settlement-card`

`progression.css` must define:

- `.captain-choice-grid`, `.captain-choice-card`
- `.wardrobe-layout`, `.skin-card`, `.collection-stats`
- `.equipment-layout`, `.equipment-slot`, `.equipment-card`, `.set-bonus`

- [ ] **Step 5: Add responsive and reduced-motion rules**

At exact breakpoints:

```css
@media (max-width: 760px) { /* stacked mobile layout */ }
@media (max-width: 430px) { /* compact 360–430 px tuning */ }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
  }
}
```

- [ ] **Step 6: Fix document metadata**

Set both HTML entry points to:

```html
<meta name="theme-color" content="#071d2b" />
<title>最后一班：潮汐列车</title>
```

- [ ] **Step 7: Verify build and commit**

```powershell
npm run typecheck
npm run build
git diff --check
git add web/styles.css web/styles web/index.html index.html
git commit -m "style: install restrained chibi theme"
```

Expected: all commands exit 0.

## Task 3: Captain selection and hub navigation

**Files:**

- Create: `web/views/CaptainSelectionView.ts`
- Create: `tests/web/CaptainSelectionView.spec.ts`
- Modify: `web/main.ts`

**Interfaces:**

- `renderCaptainSelection(model)` produces buttons with `data-action="select-captain"`.
- `hubView` is `'station' | 'wardrobe' | 'equipment'`.

- [ ] **Step 1: Write the failing view test**

```ts
import { describe, expect, it } from 'vitest';
import { renderCaptainSelection } from '../../web/views/CaptainSelectionView';

describe('CaptainSelectionView', () => {
  it('shows both equal captains and one explicit selection action each', () => {
    const html = renderCaptainSelection();
    expect(html).toContain('女列车长');
    expect(html).toContain('男列车长');
    expect(html.match(/data-action="select-captain"/g)).toHaveLength(2);
    expect(html).not.toContain('攻击更高');
    expect(html).not.toContain('生命更高');
  });
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
npm test -- tests/web/CaptainSelectionView.spec.ts
```

Expected: FAIL because the view does not exist.

- [ ] **Step 3: Implement the pure selection view**

```ts
import { CAPTAIN_CATALOG } from '../../src/domain/captain/CaptainCatalog';
import { CHIBI_ART } from '../assets/ChibiArtCatalog';

export function renderCaptainSelection(): string {
  const cards = CAPTAIN_CATALOG.map((captain) => {
    const art = CHIBI_ART.captains[captain.id]['skin-tide-base'];
    return `<button class="captain-choice-card" data-action="select-captain" data-captain-id="${captain.id}">
      <img src="${art}" alt="${captain.pronounLabel}" />
      <span><small>基础能力一致</small><b>${captain.pronounLabel}</b><em>${captain.name}</em></span>
    </button>`;
  }).join('');
  return `<section class="captain-select scene">
    <span class="eyebrow">FIRST DEPARTURE</span>
    <h1>选择你的列车长</h1>
    <p>选择只影响形象与技能演出，基础能力一致，之后可以随时切换。</p>
    <div class="captain-choice-grid">${cards}</div>
  </section>`;
}
```

- [ ] **Step 4: Add selection and hub state to `web/main.ts`**

Add:

```ts
type HubView = 'station' | 'wardrobe' | 'equipment';
let hubView: HubView = 'station';
let captainSelectionTracked = false;
```

Before rendering the phase:

```ts
if (!save.selectedCaptainId) {
  app.innerHTML = `${renderHeader()}<main>${renderCaptainSelection()}</main>`;
  if (!captainSelectionTracked) {
    track('captain_selection_viewed', {});
    captainSelectionTracked = true;
  }
  return;
}
```

Add event handling:

```ts
if (action === 'select-captain' && button.dataset.captainId) {
  const profile = selectCaptain(save, button.dataset.captainId as CaptainId);
  commit({ ...save, ...profile });
  track('captain_selected', { captainId: button.dataset.captainId });
  captainSelectionTracked = false;
  hubView = 'station';
  render();
  return;
}

if (action === 'open-hub' && button.dataset.hubView) {
  hubView = button.dataset.hubView as HubView;
  render();
  return;
}
```

Render a five-item hub nav with station, wardrobe, route/start, legion anchor, and shop anchor. The route/start item calls the existing `start-run`; legion/shop items scroll to their station sections rather than creating duplicate business state.

- [ ] **Step 5: Run tests and commit**

```powershell
npm test -- tests/web/CaptainSelectionView.spec.ts
npm run typecheck
npm run build
git add web/main.ts web/views/CaptainSelectionView.ts tests/web/CaptainSelectionView.spec.ts
git commit -m "feat: add captain selection and hub navigation"
```

## Task 4: Station, combat, route, reward, and settlement views

**Files:**

- Create: `web/views/StationHeroView.ts`
- Create: `web/views/CombatSceneView.ts`
- Create: `web/views/RunSceneView.ts`
- Create: `tests/web/StationHeroView.spec.ts`
- Create: `tests/web/CombatSceneView.spec.ts`
- Create: `tests/web/RunSceneView.spec.ts`
- Modify: `web/main.ts`

**Interfaces:**

- `renderStationHero(model)` returns only the hero/start area.
- `renderCombatScene(model)` returns the layered battlefield.
- `renderRouteCards`, `renderRewardCards`, and `renderSettlementCard` return real interactive HTML.

- [ ] **Step 1: Write view tests**

Test exact behaviors:

```ts
expect(renderStationHero(model)).toContain('data-action="start-run"');
expect(renderStationHero(model)).toContain('泡泡列车');
expect(renderCombatScene(model).match(/data-action="combat-action"/g)).toHaveLength(4);
expect(renderCombatScene(model)).toContain('data-action="damage"');
expect(renderRouteCards(model)).toContain('data-action="route"');
expect(renderRewardCards(model)).toContain('data-action="reward"');
expect(renderSettlementCard(model)).toContain('data-action="back-station"');
```

Also assert that every functional image has non-empty alt text and decorative backgrounds use `alt=""`.

- [ ] **Step 2: Run and verify failure**

```powershell
npm test -- tests/web/StationHeroView.spec.ts tests/web/CombatSceneView.spec.ts tests/web/RunSceneView.spec.ts
```

Expected: FAIL because the views do not exist.

- [ ] **Step 3: Implement `StationHeroView`**

The model must include:

```ts
interface StationHeroModel {
  readonly captainId: CaptainId;
  readonly skinId: SkinId;
  readonly mapName: string;
  readonly stationLevel: number;
  readonly maxHp: number;
  readonly damagePercent: number;
}
```

The view must render:

- Background image as decorative.
- Bubble train with alt `泡泡列车`.
- Current captain art with the catalog name as alt.
- Otter and jellyfish decorative companions.
- One current-map chip.
- One compact permanent-stat summary.
- One primary start button.

- [ ] **Step 4: Implement `CombatSceneView`**

The model must include:

```ts
interface CombatSceneModel {
  readonly captainId: CaptainId;
  readonly skinId: SkinId;
  readonly boss: boolean;
  readonly enemyHp: number;
  readonly enemyMaxHp: number;
  readonly playerHp: number;
  readonly playerMaxHp: number;
  readonly skillCharges: number;
  readonly attackDamage: number;
  readonly skillDamage: number;
  readonly repairAmount: number;
  readonly burstDamage: number;
  readonly burstReady: boolean;
  readonly repairReady: boolean;
}
```

Render one large puffer/Boss art, two crab minions for normal combat, party art, real HP/progress bars, and four action buttons using the existing action IDs. Do not bake numbers into images.

- [ ] **Step 5: Implement route, reward, and settlement cards**

Move only presentational markup out of `web/main.ts`. Keep route generation, reward resolution, first-clear settlement, ad reroll, and ad double logic in `main.ts`.

Use:

```ts
renderRouteCards({ nodes, mapName })
renderRewardCards({ options, dailyTrial, rerollHtml })
renderSettlementCard({ firstClear, rewards, doubleActionHtml, expeditionHtml })
```

Every function must escape dynamic text through a provided `escapeHtml` callback or pre-escaped model values.

- [ ] **Step 6: Wire views into `web/main.ts`**

Replace:

- old `.train-platform`
- CSS-drawn `.enemy`
- `.boss-orb`
- old route/reward card markup
- old settlement container markup

Do not change phase transitions or domain calls.

- [ ] **Step 7: Run focused and full tests**

```powershell
npm test -- tests/web/StationHeroView.spec.ts tests/web/CombatSceneView.spec.ts tests/web/RunSceneView.spec.ts
npm test
npm run typecheck
npm run build
```

Expected: all commands PASS.

- [ ] **Step 8: Commit**

```powershell
git add web/main.ts web/views tests/web
git commit -m "feat: rebuild playable scenes in chibi style"
```

## Task 5: Wardrobe and equipment screens

**Files:**

- Create: `web/views/WardrobeView.ts`
- Create: `web/views/EquipmentView.ts`
- Create: `tests/web/WardrobeView.spec.ts`
- Create: `tests/web/EquipmentView.spec.ts`
- Modify: `web/main.ts`

**Interfaces:**

- Wardrobe actions:
  - `switch-captain`
  - `equip-skin`
  - `purchase-product`
- Equipment actions:
  - `equip-equipment`
  - `upgrade-equipment`
  - `star-equipment`
  - `reroll-equipment`

- [ ] **Step 1: Write failing wardrobe tests**

```ts
expect(html).toContain('累计收藏属性');
expect(html).toContain('极光鲸歌');
expect(html).toContain('男女款式');
expect(html).toContain('永久叠加');
expect(html).toContain('data-action="equip-skin"');
expect(html).toContain('data-action="switch-captain"');
```

Assert the unowned Aurora card contains the exact deterministic price from `ProductCatalog`, while owned skins do not show an enabled purchase button.

- [ ] **Step 2: Write failing equipment tests**

```ts
expect(html.match(/class="equipment-slot/g)).toHaveLength(4);
expect(html).toContain('潮泡守望');
expect(html).toContain('珊瑚突击');
expect(html).toContain('data-action="equip-equipment"');
expect(html).toContain('data-action="upgrade-equipment"');
expect(html).toContain('data-action="star-equipment"');
expect(html).toContain('data-action="reroll-equipment"');
```

- [ ] **Step 3: Run and verify failure**

```powershell
npm test -- tests/web/WardrobeView.spec.ts tests/web/EquipmentView.spec.ts
```

Expected: FAIL because the views do not exist.

- [ ] **Step 4: Implement `WardrobeView`**

The model must include the selected captain, owned/equipped skins, catalog, collection modifiers, pending product, and deterministic product mapping.

Render:

- Large current captain preview.
- Free male/female switch.
- Three launch skin cards.
- Exact fixed skin modifiers.
- Current account-wide cumulative modifiers.
- Owned/equipped/pending states.
- Purchase button only for an unowned skin with a matching product.

Before equipping, `main.ts` must check both ownership and `canCaptainWearSkin`.

- [ ] **Step 5: Implement `EquipmentView`**

Render:

- Four current slots.
- Inventory list grouped by slot.
- Level, stars, main stats, affixes, and set name.
- Upgrade gear cost.
- Star fragment cost and current fragment count.
- Reroll gear cost and exact preview affixes.
- Active two-piece/four-piece bonuses.

For the prototype reroll button, submit this deterministic pair based on slot:

```ts
const PROTOTYPE_REROLL = {
  cannon: [{ id: 'damage-percent', value: 0.01 }],
  carriage: [{ id: 'max-hp-percent', value: 0.01 }],
  core: [{ id: 'initial-momentum', value: 3 }],
  instrument: [{ id: 'gears-percent', value: 0.01 }],
} as const;
```

Do not display random odds.

- [ ] **Step 6: Wire commands and persistence**

For each equipment mutation:

1. Convert save fields to `EquipmentState`.
2. Call the pure domain function.
3. If accepted, copy `inventory`, loadout, fragments, and gears back into `PlayerSave`.
4. Emit the matching telemetry event.
5. Show a precise success/failure notice.
6. Rerender without reloading the page.

- [ ] **Step 7: Run tests and commit**

```powershell
npm test -- tests/web/WardrobeView.spec.ts tests/web/EquipmentView.spec.ts
npm test
npm run typecheck
npm run build
git add web/main.ts web/views/WardrobeView.ts web/views/EquipmentView.ts tests/web
git commit -m "feat: add wardrobe and equipment screens"
```

## Task 6: Responsive, accessibility, and visual regression checkpoint

**Files:**

- Modify: `web/styles/*.css`
- Modify view files only for defects found during verification.

- [ ] **Step 1: Run the automated gate**

```powershell
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Start the local production preview**

```powershell
npm run build
npx vite preview --host 127.0.0.1
```

- [ ] **Step 3: Verify exact mobile widths**

At 360 × 800, 390 × 844, 412 × 915, and 430 × 932:

1. Complete first captain selection.
2. Switch captain in wardrobe.
3. Equip each owned skin.
4. Purchase Aurora through the Mock store.
5. Equip, upgrade, star, and reroll equipment.
6. Start a normal run.
7. Use attack, skill, repair, and burst.
8. Select reward and route.
9. Complete or fail and use the existing recovery/settlement paths.

Expected:

- No horizontal scrollbar.
- No clipped price, stat, or action label.
- All touch targets are at least 44 × 44.
- Captain face and train remain visible above the fold on 390 × 844.
- Combat buttons remain usable without covering enemy HP.
- Focus indicators are visible with keyboard navigation.

- [ ] **Step 4: Verify reduced motion and image fallback**

Enable reduced motion in browser emulation. Confirm captain float, water drift, enemy hover, and card lift stop.

Temporarily change one art URL to a missing filename and confirm:

- Alt/fallback silhouette appears.
- Layout height remains stable.
- No uncaught console error blocks the game.

Restore the valid URL before commit.

- [ ] **Step 5: Commit verification fixes**

```powershell
git add web tests
git commit -m "fix: polish chibi mobile layouts"
```

If no fixes were needed, do not create an empty commit.
