# 首局战斗导演式引导设计

## 1. 背景

《最后一班：潮汐列车》已经具备成长手册、手动瞄准、三个主动技能、二十级局内成长和技能进化，但当前 Web 生产运行时没有真正接入首局战斗引导。仓库中的 `assets/scripts/tutorial/TutorialController.ts` 只是未被 Web 运行时引用的 Cocos 草稿，不能帮助公开试玩玩家理解实际操作。

本轮只解决首次普通战斗的即时理解问题，不再增加任务页、货币、奖励或强制弹窗。玩家应在不中断战斗的前提下完成三个真实动作，并知道这些动作为什么重要。

## 2. 目标

- 新玩家进入首次普通战斗后，立即知道主炮会自动开火，并可点击战场改变优先攻击方向。
- 玩家成功完成一次手动瞄准后，提示自然切换到主动技能，不依赖固定倒计时。
- 玩家实际施放任意主动技能后，提示切换到第一次局内强化。
- 玩家实际选择一次强化后，引导永久完成，后续战斗不重复出现。
- 玩家可以随时跳过；跳过与完成都独立持久化，并可随“清空本地存档”恢复。
- 提示不暂停模拟、不遮挡敌人、技能按钮或强化选项，在 360、390、412、430px 手机视口可安全操作。

## 3. 非目标

- 不新增成长手册章节、货币、广告、付费入口或完成奖励。
- 不改变敌人、伤害、经验、升级速度、体力或结算数值。
- 不把引导接到每日试炼；每日试炼保持纯挑战模式。
- 不实现复杂聚光灯、手势轨迹录制或分支式教程。
- 不把未接入生产路径的 Cocos `TutorialController` 当作完成证据。

## 4. 体验流程

### 4.1 第一步：点选威胁

首次普通战斗开始时，在技能栏上方显示轻量纸票提示：

- 标题：`先盯住一只潮兽`
- 正文：`主炮会自动开火；点一下战场，可以让炮口优先追打那个方向。`
- 进度：`首次值班 1 / 3`

只有画布指针成功转换为战场坐标，且 `BattleEngine.setMainCannonAim` 返回成功时，才完成这一步。拖动中的后续 `pointermove` 不重复写入状态。

### 4.2 第二步：主动技能

完成手动瞄准后，提示改为：

- 标题：`把技能用在潮头上`
- 正文：`下方三枚技能各管爆发、防护和清场；亮起时点任意一枚试试。`
- 进度：`首次值班 2 / 3`

只有战斗引擎发出真实 `skill-used` 事件才完成；点击冷却中、能量不足或战斗非运行态的按钮不计入。

### 4.3 第三步：装车强化

完成技能后，提示改为等待状态；首次升级覆盖层出现时，在奖励箱标题区显示：

- 标题：`挑一件真正改变打法的货`
- 正文：`这是本局强化，离站后重置；带“技能进化”的选项会改变技能机制。`
- 进度：`首次值班 3 / 3`

只有战斗引擎发出真实 `upgrade-selected` 事件才完成。自动超时选择也属于真实选择，可完成引导，避免玩家因读字较慢而被永久卡住。

### 4.4 跳过

每个提示都提供 `跳过引导` 按钮，点击目标不小于 44×44 CSS 像素。跳过后本局立即隐藏，后续战斗不再出现；不会发奖励，也不会标记三个步骤为逐项完成。

## 5. 状态与规则

新增纯领域模块 `src/domain/onboarding/FirstRunBattleTutorial.ts`：

```ts
export type FirstRunBattleTutorialStepId = 'aim' | 'skill' | 'upgrade';

export interface FirstRunBattleTutorialState {
  readonly version: 1;
  readonly completedStepIds: readonly FirstRunBattleTutorialStepId[];
  readonly skipped: boolean;
}
```

模块提供：

- `createFirstRunBattleTutorialState()`：安全默认状态。
- `normalizeFirstRunBattleTutorialState(value)`：过滤未知步骤、去重并保持目录顺序，损坏数据回退默认值。
- `getFirstRunBattleTutorialPrompt(state)`：返回当前提示或 `null`。
- `completeFirstRunBattleTutorialStep(state, stepId)`：只允许按顺序前进；重复和越级事件幂等。
- `skipFirstRunBattleTutorial(state)`：返回跳过状态；已完成状态不被降级。

独立存储键为 `tidal-train-first-run-battle-tutorial-v1`，由 `AppStateRepository` 统一读取、保存和清空。它不进入 `PlayerSave`，避免为纯客户端引导升级存档版本。

## 6. 生产运行时接线

`LegacyGameRuntime` 持有当前引导状态，并向 `BattleScene` 提供：

- 当前普通战斗的提示快照；每日试炼始终返回 `null`。
- 完成真实动作的回调；回调规范化、持久化并记录遥测。
- 跳过回调；立即持久化并重新渲染 HUD。

`BattleScene` 只负责把真实战斗动作转成引导动作：

- 成功的画布瞄准 → `aim`。
- `skill-used` 事件 → `skill`。
- `upgrade-selected` 事件 → `upgrade`。

`BattleHUD` 只渲染模型和转发跳过按钮，不读取存储，也不自行推断步骤。

## 7. 视觉与交互

- 瞄准和技能提示使用不规则纸票造型，位于技能栏上方，最大宽度限制在战场安全区内。
- 纸票装饰使用 `pointer-events: none`；只有跳过按钮接收事件。
- 强化步骤嵌入奖励箱清单区域，不用浮层盖住三张卡或广告刷新按钮。
- 提示颜色使用珊瑚橙、奶油纸和潮蓝墨水，与当前 2.5D 手绘车站和战斗仪表一致，不使用通用 AI 渐变卡片。
- 默认只有轻微纸票呼吸和指向摆动；`prefers-reduced-motion: reduce` 时所有引导动画为 `none`。
- `aria-live="polite"` 宣布步骤变化；跳过按钮有明确中文可访问名称。

## 8. 遥测

在现有原型遥测联合类型中增加：

- `first_run_tutorial_step_completed`：携带 `stepId`。
- `first_run_tutorial_skipped`：携带当前 `stepId`。
- `first_run_tutorial_completed`：只在第三步首次完成时记录一次。

不记录具体点击坐标，不记录个人信息。

## 9. 验收与发布门禁

- 领域测试覆盖默认、损坏输入、顺序推进、重复、越级、跳过和完成幂等。
- 存储测试覆盖读取、损坏回退、刷新持久化和 `clear()` 删除新键。
- `BattleScene` 测试证明只有成功瞄准和真实引擎事件推进步骤。
- `BattleHUD` 测试证明三个步骤文案、强化内嵌状态、跳过动作和隐藏状态正确。
- `LegacyGameRuntime` 测试证明普通模式接线、每日试炼隔离、持久化和遥测只发生一次。
- 样式契约覆盖 44×44、移动端安全区、装饰不拦截和 reduced-motion。
- 浏览器 smoke 使用精确 `e2e=1` 夹具从空存档走完三步，并确认刷新与第二局不重复；普通 URL 不暴露 E2E 行为。
- 发布前必须通过 `npm test`、`npm run typecheck`、`npm run check:assets`、`npm run build`、`npm audit --audit-level=high`、`npm run smoke:browser` 和 `git diff --check`。

## 10. 回滚

功能没有服务端依赖和经济副作用。若上线后发现遮挡或误触，可移除 HUD 渲染与运行时回调，同时保留未知存储键；下一次清空存档会删除该键。领域状态与遥测事件均不影响战斗和奖励结算。
