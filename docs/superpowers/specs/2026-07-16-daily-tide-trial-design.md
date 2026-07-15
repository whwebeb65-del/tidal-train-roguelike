# 每日潮汐试炼设计规格

## 目标

为《最后一班：潮汐列车》增加一个每天变化、可反复挑战、可比较和可分享的固定种子模式，解决当前原型“首通和领奖后缺少第二天回来的理由”的问题。

本轮完成单账号每日试炼闭环：解锁、固定种子、轮换规则、战斗生效、分数提交、两档奖励、救援标记、成绩分享和跨刷新持久化。真实好友榜、全服榜和服务端结算不在本轮伪造。

## 方案比较

### 方案 A：每日任务清单

复用现有行为做“开炮、互动、结算”等任务。它能引导玩家，但主要增加的是打卡压力，不会显著提升核心战斗的新鲜感。

### 方案 B：乘客和模块图鉴

图鉴适合长期收集，也符合原始产品方向；但当前可实际辨识的乘客、模块效果和美术量仍有限，先做会更像展示页。

### 方案 C：每日固定种子潮汐试炼

每天由上海时区日期生成固定种子和轮换规则，所有玩家面对同一条件，反复冲击个人最佳分，并可分享同一挑战。它同时服务可玩性、次日回流和抖音传播。

采用方案 C。

## 解锁与入口

- 车站 Lv.1 显示试炼预告与锁定状态。
- 车站达到 Lv.2 后开放“今日潮汐试炼”，填补当前 Lv.1 到 Lv.3 之间没有新功能的成长空档。
- 开服列车长礼足以支持玩家完成第一次车站升级，但试炼功能本身不要求付费或广告。
- 试炼可以无限重玩，不设置体力、门票或每日次数上限。

## 日期、种子与轮换规则

每日周期按 `Asia/Shanghai` 的 UTC+8 自然日计算，日期 ID 格式为 `YYYY-MM-DD`。本地规则层只使用传入时间；正式服必须使用服务器时间。

`getDailyTrialDefinition(dayId)` 对日期 ID 做稳定哈希，生成：

- `seed`：1 到 999999 的固定正整数。
- `ruleId`：按哈希在三条规则中稳定轮换。

三条规则如下：

| 规则 | 敌人生命 | 列车最大生命 | 开场动能 | 行动伤害 | 目的 |
| --- | ---: | ---: | ---: | ---: | --- |
| 装甲逆潮 | +20 | 0 | +20 | 0 | 延长战斗，但给一次更快的爆发窗口 |
| 薄壳快线 | +10 | -20 | 0 | +5 | 高风险高输出 |
| 救援窗口 | +10 | 0 | +30 | 0 | 鼓励技能与潮汐爆发衔接 |

规则加成与异步支援叠加；最大生命最终不得低于 1，开场动能最终限制在 0 到 100。

## 试炼状态

新增独立状态，不修改 `PlayerSave`：

```ts
interface DailyTrialState {
  readonly version: 1;
  readonly dayId: string;
  readonly attempts: number;
  readonly bestScore: number;
  readonly submittedRunIds: readonly string[];
  readonly claimedMilestoneIds: readonly DailyTrialMilestoneId[];
}
```

规则层公开：

- `getChinaDayId(timestampMs)`
- `getDailyTrialDefinition(dayId)`
- `createDailyTrialState(dayId)`
- `normalizeDailyTrialState(candidate, currentDayId)`
- `submitDailyTrial(state, input)`
- `claimDailyTrialMilestone(state, milestoneId)`

日期变化时，尝试次数、最佳分、已提交 run ID 和已领里程碑全部重置；不会清除玩家钱包、开服身份或军团状态。

## 计分

提交输入：

```ts
interface DailyTrialSubmissionInput {
  readonly runId: string;
  readonly outcome: 'victory' | 'extract' | 'defeat';
  readonly completedNodes: number;
  readonly remainingHp: number;
  readonly assisted: boolean;
}
```

原始分数：

```text
结果基础分 + 完成节点 × 20 + floor(min(剩余生命, 100) / 2)
```

基础分：胜利 120、撤离 70、失败 20。使用广告或分享救援后扣 25 分，但最终提交分最低为 20，确保完成一局的玩家能获得参与档。

- `bestScore` 只保留历史最高分。
- `attempts` 每个首次提交的 run 增加 1。
- 同一个 `runId` 重复提交不增加次数、不改变最佳分。
- 本地规则校验完成节点为 0 到 10 的整数、生命为有限非负数。

## 每日奖励

只使用现有货币：

