# 手绘生活世界精品竖切 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把“车站主页 → 出发演出 → 第一场战斗”改造成暖色傍晚、手绘赛璐璐、具有生活事件的精品竖切，同时保持现有存档、数值、商业化和战斗结果不变。

**Architecture:** 车站继续使用 DOM/CSS，新增 `StationAmbientDirector` 只调度表现事件，由 `StationScene` 负责挂载、暂停、恢复和销毁。战斗继续使用现有 Canvas、`BattleEngine`、`TrainMotionController`、对象池和音频生命周期；新增纯函数视差模块，并扩展 `EffectSystem` 的池化手绘特效。美术目录提供稳定 ID，调用方不依赖文件名。

**Tech Stack:** TypeScript 5.7、Vite 8、Vitest 4、HTML/CSS、Canvas 2D、Web Audio、透明 WebP、Python/Pillow 资源压缩、GitHub Pages。

## Global Constraints

- 首轮范围严格限定为车站主页、出发演出和第一场战斗；签到、商店、衣柜、装备、军团和活动页只继承公共色彩与按钮变量。
- 不新增关卡、敌人、数值、付费商品、货币、存档字段或埋点中的个人信息。
- 不重写 `BattleEngine`、`TrainMotionController`、结算、首通、重复通关、广告或购买逻辑。
- 主场景为暖色傍晚；使用深蓝粗细线稿、两到三档色块、轻纸张颗粒、哑光珐琅和局部使用痕迹。
- 禁止统一塑料高光、无用途悬浮岛、随机水晶、满屏玻璃面板、持续高密粒子和所有元素同步循环。
- 进入车站后 2–4 秒触发首个生活事件；事件完成 5–8 秒后触发下一个；同一事件不得连续触发。
- 同一时刻最多突出一个叙事事件，同时活跃的环境小动画不超过 6 个。
- 首屏关键压缩资源目标不超过 1.5 MB；战斗屏不超过现有 2.5 MB 门槛；全部 chibi 资源不超过现有 5.5 MB 门槛。
- 主流设备目标 60 FPS；低性能模式目标不低于 45 FPS，并关闭前景视差、远景列车和低优先级碎屑。
- 支持 `prefers-reduced-motion` 和游戏内减少动态效果；关键状态不得只依靠运动表达。
- 360、390、412、430 CSS 像素宽度均不得横向溢出。
- 公开普通 URL 不得暴露 E2E 控制接口；只有查询参数精确为 `e2e=1` 时允许安装测试钩子。
- 每项代码行为先写失败测试，再做最小实现；每个任务完成后独立提交。

---

## File Map

### 新建文件

- `web/station/StationAmbientDirector.ts`：生活事件目录、确定性调度、暂停、恢复、问候和销毁。
- `web/battle/HandDrawnParallax.ts`：按列车速度、时间、画质和减少动态效果计算四层战斗视差。
- `web/styles/handdrawn-station.css`：车站四层构图、票据 UI、事件动画、出发演出和缺图剪影。
- `tests/web/station/StationAmbientDirector.spec.ts`：事件时间、去重、暂停、降级和清理测试。
- `tests/web/battle/HandDrawnParallax.spec.ts`：视差层数、速度、低画质和减少动态效果测试。
- `tests/smoke/station-assets.spec.ts`：车站目录、本地资源和分层契约测试。

### 修改文件

- `web/assets/ChibiArtCatalog.ts`：增加车站层、飞鱼邮差和远景列车 ID，保留角色、列车和伙伴稳定入口。
- `web/assets/BattleArtCatalog.ts`：把单张战斗背景替换为天空、远景、轨道和前景 ID。
- `web/views/StationHeroView.ts`：输出四层场景、车票信息、可点击列车长和环境事件挂点。
- `web/scenes/Scene.ts`：增加车站环境导演工厂契约。
- `web/scenes/StationScene.ts`：拥有环境导演生命周期和缺图降级监听。
- `web/LegacyGameRuntime.ts`：连接声音、页面可见性、设置变化、问候和出发期间暂停。
- `web/app/StationDepartureController.ts`：把正常出发演出窗口调整为 1200 ms，保持减少动态效果 80 ms。
- `web/styles.css`：引入新的车站样式文件。
- `web/styles/tokens.css`：加入手绘纸张、墨蓝、夕阳和珊瑚印章变量。
- `web/styles/scenes.css`：移除被新车站样式替代的旧玻璃/漂浮规则，保留其他场景规则。
- `web/styles/responsive.css`：适配新车站在四档移动宽度的布局。
- `web/styles/battle-canvas.css`：战斗画布降级底色改为暖夕阳海面色。
- `web/battle/QualityMonitor.ts`：给高/中/低画质增加 4/3/2 个背景层预算。
- `web/battle/BattleRenderer.ts`：绘制手绘视差层、哑光列车光效和新特效形状。
- `web/battle/EffectSystem.ts`：增加笔刷拖影、击败压扁和墨泡粒子，继续使用对象池与优先级裁剪。
- `web/audio/AudioTypes.ts`：增加检票、工具、报站、送件和远方汽笛提示音。
- `web/audio/SfxSynth.ts`：为新增提示音提供短促程序化配方，不引入大音频文件。
- `scripts/check-asset-budget.mjs`：按新车站层和新战斗层计算预算。
- `scripts/smoke-browser.mjs`：验证分层、问候、出发、视口、减少动态效果和 E2E 隔离。
- `README.md`：更新当前视觉版本、验证说明和公开试玩信息。

### 替换或新增运行时美术

- 车站层：`station-sky-dusk.webp`、`station-horizon-dusk.webp`、`station-platform-dusk.webp`、`station-foreground-dusk.webp`。
- 车站事件：`flying-fish-post.webp`、`station-distant-train.webp`。
- 战斗层：`battle-sky-dusk.webp`、`battle-horizon-dusk.webp`、`battle-track-dusk.webp`、`battle-foreground-dusk.webp`。
- 重绘现有稳定文件名：`bubble-train.webp`、六张列车长皮肤、`otter-mechanic.webp`、`jellyfish-medic.webp`、五张敌人/Boss 素材。
- `station-ocean-bg.webp` 与 `battle-ocean-bg.webp` 保留为仓库内回滚资源，但从运行时目录和首屏/战斗屏预算集合中移除；全部 chibi 总量仍计入这两张文件。

---

### Task 1: 手绘美术契约、资源包与预算

**Required execution skill:** Read and use the `imagegen` skill before generating or editing any raster asset in this task.

**Files:**
- Create: `tests/smoke/station-assets.spec.ts`
- Create: `web/assets/chibi/station-sky-dusk.webp`
- Create: `web/assets/chibi/station-horizon-dusk.webp`
- Create: `web/assets/chibi/station-platform-dusk.webp`
- Create: `web/assets/chibi/station-foreground-dusk.webp`
- Create: `web/assets/chibi/flying-fish-post.webp`
- Create: `web/assets/chibi/station-distant-train.webp`
- Create: `web/assets/chibi/battle-sky-dusk.webp`
- Create: `web/assets/chibi/battle-horizon-dusk.webp`
- Create: `web/assets/chibi/battle-track-dusk.webp`
- Create: `web/assets/chibi/battle-foreground-dusk.webp`
- Replace: `web/assets/chibi/bubble-train.webp`
- Replace: `web/assets/chibi/captain-female-base.webp`
- Replace: `web/assets/chibi/captain-female-seafoam.webp`
- Replace: `web/assets/chibi/captain-female-aurora.webp`
- Replace: `web/assets/chibi/captain-male-base.webp`
- Replace: `web/assets/chibi/captain-male-seafoam.webp`
- Replace: `web/assets/chibi/captain-male-aurora.webp`
- Replace: `web/assets/chibi/otter-mechanic.webp`
- Replace: `web/assets/chibi/jellyfish-medic.webp`
- Replace: `web/assets/chibi/puffer-dragon.webp`
- Replace: `web/assets/chibi/needle-jelly-enemy.webp`
- Replace: `web/assets/chibi/crystal-crab.webp`
- Replace: `web/assets/chibi/storm-ray-elite.webp`
- Replace: `web/assets/chibi/tidal-boss.webp`
- Modify: `web/assets/ChibiArtCatalog.ts`
- Modify: `web/assets/BattleArtCatalog.ts`
- Modify: `tests/smoke/battle-assets.spec.ts`
- Modify: `scripts/check-asset-budget.mjs`
- Test: `tests/smoke/station-assets.spec.ts`
- Test: `tests/smoke/battle-assets.spec.ts`
- Test: `tests/smoke/asset-budget.spec.ts`

