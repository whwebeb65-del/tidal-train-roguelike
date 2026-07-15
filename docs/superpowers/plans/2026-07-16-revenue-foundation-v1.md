# Revenue Foundation v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a measurable, deterministic commerce and rewarded-ad foundation without rewriting the combat core or enabling real-money transactions.

**Architecture:** Keep gameplay rules in focused TypeScript domain modules. Upgrade the main save atomically to version 2, route all purchase rewards through an idempotent `PurchaseService`, render commerce through a pure Web view, and leave platform SDK calls behind `IStore`/`IAds`. Integrate only optional ads at natural breaks and keep all rewarded sharing removed.

**Tech Stack:** TypeScript 5.7, Vitest 2.1, Vite 5.4, DOM/CSS Web prototype, Cocos Creator TypeScript bridge skeleton.

## Global Constraints

- Do not add a fourth currency.
- Do not add random paid rewards, subscriptions, monthly cards, season passes, or real payment SDKs.
- Do not write account data, payment keys, collection QR codes, or raw production order IDs to source, telemetry, or documentation.
- Only a `verified` purchase result with a non-empty transaction ID may grant assets.
- Ads are opt-in; cancellation or failure does not consume the offer and never blocks the normal flow.
- Daily trial never exposes reward reroll or settlement doubling.
- Sharing never grants revival, currency, check-in, or combat rewards.
- Use TDD, make focused commits, and preserve unrelated work.

---

### Task 1: Version 2 player save and migration

**Files:**
- Modify: `src/save/SaveRepository.ts`
- Modify: `tests/save/SaveRepository.spec.ts`
- Modify: `web/main.ts`

**Interfaces:**
- Produces: `PlayerSave` version 2 with `purchasedProductIds`, `processedTransactionIds`, and `ownedCosmeticIds`.
- Produces: `normalizePlayerSave(candidate: unknown): PlayerSave`.
- Consumes: Existing version 1 local saves.

- [ ] **Step 1: Write failing migration and deep-copy tests**

Append these cases to `tests/save/SaveRepository.spec.ts` and update existing literal expectations to use version 2 defaults:

```ts
import { createMemorySaveRepository, defaultSave, normalizePlayerSave } from '../../src/save/SaveRepository';

it('migrates a version 1 save without losing progress', () => {
  const migrated = normalizePlayerSave({
    version: 1,
    gears: 90,
    routeMarks: 3,
    starTickets: 2,
    stationLevel: 2,
    unlockedPassengerIds: ['mechanic'],
    unlockedModuleIds: ['sound-mirror'],
    unlockedMapIds: ['drift-suburb', 'old-port'],
    firstClearMapIds: ['drift-suburb'],
    claimedInteractionIds: ['run-1:salvage-a:0'],
  });

  expect(migrated).toMatchObject({
    version: 2,
    gears: 90,
    stationLevel: 2,
    purchasedProductIds: [],
    processedTransactionIds: [],
    ownedCosmeticIds: [],
  });
});

it('deep copies commerce ownership arrays', () => {
  const repository = createMemorySaveRepository();
  const save = {
    ...defaultSave(),
    purchasedProductIds: ['starter-star-ticket-pack'],
    processedTransactionIds: ['tx-1'],
    ownedCosmeticIds: ['deep-sea-engine'],
  };
  repository.save(save);
  save.purchasedProductIds.push('mutated');
  save.processedTransactionIds.push('tx-2');
  save.ownedCosmeticIds.push('mutated-cosmetic');

  expect(repository.load().purchasedProductIds).toEqual(['starter-star-ticket-pack']);
  expect(repository.load().processedTransactionIds).toEqual(['tx-1']);
  expect(repository.load().ownedCosmeticIds).toEqual(['deep-sea-engine']);
});
```

- [ ] **Step 2: Run the save tests and confirm they fail**

Run: `npm test -- tests/save/SaveRepository.spec.ts`

Expected: FAIL because `normalizePlayerSave` and version 2 fields do not exist.

- [ ] **Step 3: Implement version 2 normalization**

