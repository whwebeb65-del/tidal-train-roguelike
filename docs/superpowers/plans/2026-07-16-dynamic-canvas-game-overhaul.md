# Dynamic Canvas Game Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有静态点击原型升级为具有五个独立功能界面、自动炮击 Canvas 战斗、2.5D 动画特效、原创程序化音频和移动端性能保护的完整竖切版本。

**Architecture:** 保留 `src/domain/**`、主存档版本 3、运营活动和商业化 Mock 规则；把 1,798 行的 `web/main.ts` 拆成常驻应用外壳、状态服务、场景路由和独立场景。战斗使用确定性的 60 Hz 固定步长引擎，表现层通过只读帧视图和事件队列驱动 Canvas、HTML HUD、特效与音频。

**Tech Stack:** TypeScript、Vite、Vitest、Canvas 2D、Web Audio API、HTML/CSS、Chrome DevTools Protocol、GitHub Actions/Pages。

## Global Constraints

- 视觉必须保持清爽现代海洋 Q 版，不改成黑金重甲、老式页游或高饱和幼儿风。
- 普通攻击必须自动持续运行，玩家只操作三个主动技能和三次肉鸽三选一。
- 单局实际战斗目标为 180–210 秒，含选择与结算保持 3–5 分钟。
- 战斗使用 `requestAnimationFrame`；非战斗功能界面仍保持事件驱动。
- 五个功能入口必须切换到独立界面，不再滚动到同页锚点。
- Canvas 逻辑坐标固定为 `390 × 844`，支持 360、390、412、430 CSS 像素宽度。
- 所有永久货币、首通、重复通关、军团贡献、广告复活和购买只由现有规则层或新的唯一结算适配器发放。
- 同一个 `battleId` 只能结算一次。
- 低画质只能减少视觉对象，不得减少真实怪物、炮弹判定、伤害或奖励。
- 音乐和音效必须原创或程序化生成，不下载或仿制第三方商业音乐。
- 真实支付、广告、登录、分享和多人服务端不在本轮范围内。
- 所有实现阶段必须通过 `npm test`、`npm run typecheck` 和 `npm run build` 后才能进入下一阶段。

---

## 计划拆分与执行顺序

本规格包含五个可以独立验收的子系统，按以下顺序实施：

1. [应用外壳与五场景切换](./2026-07-16-dynamic-game-01-app-shell-scenes.md)
   - 把 Web 代码纳入严格类型检查。
   - 建立持久状态服务、常驻应用外壳和 `SceneRouter`。
   - 将车站、角色、装备、军团、商店拆为独立场景。
   - 保持全部已有按钮、存档、签到、礼包和 Mock 购买可用。

2. [确定性 Canvas 战斗引擎](./2026-07-16-dynamic-game-02-canvas-battle-engine.md)
   - 建立固定种子、固定步长、波次、敌人、自动主炮、技能、强化、精英、Boss、胜负和唯一结算。
   - 只使用测试图形和事件日志，不依赖最终美术和音频。

3. [2.5D 战斗画面、HUD 与击杀特效](./2026-07-16-dynamic-game-03-battle-presentation.md)
   - 接入现有清爽 Q 版角色与列车资源。
   - 增加新敌人竖切资源、Canvas 分层、受击、爆裂、掉落、伤害数字、屏幕震动和三选一暂停层。
   - 将静态战斗页替换为持续运行的 `BattleScene`。

4. [原创音频、设置与生命周期](./2026-07-16-dynamic-game-04-audio-lifecycle.md)
   - 实现海洋电子车站/战斗/Boss 音乐和全部关键音效。
   - 实现首次交互解锁、音乐/音效独立开关、后台暂停和返回继续层。

5. [性能、浏览器回归与重新发布](./2026-07-16-dynamic-game-05-performance-release.md)
   - 对象池、自适应画质、资源预算和两局稳定性。
   - 自动化移动端完整单局回归。
   - 更新试玩文档、CI 和 GitHub Pages。

## 跨计划接口冻结

后续计划只能通过以下接口衔接，避免并行修改时出现命名漂移：

```ts
// web/app/AppTypes.ts
export type SceneId =
  | 'station'
  | 'captain'
  | 'equipment'
  | 'legion'
  | 'store'
  | 'battle';

export type RunMode = 'normal' | 'daily-trial';

export interface StartBattleRequest {
  readonly mode: RunMode;
  readonly mapId: import('../../src/domain/station/MapProgression').MapId;
}
```

```ts
// web/battle/BattleTypes.ts
export type BattleStatus =
  | 'running'
  | 'upgrade'
  | 'boss-intro'
  | 'paused'
  | 'victory'
  | 'defeat';

export type BattleSkillId =
  | 'tidal-volley'
  | 'bubble-barrier'
  | 'extreme-tide';

export interface BattleOutcome {
  readonly battleId: string;
  readonly victory: boolean;
  readonly elapsedMs: number;
  readonly completedWaves: number;
  readonly remainingHp: number;
  readonly kills: number;
  readonly adReviveUsed: boolean;
}
```

```ts
// web/scenes/BattleScene.ts
export interface BattleSettlementPresentation {
  readonly title: string;
  readonly description: string;
  readonly rewards: {
    readonly gears: number;
    readonly routeMarks: number;
    readonly starTickets: number;
  };
  readonly expeditionPoints: number;
  readonly dailyTrialScore: number | null;
  readonly doubleSettlementAvailable: boolean;
  readonly doubled: boolean;
}

export interface BattleSceneCallbacks {
  // 胜利立即结算；失败只在玩家选择放弃后调用 onGiveUp。
  onOutcome(outcome: BattleOutcome): BattleSettlementPresentation;
  onRequestRevive(): Promise<{ accepted: boolean; hpRestored: number }>;
  onRequestUpgradeReroll(): Promise<boolean>;
  onRequestSkillRefresh(): Promise<boolean>;
  onClaimInteraction(actionId: string, attempt: number): boolean;
  onRequestDoubleSettlement(
    outcome: BattleOutcome,
  ): Promise<BattleSettlementPresentation | null>;
  onGiveUp(outcome: BattleOutcome): BattleSettlementPresentation;
  onExit(): void;
}
```

```ts
// web/audio/AudioTypes.ts
export type MusicCue =
  | 'station'
  | 'battle'
  | 'boss'
  | 'victory'
  | 'defeat'
  | 'silent';

export type SoundCue =
  | 'ui-tap'
  | 'scene-open'
  | 'cannon'
  | 'companion-cannon'
  | 'hit'
  | 'critical-hit'
  | 'armour-break'
  | 'shield-hit'
  | 'enemy-pop'
  | 'elite-down'
  | 'boss-alarm'
  | 'boss-charge'
  | 'boss-down'
  | 'loot'
  | 'upgrade-open'
  | 'upgrade-select'
  | 'skill-volley'
  | 'skill-barrier'
  | 'skill-extreme'
  | 'skill-refresh'
  | 'revive'
  | 'victory'
  | 'defeat';
```

## 最终门禁

```powershell
npm ci
npm test
npm run typecheck
npm run check:assets
npm run build
npm run smoke:browser
npm audit --audit-level=high
git diff --check
```

预期：

- 所有命令退出码为 0。
- 完整单局自动回归能看到自动炮击、三次升级、精英、Boss、结算和返回车站。
- 360、390、412、430 宽度无横向溢出。
- 公开站点资源、声音开关、暂停恢复和图片加载无未捕获异常。
