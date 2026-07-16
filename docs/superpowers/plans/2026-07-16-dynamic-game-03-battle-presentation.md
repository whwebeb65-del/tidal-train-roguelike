# Dynamic Game 03 Battle Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把计划 02 的确定性战斗引擎接成可直接游玩的竖屏 Canvas 战斗，完成清爽海洋 Q 版的角色、列车、怪潮、自动炮击、2.5D 动作、击杀特效、HTML HUD、升级层、失败复活和结算切换。

**Architecture:** `BattleScene` 只管理浏览器帧循环和生命周期；`BattleRenderer` 读取 `BattleFrameView` 并通过抽象绘制接口输出 Canvas；`EffectSystem` 消费一次性 `BattleEvent`，管理视觉粒子、伤害数字和镜头反馈；`BattleHUD` 只做 HTML 差量更新与命令转发。所有永久奖励仍由 `GameApp` 和唯一结算适配器处理。

**Tech Stack:** TypeScript、Vitest、Canvas 2D、HTML/CSS、现有 Q 版美术、ImageGen 生成的原创敌人素材。

## Global Constraints

- 保持现有清爽现代海洋 Q 版，不转为暗黑重甲、黑金页游、幼儿绘本或高饱和塑料风。
- Canvas 逻辑坐标固定为 `390 × 844`；浏览器尺寸变化只能改变缩放，不得重置战斗。
- 列车固定在底部，列车长、机械师和水母医师必须站在列车上持续运动。
- 普通攻击自动持续运行；页面中不得再出现“自动开炮”点击键、`debug-hit` 或“模拟受击”。
- 画面只能读取 `BattleFrameView`，不能直接修改敌人生命、货币、奖励、皮肤或装备。
- 击杀掉落动画不能直接修改永久钱包；正式发奖只在 `BattleOutcome` 结算一次。
- 图片失败时使用程序化剪影占位，不能让战斗白屏或卡死。
- 本计划结束时允许声音为空实现；计划 04 再接入真正音频。

---

## 目标文件结构

```text
web/
├─ assets/
│  ├─ ChibiArtCatalog.ts
│  ├─ BattleArtCatalog.ts
│  └─ chibi/
│     ├─ battle-ocean-bg.png
│     ├─ needle-jelly-enemy.png
│     └─ storm-ray-elite.png
├─ battle/
│  ├─ AssetLoader.ts
│  ├─ BattleDrawTypes.ts
│  ├─ CanvasViewport.ts
│  ├─ LayeredSpriteRig.ts
│  ├─ BattleRenderer.ts
│  ├─ CanvasPainter.ts
│  ├─ EffectSystem.ts
│  ├─ BattleInteractionSchedule.ts
│  ├─ BattleHudModel.ts
│  ├─ BattleHUD.ts
│  ├─ FixedStepLoop.ts
│  └─ BattleSoundPort.ts
├─ scenes/
│  └─ BattleScene.ts
└─ styles/
   ├─ battle-canvas.css
   └─ battle-hud.css
tests/web/battle/
├─ AssetLoader.spec.ts
├─ CanvasViewport.spec.ts
├─ LayeredSpriteRig.spec.ts
├─ BattleRenderer.spec.ts
├─ EffectSystem.spec.ts
├─ BattleInteractionSchedule.spec.ts
├─ BattleHUD.spec.ts
├─ FixedStepLoop.spec.ts
├─ BattleScene.spec.ts
└─ helpers/
   ├─ BattleFixtures.ts
   └─ RecordingPainter.ts
```

## Task 1: 建立战斗美术目录和可降级资源加载器

**Files:**

- Create: `web/assets/BattleArtCatalog.ts`
- Create: `web/battle/AssetLoader.ts`
- Create: `tests/web/battle/AssetLoader.spec.ts`
- Modify: `web/assets/ChibiArtCatalog.ts`

**Interfaces:**

- `BattleArtId`
- `BATTLE_ART_URLS`
- `BattleAssetLoader.loadAll(): Promise<BattleAssetSet>`
- `BattleAssetSet.get(id): CanvasImageSource | null`

- [ ] **Step 1: 写资源加载失败测试**

```ts
// tests/web/battle/AssetLoader.spec.ts
import { describe, expect, it } from 'vitest';
import {
  BattleAssetLoader,
  type BattleImageFactory,
} from '../../../web/battle/AssetLoader';

describe('BattleAssetLoader', () => {
  it('keeps successful images and records failed ids without rejecting the run', async () => {
    const factory: BattleImageFactory = async (url) => {
      if (url.includes('missing')) throw new Error('decode failed');
      return { url } as unknown as CanvasImageSource;
    };
    const loader = new BattleAssetLoader({
      background: '/ok.png',
      enemy: '/missing.png',
    }, factory);

    const assets = await loader.loadAll();

    expect(assets.get('background')).not.toBeNull();
    expect(assets.get('enemy')).toBeNull();
    expect(assets.failedIds).toEqual(['enemy']);
  });
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
npm test -- tests/web/battle/AssetLoader.spec.ts
```

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 定义美术目录**

