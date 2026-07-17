# Train Motion System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为车站、出发转场和 Canvas 战斗增加持续、克制且与战斗状态联动的海洋列车动态，并更新已上线网页版本。

**Architecture:** 用纯 TypeScript `TrainMotionController` 根据固定步长、战斗帧和事件生成一份复用的列车姿态视图；`BattleRenderer` 只消费姿态，绘制航道后掠、尾流、车体、乘员和动力光效。车站使用独立的 DOM/CSS 出发控制器，音频后端维护一个可复用的连续动力音节点，三者都由现有生命周期负责暂停和销毁。

**Tech Stack:** TypeScript 5.7、Canvas 2D、CSS 动画、Web Audio API、Vite 8、Vitest 4、Node 内置模块与 Chrome DevTools Protocol 冒烟测试、GitHub Actions/Pages。

## Global Constraints

- 保留现有现代海洋 Q 版列车与人物美术；不得改成传统车轮列车，不使用大 GIF、序列帧列车、视频或 3D 引擎。
- 列车运动只能影响视觉和音频；不得修改敌人坐标、战斗时钟、伤害、难度、奖励、结算、永久成长或存档语义。
- 普通巡航车体幅度上限：横向 2.2 逻辑像素、纵向 2.8 逻辑像素、滚转 0.55 度；事件冲量合并后也必须限幅。
- 视觉速度目标固定为：普通 1.00、精英 1.08、Boss 1.22、胜利 1.00→0.25/1.4 秒、失败 1.00→0/0.9 秒；车站待机为 0.18。
- 新增列车相关绘制命令上限：高画质 24、中画质 14、低画质 8；低画质每条航道至少保留一个标记并保留两侧基础尾流。
- 控制器固定更新不得创建临时数组、对象或闭包；帧视图在控制器生命周期内复用。
- 新增可选透明 WebP 光效总量不得超过 80 KB；首版优先使用现有列车图和 Canvas/CSS 图元，不下载外部素材。
- 页面隐藏、升级选择、复活层和手动暂停期间不得推进列车表现时钟；恢复时不得补算隐藏时间。
- 开启减少动态效果后，车体摇摆、冲刺和受击偏移为零；保留低速航道流光、护盾变化、动力亮度和结算状态。
- 普通公开 URL 不得暴露 E2E 控制接口。
- 发布前必须通过 `npm test`、`npm run typecheck`、`npm run check:assets`、`npm run build`、`npm run smoke:browser`、`npm audit --audit-level=high` 和 `git diff --check`。

---

## File Structure

- Create `web/battle/TrainMotionTypes.ts`：列车阶段、稳定帧视图和控制器端口。
- Create `web/battle/TrainMotionController.ts`：固定步长速度曲线、基础姿态、事件冲量和降级规则。
- Create `tests/web/battle/TrainMotionController.spec.ts`：确定性、限幅、暂停、阶段和减少动态效果测试。
- Create `web/app/StationDepartureController.ts`：车站蓄能、驶出、取消和按钮锁定生命周期。
- Create `tests/web/StationDepartureController.spec.ts`：DOM 状态、计时器和取消测试。
- Modify `web/battle/BattleTypes.ts`、`web/battle/BattleEngine.ts`：为受击事件增加不影响规则的方向元数据。
- Modify `web/battle/QualityMonitor.ts`：为航道标记和尾流增加画质预算。
- Modify `web/battle/BattleRenderer.ts`：消费列车姿态并绘制完整运动层。
- Modify `web/scenes/BattleScene.ts`：拥有控制器并同步事件、暂停、画质、渲染与音频。
- Modify `web/views/StationHeroView.ts`、`web/styles/scenes.css`、`web/LegacyGameRuntime.ts`：车站待机和出发转场。
- Modify `web/audio/AudioTypes.ts`、`web/audio/AudioBackend.ts`、`web/audio/WebAudioBackend.ts`、`web/audio/AudioManager.ts`、`web/audio/SfxSynth.ts`、`web/battle/BattleSoundPort.ts`：连续动力声与出发音效。
- Modify `web/battle/BattleE2EHooks.ts`、`scripts/smoke-browser.mjs`：只在 URL 门控的测试快照中验证列车动态。
- Modify matching files under `tests/web/**` and `docs/testing/**`：单元、集成、浏览器和人工验收。

---

### Task 1: Deterministic Train Motion Controller

**Files:**
- Create: `web/battle/TrainMotionTypes.ts`
- Create: `web/battle/TrainMotionController.ts`
- Create: `tests/web/battle/TrainMotionController.spec.ts`
- Modify: `web/battle/BattleTypes.ts:181-191`
- Modify: `web/battle/BattleEngine.ts:281-283, 534-580, 599-605, 963-981`
- Test: `tests/web/battle/BattleEngineSkills.spec.ts`

