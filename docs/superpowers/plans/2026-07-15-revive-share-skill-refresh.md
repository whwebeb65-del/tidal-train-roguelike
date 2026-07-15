# 复活、分享复活与技能刷新实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为《潮汐列车》原型加入每局一次广告复活、每局一次分享复活、每局一次广告刷新技能，并在 Web MVP 与 Cocos 控制器中保持可替换平台接口和幂等行为。

**Architecture:** 将次数限制、生命恢复、技能充能和 3000ms 复活迟滞放进无平台依赖的 `src/domain/recovery/RecoverySystem.ts`。广告与分享只负责返回平台结果，Web MVP 在成功回调后调用规则层；Cocos 控制器只发出输入事件，不直接发放奖励。这样即使 Cocos Dashboard 暂时不可用，也能先用现有 Web MVP 和源码完成闭环验证。

**Tech Stack:** TypeScript、Vitest、Vite、Cocos Creator 3.x 控制器脚本；Web MVP 使用确定性 Mock 广告和分享，不调用真实平台服务。

## Global Constraints

- 广告复活每局最多 1 次，分享复活每局最多 1 次，技能刷新每局最多 1 次。
- 广告取消、失败或中途退出不消耗次数；分享取消、失败或回调无效不消耗次数。
- 普通战斗广告复活恢复 60 点生命，分享复活恢复 50 点生命；Boss 广告复活恢复 50 点生命，分享复活恢复 40 点生命；恢复值不超过最大生命。
- Boss 复活后的表现层迟滞窗口固定为 3000ms，Boss 当前生命不重置。
- 技能每个战斗节点初始 1 次充能；使用后归零；完整激励视频成功后恢复 1 次；新战斗节点和 Boss 进入时恢复 1 次。
- 复活和技能刷新不直接发放齿轮、航线徽记或星票，不重复触发首通奖励、互动奖励、地图开放或整局结算。
- 客户端不得把按钮点击直接当作奖励完成，只有 `completed` 广告结果或有效分享回调才提交权益。
- 同一权益请求使用 `runId + entitlementType + claimIndex` 作为幂等键；快速重复点击、重复回调和网络重试不能重复发放。
- Web MVP 和单元测试使用确定性 Mock；Cocos Dashboard 不是本轮实现的前置条件。

---

## 文件结构与职责

- Create: `src/domain/recovery/RecoverySystem.ts` — 复活次数、技能充能、生命恢复和迟滞规则
- Create: `tests/domain/recovery/RecoverySystem.spec.ts` — 规则层成功、失败、重复和边界测试
- Modify: `src/platform/PlatformContracts.ts` — 技能刷新广告位、分享卡参数和分享结果类型
- Modify: `src/platform/MockPlatform.ts` — 记录广告位与分享卡参数的确定性 Mock
- Modify: `tests/platform/MockPlatform.spec.ts` — 平台 Mock 回调和参数测试
- Modify: `src/telemetry/TelemetryEvents.ts` — 复活、技能刷新和分享卡事件类型
- Modify: `tests/telemetry/TelemetryClient.spec.ts` — 新事件可以正常记录
- Modify: `web/main.ts` — 失败页、广告/分享回调、技能充能 UI 和试玩入口
- Modify: `web/styles.css` — 失败页、复活按钮、技能充能和调试受击按钮样式
- Modify: `assets/scripts/run/RunSceneController.ts` — Cocos 复活、分享、刷新技能和放弃事件
- Modify: `assets/scripts/run/CombatHud.ts` — Cocos UI 输入桥接与状态显示接口
- Modify: `docs/testing/prototype-playtest-script.md` — 增加失败—复活—继续战斗路径
- Modify: `README.md` — 增加 Mock 广告/分享试玩说明和 Cocos 编辑器非必需说明

---

### Task 1: 建立可测试的救场规则层

**Files:**
- Create: `src/domain/recovery/RecoverySystem.ts`
- Create: `tests/domain/recovery/RecoverySystem.spec.ts`

**Interfaces:**