```ts
// web/assets/BattleArtCatalog.ts
import { CHIBI_ART } from './ChibiArtCatalog';

export const BATTLE_ART_URLS = {
  background: new URL('./chibi/battle-ocean-bg.png', import.meta.url).href,
  train: CHIBI_ART.train,
  captainFemaleBase: CHIBI_ART.captains['captain-tide-female']['skin-tide-base'],
  captainFemaleSeafoam: CHIBI_ART.captains['captain-tide-female']['skin-seafoam-departure'],
  captainFemaleAurora: CHIBI_ART.captains['captain-tide-female']['skin-aurora-whale-song'],
  captainMaleBase: CHIBI_ART.captains['captain-tide-male']['skin-tide-base'],
  captainMaleSeafoam: CHIBI_ART.captains['captain-tide-male']['skin-seafoam-departure'],
  captainMaleAurora: CHIBI_ART.captains['captain-tide-male']['skin-aurora-whale-song'],
  otter: CHIBI_ART.otter,
  jellyMedic: CHIBI_ART.jellyfish,
  bubbleFin: CHIBI_ART.pufferDragon,
  needleJelly: new URL('./chibi/needle-jelly-enemy.png', import.meta.url).href,
  reefCrab: CHIBI_ART.crystalCrab,
  stormRayElite: new URL('./chibi/storm-ray-elite.png', import.meta.url).href,
  deepEchoBoss: CHIBI_ART.tidalBoss,
} as const;

export type BattleArtId = keyof typeof BATTLE_ART_URLS;
```

- [ ] **Step 4: 实现资源加载与浏览器工厂**

`AssetLoader.ts` 必须：

- 逐个加载，不使用 `Promise.all` 的整体失败语义。
- `Image.decode()` 可用时优先调用；不可用时等待 `load/error`。
- 保存成功图片和失败 ID。
- `get(id)` 对失败资源返回 `null`，由绘制层画剪影。
- `loadAll()` 可重复调用，但同一 URL 只创建一次图片。

核心类型：

```ts
export type BattleImageFactory = (
  url: string,
) => Promise<CanvasImageSource>;

export interface BattleAssetSet<Id extends string = string> {
  readonly failedIds: readonly Id[];
  get(id: Id): CanvasImageSource | null;
}
```

- [ ] **Step 5: 使用 ImageGen 生成三张原创素材**

执行本步骤时必须使用 `imagegen` 技能，并明确告诉用户该技能正在生成原创战斗素材。不得下载、临摹或复用商业游戏资产。

固定提示要求：

1. `battle-ocean-bg.png`
   - 竖屏 9:19.5 开阔海面战场；
   - 三条自然水流航道从远处汇向底部；
   - 珍珠白、海沫绿、青蓝，少量珊瑚橙；
   - 无文字、无 UI、无角色、无列车；
   - 中景留白，适合怪物和炮弹覆盖。
2. `needle-jelly-enemy.png`
   - 透明背景；
   - Q 版针潮水母，年轻现代海洋机械生物；
   - 细长、灵活、轮廓与泡泡鳍兽明显不同；
   - 正面略向下俯冲，不能恐怖写实。
3. `storm-ray-elite.png`
   - 透明背景；
   - Q 版雷鳐督军，宽翼、发光电流、精英感；
   - 海蓝与紫青电光，少量珊瑚警示色；
   - 不使用黑金重甲或页游盔甲。

生成后逐张视觉检查：

- 透明素材不得带棋盘格或文字水印。
- 外轮廓在 72–160 逻辑像素尺寸仍然可辨认。
- 风格必须能与现有列车长、刺豚、螃蟹和 Boss 同屏。
- 若生成输出不是 PNG，可保留工具原始无损格式并同步修改目录；不要为了格式转换引入不可用依赖。

- [ ] **Step 6: 验证和提交**

```powershell
npm test -- tests/web/battle/AssetLoader.spec.ts
npm run typecheck
npm run check:assets
git add web/assets web/battle/AssetLoader.ts tests/web/battle/AssetLoader.spec.ts
git commit -m "feat: add resilient battle art loading"
```

## Task 2: 实现逻辑坐标、DPR 和屏幕适配

**Files:**

- Create: `web/battle/CanvasViewport.ts`
- Create: `tests/web/battle/CanvasViewport.spec.ts`

**Interfaces:**

- `computeCanvasViewport(input): CanvasViewport`
- `resizeCanvas(canvas, viewport): void`
- `CanvasViewport.toLogical(clientX, clientY)`

- [ ] **Step 1: 写四档尺寸失败测试**