**Interfaces:**
- Consumes: `BattleFrameView`, `BattleEvent`, `QualityLevel`.
- Produces: `TrainMotionControllerPort`, `TrainMotionFrameView`, `TrainMotionPhase`, and `TrainMotionController` for Tasks 2, 3 and 5.

- [ ] **Step 1: Write failing controller tests**

Create `tests/web/battle/TrainMotionController.spec.ts` with deterministic phase, identity, pause, impulse and reduced-motion assertions:

```ts
import { describe, expect, it } from 'vitest';
import { TrainMotionController } from '../../../web/battle/TrainMotionController';
import { createFrameFixture } from './helpers/BattleFixtures';

const step = (controller: TrainMotionController, count: number, patch = {}) => {
  const frame = createFrameFixture(patch);
  for (let index = 0; index < count; index += 1) {
    controller.update(100, frame, []);
  }
};

describe('TrainMotionController', () => {
  it('reuses one view and follows the exact phase speed targets', () => {
    const controller = new TrainMotionController(false, 'high');
    controller.reset(createFrameFixture());
    const stableView = controller.view;
    step(controller, 5, {
      enemies: [{ ...createFrameFixture().enemies[0], kind: 'storm-ray-elite' }],
    });
    expect(controller.view).toBe(stableView);
    expect(controller.view.phase).toBe('elite');
    expect(controller.view.speed).toBeCloseTo(1.08, 2);

    step(controller, 12, { status: 'boss-intro' });
    expect(controller.view.phase).toBe('boss');
    expect(controller.view.speed).toBeCloseTo(1.22, 2);

    step(controller, 14, { status: 'victory' });
    expect(controller.view.speed).toBeCloseTo(0.25, 2);
    step(controller, 9, { status: 'defeat' });
    expect(controller.view.speed).toBeCloseTo(0, 2);
  });

  it('caps and decays recoil, surge and directed damage impulses', () => {
    const controller = new TrainMotionController(false, 'high');
    const frame = createFrameFixture();
    controller.reset(frame);
    controller.update(16.667, frame, [
      { type: 'weapon-fired', projectileId: 1, source: 'main' },
      { type: 'skill-used', skillId: 'extreme-tide' },
      {
        type: 'train-damaged', amount: 12, shieldAbsorbed: 0,
        remainingHp: 76, impactDirectionX: 1,
      },
    ]);
    expect(Math.abs(controller.view.offsetX)).toBeLessThanOrEqual(5.7);
    expect(Math.abs(controller.view.offsetY)).toBeLessThanOrEqual(6.8);
    expect(Math.abs(controller.view.rotation)).toBeLessThanOrEqual(0.02);
    expect(controller.view.cannonRecoil).toBeGreaterThan(0);
    step(controller, 20);
    expect(controller.view.cannonRecoil).toBe(0);
    expect(controller.view.damagePulse).toBe(0);
    expect(controller.view.surge).toBe(0);
  });

  it('freezes while paused and removes body motion in reduced mode', () => {
    const controller = new TrainMotionController(false, 'low');
    controller.reset(createFrameFixture());
    controller.update(100, createFrameFixture(), []);
    const laneOffset = controller.view.laneOffset;
    controller.update(1000, createFrameFixture({ status: 'paused' }), []);
    expect(controller.view.laneOffset).toBe(laneOffset);

    controller.setReducedMotion(true);
    controller.update(100, createFrameFixture(), [{
      type: 'train-damaged', amount: 5, shieldAbsorbed: 0,
      remainingHp: 80, impactDirectionX: -1,
    }]);
    expect(controller.view).toMatchObject({
      offsetX: 0, offsetY: 0, rotation: 0, surge: 0, damagePulse: 0,
    });
    expect(controller.view.speed).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm the missing module failure**

Run: `npx vitest run tests/web/battle/TrainMotionController.spec.ts`

Expected: FAIL because `web/battle/TrainMotionController.ts` does not exist.

- [ ] **Step 3: Add the exact motion types and attack direction metadata**

Create `web/battle/TrainMotionTypes.ts`:

```ts
import type { BattleEvent, BattleFrameView } from './BattleTypes';
import type { QualityLevel } from './QualityMonitor';

export type TrainMotionPhase = 'cruise' | 'elite' | 'boss' | 'victory' | 'defeat';

