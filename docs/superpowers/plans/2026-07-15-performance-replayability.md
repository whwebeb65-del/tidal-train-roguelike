# 性能与可玩性增强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在保持事件驱动和低包体的前提下，为普通战斗与 Boss 增加潮汐动能、连击、维修、潮汐爆发和确定性战斗词缀，并完成 Web/Cocos 接入。

**Architecture:** 新增纯函数 `CombatLoopSystem` 作为战斗状态唯一写入入口，Web 只负责把按钮映射为动作、把结果映射为 UI；Cocos HUD 只发事件，不复制规则。视觉层使用 CSS 绘制隔离、轻量伪元素和移动端降级，不引入新运行时依赖。

**Tech Stack:** TypeScript 5.7、Vitest 2、Vite 5、Cocos Creator TypeScript 脚本、CSS。

## Global Constraints

- 不接入真实抖音 SDK，不改变广告复活、分享复活和技能刷新已确认规则。
- 不引入重型 3D 依赖，不添加付费随机抽取。
- 战斗状态只能由纯规则层产生新状态，Web/Cocos 不直接修改敌人生命、玩家生命或奖励。
- 保持事件驱动，不新增持续的业务 `requestAnimationFrame` 循环。
- 完成后运行 `npm test`、`npm run typecheck`、`npm run build`、`git diff --check`。

---

### Task 1: 新增纯规则战斗循环

**Files:**
- Create: `src/domain/combat/CombatLoopSystem.ts`
- Test: `tests/domain/combat/CombatLoopSystem.spec.ts`

**Interfaces:**
- Produces `CombatAction`, `TideModifier`, `CombatLoopState`, `createCombatLoopState`, `resolveCombatAction`, `receiveDamage`, `getTideModifierLabel`。
- `CombatLoopState` 包含 `enemyHp`、`enemyMaxHp`、`playerHp`、`maxPlayerHp`、`momentum`、`combo`、`repairUsed`、`burstUsed`、`modifier`。
- `resolveCombatAction(state, action, { skillAvailable })` 返回 `{ accepted, reason, state, damageDealt, hpRestored, momentumGained, defeated }`。

- [ ] **Step 1: 先写失败测试**

覆盖以下固定行为：普通攻击造成 25 点伤害并增加 25 动能；技能在 `skillAvailable=false` 时拒绝，在可用时造成 50 点伤害；维修每节点只能成功一次且生命不超过上限；动能未满时爆发拒绝，满 100 后爆发造成 60 点伤害并清空动能；急流词缀提高普通攻击，回声词缀提高技能；敌人死亡后所有动作拒绝。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run tests/domain/combat/CombatLoopSystem.spec.ts`

Expected: FAIL，因为规则文件和导出函数尚不存在。

- [ ] **Step 3: 实现最小规则层**

使用以下动作定义：

```ts
export type CombatAction = 'attack' | 'skill' | 'repair' | 'burst';
export type TideModifier = 'calm-water' | 'surge-current' | 'echo-fog';

export interface CombatLoopState {
  readonly enemyHp: number;
  readonly enemyMaxHp: number;
  readonly playerHp: number;
  readonly maxPlayerHp: number;
  readonly momentum: number;
  readonly combo: number;
  readonly repairUsed: boolean;
  readonly burstUsed: boolean;
  readonly modifier: TideModifier;
}
```

攻击伤害为 `25 + min(combo, 5) * 2`，技能基础伤害为 50，急流攻击基础伤害为 30，回声技能基础伤害为 60；平静水域维修恢复 24，其余词缀恢复 18；攻击增加 25 动能，技能增加 40，维修减少 15，爆发要求动能达到 100 并造成 60 点伤害。所有生命和动能都裁剪在合法区间。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run tests/domain/combat/CombatLoopSystem.spec.ts`