```ts
// tests/web/battle/CanvasViewport.spec.ts
import { describe, expect, it } from 'vitest';
import { computeCanvasViewport } from '../../../web/battle/CanvasViewport';

describe('computeCanvasViewport', () => {
  it.each([
    [360, 800],
    [390, 844],
    [412, 915],
    [430, 932],
  ])('fits %d x %d without cropping logical content', (width, height) => {
    const view = computeCanvasViewport({
      cssWidth: width,
      cssHeight: height,
      devicePixelRatio: 3,
      maxDevicePixelRatio: 2,
    });

    expect(view.logicalWidth).toBe(390);
    expect(view.logicalHeight).toBe(844);
    expect(view.pixelRatio).toBe(2);
    expect(view.contentWidth).toBeLessThanOrEqual(width);
    expect(view.contentHeight).toBeLessThanOrEqual(height);
    expect(view.offsetX).toBeGreaterThanOrEqual(0);
    expect(view.offsetY).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: 实现视口**

计算规则：

```ts
const scale = Math.min(cssWidth / 390, cssHeight / 844);
const contentWidth = 390 * scale;
const contentHeight = 844 * scale;
const offsetX = (cssWidth - contentWidth) / 2;
const offsetY = (cssHeight - contentHeight) / 2;
const pixelRatio = Math.min(devicePixelRatio, maxDevicePixelRatio);
```

`resizeCanvas` 只在像素尺寸变化时写 `canvas.width/height`，避免每帧清空 Canvas。`toLogical` 必须扣除偏移再除以缩放，并把结果限制到逻辑边界。

- [ ] **Step 3: 验证和提交**

```powershell
npm test -- tests/web/battle/CanvasViewport.spec.ts
npm run typecheck
git add web/battle/CanvasViewport.ts tests/web/battle/CanvasViewport.spec.ts
git commit -m "feat: add responsive battle canvas viewport"
```

## Task 3: 建立 2.5D 分层角色和 Canvas 绘制管线

**Files:**

- Create: `web/battle/BattleDrawTypes.ts`
- Create: `web/battle/LayeredSpriteRig.ts`
- Create: `web/battle/CanvasPainter.ts`
- Create: `web/battle/BattleRenderer.ts`
- Create: `tests/web/battle/LayeredSpriteRig.spec.ts`
- Create: `tests/web/battle/BattleRenderer.spec.ts`
- Create: `tests/web/battle/helpers/BattleFixtures.ts`
- Create: `tests/web/battle/helpers/RecordingPainter.ts`

**Interfaces:**

- `BattlePainter`
- `LayeredSpriteRig.pose(timeMs, state): readonly SpritePartPose[]`
- `BattleRenderer.render(input): void`

- [ ] **Step 1: 写分层动作测试**

```ts
// tests/web/battle/LayeredSpriteRig.spec.ts
import { describe, expect, it } from 'vitest';
import { createCaptainRig } from '../../../web/battle/LayeredSpriteRig';

describe('captain layered rig', () => {
  it('keeps the body anchored while head, scarf and arm animate independently', () => {
    const rig = createCaptainRig();
    const idle = rig.pose(0, { action: 'idle', hitPulse: 0 });
    const later = rig.pose(500, { action: 'cast', hitPulse: 0 });

    expect(idle.map((part) => part.id)).toEqual([
      'body',
      'head',
      'arm',
      'scarf',
      'glow',
    ]);
    expect(later.find((part) => part.id === 'body')?.anchorY).toBe(
      idle.find((part) => part.id === 'body')?.anchorY,
    );
    expect(later.find((part) => part.id === 'arm')?.rotation).not.toBe(
      idle.find((part) => part.id === 'arm')?.rotation,
    );
  });
});
```

- [ ] **Step 2: 定义抽象绘制接口**

`BattlePainter` 使用语义化绘制方法，测试使用记录器，生产实现才接触 `CanvasRenderingContext2D`：

```ts
export interface BattlePainter {
  begin(viewport: CanvasViewport, camera: CameraPose): void;
  clear(color: string): void;
  image(command: ImageDrawCommand): void;
  ellipse(command: EllipseDrawCommand): void;
  line(command: LineDrawCommand): void;
  text(command: TextDrawCommand): void;
  end(): void;
}
```

每个命令包含 `layer`。固定层序：

1. background
2. water-lanes
3. loot-behind
4. enemies
5. projectiles
6. train
7. captain-and-companions
8. front-effects
9. damage-numbers
10. cinematic-overlay

- [ ] **Step 3: 实现分层角色**

由于现有角色素材不是骨骼图集，首版使用“归一化裁片 + 程序化附加层”：

- 身体：原图下 58%，固定脚点。
- 头部：原图上 52%，呼吸时上下 1.5–2.5px。
- 手臂：从原图右侧裁片绘制，指挥/技能时旋转 8–16°。
- 围巾：Canvas 贝塞尔带状层，随时间摆动。
- 发光层：技能时绘制低透明椭圆和短寿命光环。
- 机械师：主体轻微起伏，副炮发射时手臂与炮口同时后坐。
- 水母医师：正弦漂浮；屏障期间上升 12px 并展开光环。
- 列车：整图作为主体，另绘制主炮、副炮、动力核心和护盾层。

所有裁片比例集中写在 `LayeredSpriteRig.ts`，不得散落到 `BattleRenderer`。

- [ ] **Step 4: 写渲染顺序失败测试**

```ts
// tests/web/battle/BattleRenderer.spec.ts
import { describe, expect, it } from 'vitest';
import { createRecordingPainter } from './helpers/RecordingPainter';
import {
  byBattleLayer,
  createPresentationFixture,
} from './helpers/BattleFixtures';
import { BattleRenderer } from '../../../web/battle/BattleRenderer';

