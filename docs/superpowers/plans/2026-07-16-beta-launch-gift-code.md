# Beta, Launch Gift, and Gift Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a playable, persistent launch campaign center with beta qualification, one-time founder rewards, and gift-code redemption.

**Architecture:** Keep campaign entitlement and redemption state in a new engine-independent domain module and a separate local-storage record. The Web client renders and submits actions but only applies rewards returned by the domain layer; the Cocos controller emits requests without granting assets. The same interfaces can later be moved behind a server-authoritative API.

**Tech Stack:** TypeScript 5, Vitest 2, Vite 5, DOM/CSS Web MVP, Cocos Creator TypeScript bridge.

## Global Constraints

- Reuse only the existing currencies: gears, route marks, and star tickets.
- Beta and launch badges are cosmetic identity markers and provide no combat bonus.
- The local prototype simulates one account; it must not claim to show real-time global remaining slots.
- Formal launch quota, server time, account entitlement, gift-code inventory, and asset writes are server-authoritative.
- Unknown user-entered gift-code text must not be copied into telemetry.
- Web state key is exactly `tidal-train-launch-campaign-v1`.
- The 390px layout must not create horizontal overflow.

---

### Task 1: Campaign entitlement and redemption rules

**Files:**
- Create: `src/domain/campaign/LaunchCampaignSystem.ts`
- Create: `tests/domain/campaign/LaunchCampaignSystem.spec.ts`

**Interfaces:**
- Consumes: no project state; receives immutable `LaunchCampaignState` values.
- Produces: `createLaunchCampaignState`, `normalizeLaunchCampaignState`, `applyForBeta`, `claimBetaGift`, `claimLaunchGift`, `redeemGiftCode`, `GIFT_CODE_CATALOG`, and their exported types.

- [ ] **Step 1: Write failing default-state, beta, reward, and gift-code tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  applyForBeta,
  claimBetaGift,
  claimLaunchGift,
  createLaunchCampaignState,
  normalizeLaunchCampaignState,
  redeemGiftCode,
  type GiftCodeDefinition,
} from '../../../src/domain/campaign/LaunchCampaignSystem';

const NOW = Date.UTC(2026, 6, 16);

