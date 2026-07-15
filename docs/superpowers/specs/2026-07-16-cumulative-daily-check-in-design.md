# 累计七日值班簿设计

## 目标

在车站主页增加一个低压力的每日签到循环，让玩家每天上线都有明确、即时、可预期的奖励，同时不使用断签惩罚、付费补签、强制广告或分享领奖。原型继续复用齿轮、航线徽记和星票三种现有货币，不增加新的钱包层级。

## 方案取舍

- 连续七日签到：短期催促感强，但漏签清零会制造挫败，不采用。
- 累计七日循环：漏签只顺延，七次领取后进入下一轮，兼顾留存与玩家友好，采用。
- 月历签到：可承载更多活动内容，但需要持续配置、补签与月份边界规则，当前原型不采用。

## 玩家规则

1. 按中国标准时间的自然日计算，每个日期最多领取一次。
2. 漏签不清零、不回退，也没有补签入口；下一次上线继续领取下一格。
3. 一轮共七格。第七格领取完成后，本轮显示完成；下一个有效日期从新一轮第一格继续。
4. 同一天重复点击返回“今日已领取”，不得重复发奖。
5. 客户端日期早于最后领取日期时拒绝领取，防止简单回拨时钟重复发奖。
6. 签到不要求观看广告、分享视频、关注账号或充值。

## 奖励表

| 天数 | 奖励 |
| --- | --- |
| 第 1 次 | 20 齿轮 |
| 第 2 次 | 1 航线徽记 |
| 第 3 次 | 30 齿轮 |
| 第 4 次 | 1 星票 |
| 第 5 次 | 40 齿轮 |
| 第 6 次 | 2 航线徽记 |
| 第 7 次 | 60 齿轮、1 星票 |

每七个活跃签到日合计 150 齿轮、3 航线徽记、2 星票。奖励是确定性的，玩家在点击前可以看到每一格内容。

## 规则模块

新增 `src/domain/retention/DailyCheckInSystem.ts`，保持与引擎、浏览器和存储无关。

```ts
export interface DailyCheckInState {
  readonly version: 1;
  readonly cycleNumber: number;
  readonly cycleClaimCount: number;
  readonly totalClaims: number;
  readonly lastClaimDayId: string | null;
}

export interface DailyCheckInClaimResult {
  readonly accepted: boolean;
  readonly reason?: 'already-claimed' | 'day-not-after-last-claim';
  readonly rewardDay: number;
  readonly completedCycle: boolean;
  readonly reward: DailyCheckInReward;
  readonly state: DailyCheckInState;
}
```

模块导出固定奖励表、初始状态、容错归一化、下一格预览和领取函数。日期格式必须是有效的 `YYYY-MM-DD`。损坏或旧版本存档回退为初始状态；合法存档中的计数必须互相一致，避免伪造负数、越界值或不可能的已领取状态。

当 `cycleClaimCount` 已为 7 时，下一次跨日领取先递增 `cycleNumber` 并从第一格发奖。任何失败结果都返回零奖励和克隆后的原状态。

## Web 展示与数据流

新增纯视图 `web/views/DailyCheckInView.ts`，根据状态和当天日期生成“车站值班簿”面板：

- 标题显示当前轮次、累计签到次数和“漏签不清零”。
- 七个奖励格分别显示已领取、今日可领、后续待领；第七格强化展示。
- 今日已领取时按钮禁用并显示“明日继续”；可领取时按钮显示下一格奖励。
- 在窄屏下七格改为可读的双列/单列布局，不出现横向滚动。

`web/main.ts` 负责读取 `tidal-train-daily-checkin-v1`、调用规则模块、把成功奖励一次性加到玩家存档、记录埋点并重新渲染。清空本地存档时同步删除签到键。原型使用本地存档；正式上线后，服务器必须以账号、服务端中国标准时间和幂等资产流水为准，客户端只提交领取请求。

## 埋点与 Cocos 边界

成功领取记录 `daily_check_in_claimed`，字段为 `cycleNumber`、`rewardDay`、`totalClaims`、三种奖励数量和 `completedCycle`。失败点击不记录资产领取事件。

新增 `assets/scripts/retention/DailyCheckInController.ts`，只发出 `daily-check-in-claim-requested` 请求事件。它不在客户端计算日期或直接发放正式资产，为后续服务端 API 留出清晰边界。

## 错误处理

- 存档 JSON 无法解析：回到初始签到状态，不影响玩家主存档。
- 同日重复领取：显示今日已领取，不改变货币或签到状态。
- 日期回拨：显示设备日期异常，不改变货币或签到状态。
- 资产写入异常：Web 原型的签到状态与货币在同一个同步处理函数中按“先验证、后写入”执行；正式服必须使用单个服务端事务。

## 验证标准

- 规则测试覆盖首次领取、同日幂等、间隔日期继续、第七格完成、下一轮重启、日期回拨、非法日期和损坏存档。
- 视图测试覆盖可领取、已领取、完成一轮后的下一格预览及奖励文案。
- 埋点测试覆盖事件名。
- 浏览器回归覆盖清空存档、领取第一格、货币增加 20、按钮禁用、刷新后保持，以及 390px 移动视口无横向溢出。
- 完整单元测试、TypeScript 类型检查和生产构建全部通过。

## 非目标

本轮不实现补签、连续签到倍率、VIP 加成、广告翻倍、分享奖励、月历活动、服务端 API 或推送提醒。图鉴、成长手册、军团 Boss、好友助战、赛季路线和创作者挑战只进入独立路线图，不与本签到版本耦合。
