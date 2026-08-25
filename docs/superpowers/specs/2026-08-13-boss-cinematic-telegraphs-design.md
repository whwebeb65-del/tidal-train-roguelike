# Boss 电影化预兆设计

## 目标

让“深海回响”Boss 的三个阶段在不读长文本、不盯数值的情况下也能一眼辨认，并让玩家在攻击发生前看懂节奏、危险方向和弱点窗口。本轮只增强 Canvas 战场演出、既有阶段提示文案和可访问性；不改变 Boss 血量、伤害、阶段阈值、阶段时长、召唤频率、弱点倍率、奖励、存档、广告或付费规则。

## 方案选择

本轮比较三个方向：

1. **新增 Boss 指挥 HUD**：信息最直接，但会继续占用移动端空间，形成用户不喜欢的机械面板和方框。
2. **全屏阶段过场**：冲击力强，但频繁打断手动瞄准与技能操作，十分钟单局里会显得拖沓。
3. **战场内世界预兆**：把召唤、断潮和潮眼状态直接画在水流、航道与 Boss 身上，现有 HUD 只保留生命与操作。

采用第三种。表现必须像战场的一部分，而不是覆盖在战场上的信息表。所有几何均由现有 `EnemyBehaviourState` 和既有 Boss 事件派生，不新增规则状态或业务计时器。

## 玩家体验

### 回响集结：召唤阶段

- Boss 周围出现三个错位的“回声浮标”，用双环与短波纹表现援军正在汇聚。
- `phaseRemainingMs / phaseDurationMs` 只决定浮标中心的规则收束程度；普通模式允许缓慢呼吸和波纹偏移，减少动态模式冻结呼吸但保留规则收束。
- 高／中／低画质分别使用三／二／一道附加回声波，但三枚主浮标在所有画质都保留。
- `boss-intro-ended` 事件驱动召唤阶段入场短呼号“船长：回响集结 · 留意援军”；`boss-phase-changed` 仅驱动断潮与狂暴阶段切入短呼号。

### 断潮航道：潮汐阶段

- 现有整条粗红／绿竖线改为有方向感的水流带：安全航道使用薄荷青编织流线，危险航道使用珊瑚红断裂流线。
- 安全航道始终保留稳定主线；仅在 `EffectSystem` 消费既有 `boss-tide-warning` 事件后的真实 1200ms 预警窗口内，四道节拍刻度依次点亮，最后一道点亮即对应现有潮汐冲击。
- 普通模式的箭羽沿航道缓慢前进；减少动态模式冻结箭羽位置，只让随规则状态变化的节拍数量更新。
- 三条航道演出最大逻辑 Y 坐标不超过 `610`，不进入底部技能按钮保护区。
- 预警短呼号为“船长：绿色潮线是安全航道”。

### 狂暴潮眼：弱点阶段

- Boss 潮眼在关闭时显示紫蓝色四瓣闭合准星，在开启时显示金黄／珊瑚双色展开准星；玩家不需要靠文字判断能否精准命中。
- 准星外围四道窗口刻度由现有 `phaseRemainingMs` 派生，展示当前开／闭窗口所处节拍。
- 弱点开启时保留既有 `boss-weakpoint` 可命中圆；关闭时只显示视觉准星，不改变碰撞或伤害判定。
- 狂暴阶段增加局限在 Boss 周围的深蓝潮压光晕，不做全屏红闪，不遮挡敌人血条。
- 阶段切入短呼号为“船长：潮眼暴露 · 集中火力”。

## 架构

### 纯语义模型

新增 `web/battle/BossTelegraph.ts`，只把权威敌人状态映射为冻结的表现视图，不绘图、不持有时间：

```ts
export type BossTelegraphPhase = 'summon' | 'tide' | 'enraged';

export interface BossTelegraphView {
  readonly phase: BossTelegraphPhase;
  readonly detail: 1 | 2 | 3;
  readonly progress: number;
  readonly motionPhase: number;
  readonly safeLane: 0 | 1 | 2;
  readonly tideWarning: boolean;
  readonly weakPointOpen: boolean;
}

export function createBossTelegraphView(input: {
  readonly enemy: EnemyState;
  readonly timeMs: number;
  readonly reducedMotion: boolean;
  readonly backgroundLayers: RenderBudget['backgroundLayers'];
  readonly bossTideWarningActive: boolean;
}): BossTelegraphView | null;
```

- 非存活敌人、非 `deep-echo-boss` 或无行为状态返回 `null`。
- `boss-summon`、`boss-tide`、`boss-enraged` 分别映射为 `summon`、`tide`、`enraged`。
- `EnemyBehaviourState.phaseDurationMs` 记录产生当前 `phaseRemainingMs` 的权威阶段时长；进度由两者归一化并限制在 `0..1`，无重复表现常量。
- `tideWarning` 仅在 `boss-tide` 且 `bossTideWarningActive` 为真时成立；该只读信号只能由 `EffectSystem` 消费既有 `boss-tide-warning` 事件激活、随 `update` 递减并在 `reset` 清除。
- `motionPhase` 在减少动态时恒为 `0`；普通模式只由 `timeMs` 计算，不使用随机数。
- `backgroundLayers` 为 4／3／2 时，`detail` 分别为 3／2／1。