describe('LaunchCampaignSystem', () => {
  it('qualifies one account once', () => {
    const first = applyForBeta(createLaunchCampaignState());
    const repeat = applyForBeta(first.state);
    expect(first.accepted).toBe(true);
    expect(first.state.betaQualified).toBe(true);
    expect(repeat).toMatchObject({ accepted: false, reason: 'already-qualified' });
  });

  it('gates and grants the beta gift exactly once', () => {
    const denied = claimBetaGift(createLaunchCampaignState());
    const qualified = applyForBeta(createLaunchCampaignState()).state;
    const first = claimBetaGift(qualified);
    const repeat = claimBetaGift(first.state);
    expect(denied.reason).toBe('beta-required');
    expect(first.reward).toEqual({ gears: 60, routeMarks: 2, starTickets: 1, badgeId: 'beta-pioneer' });
    expect(repeat.reward).toEqual({ gears: 0, routeMarks: 0, starTickets: 0 });
  });

  it('grants the launch gift once and records its badge', () => {
    const first = claimLaunchGift(createLaunchCampaignState());
    const repeat = claimLaunchGift(first.state);
    expect(first.reward).toEqual({ gears: 188, routeMarks: 6, starTickets: 3, badgeId: 'launch-conductor' });
    expect(first.state.cosmeticBadgeIds).toContain('launch-conductor');
    expect(repeat.reason).toBe('already-claimed');
  });

  it('normalizes whitespace and case before redeeming a code', () => {
    const result = redeemGiftCode(createLaunchCampaignState(), '  tide2026 ', NOW);
    expect(result.accepted).toBe(true);
    expect(result.codeId).toBe('tide-voyage');
    expect(result.reward).toEqual({ gears: 66, routeMarks: 2, starTickets: 0 });
  });

  it('distinguishes empty, unknown, duplicate, future, and expired codes', () => {
    const catalog: readonly GiftCodeDefinition[] = [
      { id: 'future', code: 'FUTURE', label: '未来活动', startsAtMs: NOW + 1, expiresAtMs: NOW + 100, reward: { gears: 1, routeMarks: 0, starTickets: 0 } },
      { id: 'expired', code: 'EXPIRED', label: '过期活动', startsAtMs: NOW - 100, expiresAtMs: NOW - 1, reward: { gears: 1, routeMarks: 0, starTickets: 0 } },
    ];
    expect(redeemGiftCode(createLaunchCampaignState(), ' ', NOW).reason).toBe('empty-code');
    expect(redeemGiftCode(createLaunchCampaignState(), 'NOPE', NOW).reason).toBe('unknown-code');
    expect(redeemGiftCode(createLaunchCampaignState(), 'FUTURE', NOW, catalog).reason).toBe('not-started');
    expect(redeemGiftCode(createLaunchCampaignState(), 'EXPIRED', NOW, catalog).reason).toBe('expired');
    const first = redeemGiftCode(createLaunchCampaignState(), 'TIDE2026', NOW);
    expect(redeemGiftCode(first.state, 'TIDE2026', NOW).reason).toBe('already-redeemed');
  });

  it('sanitizes malformed persisted state', () => {
    expect(normalizeLaunchCampaignState({
      version: 1,
      campaignId: 'launch-2026',
      betaQualified: true,
      betaGiftClaimed: true,
      launchGiftClaimed: false,
      redeemedCodeIds: ['tide-voyage', 'fake'],
      cosmeticBadgeIds: ['beta-pioneer', 'damage-hack'],
    })).toEqual({
      version: 1,
      campaignId: 'launch-2026',
      betaQualified: true,
      betaGiftClaimed: true,
      launchGiftClaimed: false,
      redeemedCodeIds: ['tide-voyage'],
      cosmeticBadgeIds: ['beta-pioneer'],
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/domain/campaign/LaunchCampaignSystem.spec.ts`

Expected: FAIL because `LaunchCampaignSystem.ts` does not exist.

- [ ] **Step 3: Implement immutable campaign rules and validation**

Create the exact exported model below, with defensive state cloning and zero-reward failures:

```ts
export type CampaignBadgeId = 'beta-pioneer' | 'launch-conductor';
export type GiftCodeId = 'tide-voyage' | 'first-train' | string;
export interface CampaignReward { readonly gears: number; readonly routeMarks: number; readonly starTickets: number; readonly badgeId?: CampaignBadgeId }
export interface LaunchCampaignState { readonly version: 1; readonly campaignId: 'launch-2026'; readonly betaQualified: boolean; readonly betaGiftClaimed: boolean; readonly launchGiftClaimed: boolean; readonly redeemedCodeIds: readonly string[]; readonly cosmeticBadgeIds: readonly CampaignBadgeId[] }
export interface GiftCodeDefinition { readonly id: string; readonly code: string; readonly label: string; readonly startsAtMs: number; readonly expiresAtMs: number; readonly reward: CampaignReward }
export type CampaignFailureReason = 'already-qualified' | 'beta-required' | 'already-claimed' | 'empty-code' | 'unknown-code' | 'not-started' | 'expired' | 'already-redeemed';
export interface CampaignActionResult { readonly accepted: boolean; readonly reason?: CampaignFailureReason; readonly reward: CampaignReward; readonly state: LaunchCampaignState; readonly codeId?: string }
```

Use these exact rewards:

```ts
const BETA_REWARD = { gears: 60, routeMarks: 2, starTickets: 1, badgeId: 'beta-pioneer' } as const;
const LAUNCH_REWARD = { gears: 188, routeMarks: 6, starTickets: 3, badgeId: 'launch-conductor' } as const;
export const GIFT_CODE_CATALOG = [
  { id: 'tide-voyage', code: 'TIDE2026', label: '潮汐启航', startsAtMs: 0, expiresAtMs: Date.UTC(2100, 0, 1), reward: { gears: 66, routeMarks: 2, starTickets: 0 } },
  { id: 'first-train', code: 'FIRSTTRAIN', label: '首班列车', startsAtMs: 0, expiresAtMs: Date.UTC(2100, 0, 1), reward: { gears: 88, routeMarks: 0, starTickets: 1 } },
] as const satisfies readonly GiftCodeDefinition[];
```

Normalize a code with `trim().toUpperCase()`. Validate every catalog timestamp and non-negative finite reward before comparing it. Add a badge only once. Failed operations return a clone of the input state and `{ gears: 0, routeMarks: 0, starTickets: 0 }`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/domain/campaign/LaunchCampaignSystem.spec.ts`

Expected: all campaign tests pass.

- [ ] **Step 5: Commit the rule layer**

```powershell
git add src/domain/campaign/LaunchCampaignSystem.ts tests/domain/campaign/LaunchCampaignSystem.spec.ts
git commit -m "feat: add launch campaign reward rules"
```

### Task 2: Web persistence and launch campaign UI

**Files:**
- Modify: `web/main.ts`
- Modify: `web/styles.css`

**Interfaces:**
- Consumes: all Task 1 campaign functions and `CampaignReward`.
- Produces: persistent campaign center interactions inside the station scene.

- [ ] **Step 1: Add campaign storage and state initialization**

In `web/main.ts`, import the Task 1 APIs and add:

```ts
const CAMPAIGN_SAVE_KEY = 'tidal-train-launch-campaign-v1';

function readCampaignState(): LaunchCampaignState {
  try {
    const raw = window.localStorage.getItem(CAMPAIGN_SAVE_KEY);
    return normalizeLaunchCampaignState(raw ? JSON.parse(raw) : null);
  } catch {
    return createLaunchCampaignState();
  }
}

let campaignState = readCampaignState();

function commitCampaign(next: LaunchCampaignState): void {
  campaignState = normalizeLaunchCampaignState(next);
  window.localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(campaignState));
}

function applyCampaignReward(reward: CampaignReward): void {
  commit({ ...save, gears: save.gears + reward.gears, routeMarks: save.routeMarks + reward.routeMarks, starTickets: save.starTickets + reward.starTickets });
}
```

- [ ] **Step 2: Render the founder center between map progression and the social hub**

Add `renderLaunchCampaignCenter()` with:

- `FOUNDERS / 3,000` and “原型活动开放中”.
- Beta card button states: `申请内测资格` → `领取先行者补给` → `先行者补给已领取`.
- Launch card button states: `领取开服列车长礼` → `开服礼已领取`.
- A badge row derived from `cosmeticBadgeIds`.
- A `<form id="gift-code-form">` containing `<input name="giftCode" maxlength="24">`, submit button `兑换礼包码`, and the public test hint `TIDE2026`.

Insert `${renderLaunchCampaignCenter()}` after `.station-footer` and before `${renderSocialHub()}`.

- [ ] **Step 3: Add campaign action handlers**

Implement:

```ts
function handleBetaApplication(): void
function handleBetaGiftClaim(): void
function handleLaunchGiftClaim(): void
function handleGiftCodeRedeem(rawCode: string): void
```

For every accepted result, call `commitCampaign(result.state)` then `applyCampaignReward(result.reward)`. Map every failure reason to explicit Chinese copy. Never include an unknown raw input in `notice` or telemetry.

Register click actions `apply-beta`, `claim-beta-gift`, and `claim-launch-gift`. Add an app-level `submit` listener for `#gift-code-form` using `new FormData(form).get('giftCode')`.

- [ ] **Step 4: Clear campaign state with the existing reset action**

Extend the reset branch to remove `CAMPAIGN_SAVE_KEY` along with player and social state before reloading.

- [ ] **Step 5: Add responsive founder-center styling**

In `web/styles.css`, add focused selectors for `.launch-campaign`, `.campaign-heading`, `.campaign-grid`, `.campaign-card`, `.campaign-rewards`, `.campaign-badges`, and `.gift-code-form`. Reuse the existing glass-panel palette and button classes. At the existing mobile breakpoint, set `.campaign-grid` and `.gift-code-form` to one column and ensure inputs use `min-width: 0; width: 100%`.

- [ ] **Step 6: Run typecheck and build**

Run: `npm run typecheck` and `npm run build`.

Expected: both commands exit 0; Vite emits `dist/index.html` and bundled assets.

- [ ] **Step 7: Commit the Web flow**

```powershell
git add web/main.ts web/styles.css
git commit -m "feat: add playable founder campaign center"
```

### Task 3: Telemetry and Cocos request bridge

**Files:**
- Modify: `src/telemetry/TelemetryEvents.ts`
- Modify: `tests/telemetry/TelemetryClient.spec.ts`
- Create: `assets/scripts/campaign/LaunchCampaignController.ts`

**Interfaces:**
- Consumes: normalized campaign result fields from Task 2.
- Produces: typed prototype events and request-only Cocos scene events.

- [ ] **Step 1: Extend telemetry event-name coverage**

Add these exact union members:

```ts
| 'beta_application_result'
| 'campaign_reward_claimed'
| 'gift_code_redeem_result'
```

Extend the telemetry test to track and flush all three names. For gift-code failures, assert only `{ result: 'unknown-code' }`; do not include raw input.

- [ ] **Step 2: Emit telemetry from Web handlers**

Use:

```ts
track('beta_application_result', { result: result.accepted ? 'qualified' : result.reason ?? 'failed' });
track('campaign_reward_claimed', { campaignReward: 'beta' | 'launch', gears, routeMarks, starTickets });
track('gift_code_redeem_result', { result: result.accepted ? 'completed' : result.reason ?? 'failed', codeId: result.codeId ?? 'unknown' });
```

Unknown input must only produce `codeId: 'unknown'`.

- [ ] **Step 3: Add the Cocos request-only controller**

Create `LaunchCampaignController.ts`:

```ts
import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('LaunchCampaignController')
export class LaunchCampaignController extends Component {
  requestBetaApplication(): void { this.node.emit('beta-application-requested'); }
  requestBetaGift(): void { this.node.emit('beta-gift-claim-requested'); }
  requestLaunchGift(): void { this.node.emit('launch-gift-claim-requested'); }
  requestGiftCode(rawCode: string): void { this.node.emit('gift-code-redeem-requested', { rawCode }); }
}
```

Do not import or invoke reward rules in this controller.

- [ ] **Step 4: Run focused telemetry tests and typecheck**

Run: `npm test -- tests/telemetry/TelemetryClient.spec.ts` and `npm run typecheck`.

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit telemetry and Cocos bridge**

```powershell
git add src/telemetry/TelemetryEvents.ts tests/telemetry/TelemetryClient.spec.ts web/main.ts assets/scripts/campaign/LaunchCampaignController.ts
git commit -m "feat: expose launch campaign telemetry bridge"
```

### Task 4: Documentation and full regression

**Files:**
- Modify: `README.md`
- Modify: `docs/testing/prototype-playtest-script.md`

**Interfaces:**
- Consumes: completed campaign behavior.
- Produces: accurate local and formal-launch operating instructions.

- [ ] **Step 1: Document the campaign center and security boundary**

Update README current status and add a section containing exact prototype rewards, test code `TIDE2026`, separate campaign storage, and the warning that real quota/redemption/assets require server authority.

- [ ] **Step 2: Add a deterministic playtest path**

Add steps that start from a cleared save and verify totals:

1. Apply for beta; no currency changes.
2. Claim beta gift; totals become 60 gears, 2 route marks, 1 star ticket.
3. Claim launch gift; totals become 248 gears, 8 route marks, 4 star tickets.
4. Redeem ` tide2026 `; totals become 314 gears, 10 route marks, 4 star tickets.
5. Repeat all three claims and verify totals do not change.
6. Reload and verify qualification, claimed buttons, badges, and redeemed code persist.

- [ ] **Step 3: Run full automated verification**

Run in parallel where supported:

```powershell
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: all tests pass, typecheck/build exit 0, and diff check prints no errors.

- [ ] **Step 4: Run browser regression at desktop and 390x844**

Verify application, both rewards, normalized ` tide2026 ` redemption, repeat prevention, reload persistence, single-column campaign layout, no horizontal overflow, and zero console errors.

- [ ] **Step 5: Commit documentation and leave a clean worktree**

```powershell
git add README.md docs/testing/prototype-playtest-script.md
git commit -m "docs: add founder campaign playtest"
git status --short
```

Expected: final status is empty.