describe('BattleRenderer', () => {
  it('draws a moving battlefield in stable layer order and falls back for failed art', () => {
    const painter = createRecordingPainter();
    const renderer = new BattleRenderer(painter);

    renderer.render(createPresentationFixture({
      failedArtIds: ['needleJelly'],
    }));

    expect(painter.layers()).toEqual([...painter.layers()].sort(byBattleLayer));
    expect(painter.commands).toContainEqual(
      expect.objectContaining({ kind: 'fallback-silhouette', enemyKind: 'needle-jelly' }),
    );
    expect(painter.commands).toContainEqual(
      expect.objectContaining({ kind: 'sprite-part', actor: 'captain' }),
    );
  });
});
```

`BattleFixtures.ts` 导出：

- `createFrameFixture(patch?)`：返回完整、可覆写的 `BattleFrameView`。
- `createPresentationFixture(patch?)`：组装 frame、assets、viewport、角色皮肤和空效果视图。
- `byBattleLayer(left, right)`：使用 `BattleDrawTypes.ts` 的固定层序比较。

`RecordingPainter.ts` 实现完整 `BattlePainter` 并保存语义命令，不使用真实 DOM 或原生 Canvas。

- [ ] **Step 5: 实现战场绘制**

`BattleRenderer.render` 必须完成：

- 背景海面轻微纵向漂移和三条水流航道。
- 每种敌人按 `EnemyState` 的位置、生命比例、破甲和护盾状态绘制。
- 炮弹按 source 区分主炮、齐射和弹射轨迹。
- 掉落物先散开再吸向列车。
- 列车位于防线下方，主炮朝当前最近目标旋转。
- 当前列车长皮肤、机械师和水母医师站在车顶。
- `boss-intro` 时海面压暗、顶部标题进入、Boss 下沉入场。
- 资源失败时绘制同色系剪影、眼睛和发光轮廓。
- `prefers-reduced-motion` 由输入标记控制，不在渲染器里直接读取媒体查询。

- [ ] **Step 6: 实现 CanvasPainter**

`CanvasPainter` 必须：

- 每帧设置一次逻辑坐标变换。
- 使用 `save/restore` 隔离旋转、透明度和混合模式。
- 所有图片都使用中心/脚点锚定，不在调用处重复计算。
- 默认关闭图像平滑仅限像素素材；当前 Q 版插画保持平滑。
- 对未知或损坏尺寸拒绝 `drawImage`，改画剪影。

- [ ] **Step 7: 验证和提交**

```powershell
npm test -- tests/web/battle/LayeredSpriteRig.spec.ts tests/web/battle/BattleRenderer.spec.ts
npm run typecheck
npm run build
git add web/battle tests/web/battle
git commit -m "feat: render layered chibi canvas combat"
```

## Task 4: 实现命中、击杀、掉落、伤害数字和镜头反馈

**Files:**

- Create: `web/battle/EffectSystem.ts`
- Create: `tests/web/battle/EffectSystem.spec.ts`
- Modify: `web/battle/BattleRenderer.ts`

**Interfaces:**

- `EffectSystem.consume(events, frame): void`
- `EffectSystem.update(deltaMs): void`
- `EffectSystem.view: EffectFrameView`
- `EffectSystem.reset(): void`

- [ ] **Step 1: 写效果生命周期测试**

```ts
// tests/web/battle/EffectSystem.spec.ts
import { describe, expect, it } from 'vitest';
import { EffectSystem } from '../../../web/battle/EffectSystem';
import { createFrameFixture } from './helpers/BattleFixtures';