```ts
export type RecoverySource = 'ad' | 'share';
export type EncounterKind = 'combat' | 'boss';
export type RecoveryResult = 'completed' | 'duplicate' | 'not-needed';

export interface RecoveryState {
  readonly adReviveUsed: boolean;
  readonly shareReviveUsed: boolean;
  readonly skillRefreshUsed: boolean;
  readonly skillCharges: number;
  readonly reviveProtectionUntilMs: number;
}

export function createRecoveryState(): RecoveryState;
export function startCombatNode(state: RecoveryState): RecoveryState;
export function canRevive(state: RecoveryState, source: RecoverySource): boolean;
export function applyRevive(input: {
  state: RecoveryState;
  source: RecoverySource;
  encounter: EncounterKind;
  playerHp: number;
  maxPlayerHp: number;
  nowMs: number;
}): {
  result: RecoveryResult;
  state: RecoveryState;
  playerHp: number;
  hpRestored: number;
};
export function useSkill(state: RecoveryState): { accepted: boolean; state: RecoveryState };
export function canRefreshSkill(state: RecoveryState): boolean;
export function applySkillRefresh(state: RecoveryState): {
  result: RecoveryResult;
  state: RecoveryState;
  chargesGranted: number;
};
```

- [ ] **Step 1: 写失败测试**

```ts
it('allows one ad revive and caps hp at max hp', () => {
  const first = applyRevive({
    state: createRecoveryState(),
    source: 'ad',
    encounter: 'combat',
    playerHp: 0,
    maxPlayerHp: 100,
    nowMs: 10,
  });
  const retry = applyRevive({
    state: first.state,
    source: 'ad',
    encounter: 'combat',
    playerHp: first.playerHp,
    maxPlayerHp: 100,
    nowMs: 20,
  });
  expect(first.result).toBe('completed');
  expect(first.playerHp).toBe(60);
  expect(retry.result).toBe('duplicate');
  expect(retry.hpRestored).toBe(0);
});

it('keeps ad and share revive counters independent', () => {
  const ad = applyRevive({ state: createRecoveryState(), source: 'ad', encounter: 'boss', playerHp: 0, maxPlayerHp: 100, nowMs: 1 });
  const share = applyRevive({ state: ad.state, source: 'share', encounter: 'boss', playerHp: 0, maxPlayerHp: 100, nowMs: 2 });
  expect(ad.playerHp).toBe(50);
  expect(share.playerHp).toBe(40);
  expect(share.result).toBe('completed');
});

it('consumes one skill charge and refreshes it only once per run', () => {
  const used = useSkill(createRecoveryState());
  const refreshed = applySkillRefresh(used.state);
  const duplicate = applySkillRefresh(refreshed.state);
  expect(used.accepted).toBe(true);
  expect(refreshed.chargesGranted).toBe(1);
  expect(duplicate.result).toBe('duplicate');
});
```

- [ ] **Step 2: 运行失败测试**

Run: `npm test -- --run tests/domain/recovery/RecoverySystem.spec.ts`

Expected: FAIL，因为恢复规则文件尚未创建。

- [ ] **Step 3: 实现最小规则**

实现固定恢复量：`ad + combat = 60`、`ad + boss = 50`、`share + combat = 50`、`share + boss = 40`；恢复后的生命使用 `Math.min(maxPlayerHp, playerHp + amount)`；成功复活将对应 `*ReviveUsed` 设为 `true`，并将 `reviveProtectionUntilMs` 设为 `nowMs + 3000`；重复复活返回 `duplicate` 且不改变状态。`createRecoveryState` 和 `startCombatNode` 都将 `skillCharges` 设为 `1`，但 `startCombatNode` 保留三种已使用标记。技能刷新只在 `skillCharges === 0` 且 `skillRefreshUsed === false` 时成功。

- [ ] **Step 4: 运行规则测试和类型检查**

Run: `npm test -- --run tests/domain/recovery/RecoverySystem.spec.ts && npm run typecheck`

Expected: 恢复规则测试全部 PASS，类型检查无错误。