export interface TrainMotionFrameView {
  readonly phase: TrainMotionPhase;
  readonly motionTimeMs: number;
  readonly speed: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotation: number;
  readonly scale: number;
  readonly cannonRecoil: number;
  readonly surge: number;
  readonly damagePulse: number;
  readonly laneOffset: number;
  readonly wakeStrength: number;
  readonly engineGlow: number;
  readonly windowGlowPhase: number;
  readonly lowPowerPulse: number;
  readonly detailAlpha: number;
}

export interface TrainMotionControllerPort {
  readonly view: TrainMotionFrameView;
  reset(frame: BattleFrameView): void;
  update(stepMs: number, frame: BattleFrameView, events: readonly BattleEvent[]): void;
  setReducedMotion(reducedMotion: boolean): void;
  setQualityLevel(level: QualityLevel): void;
}
```

Extend the `train-damaged` union member in `web/battle/BattleTypes.ts` with `readonly impactDirectionX: -1 | 0 | 1`. Change `BattleEngine.damageTrain` to accept a defaulted direction and pass `enemy.x < 195 ? 1 : enemy.x > 195 ? -1 : 0` from defence-line attacks. Boss pressure, boss charge and `debugDamageTrain` use direction `0`; this changes event metadata only.

- [ ] **Step 4: Implement the controller with stable storage and exact curves**

Create `web/battle/TrainMotionController.ts`. Use one mutable internal object exposed through the readonly interface, derive phase in the order defeat → victory → boss → elite → cruise, and use transition durations `{ cruise: 600, elite: 500, boss: 1200, victory: 1400, defeat: 900 }`. Implement speed interpolation with `easeOutCubic`, advance `laneOffset` by `stepMs * speed * 0.16`, use only deterministic sine waves, and clamp final body pose to the global limits plus bounded event impulse allowances.

The event mapping must be exactly:

```ts
if (event.type === 'weapon-fired' && event.source === 'main') recoil = 1;
if (event.type === 'train-damaged') {
  damagePulse = 1;
  damageDirection = event.impactDirectionX;
}
if (event.type === 'skill-used' && event.skillId === 'tidal-volley') surge = Math.max(surge, 0.35);
if (event.type === 'skill-used' && event.skillId === 'extreme-tide') surge = 1;
```

Decay recoil over 100 ms, damage over 220 ms and surge over 320 ms. Compute low-power pulse only below 30% HP. Set `wakeStrength = speed * (hpRatio < 0.3 ? 0.72 : 1) + surge * 0.35`, clamp `engineGlow = 0.45 + speed * 0.28 + energyRatio * 0.15 - lowPowerPulse * 0.22` to `0..1`, and map quality to `detailAlpha` as high `1`, medium `0.82`, low `0.65`. In reduced-motion mode force body offsets, rotation, scale impulse, recoil, surge and damage pulse to their neutral values while continuing speed, lane phase, engine glow and low-power status.

- [ ] **Step 5: Add an engine metadata regression and run Task 1 tests**

Append to `tests/web/battle/BattleEngineSkills.spec.ts`:

```ts
it('emits visual impact direction without changing damage', () => {
  const engine = new BattleEngine(input);
  const hpBefore = engine.frame.trainHp;
  engine.debugDamageTrain(7);
  expect(engine.frame.trainHp).toBe(hpBefore - 7);
  expect(engine.drainEvents()).toContainEqual(expect.objectContaining({
    type: 'train-damaged', amount: 7, impactDirectionX: 0,
  }));
});
```

Update the existing `train-damaged` fixture in `tests/web/audio/AudioManager.spec.ts` with `impactDirectionX: 0`.

Run: `npx vitest run tests/web/battle/TrainMotionController.spec.ts tests/web/battle/BattleEngineSkills.spec.ts tests/web/audio/AudioManager.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add web/battle/TrainMotionTypes.ts web/battle/TrainMotionController.ts web/battle/BattleTypes.ts web/battle/BattleEngine.ts tests/web/battle/TrainMotionController.spec.ts tests/web/battle/BattleEngineSkills.spec.ts tests/web/audio/AudioManager.spec.ts
git commit -m "feat: add deterministic train motion controller"
```

---

### Task 2: Moving Water Lanes, Wake and Shared Train Pose

**Files:**
- Modify: `web/battle/QualityMonitor.ts`
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `tests/web/battle/helpers/BattleFixtures.ts`
- Modify: `tests/web/battle/BattleRenderer.spec.ts`
- Modify: `tests/web/battle/QualityMonitor.spec.ts`

**Interfaces:**
- Consumes: `TrainMotionFrameView` from Task 1.
- Produces: `BattleRenderInput.trainMotion` and quality-budgeted draw commands consumed by Task 3.

- [ ] **Step 1: Write failing renderer and budget assertions**

Add a `createTrainMotionFixture()` helper returning a complete cruise view to `tests/web/battle/helpers/BattleFixtures.ts`. Extend the fixture input with `readonly trainMotion?: Partial<TrainMotionFrameView>` and return `trainMotion: { ...createTrainMotionFixture(), ...input.trainMotion }`. Add these tests to `BattleRenderer.spec.ts`:

```ts
it('draws moving route markers and a bounded train wake', () => {
  const painter = createRecordingPainter();
  new BattleRenderer(painter).render(createPresentationFixture());
  expect(painter.commands.filter((item) => item.kind === 'travel-marker')).toHaveLength(15);
  expect(painter.commands.filter((item) => item.kind === 'train-wake')).toHaveLength(6);
});

