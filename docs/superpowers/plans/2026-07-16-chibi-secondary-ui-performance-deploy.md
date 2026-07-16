# Chibi Secondary UI, Performance, and Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the chibi redesign across retention, campaign, legion, gift-code, and commerce modules; enforce resource/performance budgets; run full regression; and deploy the verified build to GitHub Pages.

**Architecture:** Reuse the visual tokens and domain systems from Plans 1–2. Extract remaining large station subsections from `web/main.ts` into pure view modules, apply shared chibi card classes, and use CSS `content-visibility` plus deferred images for below-the-fold modules. Add a deterministic asset-budget check to CI-compatible npm scripts before publishing.

**Tech Stack:** TypeScript, Vitest, Vite, CSS, Node.js 22, GitHub Actions Pages.

## Global Constraints

- Plans 1 and 2 must be complete and green before this plan starts.
- Do not change existing check-in, daily trial, campaign, legion, gift-code, rewarded-ad, or verified-purchase business rules.
- Do not add a fair mode or disable skin/equipment stats in any secondary mode.
- Do not add real payment credentials or the user’s personal collection code.
- Keep first-screen critical compressed art at or below 1.5 MB.
- Keep one scene background at or below 350 KB, one captain launch asset at or below 450 KB, and one UI atlas at or below 512 KB.
- Target 60 FPS on mainstream devices and at least 45 FPS on low-performance devices; describe these as validation targets until measured on target hardware.
- Deploy only after tests, typecheck, build, asset budget, browser regression, and `git diff --check` pass.

---

## File Structure

Create:

- `web/views/LaunchCampaignView.ts`
- `web/views/SocialHubView.ts`
- `tests/web/LaunchCampaignView.spec.ts`
- `tests/web/SocialHubView.spec.ts`
- `scripts/check-asset-budget.mjs`
- `tests/smoke/asset-budget.spec.ts`

Modify:

- `web/views/DailyCheckInView.ts`
- `web/views/DailyTrialView.ts`
- `web/views/CommerceView.ts`
- `web/main.ts`
- `web/styles/progression.css`
- `web/styles/responsive.css`
- `package.json`
- `.github/workflows/deploy-pages.yml`
- `README.md`

## Task 1: Extract and reskin campaign, legion, and secondary station modules

**Files:**

- Create: `web/views/LaunchCampaignView.ts`
- Create: `web/views/SocialHubView.ts`
- Create: `tests/web/LaunchCampaignView.spec.ts`
- Create: `tests/web/SocialHubView.spec.ts`
- Modify: `web/main.ts`
- Modify: `web/views/DailyCheckInView.ts`
- Modify: `web/views/DailyTrialView.ts`
- Modify: `web/views/CommerceView.ts`
- Modify: `web/styles/progression.css`

**Interfaces:**

- Pure views consume already-computed models and emit the existing `data-action` values.
- No view writes local storage, calls a platform adapter, grants assets, or computes eligibility.

- [ ] **Step 1: Write campaign and social view tests**

Create tests that assert:

```ts
expect(campaignHtml).toContain('申请内测资格');
expect(campaignHtml).toContain('开服列车长礼');
expect(campaignHtml).toContain('data-action="redeem-gift-code"');
expect(campaignHtml).toContain('class="system-card');

expect(socialHtml).toContain('潮汐灯塔团');
expect(socialHtml).toContain('data-action="join-legion"');
expect(socialHtml).toContain('data-action="toggle-support"');
expect(socialHtml).toContain('data-action="share-squad"');
expect(socialHtml).toContain('class="system-card');
```

Use one locked-state model and one active-state model for each view.

- [ ] **Step 2: Run and verify failure**

```powershell
npm test -- tests/web/LaunchCampaignView.spec.ts tests/web/SocialHubView.spec.ts
```

Expected: FAIL because the extracted views do not exist.

- [ ] **Step 3: Extract the launch campaign markup**

Move `renderLaunchCampaignCenter()` markup from `web/main.ts` into:

```ts
export interface LaunchCampaignViewModel {
  readonly betaApplied: boolean;
  readonly betaGiftClaimed: boolean;
  readonly launchGiftClaimed: boolean;
  readonly badges: readonly string[];
  readonly giftCodeHint: string;
}

export function renderLaunchCampaignView(
  model: LaunchCampaignViewModel,
): string
```

Preserve exact action IDs:

- `apply-beta`
- `claim-beta-gift`
- `claim-launch-gift`
- `redeem-gift-code`

Wrap the module in:

```html
<section class="system-card system-card--campaign deferred-section">
```

- [ ] **Step 4: Extract the social markup**

Move `renderSocialHub()` presentational logic into:

```ts
export interface SocialHubViewModel {
  readonly cycleId: string;
  readonly legionId: string | null;
  readonly contribution: number;
  readonly milestones: readonly {
    id: ExpeditionMilestoneId;
    label: string;
    threshold: number;
    progress: number;
    claimed: boolean;
    rewardLabel: string;
  }[];
  readonly supports: readonly {
    id: SupportId;
    name: string;
    role: string;
    effect: string;
    selected: boolean;
  }[];
  readonly sharePending: boolean;
}

export function renderSocialHubView(model: SocialHubViewModel): string
```