- [ ] **Step 5: 提交**

```bash
git add src/domain/recovery/RecoverySystem.ts tests/domain/recovery/RecoverySystem.spec.ts
git commit -m "feat: add idempotent recovery rules"
```

### Task 2: 扩展平台 Mock 与埋点类型

**Files:**
- Modify: `src/platform/PlatformContracts.ts`
- Modify: `src/platform/MockPlatform.ts`
- Modify: `tests/platform/MockPlatform.spec.ts`
- Modify: `src/telemetry/TelemetryEvents.ts`
- Modify: `tests/telemetry/TelemetryClient.spec.ts`

**Interfaces:**

```ts
export type RewardedPlacement = 'revive' | 'double-settlement' | 'reroll' | 'skill-refresh';
export type ShareResult = 'completed' | 'cancelled' | 'failed';

export interface SharePayload {
  readonly mapId: string;
  readonly depth: number;
  readonly passengers: readonly string[];
  readonly modules: readonly string[];
  readonly failureReason: string;
  readonly cta: string;
}

export interface IShare {
  share(payload: SharePayload): Promise<ShareResult>;
}
```

- [ ] **Step 1: 写平台边界测试**

```ts
it('records the rewarded placement without calling a real SDK', async () => {
  const ads = new MockAds('completed');
  await ads.showRewardedAd('skill-refresh');
  expect(ads.placements).toEqual(['skill-refresh']);
});

it('returns the configured share result and keeps the share card payload', async () => {
  const share = new MockShare('completed');
  const payload = { mapId: 'drift-suburb', depth: 3, passengers: ['doctor'], modules: ['sound-mirror'], failureReason: '潮兽压制', cta: '救回列车' };
  await expect(share.share(payload)).resolves.toBe('completed');
  expect(share.payloads).toEqual([payload]);
});
```

- [ ] **Step 2: 运行测试确认接口变化可被捕获**

Run: `npm test -- --run tests/platform/MockPlatform.spec.ts`

Expected: 新增测试先失败，原因是 Mock 尚未记录广告位且分享仍是无参数布尔接口。

- [ ] **Step 3: 更新接口与 Mock**

`MockAds` 新增只读 `placements: RewardedPlacement[]`，每次调用先记录 placement 再返回配置结果；`MockShare` 构造参数改为 `ShareResult`，新增只读 `payloads: SharePayload[]`，每次调用保存 payload 并返回配置结果。保留现有 `closed` 广告结果以兼容已有测试。`PrototypeEventName` 增加 `revive_result`、`skill_refresh_clicked`、`skill_refresh_result`、`share_card_created`，并让 `revive_clicked` 继续可用。

- [ ] **Step 4: 运行平台、埋点和全量类型检查**

Run: `npm test -- --run tests/platform/MockPlatform.spec.ts tests/telemetry/TelemetryClient.spec.ts && npm run typecheck`

Expected: 平台和埋点测试 PASS，类型检查无错误。

- [ ] **Step 5: 提交**

```bash
git add src/platform/PlatformContracts.ts src/platform/MockPlatform.ts tests/platform/MockPlatform.spec.ts src/telemetry/TelemetryEvents.ts tests/telemetry/TelemetryClient.spec.ts
git commit -m "feat: add share payload and recovery telemetry contracts"
```

### Task 3: 接入 Web MVP 的失败、复活和技能刷新闭环

**Files:**
- Modify: `web/main.ts`
- Modify: `web/styles.css`

**Interfaces:**

```ts
type PreviewPhase = 'station' | 'combat' | 'reward' | 'route' | 'boss' | 'failure' | 'settlement';
type FailureEncounter = 'combat' | 'boss';

function renderFailure(): string;
function createSharePayload(): SharePayload;
async function handleAdRevive(): Promise<void>;
async function handleShareRevive(): Promise<void>;
async function handleSkillRefresh(): Promise<void>;
```

- [ ] **Step 1: 增加可复现失败入口并先运行现有检查**