it('applies one base pose to train and all crew anchors', () => {
  const painter = createRecordingPainter();
  new BattleRenderer(painter).render(createPresentationFixture({
    trainMotion: { offsetX: 2, offsetY: -3, rotation: 0.008 },
  }));
  const train = painter.commands.find((item) => item.kind === 'train');
  const captain = painter.commands.find((item) => item.actor === 'captain');
  expect(train).toMatchObject({ x: 197, y: 839, rotation: 0.008 });
  expect(captain).toEqual(expect.objectContaining({ rotation: expect.any(Number) }));
});

it('keeps essential travel motion in the low budget', () => {
  const painter = createRecordingPainter();
  new BattleRenderer(painter).render({
    ...createPresentationFixture(), renderBudget: getRenderBudget('low'),
  });
  expect(painter.commands.filter((item) => item.kind === 'travel-marker')).toHaveLength(3);
  expect(painter.commands.filter((item) => item.kind === 'train-wake')).toHaveLength(2);
});
```

Add budget expectations to `QualityMonitor.spec.ts`: high `travelMarkers: 15/trainWakeSegments: 6`, medium `9/4`, low `3/2`.

- [ ] **Step 2: Run renderer tests and confirm type/assertion failures**

Run: `npx vitest run tests/web/battle/BattleRenderer.spec.ts tests/web/battle/QualityMonitor.spec.ts`

Expected: FAIL because render budgets and `BattleRenderInput.trainMotion` do not exist.

- [ ] **Step 3: Add exact visual budgets**

Extend `RenderBudget` with `travelMarkers` and `trainWakeSegments`. Add values:

```ts
high:   { travelMarkers: 15, trainWakeSegments: 6 }
medium: { travelMarkers: 9,  trainWakeSegments: 4 }
low:    { travelMarkers: 3,  trainWakeSegments: 2 }
```

Keep all existing budget values unchanged.

- [ ] **Step 4: Render the travel field and shared pose**

Add `readonly trainMotion: TrainMotionFrameView` to `BattleRenderInput`. Replace the static lane pulse with deterministic marker placement using `trainMotion.laneOffset`, where perspective progress controls y, width and alpha. Draw exactly `renderBudget.travelMarkers` items distributed round-robin across three lanes, then exactly `renderBudget.trainWakeSegments` alternating left/right behind the train.

Use a train pivot of `(195, 842)` and helpers with numeric parameters:

```ts
const posedX = (x: number, y: number, motion: TrainMotionFrameView) =>
  195 + motion.offsetX + (x - 195) * Math.cos(motion.rotation)
    - (y - 842) * Math.sin(motion.rotation);
const posedY = (x: number, y: number, motion: TrainMotionFrameView) =>
  842 + motion.offsetY + (x - 195) * Math.sin(motion.rotation)
    + (y - 842) * Math.cos(motion.rotation);
```

Apply this pose to train, shield, cannon endpoints, captain base, mechanic, medic, barrier ring and train core. Multiply train width/height by `motion.scale`, add `motion.rotation` to actor-part rotation, and subtract `motion.cannonRecoil` only along the current cannon direction. Replace the allocating train target `[...enemies].filter().sort()` with one loop that selects the largest alive `y`, breaking ties by smallest id.

Draw an engine glow and window-flow highlight using `engineGlow`, `windowGlowPhase`, `lowPowerPulse` and `detailAlpha`; when `frame.shield > 0`, use the approved sea-foam cyan highlight without changing body pose. These count inside the fixed train effect commands and must not add new image assets.

- [ ] **Step 5: Run renderer, quality and type checks**

Run: `npx vitest run tests/web/battle/BattleRenderer.spec.ts tests/web/battle/QualityMonitor.spec.ts`

Run: `npm run typecheck`

Expected: both commands PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add web/battle/QualityMonitor.ts web/battle/BattleRenderer.ts tests/web/battle/helpers/BattleFixtures.ts tests/web/battle/BattleRenderer.spec.ts tests/web/battle/QualityMonitor.spec.ts
git commit -m "feat: animate train travel field and shared pose"
```