describe('EffectSystem', () => {
  it('creates hit, kill, loot and merged camera feedback with bounded counts', () => {
    const effects = new EffectSystem({
      particleLimit: 200,
      damageNumberLimit: 18,
      reducedMotion: false,
    });

    effects.consume([
      { type: 'projectile-hit', enemyId: 1, damage: 50, critical: true, source: 'main' },
      { type: 'enemy-killed', enemyId: 1, kind: 'bubble-fin', x: 100, y: 120 },
      { type: 'loot-created', lootId: 1, kind: 'experience' },
      { type: 'skill-used', skillId: 'extreme-tide' },
    ], createFrameFixture());

    expect(effects.view.particles.length).toBeGreaterThanOrEqual(6);
    expect(effects.view.damageNumbers).toHaveLength(1);
    expect(effects.view.camera.amplitude).toBeLessThanOrEqual(6);

    effects.update(1000);
    expect(effects.view.damageNumbers).toHaveLength(0);
    expect(effects.view.particles.length).toBeLessThanOrEqual(200);
  });
});
```

- [ ] **Step 2: 实现事件到特效映射**

固定映射：

- `weapon-fired`：炮口闪光、80–110ms 后坐。
- `projectile-hit`：小水花、命中环、70–100ms 压缩；暴击/齐射/极潮才显示数字。
- `enemy-armour-broken`：珊瑚甲片 8 个、白蓝闪光。
- `enemy-killed`：60ms 白闪、120–180ms 膨胀缩小、6–12 个碎片、冲击环。
- `loot-created/collected`：晶体散开、吸附尾迹和列车核心脉冲。
- `skill-used`：技能专属光效；极潮增加 4–6px、180ms 震动。
- `elite-entered`：警示条和 3px 轻震。
- `boss-intro-started`：暗场、警报环和标题。
- `battle-won`：Boss 时 500ms 视觉慢动作，不修改引擎时间。

镜头震动在 120ms 合并窗口取最大值而不是累加。`reducedMotion` 时振幅始终为 0，保留颜色和透明度反馈。

- [ ] **Step 3: 限制视觉对象**

高画质默认：

- 200 粒子。
- 18 伤害数字。
- 24 冲击环/闪光。

超限时先丢弃最旧且最低优先级的普通命中特效；不得影响引擎的真实炮弹、敌人、伤害或掉落结算。

- [ ] **Step 4: 接入绘制层**

`BattleRenderer.render` 新增 `effects: EffectFrameView` 输入，并在固定层绘制：

- 背景粒子在敌人之后。
- 命中/死亡碎片在怪物之前或之后按类型区分。
- 伤害数字在角色和怪物之上。
- 暗场和 Boss 标题最后绘制。

- [ ] **Step 5: 验证和提交**

```powershell
npm test -- tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleRenderer.spec.ts
npm run typecheck
git add web/battle tests/web/battle
git commit -m "feat: add battle hit and kill effects"
```

## Task 5: 实现中密度 HTML HUD 和所有战斗覆盖层

**Files:**

- Create: `web/battle/BattleHudModel.ts`
- Create: `web/battle/BattleInteractionSchedule.ts`
- Create: `web/battle/BattleHUD.ts`
- Create: `tests/web/battle/BattleInteractionSchedule.spec.ts`
- Create: `tests/web/battle/BattleHUD.spec.ts`
- Create: `web/styles/battle-hud.css`
- Modify: `web/styles.css`

**Interfaces:**

- `createBattleHudModel(frame, options): BattleHudModel`
- `getAvailableBattleInteractions(elapsedMs, claims, mode)`
- `renderBattleHudShell(): string`
- `BattleHUD.mount(host): void`
- `BattleHUD.update(model): void`
- `BattleHUD.dispose(): void`

- [ ] **Step 1: 写 HUD 模型和静态壳测试**

```ts
// tests/web/battle/BattleHUD.spec.ts
import { describe, expect, it } from 'vitest';
import {
  createBattleHudModel,
  renderBattleHudShell,
} from '../../../web/battle/BattleHUD';
import { createFrameFixture } from './helpers/BattleFixtures';

