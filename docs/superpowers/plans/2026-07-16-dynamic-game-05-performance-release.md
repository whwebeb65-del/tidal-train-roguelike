# Dynamic Game 05 Performance, Browser Regression, and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对动态游戏进行对象复用、自适应画质、资源预算、两局稳定性和真实 Chrome 回归，更新试玩文档与 CI，并把通过门禁的版本重新发布到 GitHub Pages。

**Architecture:** `EntityPool` 复用短寿命对象；`QualityMonitor` 只根据帧时间控制视觉预算，不改变引擎实体和伤害；`BattleDiagnostics` 提供无敏感数据的运行计数；`smoke-browser.mjs` 使用本机/CI Chrome DevTools Protocol 运行四档移动视口和完整单局；GitHub Actions 在构建后运行同一浏览器门禁，再部署 Pages。

**Tech Stack:** TypeScript、Vitest、Node.js 22、Chrome DevTools Protocol、Vite preview、GitHub Actions/Pages。

## Global Constraints

- 画质变化只能减少背景粒子、残影、碎片、普通闪光、伤害数字和 DPR；不能减少真实敌人、炮弹判定、伤害或奖励。
- 高/中/低画质必须产生相同 `BattleOutcome`。
- 单帧最多补 5 个逻辑步；隐藏页面恢复后不补算。
- 连续完成两局后，活动帧循环、事件监听器、效果对象和声音节点必须回到稳定区间。
- 浏览器 smoke 不使用外部测试服务，不向线上账号写入数据。
- E2E 加速入口仅在 URL 明确含 `e2e=1` 时暴露，不能在普通页面创建全局调试对象。
- 发布不得 force push；远端 `main` 不是当前提交祖先时必须停止并非破坏性地处理分歧。
- 不宣称未经真实抖音开发者工具和安卓目标机验证的 60 FPS。

---

## 目标文件结构

```text
web/battle/
├─ EntityPool.ts
├─ QualityMonitor.ts
├─ BattleDiagnostics.ts
└─ BattleE2EHooks.ts
scripts/
├─ check-asset-budget.mjs
├─ smoke-browser.mjs
└─ lib/
   └─ chrome-cdp.mjs
tests/
├─ web/battle/
│  ├─ EntityPool.spec.ts
│  ├─ QualityMonitor.spec.ts
│  └─ BattleDiagnostics.spec.ts
└─ smoke/
   └─ browser-script.spec.ts
docs/testing/
├─ prototype-playtest-script.md
└─ prototype-results-template.md
```

## Task 1: 为短寿命战斗对象建立对象池

**Files:**

- Create: `web/battle/EntityPool.ts`
- Create: `tests/web/battle/EntityPool.spec.ts`
- Modify: `web/battle/BattleEngine.ts`
- Modify: `web/battle/EffectSystem.ts`

**Interfaces:**

- `EntityPool<T>.acquire()/release()/releaseAll()`
- `EntityPool<T>.stats`

- [ ] **Step 1: 写对象复用失败测试**

```ts
// tests/web/battle/EntityPool.spec.ts
import { describe, expect, it } from 'vitest';
import { EntityPool } from '../../../web/battle/EntityPool';

describe('EntityPool', () => {
  it('reuses released instances and resets them before the next acquire', () => {
    let created = 0;
    const pool = new EntityPool(
      () => ({ id: ++created, active: false, value: 0 }),
      (item) => {
        item.active = false;
        item.value = 0;
      },
      4,
    );

    const first = pool.acquire();
    first.active = true;
    first.value = 99;
    pool.release(first);
    const second = pool.acquire();

    expect(second).toBe(first);
    expect(second).toMatchObject({ active: false, value: 0 });
    expect(pool.stats.created).toBe(1);
    expect(pool.stats.inUse).toBe(1);
  });
});
```

- [ ] **Step 2: 实现通用池**

要求：

- `acquire` 优先从空闲栈取对象。
- `release` 检测重复释放并始终抛出明确错误；不要依赖 `import.meta.env` 才启用安全检查。
- 池的保留容量有上限；超过上限的释放对象允许被垃圾回收。
- `stats` 包含 created、reused、inUse、available、discarded。
- 不依赖 DOM。