---

### Task 3: Battle Lifecycle and Gated Motion Diagnostics

**Files:**
- Modify: `web/scenes/BattleScene.ts`
- Modify: `web/battle/BattleE2EHooks.ts`
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `tests/web/battle/BattleScene.spec.ts`
- Modify: `tests/web/battle/BattleE2EHooks.spec.ts`

**Interfaces:**
- Consumes: `TrainMotionControllerPort` and `BattleRenderInput.trainMotion`.
- Produces: `BattleE2ESnapshot.trainMotion`, available only through the existing `?e2e=1` gate.

- [ ] **Step 1: Write failing BattleScene lifecycle tests**

In `BattleScene.spec.ts`, inject a `TrainMotionControllerPort` fake through a new optional `motion` dependency. Build it as a stable object (using `createTrainMotionFixture()` from the shared fixture file):

```ts
const motion = {
  view: createTrainMotionFixture(),
  reset: vi.fn(),
  update: vi.fn(),
  setReducedMotion: vi.fn(),
  setQualityLevel: vi.fn(),
};
```

Assert:

```ts
expect(motion.reset).toHaveBeenCalledWith(engine.frame);
scheduler.fire(0);
scheduler.fire(17);
expect(motion.update).toHaveBeenCalledWith(
  expect.any(Number), engine.frame, expect.any(Array),
);
expect(renderer.render).toHaveBeenLastCalledWith(
  expect.objectContaining({ trainMotion: motion.view }),
);

const beforePause = motion.view.laneOffset;
scene.pauseForVisibility();
expect(motion.update).not.toHaveBeenCalledWith(1000, expect.anything(), expect.anything());
expect(motion.view.laneOffset).toBe(beforePause);
```

Add assertions that `setReducedMotion(true)` and an adaptive quality change reach the motion port.

- [ ] **Step 2: Run focused tests and confirm dependency/render failures**

Run: `npx vitest run tests/web/battle/BattleScene.spec.ts tests/web/battle/BattleE2EHooks.spec.ts`

Expected: FAIL because `motion` and `trainMotion` snapshot fields do not exist.

- [ ] **Step 3: Own and update one controller in BattleScene**

Add `readonly motion?: TrainMotionControllerPort` to `BattleSceneDependencies`; default to `new TrainMotionController(reducedMotion, qualityMonitor.level)`. On mount call `reset(engine.frame)`. In `updateBattle`, preserve the event batch, call `motion.update(stepMs, engine.frame, events)` after engine update and before effects update. Forward reduced-motion and quality changes. Pass `motion.view` to the renderer.

Do not update the controller from `renderBattle`; this ensures render-rate changes cannot alter deterministic motion. Existing pause paths already stop the fixed loop or set `frame.status` to a frozen status, and the controller must also reject `paused`/`upgrade` updates from Task 1.

- [ ] **Step 4: Add a bounded, URL-gated train snapshot**

Extend `BattleE2ESnapshot`:

```ts
readonly trainMotion: TrainMotionFrameView | null;
```

Add `BattleScene.snapshotTrainMotion()` returning a plain object with only the numeric and phase fields from `motion.view`. In `LegacyGameRuntime.e2eSnapshot`, return this value only when `activeBattleScene` exists; otherwise return `null`. Update `BattleE2EHooks.spec.ts` fixtures and assert that a normal URL still leaves `window.__TIDAL_TRAIN_E2E__` undefined.

- [ ] **Step 5: Run scene and hook tests**

Run: `npx vitest run tests/web/battle/BattleScene.spec.ts tests/web/battle/BattleE2EHooks.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add web/scenes/BattleScene.ts web/battle/BattleE2EHooks.ts web/LegacyGameRuntime.ts tests/web/battle/BattleScene.spec.ts tests/web/battle/BattleE2EHooks.spec.ts
git commit -m "feat: connect train motion to battle lifecycle"
```

---

### Task 4: Station Idle, Charging and Departure Transition

**Files:**
- Create: `web/app/StationDepartureController.ts`
- Create: `tests/web/StationDepartureController.spec.ts`
- Modify: `web/views/StationHeroView.ts`
- Modify: `web/styles/scenes.css`
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `tests/web/StationHeroView.spec.ts`