**Interfaces:**
- Produces: `CHIBI_ART.station.{sky,horizon,platform,foreground,mailFish,distantTrain}` as URL strings.
- Preserves: `CHIBI_ART.train`, `CHIBI_ART.captains`, `CHIBI_ART.otter`, `CHIBI_ART.jellyfish`, `CHIBI_ART.pufferDragon`, `CHIBI_ART.crystalCrab`, `CHIBI_ART.tidalBoss`.
- Produces: battle art IDs `backgroundSky`, `backgroundHorizon`, `backgroundTrack`, `backgroundForeground`.

- [ ] **Step 1: Write failing station and battle catalog tests**

```ts
// tests/smoke/station-assets.spec.ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHIBI_ART } from '../../web/assets/ChibiArtCatalog';

describe('hand-drawn station art catalog', () => {
  it('provides four local scene layers and two local ambient actors', () => {
    expect(Object.keys(CHIBI_ART.station)).toEqual([
      'sky',
      'horizon',
      'platform',
      'foreground',
      'mailFish',
      'distantTrain',
    ]);
    for (const [id, href] of Object.entries(CHIBI_ART.station)) {
      const url = new URL(href);
      expect(url.protocol, id).toBe('file:');
      expect(existsSync(fileURLToPath(url)), id).toBe(true);
    }
  });
});
```

Add this assertion to `tests/smoke/battle-assets.spec.ts`:

```ts
expect(getCriticalBattleArtIds('captainFemaleBase')).toEqual(expect.arrayContaining([
  'backgroundSky',
  'backgroundHorizon',
  'backgroundTrack',
  'backgroundForeground',
]));
```

- [ ] **Step 2: Run the contract tests and verify they fail**

Run:

```powershell
npx vitest run tests/smoke/station-assets.spec.ts tests/smoke/battle-assets.spec.ts
```

Expected: FAIL because `CHIBI_ART.station` and the four battle background IDs do not exist.

- [ ] **Step 3: Generate one uncommitted style anchor with the image generation skill**

Save the generated source to `temp/handdrawn-v1/style-anchor.png`. Use this exact prompt:

```text
Vertical 9:16 key art for an original cozy ocean railway game at warm sunset. A small working tidal station, rounded bubble train, young adult chibi conductor, otter mechanic checking a service hatch, jellyfish station attendant raising a departure board, flying-fish courier dropping one parcel. Hand-drawn 2D cel animation look: expressive dark-navy linework with visible thick-to-thin variation, two or three flat shadow shapes, matte enamel and worn canvas, light paper grain, coral-orange sunset against deep-blue shadows, asymmetrical practical props, clear foreground/midground/background. Charming and authored, not glossy concept art. No photorealism, no 3D render, no plastic shine, no glass UI, no neon bloom, no floating fantasy islands, no random crystals, no text, no watermark, no excessive micro-detail.
```

Inspect `temp/handdrawn-v1/style-anchor.png` with `view_image`. Reject and regenerate if any of these are visible: mirror-like train body, uniform airbrush gradients, unreadable pseudo-text, six-fingered hands, disconnected feet, random jewelry, floating props without support, or inconsistent sunset direction.

- [ ] **Step 4: Generate staged background layers with the anchor as the style reference**

Save generated PNG sources under these exact paths:

```text
temp/handdrawn-v1/station-sky-dusk.png
temp/handdrawn-v1/station-horizon-dusk.png
temp/handdrawn-v1/station-platform-dusk.png
temp/handdrawn-v1/station-foreground-dusk.png
temp/handdrawn-v1/battle-sky-dusk.png
temp/handdrawn-v1/battle-horizon-dusk.png
temp/handdrawn-v1/battle-track-dusk.png
temp/handdrawn-v1/battle-foreground-dusk.png
```

Use `temp/handdrawn-v1/style-anchor.png` as the image reference for every generation. Append one of these exact clauses to the approved base style:

```text
station-sky: only sunset sky, soft hand-painted clouds and distant sea haze; no buildings, vehicles, characters or text; opaque full frame.
station-horizon: distant low islands, route beacons and tiny shoreline silhouettes; transparent empty sky and transparent lower foreground; no characters or text.
station-platform: functional tidal station platform, rails, warm lamps, small station office, luggage area and clear empty staging zones for a large train on the right and conductor on the left; no people, train or text; transparent outside painted structures.
station-foreground: sparse ropes, two luggage cases, one flag corner and dock edge framing the lower sides; transparent center and upper area; no text.
battle-sky: vertical sunset sky and sea haze, quiet and low contrast; no enemies, train, rails or text; opaque full frame.
battle-horizon: distant sea stacks, small route lamps and thin cloud silhouettes; transparent sky and lower field; no text.
battle-track: forward-facing liquid rail corridor with broad readable lanes and matte painted water; no train, enemies or text; tile-friendly vertical composition.
battle-foreground: sparse near rocks, foam brush marks and rope fragments on the extreme edges; transparent central combat lane; no text.
```

- [ ] **Step 5: Generate staged sprites by editing the current silhouettes into the approved style**

For each row, use the current runtime asset and `temp/handdrawn-v1/style-anchor.png` as references, preserve the recognizable silhouette and costume identity, request a transparent background, and save to the staging path shown:

| Current runtime asset | Staging PNG |
|---|---|
| `bubble-train.webp` | `temp/handdrawn-v1/bubble-train.png` |
| `captain-female-base.webp` | `temp/handdrawn-v1/captain-female-base.png` |
| `captain-female-seafoam.webp` | `temp/handdrawn-v1/captain-female-seafoam.png` |
| `captain-female-aurora.webp` | `temp/handdrawn-v1/captain-female-aurora.png` |
| `captain-male-base.webp` | `temp/handdrawn-v1/captain-male-base.png` |
| `captain-male-seafoam.webp` | `temp/handdrawn-v1/captain-male-seafoam.png` |
| `captain-male-aurora.webp` | `temp/handdrawn-v1/captain-male-aurora.png` |
| `otter-mechanic.webp` | `temp/handdrawn-v1/otter-mechanic.png` |
| `jellyfish-medic.webp` | `temp/handdrawn-v1/jellyfish-medic.png` |
| `puffer-dragon.webp` | `temp/handdrawn-v1/puffer-dragon.png` |
| `needle-jelly-enemy.webp` | `temp/handdrawn-v1/needle-jelly-enemy.png` |
| `crystal-crab.webp` | `temp/handdrawn-v1/crystal-crab.png` |
| `storm-ray-elite.webp` | `temp/handdrawn-v1/storm-ray-elite.png` |
| `tidal-boss.webp` | `temp/handdrawn-v1/tidal-boss.png` |

Use this exact sprite instruction after the base style:

```text
Isolated full silhouette on transparent background, readable at mobile size, dark-navy hand-drawn outer line with varied weight, flat cel colors and two shadow levels, matte materials, one warm sunset rim-light edge, slight asymmetry and believable weight. Preserve the referenced character or vehicle identity and all major color identifiers. Simplify tiny accessories. No cast shadow baked into the transparent image, no text, no extra limbs, no glossy 3D rendering, no airbrushed plastic highlights.
```

Generate `temp/handdrawn-v1/flying-fish-post.png` and `temp/handdrawn-v1/station-distant-train.png` from the style anchor using the same sprite rule. The flying fish carries one canvas mail satchel and one tied parcel. The distant train is a simplified side silhouette with three warm windows and no readable text.

- [ ] **Step 6: Convert staged PNG files to exact runtime dimensions and WebP paths**

Run:

```powershell
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/station-sky-dusk.png --output web/assets/chibi/station-sky-dusk.webp --width 900 --height 1300 --quality 80
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/station-horizon-dusk.png --output web/assets/chibi/station-horizon-dusk.webp --width 900 --height 1300 --quality 82
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/station-platform-dusk.png --output web/assets/chibi/station-platform-dusk.webp --width 900 --height 1300 --quality 82
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/station-foreground-dusk.png --output web/assets/chibi/station-foreground-dusk.webp --width 900 --height 1300 --quality 80
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/battle-sky-dusk.png --output web/assets/chibi/battle-sky-dusk.webp --width 900 --height 1600 --quality 80
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/battle-horizon-dusk.png --output web/assets/chibi/battle-horizon-dusk.webp --width 900 --height 1600 --quality 82
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/battle-track-dusk.png --output web/assets/chibi/battle-track-dusk.webp --width 900 --height 1600 --quality 82
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/battle-foreground-dusk.png --output web/assets/chibi/battle-foreground-dusk.webp --width 900 --height 1600 --quality 80
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/bubble-train.png --output web/assets/chibi/bubble-train.webp --max-edge 1280 --quality 84
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/captain-female-base.png --output web/assets/chibi/captain-female-base.webp --max-edge 960 --quality 84
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/captain-female-seafoam.png --output web/assets/chibi/captain-female-seafoam.webp --max-edge 960 --quality 84
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/captain-female-aurora.png --output web/assets/chibi/captain-female-aurora.webp --max-edge 960 --quality 84
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/captain-male-base.png --output web/assets/chibi/captain-male-base.webp --max-edge 960 --quality 84
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/captain-male-seafoam.png --output web/assets/chibi/captain-male-seafoam.webp --max-edge 960 --quality 84
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/captain-male-aurora.png --output web/assets/chibi/captain-male-aurora.webp --max-edge 960 --quality 84
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/otter-mechanic.png --output web/assets/chibi/otter-mechanic.webp --max-edge 640 --quality 82
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/jellyfish-medic.png --output web/assets/chibi/jellyfish-medic.webp --max-edge 640 --quality 82
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/flying-fish-post.png --output web/assets/chibi/flying-fish-post.webp --max-edge 420 --quality 82
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/station-distant-train.png --output web/assets/chibi/station-distant-train.webp --max-edge 520 --quality 80
```