- [ ] **Step 3: 接入 BattleEngine**

接入：

- `ProjectileState`。
- `LootState`。

真实敌人数量相对低且生命周期长，首版保留稳定数组，不为了“对象池化”破坏确定性 ID。释放炮弹或掉落时：

- 先标记 inactive/collected。
- 在固定更新末尾统一回收。
- 下一次 acquire 分配新的递增逻辑 ID；复用对象身份但不复用逻辑 ID。

- [ ] **Step 4: 接入 EffectSystem**

接入：

- 粒子。
- 冲击环/闪光。
- 伤害数字。

`reset()` 必须将所有在用对象释放回池。低画质降低 acquire 数量，不影响引擎事件。

- [ ] **Step 5: 验证一致性**

新增测试：同一 seed、输入和技能/升级命令，启用对象池前后的预期 fixture 仍得到相同 outcome。最终代码中不保留“双实现”；测试通过确定性快照验证。

```powershell
npm test -- tests/web/battle/EntityPool.spec.ts tests/web/battle/BattleEngineAutoFire.spec.ts tests/web/battle/BattleEngineBoss.spec.ts tests/web/battle/EffectSystem.spec.ts
npm run typecheck
git add web/battle tests/web/battle
git commit -m "perf: pool battle projectiles and effects"
```

## Task 2: 实现自适应画质和稳定降级

**Files:**

- Create: `web/battle/QualityMonitor.ts`
- Create: `tests/web/battle/QualityMonitor.spec.ts`
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `web/battle/EffectSystem.ts`
- Modify: `web/battle/CanvasViewport.ts`
- Modify: `web/scenes/BattleScene.ts`
- Modify: `web/app/GameApp.ts`

**Interfaces:**

- `QualityLevel = 'high' | 'medium' | 'low'`
- `QualityMonitor.recordFrame(deltaMs): QualityChange | null`
- `getRenderBudget(level): RenderBudget`

- [ ] **Step 1: 写降级窗口测试**

```ts
// tests/web/battle/QualityMonitor.spec.ts
import { describe, expect, it } from 'vitest';
import { QualityMonitor } from '../../../web/battle/QualityMonitor';

function feed(monitor: QualityMonitor, frameMs: number, count = 120): void {
  for (let index = 0; index < count; index += 1) {
    monitor.recordFrame(frameMs);
  }
}

describe('QualityMonitor', () => {
  it('needs two slow windows, steps down once and never auto-upgrades mid-run', () => {
    const monitor = new QualityMonitor('auto');
    feed(monitor, 24);
    expect(monitor.level).toBe('high');
    feed(monitor, 24);
    expect(monitor.level).toBe('medium');
    feed(monitor, 16, 360);
    expect(monitor.level).toBe('medium');
  });

  it('drops directly toward low when two windows exceed 28 ms', () => {
    const monitor = new QualityMonitor('auto');
    feed(monitor, 30);
    feed(monitor, 30);
    expect(monitor.level).toBe('low');
  });
});
```

- [ ] **Step 2: 实现规则**

每 120 个有效帧统计平均值：

- `< 18ms`：记录健康窗口，不自动升档。
- `> 22ms` 连续两个窗口：high → medium。
- `> 28ms` 连续两个窗口：high/medium → low。
- 单个 `deltaMs > 250` 视为切后台或调试停顿，不计入窗口。
- 手动 high/medium/low 时不自动改变。
- 每局新建 monitor；设置为 auto 时从 high 重新评估。

- [ ] **Step 3: 固定视觉预算**

```ts
export const RENDER_BUDGETS = {
  high: {
    backgroundParticles: 36,
    visibleProjectileTrails: 120,
    particles: 200,
    damageNumbers: 18,
    dprCap: 2,
  },
  medium: {
    backgroundParticles: 18,
    visibleProjectileTrails: 100,
    particles: 130,
    damageNumbers: 12,
    dprCap: 1.75,
  },
  low: {
    backgroundParticles: 0,
    visibleProjectileTrails: 80,
    particles: 80,
    damageNumbers: 8,
    dprCap: 1.5,
  },
} as const;
```

`visibleProjectileTrails` 只控制轨迹和光点；所有引擎炮弹仍参与命中。

- [ ] **Step 4: 接入埋点和设置**