| 里程碑 | 分数 | 奖励 |
| --- | ---: | --- |
| 今日出发 | 20 | 30 齿轮 |
| 无损航标 | 180 | 2 航线徽记 |

- 每档每天只能领取一次。
- 试炼对局不发普通地图首通奖励、重复通关奖励和军团贡献。
- 试炼战斗隐藏常规互动货币按钮，避免无限重玩刷取齿轮、徽记或星票。
- 试炼奖励在车站手动领取，让玩家清楚区分成绩提交和资产发放。

## Web 数据流

新增 `runMode: 'normal' | 'daily-trial'`：

1. 车站点击“开始今日试炼”。
2. 使用每日定义的固定种子创建路线，并记录模式。
3. `resetBattleState` 将每日规则与军团支援共同应用到敌人、生命、动能和伤害。
4. 战斗页显示 `DAILY TRIAL`、日期、规则名和具体效果；常规互动区替换为公平性说明。
5. 结算时提交成绩。每日试炼分支不调用普通首通和军团贡献逻辑。
6. 结算页显示本局分数、是否刷新最佳、今日最佳、尝试次数和是否使用救援。
7. 回到车站后，达到的里程碑可领取。

每日状态使用独立键 `tidal-train-daily-trial-v1`。清空本地存档时同时清除该键。

## 视图结构与整体整理

`web/main.ts` 已接近千行。本轮不做无关大重构，但新增试炼 HTML 必须放在独立的 `web/views/DailyTrialView.ts`：

- `renderDailyTrialHub(viewModel)`：车站入口、规则、最佳分和里程碑。
- `renderDailyTrialRunBanner(viewModel)`：战斗页规则提示。
- `renderDailyTrialSettlement(viewModel)`：试炼结算卡和分享按钮。

主入口只负责状态编排和事件处理，试炼视图只接收数据并返回 HTML，不直接访问本地存储或平台接口。

## 分享与救援

- 广告复活、分享复活和广告技能刷新继续可用，不阻断玩家完成试炼。
- 使用任一复活后，提交标记 `assisted: true` 并扣 25 分；技能刷新不标记救援。
- 结算页提供“分享同种子试炼”按钮，分享内容包含日期、种子、规则、最佳分和 CTA。
- 分享完成不直接发放货币，不改变分数或领奖状态。
- `SharePayload.shareType` 增加 `daily-trial`。

## 埋点

新增：

- `daily_trial_started`
- `daily_trial_submitted`
- `daily_trial_reward_claimed`
- `daily_trial_shared`

开始事件记录日期、种子和规则；提交记录结果、分数、最佳分和救援标记；领奖记录里程碑与三货币；分享记录平台结果和最佳分。

## Cocos 与正式服边界

新增请求型控制器事件：

- `daily-trial-start-requested`
- `daily-trial-submit-requested`
- `daily-trial-reward-claim-requested`
- `daily-trial-share-requested`

Cocos 控制器不自行计算正式榜单或发资产。正式服必须校验服务器日期、活动配置、种子、战斗结果、复活记录、run ID 幂等、分数、里程碑和资产事务。

## 错误处理

- 无效日期 ID、时间、run ID、节点数或生命值抛出明确规则错误。
- 未达分数、重复领奖、未知里程碑和重复提交返回标准原因与零奖励。
- 畸形本地状态按当前日期重建或清洗；非法里程碑和非字符串 run ID 不进入状态。
- 分享取消或失败不修改试炼状态。

## 测试与验收

规则测试覆盖：

- 上海时区跨日边界。
- 同一日期定义稳定、不同日期能轮换种子。
- 三种规则数值正确。
- 胜利、失败、剩余生命和救援扣分。
- 同一 run ID 提交幂等、最佳分只升不降。
- 两档奖励阈值、单日一次领取和日期滚动重置。
- 畸形状态清洗与输入验证。

浏览器验收覆盖：

- Lv.1 锁定、升级 Lv.2 后开放。
- 固定种子和规则在刷新前后不变化。
- 试炼战斗实际显示并应用敌人生命、列车生命、动能或伤害变化。
- 失败结算得到至少 20 分且不增加普通首通、军团贡献或互动货币。
- 参与档领取一次后增加 30 齿轮，重复领取不增加。
- 成绩分享不发货币。
- 390px 入口、战斗提示和结算卡无横向溢出，控制台无错误。
- `npm test`、`npm run typecheck`、`npm run build` 全部通过。

## 不在本轮范围

- 真实好友榜、区服榜和奖励排名。
- 录像回放、幽灵列车和实时竞速。
- 每日任务清单、七日任务和赛季通行证。
- 乘客或模块图鉴。
- 试炼门票、付费加次数和随机付费增益。