### 渲染器

`BattleRenderer.drawEnemyBehaviour` 获取语义模型，并调用三个小型私有绘制方法：

- `drawBossSummonTelegraph`：稳定命令名 `boss-summon-beacon`、`boss-summon-echo`；
- `drawBossTideTelegraph`：保留兼容命令名 `boss-safe-lane`、`boss-danger-lane`，新增 `boss-current-chevron`、`boss-tide-countdown`；
- `drawBossEnragedTelegraph`：保留 `boss-weakpoint`，新增 `boss-weakpoint-petal`、`boss-weakpoint-countdown`、`boss-enraged-aura`。

所有几何使用 `line` 与 `ellipse` 命令，不新增位图资源、逐帧 DOM 或 Canvas 自定义路径接口。命令保持确定性、非零边界和稳定颜色，便于 `RecordingPainter` 与像素测试取证。

### 阶段呼号

`EffectSystem` 继续消费既有 `boss-intro-ended`、`boss-phase-changed` 与 `boss-tide-warning` 事件，不新增事件。`boss-intro-ended` 事件驱动召唤阶段入场短呼号；`boss-phase-changed` 仅驱动断潮与狂暴阶段切入短呼号。它在帧视图中公开只读的真实预警信号并更新短呼号文案；`BattleRenderer.drawCinematicOverlay` 对以“船长：”开头的短呼号增加两道不闭合的手绘浪线和一个小结绳标记，命令名为 `boss-callout-stroke` 与 `boss-callout-knot`。不增加矩形底板，不改变标题存活时间。

## 画质、性能与减少动态

- 高／中／低画质每帧新增 Boss 命令上限分别为 32／24／18；三种画质均保留阶段主轮廓、危险／安全语义和潮眼开闭状态。
- 不创建新对象池、不修改 `RenderBudget` 接口、不新增图片或音频资源。
- 普通模式只使用 `timeMs` 产生有限的呼吸、箭羽偏移与准星开合视觉；不把动画值写回引擎。
- 减少动态模式下，真实断潮预警不生成移动粒子或扩散／衰减圆环；静态世界预兆和船长呼号保留。不得出现由 `timeMs` 引起的命令位置、旋转、alpha 或尺寸变化；同一权威行为状态在相隔任意时间的两帧必须得到完全相同的完整 Boss 表现命令。
- 画质与减少动态设置不得改变敌人状态、事件、命中、奖励和结算。

## 失败与恢复

- 异常、非有限或非正数 `phaseDurationMs` 归一化为安全的 `0` 进度；异常 `phaseRemainingMs` 也不抛错、不影响战斗。
- Boss 死亡或离开帧后语义模型立即返回 `null`，下一帧不再绘制预兆。
- 位图加载失败时本轮纯 Canvas 预兆仍完整显示。
- 场景卸载与重开不保存任何预兆状态，因此不会把上一局阶段带入下一局。

## 验证

### 单元与渲染命令

- 纯模型覆盖非 Boss、死亡 Boss、三个阶段、归一化边界、三个画质层级和减少动态确定性。
- 三阶段均产生各自独有命令；安全航道恰一条、危险航道恰两条；潮眼开／闭颜色和命令结构不同。
- 断潮全部命令最大 Y 不超过 `610`；Boss 名称与生命条仍在预兆之后可见。
- 高／中／低画质命令数量分别不超过 32／24／18，且主语义命令不被裁掉。
- 减少动态相隔 5000ms 的两帧 Boss 预兆命令深度相等；普通模式至少一种装饰命令发生位移。
- 阶段呼号复用既有事件与 1400ms／预警时长，船长手绘标记只对“船长：”标题出现。

### 像素证据

- 新增确定性像素证据覆盖回声浮标、断潮安全／危险双色流线、潮眼开启、潮眼关闭和减少动态静态形态。
- 每个样本必须在预期局部区域出现对应颜色的正 alpha 像素，并拒绝占据样本区域 35% 以上的实心矩形冒充。
- 透明命令和错误颜色不得通过证据门禁。

### 真实 Chrome

- 现有 390×844 完整战斗记录 `boss-summon`、`boss-tide`、`boss-enraged` 三个权威行为阶段；每阶段首次出现时截图一次，并验证 Canvas、HUD 与三个技能按钮仍可见可点。
- 记录断潮阶段时必须至少观察一次 `tideWarning=true`；狂暴阶段必须同时观察弱点开启与关闭两种状态。
- 真实阶段截图与权威 `battle.enemies[].behaviour` 绑定，不使用直接改写 Boss 阶段的 E2E 后门。
- 390×844 两局仍必须为 `victory/victory`；360／412／430 的既有简短战斗、普通 URL 无 E2E 全局、44×44 控件、资源预算与经济隔离继续通过。

## 本轮边界

不新增 Boss、敌人、技能、攻击类型、奖励、货币、存档字段、图标、声音或付费内容；不改变任何战斗数值与阶段逻辑；不重做全局 HUD、技能按钮、车站页面或结算页。后续若增加 Boss 专属音效或新的 Boss 技能，必须单独设计并重新评估移动端混音与规则平衡。