画质变化时只记录一次：

```ts
track('battle_performance_changed', {
  from: change.from,
  to: change.to,
  averageFrameMs: Math.round(change.averageFrameMs * 10) / 10,
});
```

不得记录逐帧数据。设置面板改变画质后，下一帧应用预算，不重启战斗。

- [ ] **Step 5: 验证不同画质结果一致**

用同一 seed 和命令序列分别运行 high/medium/low；断言 `BattleOutcome`、kills、remainingHp、升级结果相同。该测试只改变 presentation budget，不把 quality 传入 `BattleEngine`。

```powershell
npm test -- tests/web/battle/QualityMonitor.spec.ts tests/web/battle
npm run typecheck
npm run build
git add web/battle web/scenes web/app tests/web/battle
git commit -m "perf: add adaptive visual quality"
```

## Task 3: 强化资源预算和预加载边界

**Files:**

- Modify: `scripts/check-asset-budget.mjs`
- Modify: `tests/smoke/asset-budget.spec.ts`
- Create: `tests/smoke/battle-assets.spec.ts`
- Modify: `web/battle/AssetLoader.ts`

- [ ] **Step 1: 写战斗资源预算失败测试**

测试脚本输出必须同时包含：

- `first-screen bytes`
- `battle-screen bytes`
- `asset budget ok`

并检查 `BATTLE_ART_URLS` 引用的本地文件都存在。

- [ ] **Step 2: 更新预算**

单文件上限：

| 资源 | 上限 |
|---|---:|
| battle-ocean-bg | 700 KB |
| needle-jelly-enemy | 450 KB |
| storm-ray-elite | 550 KB |
| existing boss | 450 KB |

集合上限：

- 车站首屏继续 ≤ 1.5 MB。
- 首局战斗关键资源 ≤ 2.5 MB。
- 全部 `web/assets/chibi` ≤ 5.5 MB。

音频为程序化生成，因此不得新增大型 mp3/wav/ogg 循环文件。小型无版权 UI 样本也不在本轮引入。

- [ ] **Step 3: 分阶段预加载**

- 页面启动只加载车站首屏。
- 点击出发后并行加载战斗背景、当前皮肤、列车、伙伴、普通怪。
- 精英和 Boss 资源在普通战斗开始后低优先级加载。
- 3 秒后仍未完成时允许进入，失败项用剪影；后续成功加载可无缝替换。

不使用阻塞式长等待或页面级 spinner。

- [ ] **Step 4: 验证和提交**

```powershell
npm test -- tests/smoke/asset-budget.spec.ts tests/smoke/battle-assets.spec.ts
npm run check:assets
npm run build
git add scripts/check-asset-budget.mjs tests/smoke web/battle/AssetLoader.ts
git commit -m "perf: enforce battle asset budgets"
```

## Task 4: 建立可回收诊断数据和 E2E 控制钩子

**Files:**

- Create: `web/battle/BattleDiagnostics.ts`
- Create: `web/battle/BattleE2EHooks.ts`
- Create: `tests/web/battle/BattleDiagnostics.spec.ts`
- Modify: `web/app/GameApp.ts`
- Modify: `web/scenes/BattleScene.ts`

**Interfaces:**

- `BattleDiagnostics.snapshot()`
- `installBattleE2EHooks(window, gameApp)`
- `removeBattleE2EHooks(window)`

- [ ] **Step 1: 写诊断稳定性测试**

```ts
// tests/web/battle/BattleDiagnostics.spec.ts
import { describe, expect, it } from 'vitest';
import { BattleDiagnostics } from '../../../web/battle/BattleDiagnostics';

describe('BattleDiagnostics', () => {
  it('tracks active resources without retaining battle objects after disposal', () => {
    const diagnostics = new BattleDiagnostics();
    diagnostics.frameLoopStarted();
    diagnostics.listenerAdded(5);
    diagnostics.updateEntities({ enemies: 20, projectiles: 30, effects: 50 });
    diagnostics.frameLoopStopped();
    diagnostics.listenerRemoved(5);
    diagnostics.updateEntities({ enemies: 0, projectiles: 0, effects: 0 });

    expect(diagnostics.snapshot()).toMatchObject({
      activeFrameLoops: 0,
      activeListeners: 0,
      enemies: 0,
      projectiles: 0,
      effects: 0,
    });
  });
});
```