**Interfaces:**
- Consumes: current scene host, effective reduced-motion setting and a timer scheduler.
- Produces: `beginCharging()`, `playDeparture()`, `cancel()` and `dispose()` used by `startRun`.

- [ ] **Step 1: Write failing departure-controller tests**

Create a fake hero, two start buttons and a manual timer in `tests/web/StationDepartureController.spec.ts`. Assert that `beginCharging()` sets `data-departure-state="charging"`, `aria-busy="true"` and disables both buttons; `playDeparture()` sets `departing` and resolves true after 700 ms; `cancel()` clears the timer, resolves a pending promise false, removes busy state and re-enables buttons; reduced motion uses 80 ms.

- [ ] **Step 2: Run the focused tests and confirm missing module failure**

Run: `npx vitest run tests/web/StationDepartureController.spec.ts tests/web/StationHeroView.spec.ts`

Expected: FAIL because the controller and new motion markup do not exist.

- [ ] **Step 3: Implement the cancel-safe controller**

Create `StationDepartureController` with this public API:

```ts
export interface DepartureTimerScheduler {
  set(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clear(id: ReturnType<typeof setTimeout>): void;
}

export class StationDepartureController {
  constructor(
    host: ParentNode,
    reducedMotion: boolean,
    timer?: DepartureTimerScheduler,
  );
  beginCharging(): boolean;
  playDeparture(): Promise<boolean>;
  cancel(): void;
  dispose(): void;
}
```

Store the current hero, timer id, completion resolver and monotonically increasing token. `cancel()` must always resolve a pending departure promise before clearing references, so route teardown cannot leave `startRun` awaiting forever.

- [ ] **Step 4: Add station motion layers and state CSS**

Add `readonly reducedMotion: boolean` to `StationHeroModel`, render `data-reduced-motion="true|false"`, and add two decorative elements:

```html
<div class="station-hero__wake" data-motion-role="wake" aria-hidden="true"><i></i><i></i><i></i></div>
<span class="station-hero__engine-glow" data-motion-role="engine" aria-hidden="true"></span>
```

Update `StationHeroView.spec.ts` to expect seven `data-motion-role` elements and both new roles.

In `scenes.css`, keep the existing 3.8-second idle float, add low-opacity wake streaks and engine glow, then add exact state animations: 400 ms charging brightness/rearward settle, 700 ms departure with forward translation/scale and stronger wake, and 80 ms opacity-only behavior for `[data-reduced-motion="true"]` and `prefers-reduced-motion: reduce`. No continuous transform may exceed the established idle amplitude before departure.

- [ ] **Step 5: Integrate departure without remounting the station mid-load**

In `startRun`, create the controller before loading assets. Replace the loading-state `render()` call with direct `shell.setNotice(notice)`, call `beginCharging()`, load critical assets, and await `playDeparture()` before changing `phase` to `combat`. On any error call `cancel()` and restore station state and notice without rendering inside `catch`. In `finally`, dispose the controller, clear `battleStartPending`, and render exactly once. Task 4 keeps the existing audio calls unchanged; Task 5 adds the new propulsion cues after their types exist.

Pass `effectiveReducedMotion` into `renderStationHero`. Preserve the existing `battleStartPending` guard and all reward/run initialization order.

- [ ] **Step 6: Run station tests and build**

Run: `npx vitest run tests/web/StationDepartureController.spec.ts tests/web/StationHeroView.spec.ts tests/web/SceneRouter.spec.ts`

Run: `npm run build`

Expected: PASS; the build emits the existing app entry and hashed assets.

- [ ] **Step 7: Commit Task 4**

```bash
git add web/app/StationDepartureController.ts web/views/StationHeroView.ts web/styles/scenes.css web/LegacyGameRuntime.ts tests/web/StationDepartureController.spec.ts tests/web/StationHeroView.spec.ts
git commit -m "feat: animate station departure sequence"
```

---

### Task 5: Continuous Propulsion Audio

**Files:**
- Modify: `web/audio/AudioTypes.ts`
- Modify: `web/audio/AudioBackend.ts`
- Modify: `web/audio/WebAudioBackend.ts`
- Modify: `web/audio/AudioManager.ts`
- Modify: `web/audio/SfxSynth.ts`
- Modify: `web/battle/BattleSoundPort.ts`
- Modify: `web/scenes/BattleScene.ts`
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `tests/web/audio/helpers/RecordingAudioBackend.ts`
- Modify: `tests/web/audio/AudioBackend.spec.ts`
- Modify: `tests/web/audio/AudioManager.spec.ts`
- Modify: `tests/web/audio/SfxSynth.spec.ts`