Run the five enemy/Boss conversions:

```powershell
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/puffer-dragon.png --output web/assets/chibi/puffer-dragon.webp --max-edge 720 --quality 82
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/needle-jelly-enemy.png --output web/assets/chibi/needle-jelly-enemy.webp --max-edge 720 --quality 82
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/crystal-crab.png --output web/assets/chibi/crystal-crab.webp --max-edge 720 --quality 82
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/storm-ray-elite.png --output web/assets/chibi/storm-ray-elite.webp --max-edge 720 --quality 82
python scripts/prepare_chibi_art.py --input temp/handdrawn-v1/tidal-boss.png --output web/assets/chibi/tidal-boss.webp --max-edge 720 --quality 82
```

- [ ] **Step 7: Implement the catalog structure**

Use named URL constants so the transitional aliases compile until Task 5 removes the old single-background ID:

```ts
const stationSky = new URL('./chibi/station-sky-dusk.webp', import.meta.url).href;
const stationHorizon = new URL('./chibi/station-horizon-dusk.webp', import.meta.url).href;
const stationPlatform = new URL('./chibi/station-platform-dusk.webp', import.meta.url).href;
const stationForeground = new URL('./chibi/station-foreground-dusk.webp', import.meta.url).href;

export const CHIBI_ART = {
  station: {
    sky: stationSky,
    horizon: stationHorizon,
    platform: stationPlatform,
    foreground: stationForeground,
    mailFish: new URL('./chibi/flying-fish-post.webp', import.meta.url).href,
    distantTrain: new URL('./chibi/station-distant-train.webp', import.meta.url).href,
  },
  stationBackground: stationPlatform,
  train: new URL('./chibi/bubble-train.webp', import.meta.url).href,
  captains: {
    'captain-tide-female': {
      'skin-tide-base': new URL('./chibi/captain-female-base.webp', import.meta.url).href,
      'skin-seafoam-departure': new URL('./chibi/captain-female-seafoam.webp', import.meta.url).href,
      'skin-aurora-whale-song': new URL('./chibi/captain-female-aurora.webp', import.meta.url).href,
    },
    'captain-tide-male': {
      'skin-tide-base': new URL('./chibi/captain-male-base.webp', import.meta.url).href,
      'skin-seafoam-departure': new URL('./chibi/captain-male-seafoam.webp', import.meta.url).href,
      'skin-aurora-whale-song': new URL('./chibi/captain-male-aurora.webp', import.meta.url).href,
    },
  },
  otter: new URL('./chibi/otter-mechanic.webp', import.meta.url).href,
  jellyfish: new URL('./chibi/jellyfish-medic.webp', import.meta.url).href,
  pufferDragon: new URL('./chibi/puffer-dragon.webp', import.meta.url).href,
  crystalCrab: new URL('./chibi/crystal-crab.webp', import.meta.url).href,
  tidalBoss: new URL('./chibi/tidal-boss.webp', import.meta.url).href,
} as const;
```

In `BATTLE_ART_URLS`, add the four IDs and keep `background` as a same-file compatibility alias until Task 5:

```ts
import { CHIBI_ART } from './ChibiArtCatalog';

const battleTrack = new URL('./chibi/battle-track-dusk.webp', import.meta.url).href;

export const BATTLE_ART_URLS = {
  background: battleTrack,
  backgroundSky: new URL('./chibi/battle-sky-dusk.webp', import.meta.url).href,
  backgroundHorizon: new URL('./chibi/battle-horizon-dusk.webp', import.meta.url).href,
  backgroundTrack: battleTrack,
  backgroundForeground: new URL('./chibi/battle-foreground-dusk.webp', import.meta.url).href,
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
  needleJelly: new URL('./chibi/needle-jelly-enemy.webp', import.meta.url).href,
  reefCrab: CHIBI_ART.crystalCrab,
  stormRayElite: new URL('./chibi/storm-ray-elite.webp', import.meta.url).href,
  deepEchoBoss: CHIBI_ART.tidalBoss,
} as const;
```

During Task 1, `getCriticalBattleArtIds()` must return `background`, then all four new background IDs, then train and actor IDs. This keeps the current renderer functional until Task 5 removes the compatibility alias. `DEFERRED_BATTLE_ART_IDS` remains exactly `['stormRayElite', 'deepEchoBoss']`.

- [ ] **Step 8: Update exact byte collections and run resource verification**

In `scripts/check-asset-budget.mjs`, make `firstScreen` contain the four station layers, train, selected base captain, two companions, mail fish and distant train. Make `battleScreen` contain the four battle layers, train, selected captain, two companions and the three normal enemies. Keep the numeric thresholds at 1.5 MB, 2.5 MB and 5.5 MB.

Run:

```powershell
npx vitest run tests/smoke/station-assets.spec.ts tests/smoke/battle-assets.spec.ts tests/smoke/asset-budget.spec.ts
npm run check:assets
```

Expected: all tests PASS and output ends with `asset budget ok`.

- [ ] **Step 9: Inspect a contact sheet and commit the asset contract**

Use `view_image` on all four station layers, the train, both base captains, both companions, the four battle layers and one normal enemy. Confirm common line color, sunset direction, matte materials, transparent edges and readable silhouettes. Then run:

```powershell
git add web/assets web/assets/chibi scripts/check-asset-budget.mjs tests/smoke/station-assets.spec.ts tests/smoke/battle-assets.spec.ts
git commit -m "art: add hand-drawn sunset world pack"
```

---

### Task 2: 确定性生活事件导演

**Files:**
- Create: `web/station/StationAmbientDirector.ts`
- Create: `tests/web/station/StationAmbientDirector.spec.ts`

**Interfaces:**
- Produces: `StationAmbientEventId` union.
- Produces: `StationAmbientController` with `start()`, `pause()`, `resume()`, `setReducedMotion(boolean)`, `requestCaptainGreeting()`, `dispose()`.
- Produces: `StationAmbientDirectorOptions` with injectable timer, random source, sound callback and announcement callback.

- [ ] **Step 1: Write failing deterministic scheduling tests**

Cover these exact cases in `tests/web/station/StationAmbientDirector.spec.ts`:

```ts
it('starts in 2..4 seconds and schedules the next event 5..8 seconds after completion', () => {
  const fixture = createFixture([0.5, 0.5, 0.5]);
  fixture.director.start();
  expect(fixture.timer.delays).toEqual([3000]);

  fixture.timer.fireNext();
  expect(fixture.root.dataset.ambientEvent).toBe('mail-drop');
  expect(fixture.events).toEqual(['mail-drop']);

  fixture.timer.fireNext();
  expect(fixture.root.dataset.ambientEvent).toBeUndefined();
  expect(fixture.timer.delays.at(-1)).toBe(6500);
});

it('never selects the same automatic event twice in a row', () => {
  const fixture = createFixture([0, 0, 0, 0]);
  fixture.director.start();
  fixture.timer.fireNext();
  const first = fixture.root.dataset.ambientEvent;
  fixture.timer.fireNext();
  fixture.timer.fireNext();
  fixture.timer.fireNext();
  expect(fixture.root.dataset.ambientEvent).not.toBe(first);
});

it('clears timers and active state on pause and dispose', () => {
  const fixture = createFixture([0.5]);
  fixture.director.start();
  fixture.director.pause();
  expect(fixture.timer.pendingCount).toBe(0);
  expect(fixture.root.dataset.ambientEvent).toBeUndefined();
  fixture.director.dispose();
  fixture.director.resume();
  expect(fixture.timer.pendingCount).toBe(0);
});

it('does not auto-schedule when reduced motion is enabled but still announces a manual greeting', () => {
  const fixture = createFixture([0.5], true);
  fixture.director.start();
  expect(fixture.timer.pendingCount).toBe(0);
  expect(fixture.director.requestCaptainGreeting()).toBe(true);
  expect(fixture.lines.at(-1)).toContain('末班车');
});

it('recovers from presentation callback errors and continues scheduling', () => {
  const fixture = createFixture([0.5, 0.5, 0.5], false, true);
  fixture.director.start();
  expect(() => fixture.timer.fireNext()).not.toThrow();
  fixture.timer.fireNext();
  expect(fixture.timer.pendingCount).toBe(1);
});
```

