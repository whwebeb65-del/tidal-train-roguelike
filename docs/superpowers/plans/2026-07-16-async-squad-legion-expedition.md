# Async Squad and Legion Expedition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a playable asynchronous two-support squad and idempotent weekly legion expedition loop to the existing Web MVP.

**Architecture:** A pure `SocialExpeditionSystem` owns squad selection, support bonuses, cycle rollover, run contribution, and milestone claims. The Web layer persists that state under a separate versioned local-storage key, applies support bonuses through existing combat options, and renders a station social hub; Cocos receives request-only event adapters.

**Tech Stack:** TypeScript 5.7, Vitest 2, Vite 5, DOM/CSS, Cocos Creator TypeScript bridge skeleton.

## Global Constraints

- Preserve the existing `PlayerSave version: 1`; social state uses its own key and validator.
- Maximum active support members: 2.
- Do not add real-time networking, free-form chat, a fourth wallet currency, or a new runtime dependency.
- All contribution and reward operations must be idempotent by `runId` or milestone ID.
- Keep rendering event-driven and retain mobile/reduced-motion fallbacks.
- Real platform identity, reward authority, moderation, and anti-cheat remain server responsibilities.

---

### Task 1: Social expedition rules

**Files:**
- Create: `src/domain/social/SocialExpeditionSystem.ts`
- Create: `tests/domain/social/SocialExpeditionSystem.spec.ts`

**Interfaces:**
- Produces: `SocialExpeditionState`, `SupportId`, `SUPPORT_ROSTER`, `EXPEDITION_MILESTONES`, `createSocialExpeditionState()`, `normalizeSocialExpeditionState()`, `joinLegion()`, `toggleSquadMember()`, `getSquadBonuses()`, `contributeToExpedition()`, `claimExpeditionMilestone()`, `getIsoWeekCycleId()`.

- [ ] **Step 1: Write failing tests for joining, squad capacity, bonuses, contribution, claims, rollover, and ISO cycle IDs**

```ts
import { describe, expect, it } from 'vitest';
import {
  claimExpeditionMilestone,
  contributeToExpedition,
  createSocialExpeditionState,
  getIsoWeekCycleId,
  getSquadBonuses,
  joinLegion,
  normalizeSocialExpeditionState,
  toggleSquadMember,
} from '../../../src/domain/social/SocialExpeditionSystem';

describe('SocialExpeditionSystem', () => {
  it('requires a legion and limits the squad to two unique supports', () => {
    const empty = createSocialExpeditionState('2026-W29');
    expect(toggleSquadMember(empty, 'navigator').reason).toBe('legion-required');
    let state = joinLegion(empty, 'tide-beacon');
    state = toggleSquadMember(state, 'navigator').state;
    state = toggleSquadMember(state, 'gunner').state;
    expect(toggleSquadMember(state, 'engineer').reason).toBe('squad-full');
    expect(state.squadMemberIds).toEqual(['navigator', 'gunner']);
  });

  it('combines the three support bonus types', () => {
    let state = joinLegion(createSocialExpeditionState('2026-W29'), 'tide-beacon');
    state = toggleSquadMember(state, 'navigator').state;
    state = toggleSquadMember(state, 'engineer').state;
    expect(getSquadBonuses(state)).toEqual({ initialMomentum: 20, damageBonus: 0, maxPlayerHpBonus: 20 });
  });

  it('grants one contribution per run with a capped node bonus', () => {
    const joined = joinLegion(createSocialExpeditionState('2026-W29'), 'tide-beacon');
    const first = contributeToExpedition(joined, { runId: 'r1', outcome: 'victory', completedNodes: 9 });
    const repeated = contributeToExpedition(first.state, { runId: 'r1', outcome: 'victory', completedNodes: 9 });
    expect(first.pointsGranted).toBe(42);
    expect(repeated).toMatchObject({ accepted: false, pointsGranted: 0, reason: 'run-already-contributed' });
  });

  it('uses different base contribution for extract and defeat', () => {
    const joined = joinLegion(createSocialExpeditionState('2026-W29'), 'tide-beacon');
    expect(contributeToExpedition(joined, { runId: 'e', outcome: 'extract', completedNodes: 1 }).pointsGranted).toBe(17);
    expect(contributeToExpedition(joined, { runId: 'd', outcome: 'defeat', completedNodes: 1 }).pointsGranted).toBe(10);
  });

  it('claims each reached milestone once', () => {
    const joined = joinLegion(createSocialExpeditionState('2026-W29'), 'tide-beacon');
    const contributed = contributeToExpedition(joined, { runId: 'r1', outcome: 'victory', completedNodes: 0 }).state;
    const claimed = claimExpeditionMilestone(contributed, 'supply-20');
    expect(claimed.reward).toEqual({ gears: 30, routeMarks: 0, starTickets: 0 });
    expect(claimExpeditionMilestone(claimed.state, 'supply-20').reason).toBe('already-claimed');
    expect(claimExpeditionMilestone(contributed, 'supply-50').reason).toBe('threshold-not-reached');
  });

  it('resets weekly progress but preserves legion and squad', () => {
    let state = joinLegion(createSocialExpeditionState('2026-W28'), 'tide-beacon');
    state = toggleSquadMember(state, 'navigator').state;
    state = contributeToExpedition(state, { runId: 'r1', outcome: 'victory', completedNodes: 0 }).state;
    expect(normalizeSocialExpeditionState(state, '2026-W29')).toMatchObject({
      cycleId: '2026-W29', legionId: 'tide-beacon', squadMemberIds: ['navigator'], contribution: 0,
    });
  });

  it('creates stable ISO week identifiers', () => {
    expect(getIsoWeekCycleId(new Date('2026-07-16T00:00:00Z'))).toBe('2026-W29');
  });
});
```