Keep all contribution, milestone, squad bonus, and selection calculations in `web/main.ts` or existing domain functions.

- [ ] **Step 5: Apply one shared visual structure to all secondary modules**

Update daily check-in, daily trial, campaign, social, and commerce roots to use:

```html
<section class="system-card system-card--<kind> deferred-section">
```

Use these child classes consistently:

- `.system-card__heading`
- `.system-card__badge`
- `.system-card__grid`
- `.system-card__item`
- `.system-card__action`

Retain existing specialized classes only where behavior-specific styling is still required.

- [ ] **Step 6: Add shared styles**

In `progression.css` add:

```css
.system-card {
  margin-top: 18px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: linear-gradient(145deg, rgb(15 45 59 / 96%), rgb(7 25 37 / 96%));
  box-shadow: inset 0 1px rgb(255 255 255 / 5%);
}
.system-card__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.system-card__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.system-card__item {
  min-width: 0;
  padding: 14px;
  border: 1px solid rgb(142 218 215 / 18%);
  border-radius: var(--radius-md);
  background: rgb(4 20 30 / 46%);
}
```

Use coral only for claimable/urgent state, seafoam for completed/selected state, and lavender only for beta/seasonal state.

- [ ] **Step 7: Run focused and full tests**

```powershell
npm test -- tests/web/LaunchCampaignView.spec.ts tests/web/SocialHubView.spec.ts tests/web/DailyCheckInView.spec.ts tests/web/DailyTrialView.spec.ts tests/web/CommerceView.spec.ts
npm test
npm run typecheck
npm run build
```

Expected: all commands PASS.

- [ ] **Step 8: Commit**

```powershell
git add web/main.ts web/views web/styles/progression.css tests/web
git commit -m "style: unify retention and social modules"
```

## Task 2: Enforce asset budgets and below-the-fold performance

**Files:**

- Create: `scripts/check-asset-budget.mjs`
- Create: `tests/smoke/asset-budget.spec.ts`
- Modify: `package.json`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `web/styles/progression.css`
- Modify: relevant view image markup.

**Interfaces:**

- Produces npm script `check:assets`.
- CI runs `npm run check:assets` before build/deploy.

- [ ] **Step 1: Create the budget checker**

```js
// scripts/check-asset-budget.mjs
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'web',
  'assets',
  'chibi',
);

const limits = {
  'station-ocean-bg.webp': 350 * 1024,
  'captain-female-base.webp': 450 * 1024,
  'captain-male-base.webp': 450 * 1024,
};

const files = await readdir(root);
const failures = [];

for (const [name, limit] of Object.entries(limits)) {
  if (!files.includes(name)) {
    failures.push(`${name}: missing`);
    continue;
  }
  const info = await stat(path.join(root, name));
  if (info.size > limit) {
    failures.push(`${name}: ${info.size} bytes exceeds ${limit}`);
  }
}

const firstScreen = [
  'station-ocean-bg.webp',
  'bubble-train.webp',
  'captain-female-base.webp',
  'otter-mechanic.webp',
  'jellyfish-medic.webp',
];
let firstScreenBytes = 0;
for (const name of firstScreen) {
  const info = await stat(path.join(root, name));
  firstScreenBytes += info.size;
}
if (firstScreenBytes > 1.5 * 1024 * 1024) {
  failures.push(`first-screen: ${firstScreenBytes} bytes exceeds 1.5 MB`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`asset budget ok: ${firstScreenBytes} first-screen bytes`);
```

- [ ] **Step 2: Add an executable smoke test**

```ts
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('asset budget', () => {
  it('keeps launch art inside the approved byte budget', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/check-asset-budget.mjs'],
      { encoding: 'utf8' },
    );
    expect(output).toContain('asset budget ok');
  });
});
```

- [ ] **Step 3: Add package and CI commands**

Add:

```json
"check:assets": "node scripts/check-asset-budget.mjs"
```

In `.github/workflows/deploy-pages.yml`, insert after typecheck:

```yaml
      - name: Check asset budget
        run: npm run check:assets
```

- [ ] **Step 4: Defer below-the-fold rendering work**

Add:

```css
.deferred-section {
  content-visibility: auto;
  contain-intrinsic-size: 480px;
}
```

For non-first-screen images in wardrobe, equipment, campaign, and social views:

```html
loading="lazy" decoding="async"
```

Do not lazy-load the selected captain, station background, train, otter, or jellyfish.

- [ ] **Step 5: Compress files that fail the budget**

For each failing WebP, resize only if the rendered CSS size does not require the current pixel dimensions. Re-encode at quality 78–82 for opaque art and lossless alpha WebP for transparent art. Re-run:

```powershell
npm run check:assets
```

Expected: `asset budget ok`.

- [ ] **Step 6: Run tests and commit**