**Interfaces:**
- Consumes: `TrainMotionFrameView.speed`, `engineGlow`, `lowPowerPulse`.
- Produces: one reusable `train-engine` continuous tone and `train-charge`/`train-depart` cues.

- [ ] **Step 1: Write failing continuous-audio tests**

Add to `AudioBackend.spec.ts`: after unlock, call `setContinuousTone('train-engine', state)` three times and assert only one additional oscillator is created; assert frequency/filter/gain parameters ramp; call with `null` and assert oscillator plus filter/gain disconnect exactly once.

Add to `AudioManager.spec.ts`:

```ts
audio.setTrainMotion({ active: true, speed: 1.22, power: 0.9 });
audio.update(0);
audio.update(60);
audio.update(130);
expect(backend.continuousTones).toHaveLength(2);
expect(backend.continuousTones.at(-1)).toMatchObject({
  id: 'train-engine', instruction: { bus: 'sfx' },
});
```

This proves updates are throttled to at most once per 125 ms and do not create a node per frame.

- [ ] **Step 2: Run audio tests and confirm interface failures**

Run: `npx vitest run tests/web/audio/AudioBackend.spec.ts tests/web/audio/AudioManager.spec.ts tests/web/audio/SfxSynth.spec.ts`

Expected: FAIL because continuous-tone and train cue APIs do not exist.

- [ ] **Step 3: Add continuous-tone backend support**

Add to `AudioTypes.ts`:

```ts
export interface ContinuousToneInstruction {
  readonly bus: AudioBus;
  readonly waveform: OscillatorType;
  readonly frequencyHz: number;
  readonly gain: number;
  readonly filterHz: number;
  readonly rampSeconds: number;
}
```

Add `setContinuousTone(id: string, instruction: ContinuousToneInstruction | null): void` to `AudioBackend`. In `WebAudioBackend`, keep a map of oscillator/filter/gain nodes. The first non-null call creates and starts one oscillator; later calls only cancel/ramp AudioParams. A null call stops and disconnects that entry. `close()` must release every continuous entry before disconnecting buses. Catch Web Audio failures without throwing into gameplay.

- [ ] **Step 4: Map motion to a quiet propulsion bed**

Add to `BattleSoundPort`:

```ts
export interface TrainMotionSoundState {
  readonly active: boolean;
  readonly speed: number;
  readonly power: number;
}
setTrainMotion(state: TrainMotionSoundState): void;
```

In `AudioManager`, retain the latest state and apply it at most every 125 ms from `update(nowMs)`. Clamp inputs and use:

```ts
frequencyHz = 46 + speed * 22;
gain = active ? (0.018 + speed * 0.018) * power : 0;
filterHz = 180 + speed * 220;
rampSeconds = 0.12;
```

The tone uses the `sfx` bus and `triangle` waveform. `close()` removes `train-engine` before closing the backend. Add no-op support to `SILENT_BATTLE_SOUND`.

- [ ] **Step 5: Add departure cues and lifecycle calls**

Add `train-charge` and `train-depart` to `SoundCue`, map them to the `major` group in `SfxSynth`, and define short original recipes: a 110→220 Hz filtered rise for charge and a 90/180/360 Hz 0.18-second arpeggio plus 70 Hz low pulse for departure.

In `LegacyGameRuntime`, set station idle motion `{ active: true, speed: 0.18, power: 0.55 }` when entering a non-battle scene; set charging power to `0.9` at start, play `train-charge`, then set speed `1` and play `train-depart` immediately before the 700 ms departure. On failure return to idle state.

In `BattleScene.renderBattle`, call `sound.setTrainMotion` with `active: true`, `speed: motion.view.speed`, and power derived from `engineGlow` clamped to `0.35..1`. Existing pause/resume suspends/resumes the shared context; do not create a separate scheduler.

- [ ] **Step 6: Run all audio and BattleScene tests**

Run: `npx vitest run tests/web/audio tests/web/battle/BattleScene.spec.ts`

Expected: PASS, including one continuous oscillator across repeated updates.

- [ ] **Step 7: Commit Task 5**

```bash
git add web/audio/AudioTypes.ts web/audio/AudioBackend.ts web/audio/WebAudioBackend.ts web/audio/AudioManager.ts web/audio/SfxSynth.ts web/battle/BattleSoundPort.ts web/scenes/BattleScene.ts web/LegacyGameRuntime.ts tests/web/audio tests/web/battle/BattleScene.spec.ts
git commit -m "feat: add train propulsion audio layer"
```

---

### Task 6: Browser Motion Regression and Playtest Documentation