describe('BattleHUD', () => {
  it('renders three active skills, pause controls and upgrade overlay hooks', () => {
    const html = renderBattleHudShell();
    expect(html.match(/data-battle-skill=/g)).toHaveLength(3);
    expect(html).toContain('data-battle-action="pause"');
    expect(html).toContain('data-upgrade-options');
    expect(html).toContain('data-failure-overlay');
    expect(html).toContain('data-settlement-overlay');
  });

  it('shows exact cooldown, shield, energy and upgrade information', () => {
    const model = createBattleHudModel(createFrameFixture({
      status: 'upgrade',
      shield: 25,
      shieldRemainingMs: 3500,
      energy: 72,
      offeredUpgradeIds: ['rapid-reload', 'coral-warhead', 'bubble-capacitor'],
    }), {
      mode: 'normal',
      upgradeRerollAvailable: true,
      skillRefreshAvailable: false,
    });

    expect(model.energyLabel).toBe('72 / 100');
    expect(model.shieldLabel).toContain('3.5');
    expect(model.upgradeCards).toHaveLength(3);
    expect(model.upgradeRerollVisible).toBe(true);
  });
});
```

- [ ] **Step 2: 保留同局重复互动奖励**

`BattleInteractionSchedule.ts` 只决定何时显示，不发货币：

| actionId | 可见战斗时钟 | 单局上限 | 每次奖励 |
|---|---:|---:|---:|
| salvage-a | 18–80 秒 | 2 | 8 齿轮 |
| aid-b | 70–115 秒 | 1 | 1 航线徽记 |
| signal-c | 110–150 秒 | 1 | 12 齿轮 |

规则：

- normal 模式显示；daily-trial 完全隐藏。
- 同一时刻最多显示一个互动卡，按表中顺序优先。
- `salvage-a` 在第一次领取后仍显示 `1/2`，允许同一局再次点击并再次获得 8 齿轮。
- 达到上限后立即关闭互动卡，并由 HUD notice 显示“本局已打捞 2/2”。
- 时间窗结束后不补发。
- HUD 只上报 actionId 和当前 attempt；`GameApp` 必须调用现有 `InteractionRewardService`，成功后才更新钱包和 claim 状态。
- 互动收益已经即时入账，不进入结算双倍。

失败测试至少断言：

```ts
expect(getAvailableBattleInteractions(20_000, {}, 'normal')[0]).toMatchObject({
  actionId: 'salvage-a',
  attempt: 0,
  maxClaims: 2,
});
expect(getAvailableBattleInteractions(
  25_000,
  { 'salvage-a': 1 },
  'normal',
)[0]?.attempt).toBe(1);
expect(getAvailableBattleInteractions(
  25_000,
  { 'salvage-a': 2 },
  'normal',
)).toEqual([]);
expect(getAvailableBattleInteractions(20_000, {}, 'daily-trial')).toEqual([]);
```

- [ ] **Step 3: 建立只挂载一次的 HUD**

`renderBattleHudShell()` 只在 `mount` 时写一次 HTML。后续每帧只更新缓存节点：

- 波次和战斗时钟。
- 列车生命/护盾。
- 精英或 Boss 血条。
- 连击、经验和最多 6 个强化图标。
- 三个技能的冷却遮罩、剩余秒数和能量。
- 升级、暂停、失败、结算和“继续战斗”覆盖层。

禁止每帧执行 `host.innerHTML = ...`。

- [ ] **Step 4: 定义 HUD 回调**

```ts
export interface BattleHudCallbacks {
  onSkill(skillId: BattleSkillId): void;
  onChooseUpgrade(upgradeId: BattleUpgradeId): void;
  onClaimInteraction(actionId: string, attempt: number): void;
  onRequestUpgradeReroll(): void;
  onRequestSkillRefresh(): void;
  onPause(): void;
  onResume(): void;
  onRequestRevive(): void;
  onRequestDoubleSettlement(): void;
  onGiveUp(): void;
  onReturnStation(): void;
}
```

键盘 `1/2/3` 只能在战斗场景挂载且输入焦点不在表单时触发。`dispose` 必须移除按钮、键盘和窗口监听器。

- [ ] **Step 5: 实现三选一**

每张升级卡显示：

- 中文名称。
- 当前等级 → 新等级。
- 精确数值变化。
- 与当前构筑的简短关联。

普通模式显示一次“看广告刷新三选一”；每日试炼隐藏。选择成功后按钮立即锁定，显示 400ms `3-2-1` 短倒计时，再恢复战斗。

- [ ] **Step 6: 实现失败和结算层**

失败层：

- 显示列车失守、当前波次和击杀数。
- 每局一次广告复活。
- 放弃本局并结算。
- 不再显示分享复活。

结算层：

- 显示首通/重复通关、三货币和军团贡献。
- 普通重复通关保留一次广告双倍入口。
- 每日试炼不显示广告双倍。
- 广告双倍完成后用返回的新结算模型更新数字和 `doubled` 状态，不再次执行基础结算。
- 返回车站按钮只调用一次回调。

- [ ] **Step 7: 完成响应式样式**

`battle-hud.css` 必须：

- 使用安全区 `env(safe-area-inset-*)`。
- 360px 宽度下三个技能仍保持可点击，最小触控尺寸 44px。
- 覆盖层滚动时 Canvas 保持固定。
- 不使用大面积金色、厚重黑框或老式圆盘技能 UI。
- 信息密度中等，普通伤害不以 DOM 数字持续堆叠。

- [ ] **Step 8: 验证和提交**

```powershell
npm test -- tests/web/battle/BattleInteractionSchedule.spec.ts tests/web/battle/BattleHUD.spec.ts
npm run typecheck
npm run build
git add web/battle/BattleInteractionSchedule.ts web/battle/BattleHudModel.ts web/battle/BattleHUD.ts web/styles web/styles.css tests/web/battle/BattleInteractionSchedule.spec.ts tests/web/battle/BattleHUD.spec.ts
git commit -m "feat: add interactive battle hud"
```

## Task 6: 实现固定步长浏览器循环和 BattleScene 生命周期

**Files:**

- Create: `web/battle/FixedStepLoop.ts`
- Create: `web/battle/BattleSoundPort.ts`
- Create: `web/scenes/BattleScene.ts`
- Create: `tests/web/battle/FixedStepLoop.spec.ts`
- Create: `tests/web/battle/BattleScene.spec.ts`
- Create: `web/styles/battle-canvas.css`
- Modify: `web/styles.css`

**Interfaces:**

- `FixedStepLoop.start()/stop()/frame(nowMs)`
- `BattleSoundPort.consume(events, frame)`
- `BattleScene` implements `GameScene`

- [ ] **Step 1: 写固定步长测试**

```ts
// tests/web/battle/FixedStepLoop.spec.ts
import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../../../web/battle/FixedStepLoop';