在 `web/main.ts` 增加玩家生命状态 `playerHp = 100`、`failureEncounter`、`recoveryState = createRecoveryState()`、`pendingRecoveryActions` 和 `lastRunRecovery`；普通战斗和 Boss 都增加“模拟受击”按钮，每次扣 35 点生命，生命归零时进入 `failure` 阶段。运行 `npm run typecheck`，预期先因恢复接口尚未接入主页面而需要继续修改。

- [ ] **Step 2: 接入失败页和两种复活按钮**

失败页显示当前战斗类型、玩家生命、已用次数和两个主动入口；广告入口调用 `ads.showRewardedAd('revive')`，只有返回 `completed` 才调用 `applyRevive`；分享入口先生成并埋点 `share_card_created`，再调用 `share.share(payload)`，只有返回 `completed` 才调用 `applyRevive`。请求开始时将 `ad` 或 `share` 加入 `pendingRecoveryActions`，回调完成后删除，按钮在进行中禁用，防止快速重复点击。

```ts
const sharePayload: SharePayload = {
  mapId: currentMapId,
  depth: route.find((node) => node.id === currentNodeId)?.depth ?? 0,
  passengers: save.unlockedPassengerIds.slice(-3),
  modules: save.unlockedModuleIds.slice(-3),
  failureReason: failureEncounter === 'boss' ? '潮汐巨兽击穿列车' : '潮兽击穿列车',
  cta: '救回列车',
};
```

- [ ] **Step 3: 接入技能充能和刷新广告**

战斗和 Boss 进入时调用 `startCombatNode(recoveryState)`；技能按钮显示 `技能充能 ${recoveryState.skillCharges}/1`，调用 `useSkill` 成功后才造成 40 点敌方伤害；充能为 0 且 `skillRefreshUsed` 为 `false` 时显示“看广告刷新技能”，调用 `ads.showRewardedAd('skill-refresh')`，仅在 `completed` 后调用 `applySkillRefresh`。技能刷新不修改玩家生命、敌人生命或路线状态以外的任何奖励状态。

- [ ] **Step 4: 接入放弃结算、埋点和状态重置**

放弃按钮调用既有 `settleRun(false)`；复活成功将 `phase` 恢复为 `combat` 或 `boss`，保留当前敌人/Boss 生命、路线深度和互动奖励；复活成功发送 `revive_result`，失败/取消发送对应结果但不消耗次数；刷新技能发送 `skill_refresh_clicked` 与 `skill_refresh_result`；下一次开局重置本局恢复状态并发送 `run_restart` 的恢复来源字段。

- [ ] **Step 5: 补齐样式并构建 Web MVP**

在 `web/styles.css` 增加 `.failure-panel`、`.recovery-actions`、`.recovery-button`、`.skill-meter` 和 `.debug-hit` 的紧凑样式，保证手机宽度下两个复活按钮纵向排列、不会遮挡放弃按钮。运行：

```bash
npm run typecheck
npm run build
```

Expected: 类型检查与 Vite 构建均成功。

- [ ] **Step 6: 提交 Web 闭环**

```bash
git add web/main.ts web/styles.css
git commit -m "feat: add web recovery and skill refresh loop"
```

### Task 4: 扩展 Cocos 控制器输入边界

**Files:**
- Modify: `assets/scripts/run/RunSceneController.ts`
- Modify: `assets/scripts/run/CombatHud.ts`

**Interfaces:**

```ts
export type RecoverySource = 'ad' | 'share';

export interface RunScenePorts {
  onLaneChanged(lane: number): void;
  onSkillPressed(skillId: string): void;
  onSkillRefreshPressed(): void;
  onRevivePressed(source: RecoverySource): void;
  onDamageRequested(amount: number): void;
  onGiveUpPressed(): void;
  onRouteSelected(nodeId: string): void;
  onRewardSelected(optionId: string): void;
}
```

- [ ] **Step 1: 写入控制器事件桥接**