Expected: 新增规则测试全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/domain/combat/CombatLoopSystem.ts tests/domain/combat/CombatLoopSystem.spec.ts
git commit -m "feat: add deterministic combat loop rules"
```

### Task 2: 接入 Web 战斗动作和确定性词缀

**Files:**
- Modify: `web/main.ts`

**Interfaces:**
- Consumes `CombatLoopState` and `resolveCombatAction` from Task 1。
- Produces 四个战斗按钮、动能/连击/维修状态、词缀说明和统一的普通战斗/Boss 动作处理。

- [ ] **Step 1: 建立单一战斗状态**

将 `combatHp`、`bossHp`、`playerHp` 替换为一个 `battleState`，进入普通战斗时调用 `createCombatLoopState({ enemyHp: 100, modifier })`，进入 Boss 时调用 `createCombatLoopState({ enemyHp: 120, modifier })`。词缀用 `seed + currentNodeId` 的简单哈希确定，不使用每次点击重新随机。

- [ ] **Step 2: 把按钮统一映射到规则层**

添加 `handleCombatAction(action: CombatAction)`：先调用 `resolveCombatAction`，拒绝时只更新提示；技能成功后才调用现有 `useSkill`；接受后以返回的 `state` 更新界面；普通敌人死亡进入奖励，Boss 死亡调用现有 `settleRun(true)`。

- [ ] **Step 3: 保留复活兼容**

复活调用 `applyRevive` 时传入 `battleState.playerHp`，成功后只替换 `battleState.playerHp`，保留敌人生命、动能、连击、维修和爆发状态；新节点仍调用 `startCombatNode`，并重新创建战斗状态。

- [ ] **Step 4: 添加四个动作入口**

普通战斗和 Boss 分别显示“自动开炮”“释放汽笛共鸣”“维修车厢”“潮汐爆发”；爆发只在动能达到 100 且尚未使用时可点击，维修在本节点已使用后禁用。旧的调试受击入口继续保留，用于回归失败复活。

- [ ] **Step 5: 运行 Web 相关验证**

Run: `npm run typecheck && npm run build`

Expected: 类型检查通过，Vite 生产构建成功。

- [ ] **Step 6: 提交**

```powershell
git add web/main.ts
git commit -m "feat: connect web battle loop actions"
```

### Task 3: 低开销 2.5D 视觉和移动端降级

**Files:**
- Modify: `web/styles.css`

**Interfaces:**
- Consumes Task 2 生成的 `.battle-status`、`.battle-actions`、`.modifier-chip`、`.burst-ready` 等语义类名。
- Produces 低 DOM、绘制隔离、移动端降级和减少动画模式。

- [ ] **Step 1: 添加战斗状态视觉**

为动能条、连击徽章、词缀标签、维修按钮和爆发按钮增加统一层级；用渐变、伪元素、透视和阴影增强列车、潮兽和车站的结构感，不新增图片或字体依赖。

- [ ] **Step 2: 添加性能约束**

给 `.scene`、`.combat-board`、`.boss-board` 和 `.train-platform` 添加 `contain: layout paint`；移动端关闭 `backdrop-filter` 和非必要动画；使用 `@media (prefers-reduced-motion: reduce)` 将 transition/animation 降到最小。

- [ ] **Step 3: 验证 CSS 和构建体积**

Run: `npm run build`

Expected: 构建成功，输出仍只包含一个主 JS 和一个主 CSS，未引入额外依赖。

- [ ] **Step 4: 提交**

```powershell
git add web/styles.css
git commit -m "perf: add lightweight 2d scene rendering"
```

### Task 4: Cocos HUD 事件桥接

**Files:**
- Modify: `assets/scripts/run/CombatHud.ts`
- Modify: `assets/scripts/run/RunSceneController.ts`

**Interfaces:**
- Consumes `CombatAction` from `src/domain/combat/CombatLoopSystem`。
- Produces `combat-action-requested`、`battle-state-updated` 事件，且不在 HUD 内结算奖励或改写生命。

- [ ] **Step 1: 添加 HUD 方法**

```ts
public onCombatActionButtonPressed(action: CombatAction): void {
  this.node.emit('combat-action-requested', action);
}

public updateBattleState(state: CombatLoopState): void {
  this.node.emit('battle-state-updated', state);
}
```

保留现有车道、技能、复活、受击和放弃事件。

- [ ] **Step 2: 添加场景控制器端口**

在 `RunScenePorts` 添加 `onCombatActionRequested(action: CombatAction): void`，在 `RunSceneController` 中通过 `events.emit('combat-action-requested', action)` 转发。

- [ ] **Step 3: 运行类型和引用检查**

Run: `rg -n "combat-action-requested|battle-state-updated|onCombatActionRequested" assets/scripts/run && npm run typecheck`

Expected: 能找到 HUD 和控制器两端事件，类型检查通过。

- [ ] **Step 4: 提交**

```powershell
git add assets/scripts/run/CombatHud.ts assets/scripts/run/RunSceneController.ts
git commit -m "feat: bridge combat actions to cocos hud"
```

### Task 5: 全量回归和试玩文档

**Files:**
- Modify: `docs/testing/prototype-playtest-script.md`
- Modify: `README.md`

**Interfaces:**
- Documents the actual four-action path and performance limitations for future Cocos 真机验证。

- [ ] **Step 1: 更新试玩路径**

加入“连续开炮积累动能 → 维修一次 → 技能/爆发击杀”的路径，并明确检查新节点会重置维修、爆发和动能；保留广告复活、分享复活、技能刷新原有路径。

- [ ] **Step 2: 更新 README**

说明本轮新增的战斗动作、事件驱动渲染和“当前版本未宣称真机 60 FPS”的边界。

- [ ] **Step 3: 运行全量验证**

```powershell
npm test
npm run typecheck
npm run build
git diff --check
git status --short
```

Expected: 所有测试通过，构建成功，差异检查无输出，提交后工作区干净。

- [ ] **Step 4: 提交**

```powershell
git add docs/testing/prototype-playtest-script.md README.md
git commit -m "test: document enhanced combat and performance checks"
```