describe('FixedStepLoop', () => {
  it('caps backlog at 100 ms and performs at most five updates per frame', () => {
    const updates: number[] = [];
    const renders: number[] = [];
    const loop = new FixedStepLoop({
      stepMs: 1000 / 60,
      maxFrameDeltaMs: 100,
      maxStepsPerFrame: 5,
      update: (step) => updates.push(step),
      render: (alpha) => renders.push(alpha),
    });

    loop.frame(0);
    loop.frame(1000);

    expect(updates).toHaveLength(5);
    expect(renders).toHaveLength(2);
    expect(renders[1]).toBeGreaterThanOrEqual(0);
    expect(renders[1]).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: 实现无浏览器依赖的循环核心**

`FixedStepLoop` 不直接调用 `requestAnimationFrame`。`BattleScene` 通过注入的 `FrameScheduler` 驱动：

```ts
export interface FrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
}
```

生产实现包装 `window.requestAnimationFrame/cancelAnimationFrame`；测试使用手动 scheduler。

- [ ] **Step 3: 定义静音声音端口**

```ts
export interface BattleSoundPort {
  consume(events: readonly BattleEvent[], frame: BattleFrameView): void;
  setBattlePhase(phase: 'battle' | 'boss' | 'victory' | 'defeat'): void;
  pause(): void;
  resume(): Promise<void>;
  dispose(): void;
}

export const SILENT_BATTLE_SOUND: BattleSoundPort = {
  consume() {},
  setBattlePhase() {},
  pause() {},
  resume: async () => {},
  dispose() {},
};
```

计划 04 的 `AudioManager` 实现该端口。

- [ ] **Step 4: 写 BattleScene 生命周期测试**

测试使用假的 host、canvas、HUD、engine、renderer、scheduler 和 sound port，验证：

- `mount` 只注册一个帧回调。
- 每个引擎事件批次只交给 `EffectSystem` 和声音端口一次。
- `upgrade`、`boss-intro`、`paused`、`victory`、`defeat` 时没有额外逻辑更新。
- `unmount` 取消帧、移除监听器、清空效果并释放资源。
- 重复 `unmount` 安全。

- [ ] **Step 5: 实现 BattleScene**

挂载结构：

```html
<section class="game-scene game-scene--battle">
  <div class="battle-canvas-host">
    <canvas data-battle-canvas aria-label="潮汐列车战斗"></canvas>
  </div>
  <div data-battle-hud></div>
</section>
```

每个逻辑步：

1. `engine.update(FIXED_STEP_MS)`。
2. `events = engine.drainEvents()`。
3. `effects.consume(events, engine.frame)`。
4. `sound.consume(events, engine.frame)`。
5. `effects.update(FIXED_STEP_MS)`。
6. `battle-won` 只调用一次 `callbacks.onOutcome` 并把返回的结算模型交给 HUD；`battle-lost` 只打开失败层，尚未结算。

每个绘制帧：

1. 检查 host 尺寸并在变化时更新 viewport。
2. `renderer.render(frame, effects.view, art, viewport)`。
3. `hud.update(...)`；HUD 内部自行跳过值未变化的写入。

- [ ] **Step 6: 技能、升级和复活命令**

- `onSkill` → `engine.useSkill`。
- `onChooseUpgrade` → `engine.chooseUpgrade`；成功后延迟 400ms 恢复。
- `onRequestUpgradeReroll` → 等待 `GameApp` 广告结果，成功后调用 `engine.rerollUpgradeOffer()`。
- `onRequestSkillRefresh` → 先 `engine.pause('rewarded-ad')`，等待广告结果；随后恢复到 running，若广告成功则在下一逻辑步前调用 `engine.refreshActiveSkillCooldowns()`，取消/失败只恢复。
- `onClaimInteraction` → 同步调用 `GameApp`；只有返回 true 才增加本局 claim 计数并刷新 HUD。
- `onRequestRevive` → 等待广告结果，成功后调用 `engine.revive(hp, 3000)`。
- 复活取消或失败时保持失败层；复活成功后引擎清空临时失败 outcome 并继续当前波次。
- `onGiveUp` 只有在 `engine.outcome?.victory === false` 时调用，由 `GameApp` 完成唯一失败结算，再把返回模型交给 HUD。
- `onRequestDoubleSettlement` 只在已有基础结算模型且按钮可用时调用，成功返回更新模型，失败返回 `null`。
- 所有异步动作使用 pending 集合锁，快速重复点击不得重复调用平台。

- [ ] **Step 7: 验证和提交**

```powershell
npm test -- tests/web/battle/FixedStepLoop.spec.ts tests/web/battle/BattleScene.spec.ts
npm run typecheck
npm run build
git add web/battle web/scenes/BattleScene.ts web/styles tests/web/battle
git commit -m "feat: add continuous canvas battle scene"
```

## Task 7: 用动态 BattleScene 替换旧静态单局

**Files:**

- Modify: `web/app/GameApp.ts`
- Modify: `web/app/AppTypes.ts`
- Modify: `web/app/BattleSettlementAdapter.ts`
- Modify: `web/main.ts`
- Modify: `web/scenes/StationScene.ts`
- Delete: `web/scenes/LegacyRunScene.ts`
- Delete: `web/views/CombatSceneView.ts`
- Delete: `tests/web/CombatSceneView.spec.ts`
- Modify: `tests/web/GameApp.spec.ts`
- Create: `tests/web/battle/BattleIntegration.spec.ts`

**Interfaces:**

- `GameApp.startBattle(request): Promise<void>`
- `GameApp.settleBattle(outcome): void`
- `BattleSceneCallbacks`

- [ ] **Step 1: 扩展跨层回调**

最终接口：

```ts
export interface BattleSceneCallbacks {
  // 只用于胜利；失败要等玩家放弃后走 onGiveUp。
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

同步修改总计划中的冻结接口，不保留旧的 `onRequestRevive(outcome): Promise<boolean>`。

`BattleSettlementPresentation` 放在同一文件或 `web/app/AppTypes.ts`，字段与总计划完全一致。`BattleScene` 将 `onOutcome/onGiveUp` 的返回值交给 HUD；广告双倍只调用 `onRequestDoubleSettlement` 并应用返回的更新模型。

- [ ] **Step 2: 写集成失败测试**

覆盖：

1. 点击普通出发后路由到 `battle`。
2. `createBattleRunInput` 只聚合一次全部已拥有皮肤的累计加成、已装备装备、军团和地图属性；没有公平模式覆盖这些数值。
3. 自动推进后出现 `weapon-fired`，不需要点击普通攻击。
4. 同一 `battleId` 的两次结果只结算一次。
5. 正常首通、重复通关、每日试炼、军团贡献继续调用现有领域服务。
6. 广告复活、技能刷新、升级重选和重复通关双倍分别每局最多一次。
7. 取消/失败广告不消耗机会。
8. 第一次失败不会提前发奖励；复活后仍可击败 Boss，或再次失败后放弃并只结算一次。
9. 重复通关基础奖励先结算一次；广告双倍只补发允许的差额并把结算模型标记为 doubled。
10. `salvage-a` 同局前两次点击各发 8 齿轮，第三次及快速重复请求不再发奖；每日试炼不显示互动。

- [ ] **Step 3: 接入 BattleScene**

`GameApp.startBattle`：

- 生成唯一 `battleId` 和固定 seed。
- 从 `ProgressionStatService` 获取快照。
- 调用 `createBattleRunInput`。
- 创建 `BattleEngine`、`EffectSystem`、`BattleHUD`、`BattleRenderer` 和 `BattleScene`。
- 资源加载未完成时显示 1–3 秒战斗加载层；失败资源使用占位图。
- 隐藏底部五场景导航，保留战斗 HUD。

- [ ] **Step 4: 接入旧商业化和运营规则**

- 广告接口继续使用 `IAds` 和 `RewardedPlacement`。
- `revive` 成功后绝对恢复量沿用 `RecoverySystem`：普通阶段 60，Boss 阶段 50，保护 3000ms。
- `skill-refresh` 清空潮汐齐射和泡泡屏障冷却，不直接填满极潮能量。
- `reroll` 只在普通模式升级层出现。
- `double-settlement` 只在普通重复通关出现。
- 每日试炼不发常规首通/重复地图奖励，不贡献军团，不显示重选和双倍。
- 战斗互动继续调用 `InteractionRewardService`，claimId 使用 `battleId + actionId + attempt`；成功后立即刷新顶栏货币，失败或重复不改变钱包。

唯一结算映射必须保持现有经济数值：

- 普通胜利首通：400 齿轮、10 航线徽记、3 星票。
- 普通胜利重复通关：80 齿轮、2 航线徽记、0 星票。
- 付费皮肤/装备累计形成的 `progression.gearsMultiplier` 只对齿轮在结算时乘算一次。
- 重复通关广告双倍只追加同一份 80 齿轮和 2 航线徽记，不重复首通、不重复军团贡献。
- 普通失败：钱包奖励为 0，但军团贡献仍按 defeat + `outcome.completedWaves` 结算一次。
- 军团 `completedNodes = outcome.completedWaves`。
- 每日试炼 `completedNodes = outcome.completedWaves`、`remainingHp = outcome.remainingHp`、`assisted = outcome.adReviveUsed`。
- 每日试炼无普通钱包结算、无军团贡献、无广告重选和结算双倍。

- [ ] **Step 5: 删除旧点击式战斗**

删除或替换：

- `renderCombatScene`。
- `combat-action="attack"`。
- `debug-hit` / `data-action="damage"`。
- 旧 `combat | reward | route | boss` 静态 phase。
- 旧的四个战斗动作按钮。

保留：

- 现有结算领域服务。
- 首通/重复通关奖励语义。
- 每日试炼成绩和里程碑。
- 军团贡献。
- 广告复活、技能刷新、重选和结算双倍。

- [ ] **Step 6: 验证和提交**

```powershell
npm test -- tests/web/battle tests/web tests/domain tests/save tests/telemetry
npm run typecheck
npm run build
git diff --check
git add web tests
git commit -m "feat: replace static run with dynamic canvas battle"
```

## Task 8: 完整表现验收

- [ ] **Step 1: 启动本地预览**

```powershell
npm run build
npx vite preview --host 127.0.0.1 --port 4173 --strictPort
```

- [ ] **Step 2: 手工检查四种视口**

在 360×800、390×844、412×915、430×932 下逐项检查：

- 车站进入战斗后 Canvas 可见且持续运动。
- 不点击普通攻击，主炮仍然射击。
- 列车长、机械师、水母医师都站在列车上并有不同动作。
- 四种普通/精英/Boss 敌人轮廓可区分。
- 炮口、弹道、命中、死亡、碎片、冲击环和掉落吸附均可见。
- 三个技能可触发，冷却和能量准确。
- 三次升级层暂停战斗且可选择。
- Boss 出场有 6 秒演出和血条。
- 失败可广告复活，胜利可结算回站。
- 页面无横向溢出，控制台无未捕获异常。

- [ ] **Step 3: 全量门禁**

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
git diff --check
```

Expected: 全部退出码为 0。