`RunSceneController` 新增 `onSkillRefreshPressed`、`onRevivePressed`、`onDamageRequested` 和 `onGiveUpPressed`，分别发出 `skill-refresh-pressed`、`revive-pressed`、`damage-requested` 和 `give-up-pressed` 事件；这些方法只发事件，不改变生命、次数或奖励。

- [ ] **Step 2: 写入 CombatHud 输入方法和只读状态更新**

`CombatHud` 新增 `onSkillRefreshButtonPressed()`、`onReviveButtonPressed(source)`、`onDamageButtonPressed()`、`onGiveUpButtonPressed()`；新增 `updateRecoveryState(playerHp, maxPlayerHp, skillCharges, adReviveAvailable, shareReviveAvailable, skillRefreshAvailable)`，该方法只更新绑定节点的 UI 字段，不发放权益。若绑定节点不存在，方法安全返回。

- [ ] **Step 3: 做源码级检查并提交**

运行：

```bash
rg -n "skill-refresh-pressed|revive-pressed|damage-requested|give-up-pressed|onSkillRefreshPressed|onRevivePressed" assets/scripts/run
npm run typecheck
```

Expected: 四类事件和对应方法均出现；规则层类型检查成功。由于当前工作区未安装 Cocos Creator 运行时，Cocos 场景手测记录为待编辑器可用后执行，不阻塞 Web MVP 闭环。

```bash
git add assets/scripts/run/RunSceneController.ts assets/scripts/run/CombatHud.ts
git commit -m "feat: expose recovery inputs to cocos run scene"
```

### Task 5: 自动化回归、试玩脚本和交付验证

**Files:**
- Modify: `docs/testing/prototype-playtest-script.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `RecoverySystem`、Mock 广告/分享接口、Web MVP 失败页和 Cocos 输入事件。
- Produces: 可验证的失败救场试玩流程和当前工具限制说明。

- [ ] **Step 1: 更新试玩脚本**

新增一条固定路径：清空存档 → 开始一局 → 在普通战斗点击模拟受击直至失败 → 看广告复活 → 再次受击并失败 → 分享复活 → 再次受击并失败 → 放弃结算；另开一局使用技能、耗尽技能充能、看广告刷新技能，确认同局不能再次刷新。

- [ ] **Step 2: 启动 Web MVP 并做交互验收**

Run: `npm run dev -- --host 127.0.0.1`

使用浏览器验证：广告复活和分享复活各成功一次；重复点击不重复恢复生命；取消/失败 Mock 不扣次数；Boss 生命不被复活重置；技能刷新只恢复 1 次；放弃后首通奖励和三种货币不重复发放。

- [ ] **Step 3: 运行完整自动化检查**

Run: `npm test && npm run typecheck && npm run build`

Expected: 所有测试 PASS，类型检查成功，Vite 构建成功。

- [ ] **Step 4: 检查差异、提交和交付说明**

Run: `git diff --check; git status --short; git log -5 --oneline`

Expected: 无空白错误；工作树只包含已提交变更；README 明确说明用源码编辑器/命令行即可继续开发，Cocos Dashboard 下载失败不会阻塞 Web MVP。

```bash
git add docs/testing/prototype-playtest-script.md README.md
git commit -m "test: validate recovery loop and tooling fallback"
```

---

## 计划自检

- **规格覆盖：** 复活次数、平台成功回调、分享卡、技能充能、3000ms 迟滞、幂等、埋点、Web MVP、Cocos 控制器、试玩和构建分别由 Tasks 1—5 覆盖。
- **边界检查：** 复活不修改首通、互动奖励、货币和路线；广告/分享 Mock 不调用真实 SDK；Cocos 控制器只发输入事件。
- **类型一致：** `RecoverySource`、`RecoveryState`、`SharePayload`、`ShareResult` 和 `RewardedPlacement` 在规则层、平台层、Web 层与 Cocos 层使用相同字面量。
- **完整性扫描：** 计划步骤包含具体文件、接口、命令和预期结果；编辑器可用后的 Cocos 手测被明确列为工具限制下的验证项，不影响本轮已可执行的源码检查。