The fixture signature must be `createFixture(randomValues: number[], reducedMotion?: boolean, throwOnEvent?: boolean)`. It uses a manual timer that records delay values, a random function that consumes the supplied sequence, and an `onEvent` callback that throws only when `throwOnEvent` is true.

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
npx vitest run tests/web/station/StationAmbientDirector.spec.ts
```

Expected: FAIL because `StationAmbientDirector` is missing.

- [ ] **Step 3: Implement the public types and exact event table**

```ts
export type StationAmbientEventId =
  | 'mechanic-check'
  | 'station-call'
  | 'mail-drop'
  | 'distant-train'
  | 'captain-idle'
  | 'captain-greeting';

export type StationAmbientCue =
  | 'station-tool'
  | 'station-chime'
  | 'station-mail'
  | 'station-whistle';

export interface StationAmbientTimer {
  set(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clear(id: ReturnType<typeof setTimeout>): void;
}

export interface StationAmbientController {
  start(): void;
  pause(): void;
  resume(): void;
  setReducedMotion(reducedMotion: boolean): void;
  requestCaptainGreeting(): boolean;
  dispose(): void;
}

export interface StationAmbientDirectorOptions {
  readonly reducedMotion: boolean;
  readonly timer?: StationAmbientTimer;
  readonly random?: () => number;
  readonly playSound?: (cue: StationAmbientCue) => void;
  readonly announce?: (message: string) => void;
  readonly onEvent?: (eventId: StationAmbientEventId) => void;
}

interface StationAmbientDefinition {
  readonly id: Exclude<StationAmbientEventId, 'captain-greeting'>;
  readonly durationMs: number;
  readonly cue?: StationAmbientCue;
}

const EVENTS: readonly StationAmbientDefinition[] = [
  { id: 'mechanic-check', durationMs: 1800, cue: 'station-tool' },
  { id: 'station-call', durationMs: 1600, cue: 'station-chime' },
  { id: 'mail-drop', durationMs: 1700, cue: 'station-mail' },
  { id: 'distant-train', durationMs: 2200, cue: 'station-whistle' },
  { id: 'captain-idle', durationMs: 1400 },
] as const;
```

- [ ] **Step 4: Implement start, selection, completion and cleanup**

Use these exact timing formulas and state rules:

```ts
const firstDelay = (random: () => number): number => 2000 + random() * 2000;
const nextDelay = (random: () => number): number => 5000 + random() * 3000;

private schedule(delayMs: number): void {
  if (this.disposed || this.paused || this.reducedMotion || this.timerId !== null) return;
  this.timerId = this.timer.set(() => {
    this.timerId = null;
    this.playAutomaticEvent();
  }, delayMs);
}

private chooseEvent(): typeof EVENTS[number] {
  const candidates = EVENTS.filter((event) => event.id !== this.lastAutomaticId);
  const index = Math.min(
    candidates.length - 1,
    Math.floor(this.random() * candidates.length),
  );
  return candidates[index] ?? EVENTS[0];
}
```

When an event starts, set `root.dataset.ambientEvent`, invoke `onEvent`, play its optional cue and arm one completion timer. Wrap `onEvent`, `playSound` and `announce` independently in `try/catch`; a presentation callback failure must not escape, keep an active dataset value forever or prevent the completion timer. Completion removes the dataset value and schedules the next event. `start()` is idempotent. `pause()` and `dispose()` must clear both pending and active timers and remove the dataset value. `resume()` schedules a fresh first-delay window and never catches up missed events. `setReducedMotion(true)` pauses automatic events immediately; `setReducedMotion(false)` schedules a fresh first-delay window only if the director was started and is not visibility-paused.

`requestCaptainGreeting()` must return false only when the active event is already `captain-greeting` or the director is disposed. If another automatic event is active, clear its completion timer and presentation first so the player interaction always takes priority. Set `captain-greeting` for 1200 ms, call `announce('末班车还没开走，准备好就一起出发。')`, and then return to the normal next-delay schedule unless reduced motion is active.

- [ ] **Step 5: Run focused tests and commit**

Run:

```powershell
npx vitest run tests/web/station/StationAmbientDirector.spec.ts
npm run typecheck
git add web/station/StationAmbientDirector.ts tests/web/station/StationAmbientDirector.spec.ts
git commit -m "feat: add deterministic station ambient director"
```

Expected: tests and typecheck PASS.

---

### Task 3: 分层车站、票据 UI 与场景生命周期

**Files:**
- Modify: `web/views/StationHeroView.ts`
- Modify: `web/scenes/Scene.ts`
- Modify: `web/scenes/StationScene.ts`
- Modify: `web/LegacyGameRuntime.ts`
- Create: `web/styles/handdrawn-station.css`
- Modify: `web/styles.css`
- Modify: `web/styles/tokens.css`
- Modify: `web/styles/scenes.css`
- Modify: `web/styles/responsive.css`
- Modify: `tests/web/StationHeroView.spec.ts`
- Modify: `tests/web/FeatureScenes.spec.ts`

**Interfaces:**
- Consumes: `CHIBI_ART.station` from Task 1.
- Consumes: `StationAmbientController` and `StationAmbientDirector` from Task 2.
- Produces: `FeatureSceneContext.createStationAmbient(host): StationAmbientController`.
- Produces: `StationScene` methods `pauseForVisibility()`, `resumeForVisibility()`, `setReducedMotion(boolean)`, `requestCaptainGreeting()`, `pauseAmbient()`.

- [ ] **Step 1: Replace old view assertions with failing layered-scene assertions**

Update `tests/web/StationHeroView.spec.ts` to assert:

```ts
const html = renderHero();
expect(html.match(/data-station-layer=/g)).toHaveLength(4);
expect(html).toContain('data-station-layer="sky"');
expect(html).toContain('data-station-layer="horizon"');
expect(html).toContain('data-station-layer="platform"');
expect(html).toContain('data-station-layer="foreground"');
expect(html).toContain('data-ambient-role="mail-fish"');
expect(html).toContain('data-ambient-role="distant-train"');
expect(html).toContain('data-action="captain-greeting"');
expect(html).toContain('station-ticket');
expectSharedVehicleOwnership(html);
```

Keep the existing assertions that train, captain, otter, jellyfish, wake and engine belong to the same exact `.station-hero__vehicle` ancestor.

In `tests/web/FeatureScenes.spec.ts`, create a fake controller and include its factory in the typed context literal before constructing scenes:

```ts
const calls: string[] = [];
const ambient = {
  start: () => calls.push('start'),
  pause: () => calls.push('pause'),
  resume: () => calls.push('resume'),
  setReducedMotion: (value: boolean) => calls.push(`motion:${value}`),
  requestCaptainGreeting: () => true,
  dispose: () => calls.push('dispose'),
};
const context: FeatureSceneContext = {
  renderStation: () => '<div>station-only</div>',
  renderCaptain: () => '<div>captain-only</div>',
  renderEquipment: () => '<div>equipment-only</div>',
  renderLegion: () => '<div>legion-only</div>',
  renderStore: () => '<div>store-only</div>',
  createStationAmbient: () => ambient,
  dispatch: () => undefined,
};
const hero = { dataset: {} } as HTMLElement;
const listeners = new Set<EventListener>();
const host = {
  innerHTML: '',
  querySelector: (selector: string) => selector === '.station-hero' ? hero : null,
  querySelectorAll: () => [],
  addEventListener: (_type: string, listener: EventListener) => listeners.add(listener),
  removeEventListener: (_type: string, listener: EventListener) => listeners.delete(listener),
} as unknown as HTMLElement;
const scene = createStationScene(context);
scene.mount(host);
scene.pauseForVisibility();
scene.resumeForVisibility();
scene.setReducedMotion(true);
scene.unmount();
expect(calls).toEqual(['start', 'pause', 'resume', 'motion:true', 'dispose']);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
npx vitest run tests/web/StationHeroView.spec.ts tests/web/FeatureScenes.spec.ts
```

Expected: FAIL because the layered markup and ambient factory do not exist.

- [ ] **Step 3: Render the four scene layers and purposeful actors**

Replace the single background image in `renderStationHero()` with this structure while preserving the existing model values and the exact shared vehicle frame:

```ts
return `<section class="station-hero" data-reduced-motion="${model.reducedMotion}" aria-labelledby="station-hero-title">
  <div class="station-hero__world" data-motion-role="background" aria-hidden="true">
    <img class="station-layer station-layer--sky" data-station-layer="sky" data-station-art src="${CHIBI_ART.station.sky}" alt="" />
    <img class="station-layer station-layer--horizon" data-station-layer="horizon" data-station-art src="${CHIBI_ART.station.horizon}" alt="" />
    <img class="station-layer station-layer--platform" data-station-layer="platform" data-station-art src="${CHIBI_ART.station.platform}" alt="" />
    <img class="station-layer station-layer--foreground" data-station-layer="foreground" data-station-art src="${CHIBI_ART.station.foreground}" alt="" />
    <span class="station-lamp station-lamp--left" data-ambient-role="lamp-left"></span>
    <span class="station-lamp station-lamp--right" data-ambient-role="lamp-right"></span>
    <img class="station-ambient station-ambient--distant-train" data-ambient-role="distant-train" data-station-art src="${CHIBI_ART.station.distantTrain}" alt="" />
    <img class="station-ambient station-ambient--mail-fish" data-ambient-role="mail-fish" data-station-art src="${CHIBI_ART.station.mailFish}" alt="" />
  </div>
  <div class="station-ticket">
    <span class="station-ticket__stamp">STATION ${model.stationLevel}</span>
    <h1 id="station-hero-title">潮汐末班站</h1>
    <p>夕潮将落，带上本局构筑前往下一站。</p>
    <div class="station-ticket__facts">
      <span>航线 ${model.mapName}</span>
      <span>生命 ${model.maxHp}</span>
      <span>永久伤害 +${model.damagePercent}%</span>
    </div>
    <button class="station-departure" data-action="start-run">检票出发</button>
  </div>
  <div class="station-hero__vehicle" data-motion-role="vehicle">
    <div class="station-hero__wake" data-motion-role="wake" aria-hidden="true"><i></i><i></i><i></i></div>
    <span class="station-hero__engine-glow" data-motion-role="engine" aria-hidden="true"></span>
    <span class="station-service-hatch" data-ambient-role="service-hatch" aria-hidden="true"></span>
    <span class="station-art-fallback station-art-fallback--train" aria-hidden="true"></span>
    <img class="station-hero__train" data-motion-role="train" data-station-art src="${CHIBI_ART.train}" alt="泡泡列车" />
    <button class="station-hero__captain-button" data-action="captain-greeting" aria-label="和列车长打招呼">
      <span class="station-art-fallback station-art-fallback--captain" aria-hidden="true"></span>
      <img class="captain-art station-hero__captain" data-motion-role="captain" data-ambient-role="captain" data-station-art src="${captainArt}" alt="${captain.name} · ${skin.name}" />
    </button>
    <img class="companion-art station-hero__otter" data-motion-role="otter" data-ambient-role="otter" data-station-art src="${CHIBI_ART.otter}" alt="" aria-hidden="true" />
    <img class="companion-art station-hero__jellyfish" data-motion-role="jellyfish" data-ambient-role="jellyfish" data-station-art src="${CHIBI_ART.jellyfish}" alt="" aria-hidden="true" />
  </div>
  <p class="station-dialogue" data-ambient-role="dialogue" aria-live="polite"></p>
</section>`;
```

The implementation must interpolate real URLs, captain/skin names, map, HP and permanent damage values. It must not bake text into images.

- [ ] **Step 4: Give `StationScene` ownership of the ambient lifecycle and missing-image fallback**

Add this contract to `FeatureSceneContext`:

```ts
createStationAmbient(host: HTMLElement): StationAmbientController;
```

Make `createStationScene()` return an extended `StationScene` interface. On every mount, dispose the previous director, render the station body, register one capture-phase `error` listener, create the director with the `.station-hero` element, and call `start()`. The error listener must add `is-missing` to a failed `[data-station-art]` image so the CSS fallback behind it becomes visible. Unmount removes the listener, disposes the director and clears references.

Delegating methods must be exact:

```ts
pauseForVisibility(): void { ambient?.pause(); }
resumeForVisibility(): void { ambient?.resume(); }
setReducedMotion(value: boolean): void { ambient?.setReducedMotion(value); }
requestCaptainGreeting(): boolean {
  return ambient?.requestCaptainGreeting() ?? false;
}
pauseAmbient(): void { ambient?.pause(); }
```

- [ ] **Step 5: Connect the scene to runtime visibility, settings and captain greeting**

In `LegacyGameRuntime.ts`:

```ts
let activeStationScene: StationScene | null = null;

// In the scene factory:
if (sceneId === 'station') {
  const scene = createStationScene(featureContext);
  activeStationScene = scene;
  return scene;
}

// In featureContext:
createStationAmbient: (host) => new StationAmbientDirector(host, {
  reducedMotion: effectiveReducedMotion,
  announce: (message) => {
    const dialogue = host.querySelector<HTMLElement>('[data-ambient-role="dialogue"]');
    if (dialogue) dialogue.textContent = message;
  },
}),
```

`handlePageHidden()` calls `activeStationScene?.pauseForVisibility()` before pausing audio. `handlePageVisible()` resumes audio and then calls `activeStationScene?.resumeForVisibility()` only when the current scene is not battle. `applyRuntimeSettings()` forwards the effective reduced-motion value. The global click handler handles `captain-greeting`, delegates to the active station scene and returns without changing save data.

- [ ] **Step 6: Add the hand-drawn visual tokens and station stylesheet**

Add these tokens to `web/styles/tokens.css`:

```css
--ink-drawn: #17344c;
--paper-warm: #fff2d2;
--paper-shadow: #e8c99a;
--sunset-coral: #ef785f;
--sunset-gold: #f3bb66;
--twilight-blue: #234f72;
--deep-shadow: #102a40;
--line-drawn: rgb(23 52 76 / 76%);
--paper-grain: radial-gradient(circle at 20% 10%, rgb(23 52 76 / 5%) 0 1px, transparent 1.5px);
```

Create `web/styles/handdrawn-station.css` with these required behaviors:

```css
.station-hero {
  position: relative;
  isolation: isolate;
  min-height: 620px;
  overflow: hidden;
  border: 3px solid var(--ink-drawn);
  border-radius: 26px 22px 30px 20px;
  background: #e89b72;
  box-shadow: 0 16px 0 rgb(16 42 64 / 24%);
}

.station-hero__world,
.station-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.station-layer { object-fit: cover; pointer-events: none; }
.station-layer--sky { z-index: -6; }
.station-layer--horizon { z-index: -5; }
.station-layer--platform { z-index: -4; }
.station-layer--foreground { z-index: 8; pointer-events: none; }

.station-ticket {
  position: absolute;
  z-index: 10;
  top: 30px;
  left: 34px;
  width: min(43%, 430px);
  padding: 20px;
  color: var(--ink-drawn);
  border: 3px solid var(--ink-drawn);
  border-radius: 18px 14px 20px 13px;
  background-color: var(--paper-warm);
  background-image: var(--paper-grain);
  box-shadow: 7px 8px 0 rgb(16 42 64 / 28%);
  transform: rotate(-.35deg);
}

.station-departure {
  min-width: 190px;
  color: #fff8df;
  border: 3px solid var(--ink-drawn);
  border-radius: 14px 11px 15px 10px;
  background: var(--sunset-coral);
  box-shadow: 0 5px 0 #9b3f3b;
  font-weight: 900;
}

.station-departure:active { transform: translateY(4px) rotate(.5deg); box-shadow: 0 1px 0 #9b3f3b; }
.station-hero__vehicle { position: absolute; z-index: 2; inset: 0; pointer-events: none; }
.station-hero__captain-button { position: absolute; z-index: 4; bottom: -2%; left: 5%; width: min(27%, 270px); padding: 0; background: transparent; pointer-events: auto; }
.station-hero__captain { width: 100%; filter: drop-shadow(5px 9px 0 rgb(16 42 64 / 34%)); }
.station-hero__train { position: absolute; right: -7%; bottom: 2%; width: min(64%, 690px); filter: drop-shadow(8px 13px 0 rgb(16 42 64 / 30%)); }
.station-hero [data-station-art].is-missing { visibility: hidden; }
.station-art-fallback--captain { position: absolute; inset: 16% 18% 4%; border-radius: 48% 48% 40% 40%; background: var(--twilight-blue); }
```

Add event selectors for all six IDs. Each selector animates only its purposeful actor. Use 1800/1600/1700/2200/1400/1200 ms durations matching Task 2. `mechanic-check` tilts the otter and service hatch; `station-call` raises the jellyfish and brightens two lamps; `mail-drop` moves the mail fish across the upper middle; `distant-train` crosses the horizon; `captain-idle` moves the captain by at most 3 px; `captain-greeting` tilts the captain button by at most 2 degrees and reveals the dialogue.

For `[data-reduced-motion="true"]`, disable layer transforms and event keyframes while leaving event text visible. At `max-width: 430px`, make the ticket span left/right 12 px, move it to the top, place the train in the lower 36% and keep the captain button at 39–43% width. Import the file after `scenes.css` in `web/styles.css`.

- [ ] **Step 7: Run station tests, typecheck and commit**

Run:

```powershell
npx vitest run tests/web/StationHeroView.spec.ts tests/web/FeatureScenes.spec.ts tests/web/station/StationAmbientDirector.spec.ts
npm run typecheck
git diff --check
git add web/views/StationHeroView.ts web/scenes/Scene.ts web/scenes/StationScene.ts web/LegacyGameRuntime.ts web/styles.css web/styles/tokens.css web/styles/scenes.css web/styles/responsive.css web/styles/handdrawn-station.css tests/web/StationHeroView.spec.ts tests/web/FeatureScenes.spec.ts
git commit -m "feat: build hand-drawn living station scene"
```

Expected: focused tests, typecheck and diff check PASS.

---

### Task 4: 检票、出发演出与车站声音

**Files:**
- Modify: `web/audio/AudioTypes.ts`
- Modify: `web/audio/SfxSynth.ts`
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `web/app/StationDepartureController.ts`
- Modify: `web/styles/handdrawn-station.css`
- Modify: `tests/web/audio/SfxSynth.spec.ts`
- Modify: `tests/web/StationDepartureController.spec.ts`

**Interfaces:**
- Extends: `SoundCue` with `ticket-stamp`, `station-tool`, `station-chime`, `station-mail`, `station-whistle`.
- Preserves: `StationDepartureController.beginCharging(): boolean` and `playDeparture(): Promise<boolean>`.
- Changes: normal departure duration from 700 ms to 1200 ms; reduced-motion duration remains 80 ms.

- [ ] **Step 1: Write failing sound and duration tests**

Add to `tests/web/audio/SfxSynth.spec.ts`:

```ts
it('renders every station-life cue as a short procedural recipe', () => {
  const backend = new RecordingAudioBackend();
  const synth = new SfxSynth(backend);
  const cues = [
    'ticket-stamp',
    'station-tool',
    'station-chime',
    'station-mail',
    'station-whistle',
  ] as const;
  cues.forEach((cue, index) => expect(synth.play(cue, index + 1)).toBe(true));
  expect(backend.instructions.length).toBeGreaterThanOrEqual(8);
});
```

Change the normal departure expectation in `tests/web/StationDepartureController.spec.ts` from 700 to 1200 ms. Keep the 80 ms reduced-motion assertion unchanged. Change the station CSS assertion in `tests/web/StationHeroView.spec.ts` to read `handdrawn-station.css` and require `station-vehicle-departing 1200ms`.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
npx vitest run tests/web/audio/SfxSynth.spec.ts tests/web/StationDepartureController.spec.ts
```

Expected: FAIL because the cues are not in `SoundCue` and the controller still uses 700 ms.

- [ ] **Step 3: Add exact station sound recipes**

Map `ticket-stamp` and `station-chime` to `ui`, `station-tool` and `station-mail` to `other`, and `station-whistle` to `major`. Add these switch cases:

```ts
case 'ticket-stamp':
  this.tone(nowSeconds, 0, 180, 0.035, 0.12, 'square', 0, 900);
  this.tone(nowSeconds, 0.025, 92, 0.055, 0.1, 'triangle', 0, 480);
  return;
case 'station-tool':
  this.arpeggio(nowSeconds, [620, 410], 0.055, 0.07, 0.055, 'triangle');
  return;
case 'station-chime':
  this.arpeggio(nowSeconds, [523.25, 659.25, 783.99], 0.09, 0.18, 0.07, 'sine');
  return;
case 'station-mail':
  this.arpeggio(nowSeconds, [392, 493.88], 0.045, 0.08, 0.06, 'triangle');
  return;
case 'station-whistle':
  this.tone(nowSeconds, 0, 293.66, 0.5, 0.055, 'sine', -0.35, 1700);
  this.tone(nowSeconds, 0.08, 440, 0.42, 0.035, 'sine', 0.35, 2200);
  return;
```

- [ ] **Step 4: Connect ambient sounds and pause them during departure**

Pass `playSound: (cue) => { audio.playSound(cue); }` when creating `StationAmbientDirector`. In `startRun()`:

1. Replace the current post-unlock `ui-tap` cue with `ticket-stamp`; do not play both cues.
2. Call `activeStationScene?.pauseAmbient()` only after `departure.beginCharging()` succeeds.
3. Keep existing `train-charge` while critical assets load.
4. Keep existing `train-depart` immediately before `playDeparture()`.
5. On cancellation or failure while still in station phase and `pageHidden === false`, call `activeStationScene?.resumeForVisibility()` after restoring idle train sound.
6. Do not resume the ambient director after successful navigation to battle; station unmount disposes it.

- [ ] **Step 5: Implement the 1200 ms visual choreography**

Change only the normal duration constant in `StationDepartureController`:

```ts
const durationMs = this.reducedMotion ? 80 : 1200;
```

In `handdrawn-station.css`, keep charging indefinite while assets load: stamp depresses, two station lamps illuminate, the otter moves toward the service hatch and the engine glow rises. During the 1200 ms departing state: door closes in 0–220 ms, otter boards in 120–420 ms, vehicle compresses in 0–260 ms, then vehicle and every owned child move right in 260–1200 ms. Wake and foreground speed lines rise only after 260 ms. The normal transition may use transforms and opacity only. The reduced-motion path stays an 80 ms opacity change.

- [ ] **Step 6: Run audio, departure and station tests, then commit**

Run:

```powershell
npx vitest run tests/web/audio/SfxSynth.spec.ts tests/web/audio/AudioManager.spec.ts tests/web/StationDepartureController.spec.ts tests/web/StationHeroView.spec.ts tests/web/station/StationAmbientDirector.spec.ts
npm run typecheck
git diff --check
git add web/audio/AudioTypes.ts web/audio/SfxSynth.ts web/LegacyGameRuntime.ts web/app/StationDepartureController.ts web/styles/handdrawn-station.css tests/web/audio/SfxSynth.spec.ts tests/web/StationDepartureController.spec.ts tests/web/StationHeroView.spec.ts
git commit -m "feat: choreograph ticketed station departure"
```

Expected: focused tests, typecheck and diff check PASS.

---

### Task 5: 手绘战斗视差与画质降级

**Files:**
- Create: `web/battle/HandDrawnParallax.ts`
- Create: `tests/web/battle/HandDrawnParallax.spec.ts`
- Modify: `web/assets/BattleArtCatalog.ts`
- Modify: `web/battle/QualityMonitor.ts`
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `web/styles/battle-canvas.css`
- Modify: `tests/web/battle/BattleRenderer.spec.ts`
- Modify: `tests/web/battle/QualityMonitor.spec.ts`
- Modify: `tests/smoke/battle-assets.spec.ts`

**Interfaces:**
- Produces: `createHandDrawnParallax(input): readonly HandDrawnParallaxPose[]`.
- Consumes: `TrainMotionFrameView.laneOffset`, `timeMs`, `reducedMotion`, and `RenderBudget.backgroundLayers`.
- Extends: `RenderBudget` with `backgroundLayers: 4 | 3 | 2`.

- [ ] **Step 1: Write failing pure parallax tests**

```ts
it('uses four ordered layers at high quality and moves near layers faster', () => {
  const poses = createHandDrawnParallax({
    timeMs: 1000,
    laneOffset: 240,
    backgroundLayers: 4,
    reducedMotion: false,
  });
  expect(poses.map((pose) => pose.id)).toEqual([
    'sky', 'horizon', 'track', 'foreground',
  ]);
  expect(Math.abs(poses[3]!.offsetY)).toBeGreaterThan(Math.abs(poses[1]!.offsetY));
});

it('keeps sky and track only at low quality', () => {
  const poses = createHandDrawnParallax({
    timeMs: 1000,
    laneOffset: 240,
    backgroundLayers: 2,
    reducedMotion: false,
  });
  expect(poses.map((pose) => pose.id)).toEqual(['sky', 'track']);
});

it('freezes decorative drift for reduced motion while preserving the track', () => {
  const first = createHandDrawnParallax({
    timeMs: 1000, laneOffset: 240, backgroundLayers: 4, reducedMotion: true,
  });
  const second = createHandDrawnParallax({
    timeMs: 9000, laneOffset: 240, backgroundLayers: 4, reducedMotion: true,
  });
  expect(second).toEqual(first);
  expect(first.some((pose) => pose.id === 'track')).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npx vitest run tests/web/battle/HandDrawnParallax.spec.ts tests/web/battle/QualityMonitor.spec.ts
```

Expected: FAIL because the module and `backgroundLayers` budget do not exist.

- [ ] **Step 3: Implement exact parallax types and layer selection**

```ts
export type HandDrawnParallaxId = 'sky' | 'horizon' | 'track' | 'foreground';

export interface HandDrawnParallaxInput {
  readonly timeMs: number;
  readonly laneOffset: number;
  readonly backgroundLayers: 2 | 3 | 4;
  readonly reducedMotion: boolean;
}

export interface HandDrawnParallaxPose {
  readonly id: HandDrawnParallaxId;
  readonly artId:
    | 'backgroundSky'
    | 'backgroundHorizon'
    | 'backgroundTrack'
    | 'backgroundForeground';
  readonly offsetX: number;
  readonly offsetY: number;
  readonly repeatY: boolean;
  readonly alpha: number;
}
```

Use this selection rule: 2 layers = sky + track; 3 layers = sky + horizon + track; 4 layers = all four. With normal motion, sky uses horizontal `sin(timeMs / 5000) * 3`, horizon uses `-laneOffset * 0.08`, track uses `laneOffset`, and foreground uses `laneOffset * 1.42`. Wrap repeating Y offsets into `0..844`. With reduced motion, time-based drift is zero and lane-based movement is represented by one fixed 6 px track offset.

- [ ] **Step 4: Add background layer budgets**

Add `backgroundLayers` to `RenderBudget` and use exact values:

```ts
export const RENDER_BUDGETS: Readonly<Record<QualityLevel, RenderBudget>> = {
  high: {
    backgroundLayers: 4,
    backgroundParticles: 36,
    visibleProjectileTrails: 120,
    particles: 200,
    damageNumbers: 18,
    impactRings: 24,
    travelMarkers: 15,
    trainWakeSegments: 6,
    dprCap: 2,
  },
  medium: {
    backgroundLayers: 3,
    backgroundParticles: 18,
    visibleProjectileTrails: 100,
    particles: 130,
    damageNumbers: 12,
    impactRings: 16,
    travelMarkers: 9,
    trainWakeSegments: 4,
    dprCap: 1.75,
  },
  low: {
    backgroundLayers: 2,
    backgroundParticles: 0,
    visibleProjectileTrails: 80,
    particles: 80,
    damageNumbers: 8,
    impactRings: 10,
    travelMarkers: 3,
    trainWakeSegments: 2,
    dprCap: 1.5,
  },
};
```

Update quality tests to assert 4/3/2 and leave all existing particle, trail, ring and DPR values unchanged.

- [ ] **Step 5: Replace the single battle background draw with ordered layered draws**

Remove the compatibility `background` URL from `BATTLE_ART_URLS` and replace `drawBackground()` with a method that calls `createHandDrawnParallax()`. Draw each pose on the `background` layer. Sky and horizon use one 398 × 860 image. Track and foreground use two vertically adjacent 398 × 860 images when `repeatY` is true so movement never exposes a blank strip. Missing optional horizon or foreground assets are skipped; missing sky or track leaves the warm CSS/Canvas fallback visible.

Update renderer tests to assert:

```ts
expect(commands.filter((command) => command.kind.startsWith('background-')).map((command) => command.kind)).toEqual([
  'background-sky',
  'background-horizon',
  'background-track',
  'background-track',
  'background-foreground',
  'background-foreground',
]);
```

At low quality, assert no `background-horizon` or `background-foreground` commands. Keep train, enemies, HUD and settlement behavior unchanged.

- [ ] **Step 6: Run battle rendering tests and commit**

Run:

```powershell
npx vitest run tests/web/battle/HandDrawnParallax.spec.ts tests/web/battle/QualityMonitor.spec.ts tests/web/battle/BattleRenderer.spec.ts tests/smoke/battle-assets.spec.ts
npm run typecheck
npm run check:assets
git diff --check
git add web/battle/HandDrawnParallax.ts web/assets/BattleArtCatalog.ts web/battle/QualityMonitor.ts web/battle/BattleRenderer.ts web/styles/battle-canvas.css tests/web/battle/HandDrawnParallax.spec.ts tests/web/battle/QualityMonitor.spec.ts tests/web/battle/BattleRenderer.spec.ts tests/smoke/battle-assets.spec.ts
git commit -m "feat: add hand-drawn battle parallax"
```

Expected: focused tests, typecheck, asset budget and diff check PASS.

---

### Task 6: 赛璐璐命中、击败与奖励特效

**Files:**
- Modify: `web/battle/EffectSystem.ts`
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `tests/web/battle/EffectSystem.spec.ts`
- Modify: `tests/web/battle/BattleRenderer.spec.ts`

**Interfaces:**
- Extends: `EffectParticleKind` with `brush-smear`, `defeat-squash`, `ink-bubble`.
- Extends: `EffectParticleView` with normalized `progress: number`.
- Preserves: existing `EffectFrameView`, pool stats, render budgets and battle-event inputs.

- [ ] **Step 1: Write failing effect semantics tests**

Add to `tests/web/battle/EffectSystem.spec.ts`:

```ts
it('turns an enemy kill into one high-priority squash followed by ink bubbles', () => {
  const effects = new EffectSystem({
    particleLimit: 80,
    damageNumberLimit: 8,
    reducedMotion: false,
  });
  effects.consume([{
    type: 'enemy-killed',
    enemyId: 7,
    kind: 'bubble-fin',
    x: 120,
    y: 260,
  }], createFrameFixture());

  expect(effects.view.particles.filter((item) => item.kind === 'defeat-squash')).toHaveLength(1);
  expect(effects.view.particles.filter((item) => item.kind === 'ink-bubble').length).toBeGreaterThanOrEqual(4);
  effects.update(120);
  expect(effects.view.particles.find((item) => item.kind === 'defeat-squash')!.progress).toBeGreaterThan(0);
});

it('retains the defeat squash when the low-quality particle budget trims decoration', () => {
  const effects = new EffectSystem({ particleLimit: 8, damageNumberLimit: 4, reducedMotion: false });
  effects.consume([{ type: 'battle-won' }], createFrameFixture());
  effects.consume([{
    type: 'enemy-killed', enemyId: 9, kind: 'bubble-fin', x: 195, y: 260,
  }], createFrameFixture());
  expect(effects.view.particles.some((item) => item.kind === 'defeat-squash')).toBe(true);
});
```

Add a renderer assertion that `defeat-squash` produces a wide, short ellipse and `ink-bubble` uses `source-over`, not `screen` blend mode.

- [ ] **Step 2: Run effect tests and verify failure**

Run:

```powershell
npx vitest run tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleRenderer.spec.ts
```

Expected: FAIL because the new kinds and progress value do not exist.

- [ ] **Step 3: Extend pooled particle views without adding a second animation loop**

Add `progress` in the view mapping:

```ts
progress: Math.min(1, particle.ageMs / Math.max(1, particle.lifetimeMs)),
```

Add a dedicated helper that acquires one particle from the existing pool:

```ts
private spawnDefeatSquash(x: number, y: number, boss: boolean): void {
  if (this.particleLimit <= 0) return;
  const particle = this.particlePool.acquire();
  particle.id = this.nextId++;
  particle.kind = 'defeat-squash';
  particle.layer = 'front-effects';
  particle.color = boss ? '#243f67' : '#315c70';
  particle.size = boss ? 42 : 24;
  particle.lifetimeMs = boss ? 420 : 260;
  particle.priority = 8;
  particle.x = x;
  particle.y = y;
  particle.vx = 0;
  particle.vy = 0;
  particle.rotation = 0;
  particle.spin = 0;
  particle.ageMs = 0;
  this.particles.push(particle);
}
```

On `weapon-fired`, add two `brush-smear` particles behind the existing muzzle burst. On `projectile-hit`, use three or six compact brush-smear particles depending on critical state. On `enemy-killed`, call `spawnDefeatSquash()` first, then spawn 6 normal / 9 elite / 14 boss `ink-bubble` particles and keep the existing ring and camera rules. Assign priority 8 to squash, 4 to ink bubbles and at most 2 to decorative shards so trim order is deterministic.

- [ ] **Step 4: Draw matte hand-made shapes**

In `drawEffectParticles()`:

```ts
if (particle.kind === 'defeat-squash') {
  this.painter.ellipse({
    kind: 'effect-defeat-squash',
    layer,
    x: particle.x,
    y: particle.y + particle.size * particle.progress * 0.22,
    radiusX: particle.size * (1 + particle.progress * 0.9),
    radiusY: particle.size * (0.8 - particle.progress * 0.5),
    fill: particle.color,
    stroke: '#17344c',
    lineWidth: 3,
    alpha: particle.alpha,
    blendMode: 'source-over',
  });
  continue;
}
```

Render `brush-smear` as a rotated ellipse with `radiusX = size * 2.2`, `radiusY = size * 0.42`; render `ink-bubble` as a circle with dark-blue stroke and no glow. Existing `skill` and `muzzle` can retain `screen`; all new hand-drawn kinds use `source-over`. Change default impact-ring stroke from pure luminous cyan to `#fff2d2` with a dark-blue secondary line for critical or defeat rings.

- [ ] **Step 5: Verify pooling, low-quality trim and battle determinism**

Run:

```powershell
npx vitest run tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleRenderer.spec.ts tests/web/battle/BattleQualityDeterminism.spec.ts tests/web/battle/BattleIntegration.spec.ts
npm run typecheck
git diff --check
git add web/battle/EffectSystem.ts web/battle/BattleRenderer.ts tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleRenderer.spec.ts
git commit -m "feat: add hand-drawn combat impact language"
```

Expected: all focused tests PASS; no battle frame or reward value changes.

---

### Task 7: 浏览器回归、降级与视觉验收

**Files:**
- Modify: `scripts/smoke-browser.mjs`
- Modify: `tests/smoke/browser-script.spec.ts`
- Modify: `tests/web/StationHeroView.spec.ts`
- Modify: `tests/web/FeatureScenes.spec.ts`

**Interfaces:**
- Consumes: exact DOM roles and scene methods from Tasks 2–4.
- Preserves: existing four-viewpoint departure ownership and battle E2E checks.

- [ ] **Step 1: Add failing browser-script source requirements**

Extend `tests/smoke/browser-script.spec.ts`:

```ts
expect(source).toContain('inspectHandDrawnStation');
expect(source).toContain('data-station-layer');
expect(source).toContain('captain-greeting');
expect(source).toContain('background-foreground');
expect(source).toContain('data-ambient-event');
```

- [ ] **Step 2: Run source test and verify failure**

Run:

```powershell
npx vitest run tests/smoke/browser-script.spec.ts
```

Expected: FAIL because smoke coverage has not been added.

- [ ] **Step 3: Add a non-flaky station inspection to browser smoke**

Implement `inspectHandDrawnStation(client, label)` with one browser evaluation that returns:

```js
({
  layerIds: [...document.querySelectorAll('[data-station-layer]')]
    .map((node) => node.getAttribute('data-station-layer')),
  ambientReady: Boolean(document.querySelector('[data-ambient-role="mail-fish"]'))
    && Boolean(document.querySelector('[data-ambient-role="distant-train"]')),
  captainButtonSize: (() => {
    const rect = document.querySelector('[data-action="captain-greeting"]')
      ?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height } : null;
  })(),
  ticketBackground: getComputedStyle(document.querySelector('.station-ticket')).backgroundColor,
  backdropFilter: getComputedStyle(document.querySelector('.station-ticket')).backdropFilter,
})
```

Assert layer order is exactly sky, horizon, platform, foreground; both ambient actors exist; captain button is at least 44 × 44 CSS pixels; ticket backdrop filter is `none`; and the warm paper background is non-transparent.

Then click the captain greeting button, wait up to 500 ms for `data-ambient-event="captain-greeting"`, and assert the `aria-live` dialogue contains `末班车`. Do this before measuring the departure pose so the greeting completion cannot overlap the departure.

- [ ] **Step 4: Preserve and extend existing departure and battle smoke checks**

Keep all existing assertions that the train, captain, otter, jellyfish, wake and engine share the exact vehicle ancestor and relative displacement tolerance at all four viewports. Update the expected normal departure timing to allow the 1200 ms choreography. Browser smoke must still enter battle, observe non-zero train motion, complete the deterministic battle path and return to station. Layer command semantics remain covered only by `BattleRenderer.spec.ts`; do not expose draw commands through a new production global. The ordinary public URL without `e2e=1` must still return `undefined` for `window.__TIDAL_TRAIN_E2E__`.

- [ ] **Step 5: Run the complete local release gate**

Run in this order:

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
npm run smoke:browser
npm audit --audit-level=high
git diff --check
```

Expected: every command exits 0; Vitest reports no failed files; asset output ends with `asset budget ok`; Vite emits `dist`; all four browser viewports pass; audit reports 0 high-or-higher vulnerabilities.

- [ ] **Step 6: Perform human visual QA on the actual composition**

Serve the production build with `npx vite preview --host 127.0.0.1 --strictPort --port 4188`. Capture or inspect 390 × 844 and 430 × 932 station frames plus one battle frame. Verify all of the following:

- one-second hierarchy is captain → train → departure button;
- sunset light direction matches on background, train, captain and companions;
- no element has mirror-like plastic shine or pseudo-text;
- feet and train contact shadows prevent sticker-like floating;
- ticket panel is paper/ink, not glass;
- only one narrative event is visually dominant;
- battle enemies remain readable against the warm track;
- normal attack, active skill, hit and defeat have distinct silhouettes;
- low quality removes foreground decoration but not track, enemies, train or defeat cue;
- reduced motion removes continuous drift and camera shake but preserves state text.

Stop the preview process after inspection.

- [ ] **Step 7: Commit browser and resilience coverage**

```powershell
git add scripts/smoke-browser.mjs tests/smoke/browser-script.spec.ts tests/web/StationHeroView.spec.ts tests/web/FeatureScenes.spec.ts
git commit -m "test: lock hand-drawn vertical slice behavior"
```

---

### Task 8: 文档、最终审查与 GitHub Pages 发布

**Files:**
- Modify: `README.md`
- Verify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Produces: a clean commit on `feature/tidal-train-prototype`, pushed exactly to `origin/main` after all gates pass.
- Produces: public GitHub Pages URL with the hand-drawn release.

- [ ] **Step 1: Update README with the new verified state**

Add a concise “手绘生活世界精品竖切” section that states:

- the station now uses four hand-drawn sunset layers and purposeful ambient events;
- departure is a 1200 ms choreography with an 80 ms reduced-motion fallback;
- battle uses 4/3/2 parallax layers by quality level and pooled cel-style hit/defeat effects;
- business rules, save data and public payment limitations remain unchanged;
- the exact local verification commands are the seven commands from Task 7.

Do not claim Douyin/Cocos real-device FPS or real payment availability.

- [ ] **Step 2: Run the final gate from a clean dependency state**

Run:

```powershell
npm ci
npm test
npm run typecheck
npm run check:assets
npm run build
npm run smoke:browser
npm audit --audit-level=high
git diff --check
git status --short
```

Expected: all gates exit 0. Before committing README, `git status --short` lists only `README.md`; after committing, it is empty.

- [ ] **Step 3: Commit release documentation**

```powershell
git add README.md
git commit -m "docs: describe hand-drawn vertical slice release"
git status --short --branch
```

Expected: clean working tree and branch ahead of `origin/main` only by this feature's reviewed commits.

- [ ] **Step 4: Review the complete branch before publishing**

Run:

```powershell
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Review that the diff contains only the approved design document, implementation plan, hand-drawn runtime assets, station/battle/audio code, tests and README. It must not contain payment QR images, credentials, production receipts, unrelated files or generated `dist` output.

- [ ] **Step 5: Publish the reviewed commit set to GitHub main**

```powershell
git push origin HEAD:main
```

Expected: push succeeds without force. Do not use `--force`.

- [ ] **Step 6: Verify GitHub Pages workflow and public artifact**

Run:

```powershell
$headSha=git rev-parse HEAD
$run=gh run list --workflow "Deploy GitHub Pages" --branch main --limit 1 --json databaseId,headSha,status,conclusion,url | ConvertFrom-Json
if($run.headSha -ne $headSha){ throw "latest Pages run does not match $headSha" }
gh run watch $run.databaseId --exit-status
$run=gh run view $run.databaseId --json headSha,status,conclusion,url | ConvertFrom-Json
$run
```

Expected: `headSha` equals the pushed SHA, `status` is `completed`, and `conclusion` is `success`.

Verify the public document and assets:

```powershell
$url='https://whwebeb65-del.github.io/tidal-train-roguelike/?release=handdrawn-v1'
$response=Invoke-WebRequest -Uri $url -UseBasicParsing
$response.StatusCode
$response.Content | Select-String '<title>最后一班：潮汐列车</title>'
```

Expected: status 200 and the title match. Open the same URL without `e2e=1` and verify `window.__TIDAL_TRAIN_E2E__` is undefined. Confirm every emitted JS, CSS and WebP URL requested by the page returns 200 with the expected content type.

- [ ] **Step 7: Record release evidence**

Report the final SHA, successful Actions run URL, public Pages URL, test counts, asset-budget totals, four viewport smoke result and any remaining platform-bound limitations. The only acceptable remaining limitations are real Douyin ads/share/payment/login, production server/social data and Cocos real-device validation.

---

## Plan Completion Criteria

The plan is complete only when all eight task commits exist, the working tree is clean, all local gates pass, GitHub Pages deploys the exact reviewed SHA, and the public ordinary URL shows the hand-drawn station and battle without exposing E2E controls.