```powershell
npm test -- tests/smoke/asset-budget.spec.ts
npm test
npm run typecheck
npm run check:assets
npm run build
git add scripts package.json package-lock.json .github/workflows web tests/smoke
git commit -m "perf: enforce chibi asset budgets"
```

## Task 3: Full product regression and documentation

**Files:**

- Modify: `README.md`
- Modify implementation files only for defects found during regression.

- [ ] **Step 1: Run the complete automated gate**

```powershell
npm ci
npm test
npm run typecheck
npm run check:assets
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Verify clean-save onboarding**

Clear only the game’s local-storage keys, reload, and verify:

1. The captain selection screen appears.
2. Both captains state that base ability is identical.
3. Selecting either captain enters the station.
4. Refresh preserves the selection.
5. Switching in wardrobe is free and preserves equipment.

- [ ] **Step 3: Verify stacked skins**

Using the Mock purchase flow and event reward:

1. Own base, Seafoam Departure, and Aurora Whale Song.
2. Confirm collection stats equal the sum of all three definitions.
3. Equip only one skin and confirm the same collection total remains.
4. Switch captain and confirm the same collection total remains.
5. Start normal, daily trial, and legion-contributing runs; confirm each receives the same permanent progression snapshot.
6. Retry a verified transaction ID; confirm no duplicate skin or attributes.

- [ ] **Step 4: Verify equipment**

1. Equip two Tide Guard items and confirm the two-piece bonus.
2. Equip all four and confirm the four-piece bonus.
3. Upgrade once and confirm gear deduction and stat increase.
4. Grant fragments in the local prototype fixture, star once, and confirm fragment deduction.
5. Reroll once and confirm only affixes change.
6. Switch to Coral Assault and confirm set bonuses update.
7. Switch captain and confirm loadout is unchanged.

- [ ] **Step 5: Verify existing retention and monetization paths**

Test:

- Daily check-in.
- Daily fixed-seed trial.
- Beta application and launch gift.
- Gift-code redemption.
- Legion join, support selection, expedition contribution, and reward claim.
- Rewarded revive, skill refresh, reward reroll, and repeat-clear double settlement.
- Existing star-ticket pack and legacy deep-sea engine cosmetic.
- New deterministic skin and equipment products.

Expected: no business-rule regression and no console errors.

- [ ] **Step 6: Verify mobile and accessibility**

Repeat the four mobile widths from Plan 2. Additionally:

- Scroll through every deferred section.
- Confirm no visible layout jump greater than one card height.
- Use keyboard-only navigation.
- Confirm visible focus.
- Confirm no text is embedded only in raster art.
- Confirm reduced-motion mode.

- [ ] **Step 7: Update README**

Add a “现代精品Q版成长系统” section containing:

- Male/female captain choice.
- Permanent additive owned-skin bonuses.
- Equipped equipment progression.
- Mock-only payment disclaimer.
- Asset/performance commands.
- Public Pages URL.

Explicitly state that the published prototype does not process real money.

- [ ] **Step 8: Commit regression fixes and docs**

```powershell
git add README.md src web tests scripts package.json package-lock.json .github
git commit -m "docs: describe chibi progression prototype"
```

If regression found no code defect, include only README changes in the commit.

## Task 4: Deploy the verified build to GitHub Pages

**Files:**

- No planned source changes.

- [ ] **Step 1: Confirm a clean branch**

```powershell
git status --short
git log -12 --oneline
```

Expected: no uncommitted files.

- [ ] **Step 2: Re-run the release gate**

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Synchronize with remote main**

```powershell
git fetch origin
git log --left-right --cherry-pick --oneline origin/main...HEAD
```

If `origin/main` contains commits not in `HEAD`, rebase non-interactively:

```powershell
git rebase origin/main
```

Resolve only conflicts in files changed by these plans; preserve unrelated remote changes.

- [ ] **Step 4: Push the verified branch to main**

```powershell
git push origin HEAD:main
```

Expected: push succeeds without force.

- [ ] **Step 5: Watch Pages deployment**

```powershell
$gh = 'C:\Users\asus\AppData\Local\CodexTools\GitHubCLI\bin\gh.exe'
$runId = & $gh run list --workflow deploy-pages.yml --limit 1 --json databaseId --jq '.[0].databaseId'
& $gh run watch $runId --exit-status
```

Expected: Pages workflow completes successfully.

- [ ] **Step 6: Verify the public site**

Open:

```text
https://whwebeb65-del.github.io/tidal-train-roguelike/
```

Verify:

- New captain selection appears on a clean browser profile.
- Chibi assets load with no 404s.
- Refresh and navigation work under the relative Pages base path.
- Mock purchase is clearly labeled and does not request real payment.
- Console has no uncaught errors.

- [ ] **Step 7: Record release**

```powershell
git rev-parse HEAD
& 'C:\Users\asus\AppData\Local\CodexTools\GitHubCLI\bin\gh.exe' run list --workflow deploy-pages.yml --limit 1
```

Report the deployed commit, workflow result, public URL, automated test count, and any remaining true-device performance validation.