- [ ] **Step 2: 实现诊断**

只记录数字：

- activeFrameLoops
- activeListeners
- activeAudioSchedulers
- enemies
- projectiles
- loot
- effects
- pooledInUse
- settledBattleCount
- qualityLevel
- lastUncaughtError

不得保存玩家昵称、购买信息、二维码、支付信息、完整存档或 DOM 节点。

- [ ] **Step 3: 定义 E2E 钩子**

仅当 `new URLSearchParams(location.search).get('e2e') === '1'` 时安装：

```ts
export interface TidalTrainE2EHooks {
  snapshot(): {
    readonly sceneId: SceneId;
    readonly battle: BattleFrameView | null;
    readonly diagnostics: BattleDiagnosticsSnapshot;
    readonly settlementCount: number;
  };
  navigate(sceneId: Exclude<SceneId, 'battle'>): Promise<void>;
  startNormalBattle(): Promise<void>;
  startDailyTrial(): Promise<void>;
  advanceBattle(durationMs: number): void;
  chooseFirstUpgrade(): boolean;
  useSkill(skillId: BattleSkillId): boolean;
  requestPause(): void;
  requestResume(): Promise<void>;
  returnToStation(): Promise<void>;
}
```

`advanceBattle`：

- 只在 E2E 钩子中直接调用固定更新。
- 每次最多推进 300,000ms。
- 遇到升级暂停时停止，由 smoke 显式选择。
- 不提供直接加货币、解锁皮肤、伪造购买或重复结算方法。

- [ ] **Step 4: 清理**

`GameApp.destroy()` 和页面卸载时删除 `window.__TIDAL_TRAIN_E2E__`。普通 URL 断言该属性为 `undefined`。

- [ ] **Step 5: 验证和提交**

```powershell
npm test -- tests/web/battle/BattleDiagnostics.spec.ts tests/web/GameApp.spec.ts
npm run typecheck
git add web/battle web/app web/scenes tests/web
git commit -m "test: expose bounded battle diagnostics"
```

## Task 5: 编写无额外依赖的 Chrome 浏览器 smoke

**Files:**

- Create: `scripts/lib/chrome-cdp.mjs`
- Create: `scripts/smoke-browser.mjs`
- Create: `tests/smoke/browser-script.spec.ts`
- Modify: `package.json`

**Interfaces:**

- `findChromeExecutable()`
- `CdpClient.send(method, params)`
- npm script `smoke:browser`

- [ ] **Step 1: 写脚本静态测试**

```ts
// tests/smoke/browser-script.spec.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('browser smoke script', () => {
  it('uses strict preview, four mobile viewports and e2e hooks', () => {
    const source = readFileSync('scripts/smoke-browser.mjs', 'utf8');
    expect(source).toContain('--strictPort');
    expect(source).toContain('360');
    expect(source).toContain('390');
    expect(source).toContain('412');
    expect(source).toContain('430');
    expect(source).toContain('__TIDAL_TRAIN_E2E__');
  });
});
```

- [ ] **Step 2: 实现 Chrome 定位**

顺序：

1. `CHROME_BIN`。
2. Windows：
   - `%PROGRAMFILES%\Google\Chrome\Application\chrome.exe`
   - `%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe`
   - `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`
3. Linux：
   - `/usr/bin/google-chrome`
   - `/usr/bin/chromium`
   - `/usr/bin/chromium-browser`

都不存在时明确报错并退出 1，不静默跳过。

- [ ] **Step 3: 实现 CDP 客户端**

仅使用 Node 22 内置 `fetch`、`WebSocket`、`child_process`、`fs` 和 `os`：

- 启动 `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4177 --strictPort`。
- 轮询 `http://127.0.0.1:4177/`，最多 15 秒。
- 用 Node `net` 先取得一个空闲 loopback 端口，再启动临时 profile 的 headless Chrome；不要硬编码可能冲突的调试端口。
- Linux CI 添加 `--no-sandbox`；本地 Windows 不添加。
- 使用 HTTP `PUT /json/new?<encoded-url>` 创建页面并连接 WebSocket。
- 每条 CDP 请求有递增 ID 和 10 秒超时。
- 收集 `Runtime.exceptionThrown` 和 `Log.entryAdded`。
- `finally` 中关闭页面、Chrome、preview 和临时目录。