In `src/save/SaveRepository.ts`, set `version: 2`, add the three arrays, and export a normalizer with this behavior:

```ts
export interface PlayerSave {
  readonly version: 2;
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
  readonly stationLevel: number;
  readonly unlockedPassengerIds: readonly string[];
  readonly unlockedModuleIds: readonly string[];
  readonly unlockedMapIds: readonly string[];
  readonly firstClearMapIds: readonly string[];
  readonly claimedInteractionIds: readonly string[];
  readonly purchasedProductIds: readonly string[];
  readonly processedTransactionIds: readonly string[];
  readonly ownedCosmeticIds: readonly string[];
}

export function normalizePlayerSave(candidate: unknown): PlayerSave {
  if (!candidate || typeof candidate !== 'object') throw new Error('Save must be an object');
  const raw = candidate as Record<string, unknown>;
  if (raw.version !== 1 && raw.version !== 2) throw new Error('Unsupported save version');
  const normalized = {
    ...raw,
    version: 2 as const,
    purchasedProductIds: raw.version === 2 ? raw.purchasedProductIds : [],
    processedTransactionIds: raw.version === 2 ? raw.processedTransactionIds : [],
    ownedCosmeticIds: raw.version === 2 ? raw.ownedCosmeticIds : [],
  } as unknown as PlayerSave;
  validateSave(normalized);
  return cloneSave(normalized);
}
```

Extend `defaultSave`, `cloneSave`, and `validateSave` so every commerce field is present, cloned, and contains only strings. Change `createMemorySaveRepository(initial: unknown = defaultSave())` to normalize the input before storing it.

In `web/main.ts`, parse local storage as `unknown` and call `normalizePlayerSave` before constructing the repository.

- [ ] **Step 4: Run save tests and typecheck**

Run: `npm test -- tests/save/SaveRepository.spec.ts && npm run typecheck`

Expected: all save tests PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add src/save/SaveRepository.ts tests/save/SaveRepository.spec.ts web/main.ts
git commit -m "feat: migrate player save for commerce"
```

---

### Task 2: Deterministic product catalog and idempotent purchase settlement

**Files:**
- Create: `src/domain/commerce/ProductCatalog.ts`
- Create: `src/domain/commerce/PurchaseService.ts`
- Create: `tests/domain/commerce/PurchaseService.spec.ts`
- Modify: `src/platform/PlatformContracts.ts`
- Modify: `src/platform/MockPlatform.ts`
- Modify: `tests/platform/MockPlatform.spec.ts`

**Interfaces:**
- Produces: `PRODUCT_CATALOG`, `getProductDefinition(productId)`.
- Produces: `settlePurchase(save, input): PurchaseSettlement`.
- Produces: `PurchaseResult = { status: 'verified'; transactionId: string } | { status: 'cancelled' | 'failed' }`.

- [ ] **Step 1: Write failing purchase service tests**

Create `tests/domain/commerce/PurchaseService.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { settlePurchase } from '../../../src/domain/commerce/PurchaseService';
import { defaultSave } from '../../../src/save/SaveRepository';