- [ ] **Step 2: Run the focused test and verify module-not-found failure**

Run: `npx vitest run tests/domain/social/SocialExpeditionSystem.spec.ts`

Expected: FAIL because `SocialExpeditionSystem.ts` does not exist.

- [ ] **Step 3: Implement the pure social rules with defensive cloning and validation**

Implement the interfaces listed above. `toggleSquadMember` removes an already-selected member, rejects additions before joining, and rejects a third member. `contributeToExpedition` uses base values `{ victory: 30, extract: 15, defeat: 8 }` plus `min(12, floor(completedNodes) * 2)`. `normalizeSocialExpeditionState` returns a safe state and resets cycle-scoped fields when `cycleId` changes.

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run tests/domain/social/SocialExpeditionSystem.spec.ts`

Expected: 7 tests pass.

- [ ] **Step 5: Commit the social rules**

```powershell
git add src/domain/social/SocialExpeditionSystem.ts tests/domain/social/SocialExpeditionSystem.spec.ts
git commit -m "feat: add async squad and expedition rules"
```

### Task 2: Combat support integration

**Files:**
- Modify: `src/domain/combat/CombatLoopSystem.ts`
- Modify: `tests/domain/combat/CombatLoopSystem.spec.ts`

**Interfaces:**
- Consumes: `SquadBonuses.damageBonus` from Task 1.
- Produces: optional `damageBonus?: number` on `CombatActionOptions`.

- [ ] **Step 1: Add a failing damage-bonus test**

```ts
it('applies a non-negative squad damage bonus to damaging actions', () => {
  const state = createCombatLoopState({ enemyHp: 200 });
  expect(resolveCombatAction(state, 'attack', { skillAvailable: true, damageBonus: 5 }).damageDealt).toBe(30);
  expect(resolveCombatAction(state, 'repair', { skillAvailable: true, damageBonus: 5 }).damageDealt).toBe(0);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run tests/domain/combat/CombatLoopSystem.spec.ts`

Expected: FAIL because `damageBonus` is not accepted or applied.

- [ ] **Step 3: Add validated flat damage support**

Add `readonly damageBonus?: number` to `CombatActionOptions`; reject negative or non-finite values with `Damage bonus must be a finite non-negative number`; add the bonus only when `rawDamage > 0`.

- [ ] **Step 4: Run combat and social tests**

Run: `npx vitest run tests/domain/combat/CombatLoopSystem.spec.ts tests/domain/social/SocialExpeditionSystem.spec.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit combat integration**

```powershell
git add src/domain/combat/CombatLoopSystem.ts tests/domain/combat/CombatLoopSystem.spec.ts
git commit -m "feat: apply squad support in combat"
```

### Task 3: Web social hub and expedition loop

**Files:**
- Modify: `web/main.ts`
- Modify: `web/styles.css`
- Modify: `src/telemetry/TelemetryEvents.ts`
- Modify: `src/platform/PlatformContracts.ts`

**Interfaces:**
- Consumes: all Task 1 rules and Task 2 `damageBonus`.
- Produces: station actions `join-legion`, `toggle-support`, `claim-expedition`, `share-squad`; storage key `tidal-train-social-v1`.

- [ ] **Step 1: Add social state loading and persistence**

Use `getIsoWeekCycleId(new Date())` and `normalizeSocialExpeditionState(JSON.parse(raw), cycleId)`. Persist social state separately from `PlayerSave` and clear both keys from the existing reset action.

- [ ] **Step 2: Render the station social hub**

Render a join state, three support cards, a two-slot summary, progress bar, 20/50/100 milestone buttons, and an optional share-recruit button. Buttons remain clickable when the squad is full so the rule-layer rejection can produce feedback.

- [ ] **Step 3: Apply support to every new battle node**

Pass `100 + maxPlayerHpBonus` and `initialMomentum` to `createCombatLoopState`; pass `damageBonus` to `resolveCombatAction`; show active support names and bonuses in the battle status.

- [ ] **Step 4: Contribute once at settlement and claim deterministic rewards**

On victory call `contributeToExpedition` with `victory`; on give-up call it with `defeat`. Persist accepted contributions, display `lastExpeditionContribution` on settlement, and apply claimed milestone rewards to the existing three wallet currencies exactly once.

- [ ] **Step 5: Wire recruit sharing and telemetry**

Add optional `shareType: 'recovery' | 'squad-invite'` to `SharePayload`. Track `legion_joined`, `squad_changed`, `squad_invite_shared`, `expedition_contributed`, and `expedition_reward_claimed`. A completed invite share grants no direct currency.

- [ ] **Step 6: Add responsive social styles**

Use grid cards, progress bars, selected states, and existing color tokens. At `max-width: 760px`, switch roster and milestones to one column and retain no continuous animation.

- [ ] **Step 7: Run typecheck and all tests**

Run: `npm run typecheck` and `npm test`

Expected: both pass.

- [ ] **Step 8: Commit the Web loop**

```powershell
git add web/main.ts web/styles.css src/telemetry/TelemetryEvents.ts src/platform/PlatformContracts.ts
git commit -m "feat: add playable legion expedition hub"
```

### Task 4: Cocos bridge, documentation, and regression

**Files:**
- Create: `assets/scripts/social/SocialHubController.ts`
- Modify: `README.md`
- Modify: `docs/testing/prototype-playtest-script.md`

**Interfaces:**
- Consumes: `SupportId` and milestone IDs from Task 1.
- Produces Cocos events: `legion-join-requested`, `squad-member-toggle-requested`, `expedition-milestone-claim-requested`, `squad-invite-requested`.

- [ ] **Step 1: Add the Cocos request-only controller**

Create a component with `EventTarget` methods that emit the four events above. It must not mutate contribution, squad state, or wallet rewards.

- [ ] **Step 2: Document the social loop and server boundary**

Update README status, usage, feature list, and limitations. Extend the playtest script with join, two-support selection, full-squad rejection, combat bonus, settlement contribution, milestone claim, repeat-claim rejection, invite share, and mobile layout checks.

- [ ] **Step 3: Run full automated validation**

Run: `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`.

Expected: all commands exit 0; Vite emits `dist/index.html` and its JS/CSS assets.

- [ ] **Step 4: Run browser regression**

Verify desktop and 390 px layouts: join the legion, select navigator and gunner, reject a third support, start a run with 20 momentum and +5 damage, finish a run, observe expedition contribution, and claim an eligible milestone without duplicate rewards.

- [ ] **Step 5: Commit documentation and bridge**

```powershell
git add assets/scripts/social/SocialHubController.ts README.md docs/testing/prototype-playtest-script.md
git commit -m "docs: expose social expedition bridge and playtest"
```

## Plan Self-Review

- Spec coverage: squad, support effects, contribution outcomes, idempotency, weekly rollover, milestone rewards, invite sharing, telemetry, mobile layout, Cocos boundary, and formal-server limitations are each assigned to a task.
- Placeholder scan: no TBD, TODO, or undefined implementation placeholder remains.
- Type consistency: `SupportId`, milestone IDs, `damageBonus`, storage key, action names, and event names are consistent across tasks.