- [ ] **Step 4: 实现四档视口回归**

对每个尺寸 360×800、390×844、412×915、430×932：

1. `Emulation.setDeviceMetricsOverride`。
2. 打开 `/?e2e=1&smoke=<timestamp>`。
3. 等待 `window.__TIDAL_TRAIN_E2E__`。
4. 若出现首次列车长选择，使用真实按钮选择默认女列车长，不直接写 localStorage。
5. 断言 `document.documentElement.scrollWidth <= innerWidth + 1`。
6. 依次导航 station/captain/equipment/legion/store，断言 `data-scene-id`。
7. 返回 station，开始普通战斗。
8. 推进 2 秒，断言 projectiles 或 weapon-fired 计数 > 0。
9. 推进到 20 秒，通过真实 HUD 连点 `salvage-a` 两次，断言齿轮累计 +16；第三次不再增加。
10. 使用潮汐齐射和泡泡屏障；能量满足后使用极潮爆发。
11. 循环推进，遇到 upgrade 就选择第一项，直到出现三次升级。
12. 断言至少出现普通击杀、精英、Boss intro、胜负和结算层。
13. 返回车站。

四档都跑完整局成本较高时，规则如下：

- 390×844 跑完整单局。
- 其余三档跑场景切换、自动炮击、技能和横向溢出。
- 不能省略任何一个尺寸。

- [ ] **Step 5: 实现两局稳定性检查**

在 390×844 同一页面连续完成两局，并在每局回站后断言：

- activeFrameLoops = 0。
- enemies/projectiles/loot/effects = 0。
- activeListeners 回到基线。
- activeAudioSchedulers ≤ 1。
- settlementCount 每局只增加 1。
- 没有未捕获异常。

- [ ] **Step 6: 添加 npm 脚本**

```json
{
  "scripts": {
    "smoke:browser": "node scripts/smoke-browser.mjs"
  }
}
```

- [ ] **Step 7: 验证和提交**

```powershell
npm test -- tests/smoke/browser-script.spec.ts
npm run build
npm run smoke:browser
git add package.json scripts tests/smoke
git commit -m "test: add full chrome battle smoke"
```

Expected: Chrome smoke 输出每个视口的 PASS 摘要并退出 0。

## Task 6: 更新试玩脚本和性能记录

**Files:**

- Modify: `docs/testing/prototype-playtest-script.md`
- Modify: `docs/testing/prototype-results-template.md`
- Create: `docs/testing/dynamic-battle-performance-checklist.md`

- [ ] **Step 1: 替换旧点击式战斗步骤**

删除：

- 连续点击普通开炮。
- `模拟受击`。
- 静态 `combat/reward/route/boss` 页面切换。
- “普通战斗不应产生 requestAnimationFrame”的旧约束。

改为：

- 自动主炮是否无需教学即可理解。
- 三个主动技能是否可分辨。
- 三次肉鸽选择是否清楚。
- 普通怪/精英/Boss 节奏是否落在 3–5 分钟。
- 击杀、掉落、音效和角色动作是否足够精致但不花哨。
- 五个场景是否真正独立切换。

- [ ] **Step 2: 更新结果模板**

新增：

- 首次注意到自动开炮的时间。
- 三个技能使用次数。
- 三次升级选择。
- 单局时长。
- 音乐/音效是否开启。
- 视口和设备像素比。
- 平均/低位帧率（如工具可测）。
- 自动降级是否发生。
- 眩晕/画面过密反馈。
- 两局后是否愿意继续。

- [ ] **Step 3: 新增性能检查清单**

要求记录：

- 设备型号。
- 系统版本。
- 浏览器或抖音开发者工具版本。
- 高/中/低画质。
- 平均帧时间、最低可感帧率区间。
- 峰值敌人/炮弹/粒子。
- 两局后内存和监听器是否回落。
- 音频爆音、切后台和恢复结果。

明确标注：桌面 Chrome 数据不能替代抖音真机结论。

- [ ] **Step 4: 提交**