describe('PurchaseService', () => {
  it('grants a verified deterministic starter pack once', () => {
    const result = settlePurchase(defaultSave(), {
      productId: 'starter-star-ticket-pack',
      result: { status: 'verified', transactionId: 'tx-1' },
    });
    expect(result.accepted).toBe(true);
    expect(result.save.starTickets).toBe(60);
    expect(result.save.purchasedProductIds).toEqual(['starter-star-ticket-pack']);
    expect(result.save.processedTransactionIds).toEqual(['tx-1']);
  });

  it('grants the cosmetic without combat stats', () => {
    const result = settlePurchase(defaultSave(), {
      productId: 'abyssal-engine-cosmetic',
      result: { status: 'verified', transactionId: 'tx-cosmetic' },
    });
    expect(result.accepted).toBe(true);
    expect(result.save.ownedCosmeticIds).toEqual(['deep-sea-engine']);
    expect(result.save.gears).toBe(0);
    expect(result.save.routeMarks).toBe(0);
  });

  it.each(['cancelled', 'failed'] as const)('does not grant a %s purchase', (status) => {
    const result = settlePurchase(defaultSave(), {
      productId: 'starter-star-ticket-pack',
      result: { status },
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(status);
    expect(result.save).toEqual(defaultSave());
  });

  it('rejects duplicate transactions and repeated one-time products', () => {
    const first = settlePurchase(defaultSave(), {
      productId: 'starter-star-ticket-pack',
      result: { status: 'verified', transactionId: 'tx-1' },
    });
    const duplicateTransaction = settlePurchase(first.save, {
      productId: 'starter-star-ticket-pack',
      result: { status: 'verified', transactionId: 'tx-1' },
    });
    const repeatedProduct = settlePurchase(first.save, {
      productId: 'starter-star-ticket-pack',
      result: { status: 'verified', transactionId: 'tx-2' },
    });
    expect(duplicateTransaction.reason).toBe('duplicate-transaction');
    expect(repeatedProduct.reason).toBe('already-owned');
    expect(repeatedProduct.save.starTickets).toBe(60);
  });

  it('rejects unknown products and blank transaction IDs', () => {
    expect(settlePurchase(defaultSave(), {
      productId: 'unknown',
      result: { status: 'verified', transactionId: 'tx-unknown' },
    }).reason).toBe('unknown-product');
    expect(() => settlePurchase(defaultSave(), {
      productId: 'starter-star-ticket-pack',
      result: { status: 'verified', transactionId: ' ' },
    })).toThrow('Verified purchases require a transaction ID');
  });
});
```

- [ ] **Step 2: Run purchase tests and confirm they fail**

Run: `npm test -- tests/domain/commerce/PurchaseService.spec.ts`

Expected: FAIL because commerce modules do not exist.

- [ ] **Step 3: Create the immutable product catalog**

Create `src/domain/commerce/ProductCatalog.ts`:

```ts
export interface ProductReward {
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
  readonly cosmeticIds: readonly string[];
}

export interface ProductDefinition {
  readonly id: string;
  readonly name: string;
  readonly displayPrice: string;
  readonly description: string;
  readonly oneTime: boolean;
  readonly reward: ProductReward;
}

export const PRODUCT_CATALOG: readonly ProductDefinition[] = [
  {
    id: 'starter-star-ticket-pack',
    name: '首航星票补给',
    displayPrice: '¥6',
    description: '固定获得 60 星票；仅可购买一次。',
    oneTime: true,
    reward: { gears: 0, routeMarks: 0, starTickets: 60, cosmeticIds: [] },
  },
  {
    id: 'abyssal-engine-cosmetic',
    name: '深海引擎涂装',
    displayPrice: '¥18',
    description: '固定获得非战力外观「深海引擎」；仅可购买一次。',
    oneTime: true,
    reward: { gears: 0, routeMarks: 0, starTickets: 0, cosmeticIds: ['deep-sea-engine'] },
  },
] as const;

export function getProductDefinition(productId: string): ProductDefinition | undefined {
  return PRODUCT_CATALOG.find((product) => product.id === productId);
}
```

- [ ] **Step 4: Implement verified, idempotent settlement**

Create `src/domain/commerce/PurchaseService.ts` with `settlePurchase` that returns a cloned unchanged save for non-verified, unknown, duplicate, or already-owned inputs; for a verified purchase, append the product and transaction IDs, add deterministic currency, and append unique cosmetic IDs. Use this exact reason union:

```ts
export type PurchaseFailureReason =
  | 'cancelled'
  | 'failed'
  | 'unknown-product'
  | 'duplicate-transaction'
  | 'already-owned';
```

Throw `Verified purchases require a transaction ID` when a verified transaction ID trims to an empty string.

- [ ] **Step 5: Upgrade platform contracts and mocks**

In `src/platform/PlatformContracts.ts` add:

```ts
export type PurchaseResult =
  | { readonly status: 'verified'; readonly transactionId: string }
  | { readonly status: 'cancelled' | 'failed' };

export interface IStore {
  purchase(productId: string): Promise<PurchaseResult>;
}
```

Update `MockStore` to accept `'verified' | 'cancelled' | 'failed'`, record product IDs, and return transaction IDs formatted as `mock-<productId>-<1-based count>` for verified purchases. Update platform tests to assert the structured result and recorded product.

- [ ] **Step 6: Run focused and full tests**

Run: `npm test -- tests/domain/commerce/PurchaseService.spec.ts tests/platform/MockPlatform.spec.ts && npm test`

Expected: focused tests and the full suite PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/commerce src/platform tests/domain/commerce tests/platform/MockPlatform.spec.ts
git commit -m "feat: add verified deterministic commerce"
```

---

### Task 3: Commerce view and monetization telemetry

**Files:**
- Create: `web/views/CommerceView.ts`
- Create: `tests/web/CommerceView.spec.ts`
- Modify: `src/telemetry/TelemetryEvents.ts`
- Modify: `tests/telemetry/TelemetryClient.spec.ts`
- Modify: `web/main.ts`
- Modify: `web/styles.css`

**Interfaces:**
- Produces: `renderCommerceStore(model: CommerceStoreModel): string`.
- Produces: monetization event names listed in the design.
- Consumes: `PRODUCT_CATALOG`, save ownership arrays, and current pending product ID.

- [ ] **Step 1: Write failing commerce view tests**

Create `tests/web/CommerceView.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PRODUCT_CATALOG } from '../../src/domain/commerce/ProductCatalog';
import { renderCommerceStore } from '../../web/views/CommerceView';

describe('CommerceView', () => {
  it('shows deterministic content and prices', () => {
    const html = renderCommerceStore({
      products: PRODUCT_CATALOG,
      purchasedProductIds: [],
      pendingProductId: null,
    });
    expect(html).toContain('首航星票补给');
    expect(html).toContain('¥6');
    expect(html).toContain('固定获得 60 星票');
    expect(html).toContain('深海引擎涂装');
    expect(html).not.toContain('概率');
  });

  it('disables owned and pending products', () => {
    const owned = renderCommerceStore({
      products: PRODUCT_CATALOG,
      purchasedProductIds: ['starter-star-ticket-pack'],
      pendingProductId: 'abyssal-engine-cosmetic',
    });
    expect(owned).toContain('已拥有');
    expect(owned).toContain('验单中…');
  });
});
```

- [ ] **Step 2: Run the view test and confirm it fails**

Run: `npm test -- tests/web/CommerceView.spec.ts`

Expected: FAIL because `CommerceView` does not exist.

- [ ] **Step 3: Implement the pure commerce view**

Create `web/views/CommerceView.ts` with a model containing `products`, `purchasedProductIds`, and `pendingProductId`. Render a `<section class="commerce-store">`, one `<article class="commerce-card">` per product, and buttons with `data-action="purchase-product"` and `data-product-id`. Owned or pending buttons are disabled and display `已拥有` or `验单中…`; available buttons display `模拟购买 · <price>`.

- [ ] **Step 4: Add monetization event names and tests**

Add the eight design event names to `PrototypeEventName`. Add this telemetry test:

```ts
it('records the commerce and rewarded-ad funnel without sensitive payment data', () => {
  const telemetry = createMemoryTelemetry();
  telemetry.track({ name: 'store_viewed', runId: 'station', timestampMs: 20, payload: { productCount: 2 } });
  telemetry.track({ name: 'product_clicked', runId: 'station', timestampMs: 21, payload: { productId: 'starter-star-ticket-pack' } });
  telemetry.track({ name: 'purchase_started', runId: 'station', timestampMs: 22, payload: { productId: 'starter-star-ticket-pack' } });
  telemetry.track({ name: 'purchase_result', runId: 'station', timestampMs: 23, payload: { productId: 'starter-star-ticket-pack', result: 'verified', transactionRef: 'mock-1' } });
  telemetry.track({ name: 'rewarded_ad_offer_shown', runId: 'r1', timestampMs: 24, payload: { placement: 'reroll' } });
  telemetry.track({ name: 'rewarded_ad_clicked', runId: 'r1', timestampMs: 25, payload: { placement: 'reroll' } });
  telemetry.track({ name: 'rewarded_ad_result', runId: 'r1', timestampMs: 26, payload: { placement: 'reroll', result: 'completed' } });
  telemetry.track({ name: 'economy_reward_granted', runId: 'r1', timestampMs: 27, payload: { source: 'reroll', gears: 0 } });

  const serialized = JSON.stringify(telemetry.flush());
  expect(serialized).not.toContain('bank');
  expect(serialized).not.toContain('qr');
  expect(serialized).not.toContain('secret');
});
```

- [ ] **Step 5: Integrate store rendering and purchase settlement**

In `web/main.ts`:

- Import `PRODUCT_CATALOG`, `settlePurchase`, and `renderCommerceStore`.
- Construct `new MockStore('verified')`.
- Add `let pendingProductId: string | null = null` and `let storeViewTracked = false`.
- Render `renderCommerceStore(...)` in the station instead of `.monetize-strip`.
- Track `store_viewed` once per page session when the station first renders.
- Implement `handlePurchase(productId)` that tracks click/start, disables the selected card, awaits `store.purchase`, calls `settlePurchase`, commits only the returned save, tracks `purchase_result`, and displays precise cancelled/failed/already-owned/unknown messages.
- Never include a raw production order ID; for the Mock only, transform the transaction ID to `mock:<last segment>` before telemetry.
- Route `data-action="purchase-product"` to the handler.

- [ ] **Step 6: Add responsive store styles**

Add `.commerce-store`, `.commerce-grid`, `.commerce-card`, `.commerce-price`, and `.commerce-reward` styles. Use a two-column desktop grid and one-column mobile grid inside the existing `max-width: 760px` media query.

- [ ] **Step 7: Run tests, typecheck, and build**

Run: `npm test -- tests/web/CommerceView.spec.ts tests/telemetry/TelemetryClient.spec.ts && npm run typecheck && npm run build`

Expected: all commands PASS.

- [ ] **Step 8: Commit**

```bash
git add web/views/CommerceView.ts tests/web/CommerceView.spec.ts src/telemetry/TelemetryEvents.ts tests/telemetry/TelemetryClient.spec.ts web/main.ts web/styles.css
git commit -m "feat: add measurable deterministic store"
```

---

### Task 4: Remove rewarded share revival

**Files:**
- Modify: `src/domain/recovery/RecoverySystem.ts`
- Modify: `tests/domain/recovery/RecoverySystem.spec.ts`
- Modify: `src/platform/PlatformContracts.ts`
- Modify: `web/main.ts`
- Modify: `tests/telemetry/TelemetryClient.spec.ts`

**Interfaces:**
- Produces: ad-only `RecoveryState` and `applyRevive`.
- Preserves: non-rewarded daily-trial and squad sharing.

- [ ] **Step 1: Replace the share recovery test with an ad-only state test**

Replace the independence test with:

```ts
it('exposes only one rewarded ad revive per run', () => {
  const state = createRecoveryState();
  expect(state).not.toHaveProperty('shareReviveUsed');
  const first = applyRevive({
    state,
    encounter: 'boss',
    playerHp: 0,
    maxPlayerHp: 100,
    nowMs: 1,
  });
  const duplicate = applyRevive({
    state: first.state,
    encounter: 'boss',
    playerHp: 0,
    maxPlayerHp: 100,
    nowMs: 2,
  });
  expect(first.playerHp).toBe(50);
  expect(duplicate.result).toBe('duplicate');
});
```

Remove `source: 'ad'` from the remaining revive test inputs.

- [ ] **Step 2: Run recovery tests and confirm they fail**

Run: `npm test -- tests/domain/recovery/RecoverySystem.spec.ts`

Expected: FAIL until the share state and source input are removed.

- [ ] **Step 3: Simplify the recovery domain**

Remove `RecoverySource`, `shareReviveUsed`, and the source-indexed HP table. Use `REVIVE_HP = { combat: 60, boss: 50 }`, `canRevive(state): boolean`, and `applyRevive({ state, encounter, playerHp, maxPlayerHp, nowMs })` that toggles only `adReviveUsed`.

- [ ] **Step 4: Remove the rewarded share path from Web integration**

In `web/main.ts`:

- Remove `RecoverySource` import, `createSharePayload`, `handleShareRevive`, the share failure button, and the `share-revive` click route.
- Change failure copy to “可选择一次广告救场，或直接结算回站”。
- Keep a single “广告复活” status and the give-up button.
- Make `lastRunRecovery` type `'ad' | 'none'` and remove `afterShareRevive` telemetry.
- Compute daily trial `assisted` from `recoveryState.adReviveUsed` only.
- Keep `SharePayload.shareType` limited to `'squad-invite' | 'daily-trial'`.
- Update the existing telemetry recovery test payload from `type: 'share'` to `type: 'ad'`.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- tests/domain/recovery/RecoverySystem.spec.ts tests/telemetry/TelemetryClient.spec.ts && npm test && npm run typecheck`

Expected: all commands PASS and `rg -n "share-revive|shareReviveUsed|shareType: 'recovery'" src web tests` returns no matches.

- [ ] **Step 6: Commit**

```bash
git add src/domain/recovery/RecoverySystem.ts tests/domain/recovery/RecoverySystem.spec.ts src/platform/PlatformContracts.ts web/main.ts tests/telemetry/TelemetryClient.spec.ts
git commit -m "fix: remove rewarded share revival"
```

---

### Task 5: Reward reroll, repeat-settlement doubling, and premium economy guardrail

**Files:**
- Modify: `src/domain/route/RewardResolver.ts`
- Modify: `tests/domain/route/RewardResolver.spec.ts`
- Modify: `web/main.ts`
- Modify: `web/styles.css`

**Interfaces:**
- Produces: `createRewardOptions(seed, nodeId, offset = 0)` with deterministic alternative sets.
- Consumes: `IAds.showRewardedAd('reroll' | 'double-settlement')`.

- [ ] **Step 1: Write a failing deterministic reroll test**

Add to `tests/domain/route/RewardResolver.spec.ts`:

```ts
it('creates a different deterministic set for the one-time reroll offset', () => {
  const original = createRewardOptions(17, 'node-2', 0);
  const rerolled = createRewardOptions(17, 'node-2', 1);
  expect(rerolled).toEqual(createRewardOptions(17, 'node-2', 1));
  expect(rerolled).not.toEqual(original);
  expect(new Set(rerolled.map((option) => option.id)).size).toBe(3);
});
```

- [ ] **Step 2: Run the resolver test and confirm it fails**

Run: `npm test -- tests/domain/route/RewardResolver.spec.ts`

Expected: FAIL because the function accepts only two arguments or ignores the offset.

- [ ] **Step 3: Add deterministic offset support**

Change the resolver signature to `createRewardOptions(seed: number, nodeId: string, offset = 0)`. Validate that `offset` is a non-negative integer. Calculate the start index as `(hashNode(seed, nodeId) + offset * 3) % (candidates.length - 2)`.

- [ ] **Step 4: Add the ordinary interaction economy guardrail**

In both `renderInteractionCards` and `handleInteraction`, change `signal-c` from `1 starTickets / 星票` to `12 gears / 齿轮`, keeping `maxClaims: 1`. Add a telemetry `economy_reward_granted` event for accepted interaction rewards with `source: 'interaction'`, `currency`, and `amount`.

- [ ] **Step 5: Integrate optional reward reroll**

In `web/main.ts` add `rewardRerollUsed`, `rewardRerollOffset`, and pending placement state. Reset both on `startRun`. `renderReward` must use the offset and show the reroll button only in normal mode. `handleRewardReroll` must:

1. Track offer once and click every attempt.
2. Await `ads.showRewardedAd('reroll')`.
3. On cancel/failure, leave `rewardRerollUsed` false and render the original options.
4. On completion, set `rewardRerollUsed = true`, `rewardRerollOffset = 1`, track `rewarded_ad_result`, and render the deterministic alternate set.

Daily trial must render no reroll button.

- [ ] **Step 6: Integrate optional ordinary settlement doubling**

Add `settlementDoubleAvailable`, `settlementDoubleClaimed`, and pending placement state. In normal victory settlement, set availability only when `claimFirstClear` returns `granted: false`. Render a button labeled `看广告再领 80 齿轮 · 2 航线徽记`. `handleSettlementDouble` must grant exactly those assets once after a completed ad, track both ad result and `economy_reward_granted`, and disable itself after completion. Cancel/failure must grant nothing and preserve retry. Defeat, first clear, and daily trial render no button.

- [ ] **Step 7: Run tests, typecheck, and build**

Run: `npm test -- tests/domain/route/RewardResolver.spec.ts && npm test && npm run typecheck && npm run build`

Expected: all commands PASS.

- [ ] **Step 8: Commit**

```bash
git add src/domain/route/RewardResolver.ts tests/domain/route/RewardResolver.spec.ts web/main.ts web/styles.css
git commit -m "feat: add optional rewarded monetization points"
```

---

### Task 6: Cocos bridge, documentation, and end-to-end verification

**Files:**
- Create: `assets/scripts/commerce/CommerceController.ts`
- Modify: `README.md`
- Modify: `docs/product/player-feature-roadmap.md`

**Interfaces:**
- Produces: Cocos events `commerce-purchase-requested` and `rewarded-ad-requested`.
- Documents: local-only prototype, server verification boundary, manual test flow.

- [ ] **Step 1: Add the Cocos commerce bridge**

Create `assets/scripts/commerce/CommerceController.ts`:

```ts
import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

export type CommerceAdPlacement = 'revive' | 'skill-refresh' | 'reroll' | 'double-settlement';

@ccclass('CommerceController')
export class CommerceController extends Component {
  public requestPurchase(productId: string): void {
    if (!productId.trim()) return;
    this.node.emit('commerce-purchase-requested', productId);
  }

  public requestRewardedAd(placement: CommerceAdPlacement): void {
    this.node.emit('rewarded-ad-requested', placement);
  }
}
```

- [ ] **Step 2: Update player-facing and launch-boundary documentation**

In `README.md`, replace the single simulated pack description with:

- Two deterministic one-time products and their exact contents.
- Ad revive, skill refresh, normal-mode reroll, and repeat-settlement doubling rules.
- Explicit statement that daily trial has no reroll/doubling.
- Explicit statement that ordinary interactions no longer grant star tickets.
- Manual test steps for purchase persistence, duplicate prevention, ad cancellation fallback, and removed share revival.
- Production requirement for server receipt verification and platform bank settlement; personal collection QR codes are never embedded.

In `docs/product/player-feature-roadmap.md`, mark “收益基础设施 v1” complete before the growth handbook and retain growth handbook as the next feature.

- [ ] **Step 3: Run the complete automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
rg -n "share-revive|shareReviveUsed|shareType: 'recovery'|signal-c.*starTickets" src web tests
```

Expected: all tests, typecheck, build, and diff check PASS; the final `rg` command returns no matches.

- [ ] **Step 4: Run browser regression**

Start the Vite preview on the next free localhost port and verify:

1. Store contains both products, exact prices, deterministic contents, and no probability wording.
2. Starter pack grants 60 star tickets once; refreshing preserves ownership; duplicate purchase is disabled.
3. Cosmetic purchase records ownership without changing combat currencies.
4. `signal-c` grants 12 gears and no star tickets.
5. Failure page has ad revive and give-up only.
6. Normal reward page can reroll once after the rewarded-ad Mock completes; daily trial cannot.
7. A repeated normal victory can double 80 gears and 2 route marks exactly once; first clear and daily trial cannot.
8. At 390 px width, the store is one column with no horizontal overflow.
9. Main game page has no console warnings or errors.

- [ ] **Step 5: Inspect repository state and commit documentation**

```bash
git add assets/scripts/commerce/CommerceController.ts README.md docs/product/player-feature-roadmap.md
git commit -m "docs: document revenue foundation playtest"
git status --short
git log -8 --oneline
```

Expected: clean working tree and the revenue foundation commits visible in order.