**Files:**
- Modify: `scripts/smoke-browser.mjs`
- Modify: `docs/testing/prototype-playtest-script.md`
- Modify: `docs/testing/dynamic-battle-performance-checklist.md`
- Modify: `tests/web/battle/BattleE2EHooks.spec.ts`

**Interfaces:**
- Consumes: gated `BattleE2ESnapshot.trainMotion` from Task 3.
- Produces: cloud-runnable proof that travel motion changes, pauses, reaches Boss speed and releases after two battles.

- [ ] **Step 1: Add motion assertions to the real-browser smoke**

After starting a battle, snapshot `trainMotion`, advance 500 ms, and assert that `laneOffset` changed, speed is at least `0.95`, offsets are finite and phase is `cruise` or `elite`. During the existing pause check, snapshot before and after a paused advance and assert exact equality for `motionTimeMs`, `laneOffset`, `offsetX`, `offsetY` and `rotation`.

In the full-battle loop, track `maxTrainSpeed` and `bossMotionSeen`; require `maxTrainSpeed >= 1.18` and a `boss` phase before terminal settlement. After returning to station, assert `trainMotion === null`. Preserve the ordinary-URL assertion that the E2E global is undefined.

- [ ] **Step 2: Run the focused browser smoke locally**

Run: `npm run build`

Run: `npm run smoke:browser`

Expected: PASS at 360×800, 390×844, 412×915 and 430×932; 390×844 completes two full battles; ordinary URL reports no E2E global.

- [ ] **Step 3: Update human playtest and performance checks**

Add a “列车动态” section to `prototype-playtest-script.md` with checks for one-second motion recognition, station charge/departure, shared crew anchoring, cannon/skill/hit response, Boss acceleration, victory/defeat deceleration and reduced-motion behavior.

Add to `dynamic-battle-performance-checklist.md`: record draw-command counts by quality, verify no extra image asset over 80 KB, verify one continuous engine oscillator, and compare frame stability before/after two runs. Do not record a 60 FPS device claim without an identified real device or platform developer tool.

- [ ] **Step 4: Run the complete clean quality gate**

Run in order and stop on first failure:

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
npm run smoke:browser
npm audit --audit-level=high
git diff --check
git status --short
```

Expected: all tests PASS, asset budgets PASS, build PASS, four viewport smoke PASS, audit reports zero high-severity vulnerabilities, diff check prints nothing, and status lists only intended Task 6 files before commit.

- [ ] **Step 5: Commit Task 6**

```bash
git add scripts/smoke-browser.mjs docs/testing/prototype-playtest-script.md docs/testing/dynamic-battle-performance-checklist.md tests/web/battle/BattleE2EHooks.spec.ts
git commit -m "test: verify train motion in chrome smoke"
```

---

### Task 7: Publish and Verify the Updated Web Build

**Files:**
- Verify: `.github/workflows/deploy-pages.yml`
- Verify: generated `dist/**` without committing it unless repository policy changes.

**Interfaces:**
- Consumes: clean, fully tested feature branch.
- Produces: fast-forwarded `main`, successful GitHub Pages workflow and verified public artifact.

- [ ] **Step 1: Confirm release ancestry and clean state**

```powershell
git status --short --branch
git fetch origin
git merge-base --is-ancestor origin/main HEAD
git rev-list --left-right --count origin/main...HEAD
```

Expected: clean working tree, ancestry command exits 0, and the count shows `0` commits behind with only the reviewed feature commits ahead.

- [ ] **Step 2: Push without force and watch CI**

```powershell
git push origin HEAD:main
$runId = gh run list --workflow deploy-pages.yml --limit 1 --json databaseId --jq '.[0].databaseId'
if (-not $runId) { throw 'No deploy-pages workflow run was found' }
gh run watch $runId --exit-status
```

The script reads the newest run ID produced after the push and fails when no run exists. Expected: build, unit/type/asset checks, Chrome smoke, artifact upload and Pages deploy all succeed.

- [ ] **Step 3: Verify the public release artifact**

Open `https://whwebeb65-del.github.io/tidal-train-roguelike/?release=train-motion-v1`, confirm status 200, title `最后一班：潮汐列车`, zero image failures and `typeof window.__TIDAL_TRAIN_E2E__ === 'undefined'`. Compare the public hashed JS/CSS asset names with the successful workflow artifact and verify the train image returns `200 image/webp`.

- [ ] **Step 4: Record final release evidence**

Report the deployed URL, final commit SHA, GitHub Actions run URL, test count, four viewport smoke result, audit result and the remaining platform boundary: real Douyin payments/ads/social services are still mock integrations and are not changed by this visual release.