```powershell
git add docs/testing
git commit -m "docs: update dynamic battle playtest protocol"
```

## Task 7: 把浏览器回归加入 CI

**Files:**

- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `tests/smoke/tooling.spec.ts`

- [ ] **Step 1: 更新工具门禁测试**

检查 package scripts 包含：

- test
- typecheck
- check:assets
- build
- smoke:browser

检查 workflow 按顺序包含：

1. npm ci
2. npm test
3. npm run typecheck
4. npm run check:assets
5. npm run build
6. npm run smoke:browser
7. upload Pages artifact

- [ ] **Step 2: 修改工作流**

在 Build 后、Upload 前加入：

```yaml
      - name: Browser smoke
        run: npm run smoke:browser
```

Ubuntu runner 使用已安装 Chrome；若环境只提供 Chromium，定位脚本必须自动发现。CI 不下载不固定来源的浏览器二进制。

- [ ] **Step 3: 验证 YAML 和本地门禁**

```powershell
npm test -- tests/smoke/tooling.spec.ts tests/smoke/browser-script.spec.ts
npm run build
npm run smoke:browser
git diff --check
git add .github/workflows/deploy-pages.yml tests/smoke/tooling.spec.ts
git commit -m "ci: gate pages deploy on browser smoke"
```

## Task 8: 最终回归、发布和线上验证

**Files:**

- Modify only if needed by failures found in final validation.

- [ ] **Step 1: 清洁工作区和完整门禁**

```powershell
git status --short
npm ci
npm test
npm run typecheck
npm run check:assets
npm run build
npm run smoke:browser
npm audit --audit-level=high
git diff --check
```

Expected:

- 全部命令退出码 0。
- 无未提交的临时截图、Chrome profile、日志、dist 或测试产物。
- `npm audit` 没有 high/critical 漏洞；若只有无法修复的开发依赖告警，必须停下记录具体包和影响，不能假装通过。

- [ ] **Step 2: 审查改动**

```powershell
git log --oneline --decorate -20
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

确认：

- 没有二维码、收款信息、真实密钥、账号 token 或个人路径进入仓库。
- 没有第三方商业游戏素材或音频。
- 没有真实支付/广告 API 的伪实现冒充上线。
- 所有永久奖励仍经过唯一结算。

- [ ] **Step 3: 发布到 GitHub**

执行本步骤时必须使用 `github:yeet` 技能，因为这是把本地实现提交并发布到 GitHub 的任务。该技能造成推送或 PR 动作时，明确告诉用户。

先安全同步：

```powershell
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
```

若第二条退出非 0，停止直接推送，检查远端变更并使用非破坏性 rebase/merge 方案；禁止 force push。

若通过：

```powershell
git push origin HEAD:main
```

如果仓库保护规则拒绝直接推送，则：

- 推送当前 feature 分支。
- 创建 PR。
- 等待所有检查通过。
- squash merge 到 main。

- [ ] **Step 4: 等待 Pages 工作流**

通过 GitHub 工具或 `gh` 查看最新 `Deploy GitHub Pages`：

- build 成功。
- browser smoke 成功。
- deploy 成功。
- 环境 URL 与仓库 Pages URL 一致。

不得在工作流仍运行时宣称已经上线。

- [ ] **Step 5: 验证公开站点**

打开带缓存破坏参数的公开 URL：

```text
https://whwebeb65-del.github.io/tidal-train-roguelike/?release=dynamic-v1
```

检查：

- 页面加载无 404。
- 三张新素材均成功返回。
- 五个场景可切换。
- 出发后自动炮击、Canvas、HUD 和声音解锁工作。
- 控制台无未捕获异常。
- 公开 URL 不暴露 `__TIDAL_TRAIN_E2E__`。

- [ ] **Step 6: 最终提交或修复循环**

如果线上检查失败：

1. 记录可复现问题。
2. 在 feature 分支写失败测试。
3. 做最小修复。
4. 重跑完整门禁。
5. 正常提交和推送；不得直接修改部署产物。

发布成功后最终记录：

- 部署提交 SHA。
- GitHub Actions 运行链接。
- 公网站点 URL。
- 自动测试结果。
- 尚待抖音开发者工具/真实安卓设备验证的性能边界。
