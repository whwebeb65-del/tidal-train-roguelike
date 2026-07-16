# Dynamic Game 04 Audio and Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为动态车站和 Canvas 战斗加入原创程序化海洋电子音乐、完整关键音效、独立声音设置、首次交互解锁，以及切后台暂停和玩家确认恢复。

**Architecture:** `AudioManager` 只接收音乐 cue 和战斗事件，不理解敌人生命或奖励；`ProceduralScore` 生成节拍与乐句，`SfxSynth` 把声音 cue 转为短音符；`WebAudioBackend` 是唯一接触 `AudioContext` 的实现。`SettingsRepository` 独立保存声音、减少震动和画质偏好；`PageLifecycleController` 统一协调页面可见性、战斗暂停、音频挂起和继续覆盖层。

**Tech Stack:** TypeScript、Vitest、Web Audio API、HTML/CSS、localStorage。

## Global Constraints

- 音乐和音效必须原创或程序化生成，不下载、仿制或截取第三方商业音乐。
- 浏览器未解锁声音、拒绝声音或没有 Web Audio 时，玩法必须完整可用。
- 音乐和音效使用独立开关，并保存到 `tidal-train-settings-v1`。
- 页面隐藏时必须立即暂停模拟和全部音频；重新可见后不得自动恢复战斗。
- 玩家点击“继续战斗”后，先恢复 AudioContext，再恢复引擎。
- 连续炮声和命中声必须有并发限制，不能爆音或无限创建节点。
- `AudioManager` 不得创建 `setInterval`；节拍由显式 `update(nowMs)` 或战斗帧驱动。
- 设置中的减少震动必须同时覆盖系统 `prefers-reduced-motion` 和玩家手动选择。

---

## 目标文件结构

```text
web/
├─ app/
│  ├─ SettingsRepository.ts
│  └─ PageLifecycleController.ts
├─ audio/
│  ├─ AudioTypes.ts
│  ├─ AudioBackend.ts
│  ├─ WebAudioBackend.ts
│  ├─ ProceduralScore.ts
│  ├─ SfxSynth.ts
│  └─ AudioManager.ts
├─ views/
│  └─ SettingsPanelView.ts
└─ styles/
   └─ settings-panel.css
tests/web/
├─ SettingsRepository.spec.ts
├─ PageLifecycleController.spec.ts
└─ audio/
   ├─ ProceduralScore.spec.ts
   ├─ SfxSynth.spec.ts
   ├─ AudioManager.spec.ts
   └─ helpers/
      └─ RecordingAudioBackend.ts
```

## Task 1: 建立版本化设置存档

**Files:**

- Create: `web/app/SettingsRepository.ts`
- Create: `tests/web/SettingsRepository.spec.ts`

**Interfaces:**

- `GameSettings`
- `SettingsRepository.load()/save()/reset()`
- `createBrowserSettingsRepository(storage)`

- [ ] **Step 1: 写设置归一化失败测试**

```ts
// tests/web/SettingsRepository.spec.ts
import { describe, expect, it } from 'vitest';
import {
  SETTINGS_STORAGE_KEY,
  createBrowserSettingsRepository,
  defaultGameSettings,
} from '../../web/app/SettingsRepository';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('SettingsRepository', () => {
  it('loads defaults, normalizes invalid values and preserves unrelated keys', () => {
    const storage = new MemoryStorage();
    storage.setItem('unrelated', 'keep');
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      musicEnabled: 'yes',
      sfxEnabled: false,
      reducedMotion: true,
      qualityPreference: 'ultra',
    }));
    const repository = createBrowserSettingsRepository(storage);

    expect(repository.load()).toEqual({
      ...defaultGameSettings(),
      sfxEnabled: false,
      reducedMotion: true,
    });

    repository.reset();
    expect(storage.getItem('unrelated')).toBe('keep');
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: 定义设置类型**

```ts
export type QualityPreference = 'auto' | 'high' | 'medium' | 'low';

export interface GameSettings {
  readonly version: 1;
  readonly musicEnabled: boolean;
  readonly sfxEnabled: boolean;
  readonly reducedMotion: boolean;
  readonly qualityPreference: QualityPreference;
}

export const SETTINGS_STORAGE_KEY = 'tidal-train-settings-v1';
```

默认值：

- musicEnabled: true
- sfxEnabled: true
- reducedMotion: 读取系统媒体查询后的初始建议由 `GameApp` 合并；仓库纯默认值为 false
- qualityPreference: auto

仓库只接受精确类型和允许的枚举，损坏 JSON 回落到默认值。

- [ ] **Step 3: 实现并验证**

```powershell
npm test -- tests/web/SettingsRepository.spec.ts
npm run typecheck
git add web/app/SettingsRepository.ts tests/web/SettingsRepository.spec.ts
git commit -m "feat: persist audio motion and quality settings"
```

## Task 2: 定义可测试的音频后端和声音契约

**Files:**

- Create: `web/audio/AudioTypes.ts`
- Create: `web/audio/AudioBackend.ts`
- Create: `web/audio/WebAudioBackend.ts`
- Create: `tests/web/audio/AudioBackend.spec.ts`
- Create: `tests/web/audio/helpers/RecordingAudioBackend.ts`

**Interfaces:**

- `MusicCue`
- `SoundCue`
- `ToneInstruction`
- `AudioBackend`
- `createWebAudioBackend()`

- [ ] **Step 1: 冻结声音名称**

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

export type AudioBus = 'music' | 'sfx';

export interface ToneInstruction {
  readonly bus: AudioBus;
  readonly waveform: OscillatorType;
  readonly frequencyHz: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly gain: number;
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
  readonly pan: number;
  readonly detuneCents?: number;
  readonly filterHz?: number;
}
```

- [ ] **Step 2: 写后端边界测试**

测试假的 `AudioContextLike`，验证：

- `unlock()` 只创建一次上下文。
- `scheduleTone` 在未解锁时安全忽略。
- 所有 gain、pan、频率和时长被限制到安全范围。
- `suspend/resume/close` 幂等。
- 后端创建的 oscillator/gain/panner/filter 节点在声音结束后断开。

- [ ] **Step 3: 实现 AudioBackend**

```ts
export interface AudioBackend {
  readonly available: boolean;
  readonly unlocked: boolean;
  nowSeconds(): number;
  unlock(): Promise<boolean>;
  scheduleTone(instruction: ToneInstruction): void;
  setBusGain(bus: AudioBus, value: number, rampSeconds?: number): void;
  suspend(): Promise<void>;
  resume(): Promise<boolean>;
  close(): Promise<void>;
}
```

`WebAudioBackend`：

- 兼容 `window.AudioContext` 和 `webkitAudioContext`。
- 两个主总线：music、sfx，再接 master。
- 默认总线 gain 为 music 0.34、sfx 0.55。
- 所有音符使用短 attack/release，避免爆音。
- 不长期保留已结束节点引用。
- 初始化失败将 `available=false`，后续调用无异常。

`RecordingAudioBackend.ts` 实现同一个 `AudioBackend`，把 `ToneInstruction` 复制到公开的 `instructions` 数组，并记录 bus gain、suspend、resume 和 close 调用；后续程序化音乐、音效和管理器测试统一复用它。

- [ ] **Step 4: 验证和提交**

```powershell
npm test -- tests/web/audio/AudioBackend.spec.ts
npm run typecheck
git add web/audio tests/web/audio
git commit -m "feat: add safe web audio backend"
```

## Task 3: 编写原创程序化车站、战斗和 Boss 音乐

**Files:**

- Create: `web/audio/ProceduralScore.ts`
- Create: `tests/web/audio/ProceduralScore.spec.ts`

**Interfaces:**

- `ProceduralScore.setCue(cue, nowSeconds)`
- `ProceduralScore.update(nowSeconds)`
- `ProceduralScore.pause()/resume()/reset()`

- [ ] **Step 1: 写节拍和无缝切层测试**

```ts
// tests/web/audio/ProceduralScore.spec.ts
import { describe, expect, it } from 'vitest';
import { ProceduralScore } from '../../../web/audio/ProceduralScore';
import { RecordingAudioBackend } from './helpers/RecordingAudioBackend';

describe('ProceduralScore', () => {
  it('uses 92 BPM at station, 122 BPM in battle and layers boss without restarting battle bars', () => {
    const backend = new RecordingAudioBackend();
    const score = new ProceduralScore(backend);

    score.setCue('station', 0);
    score.update(2);
    expect(score.debugState.bpm).toBe(92);

    score.setCue('battle', 4);
    score.update(6);
    const battleBar = score.debugState.barIndex;

    score.setCue('boss', 6);
    score.update(8);
    expect(score.debugState.bpm).toBe(122);
    expect(score.debugState.barIndex).toBeGreaterThanOrEqual(battleBar);
    expect(backend.instructions.some((tone) => tone.frequencyHz < 90)).toBe(true);
  });
});
```

- [ ] **Step 2: 实现车站音乐**

固定规格：

- 92 BPM，4/4。
- D 大调五声音阶为主。
- 玻璃音色：sine/triangle 的短音。
- 柔和低音每两拍一次。
- 轻水滴音每两小节 1–2 次，使用确定性轮换，不用 `Math.random()`。
- 每次只向前调度 0.2 秒，避免隐藏页面积压大量音符。

- [ ] **Step 3: 实现战斗音乐**

固定规格：

- 122 BPM，4/4。
- 低音短促、八分音符琶音、轻拍击感。
- 8 小节循环，结尾回到起点时音高和包络连续。
- 从车站进入战斗时 400ms 交叉淡化。

- [ ] **Step 4: 实现 Boss 同步叠层**

Boss cue 不重启战斗主循环：

- 保持 122 BPM 和当前 bar/beat。
- 叠加 48–72Hz 低频脉冲。
- 每两小节增加警报音型。
- 打击密度增加但总 gain 不超过 0.82。

胜利/失败 cue 为 2–3 秒短乐句，播放完转 silent；不创建长循环。

- [ ] **Step 5: 验证和提交**

```powershell
npm test -- tests/web/audio/ProceduralScore.spec.ts
npm run typecheck
git add web/audio/ProceduralScore.ts tests/web/audio/ProceduralScore.spec.ts
git commit -m "feat: compose procedural ocean score"
```

## Task 4: 实现关键音效和并发限制

**Files:**

- Create: `web/audio/SfxSynth.ts`
- Create: `tests/web/audio/SfxSynth.spec.ts`

**Interfaces:**

- `SfxSynth.play(cue, nowSeconds): boolean`
- `SfxSynth.reset(): void`

- [ ] **Step 1: 写音效变化和限流测试**

```ts
// tests/web/audio/SfxSynth.spec.ts
import { describe, expect, it } from 'vitest';
import { SfxSynth } from '../../../web/audio/SfxSynth';
import { RecordingAudioBackend } from './helpers/RecordingAudioBackend';

describe('SfxSynth', () => {
  it('rotates cannon pitch and limits dense hit polyphony', () => {
    const backend = new RecordingAudioBackend();
    const synth = new SfxSynth(backend);

    synth.play('cannon', 0);
    synth.play('cannon', 0.02);
    synth.play('cannon', 0.04);
    expect(new Set(
      backend.instructions
        .filter((tone) => tone.bus === 'sfx')
        .map((tone) => tone.frequencyHz),
    ).size).toBeGreaterThan(1);

    for (let index = 0; index < 20; index += 1) {
      synth.play('hit', 0.05);
    }
    expect(synth.debugState.activeByGroup.hit).toBeLessThanOrEqual(6);
  });
});
```

- [ ] **Step 2: 实现 cue 配方**

至少实现：

- 主炮：3 组音高/力度，低频 triangle + 短噪声感高频。
- 副炮：更轻、更短。
- 命中：水滴/泡裂短音。
- 暴击：命中音上叠高八度。
- 破甲：下降锯齿 + 短碎裂。
- 护盾命中：柔和 sine glissando。
- 三种普通击杀：循环轮换而非随机下载样本。
- 精英/Boss 死亡：多层下降音、低频和短冲击。
- 掉落吸附：上升琶音，连续收集做 80ms 合并。
- 三个主动技能：清晰可区分。
- 升级出现/选择、UI 点击、场景切换、复活、胜利和失败。

- [ ] **Step 3: 固定并发策略**

| 分组 | 窗口 | 上限 |
|---|---:|---:|
| cannon | 120ms | 4 |
| hit | 100ms | 6 |
| enemy-pop | 180ms | 4 |
| loot | 80ms | 3 |
| UI | 80ms | 2 |
| boss/skill | 不合并关键首音 | 2 |

被抑制的声音返回 `false`，但不影响视觉和战斗逻辑。

- [ ] **Step 4: 验证和提交**

```powershell
npm test -- tests/web/audio/SfxSynth.spec.ts
npm run typecheck
git add web/audio/SfxSynth.ts tests/web/audio/SfxSynth.spec.ts
git commit -m "feat: synthesize battle and interface sound effects"
```

## Task 5: 实现 AudioManager 并接入车站、场景和战斗事件

**Files:**

- Create: `web/audio/AudioManager.ts`
- Create: `tests/web/audio/AudioManager.spec.ts`
- Modify: `web/battle/BattleSoundPort.ts`
- Modify: `web/app/GameApp.ts`
- Modify: `web/app/SceneRouter.ts`
- Modify: `web/scenes/BattleScene.ts`

**Interfaces:**

- `AudioManager` implements `BattleSoundPort`
- `AudioManager.unlockFromGesture(): Promise<boolean>`
- `AudioManager.setMusicCue(cue): void`
- `AudioManager.applySettings(settings): void`

- [ ] **Step 1: 写事件映射和静音测试**

测试：

- `weapon-fired/main` → cannon。
- `projectile-hit/critical` → critical-hit，否则 hit。
- `enemy-armour-broken` → armour-break。
- `train-damaged` 且 `shieldAbsorbed > 0` → shield-hit。
- 普通/精英/Boss `enemy-killed` 分别映射 enemy-pop/elite-down/boss-down。
- `skill-used` 映射三个技能。
- `skill-cooldowns-refreshed` → skill-refresh。
- `upgrade-offered/upgrade-rerolled/upgrade-selected` → upgrade-open/upgrade-open/upgrade-select。
- `boss-intro-started` 同时切 boss cue 和播放 alarm。
- `boss-charge-started` → boss-charge。
- `battle-won/lost` 切换短结算 cue。
- music off 只静音 music bus；sfx off 只静音 sfx bus。
- 未解锁时事件可消费但不抛异常。

- [ ] **Step 2: 实现 AudioManager**

`AudioManager` 持有：

- 一个 `AudioBackend`。
- 一个 `ProceduralScore`。
- 一个 `SfxSynth`。
- 当前设置和当前 cue。
- 一次性失败通知标记。

它不拥有浏览器帧循环；`GameApp` 的常驻轻量更新或 `BattleScene` 绘制帧调用 `audio.update(performance.now())`。车站没有战斗循环时，允许使用单个受控 rAF，仅在 musicEnabled 且页面可见时运行；切战斗时复用同一管理器，不能创建第二个音频循环。

- [ ] **Step 3: 从用户手势解锁**

点击“出发”处理函数的第一条异步动作：

```ts
const audioReady = await audio.unlockFromGesture();
if (!audioReady) {
  shell.showNotice('当前浏览器未启用声音，游戏仍可正常游玩。');
}
```

不得在页面加载时自动创建或恢复 AudioContext。

- [ ] **Step 4: 接入场景 cue**

- station/captain/equipment/legion/store → station。
- battle 普通阶段 → battle。
- boss intro/boss fight → boss。
- victory/defeat →对应短 cue。
- 场景切换 → scene-open。
- 主要按钮 → ui-tap。

重复设置相同 cue 不得重启音乐。

- [ ] **Step 5: 验证和提交**

```powershell
npm test -- tests/web/audio/AudioManager.spec.ts tests/web/battle/BattleScene.spec.ts tests/web/SceneRouter.spec.ts
npm run typecheck
npm run build
git add web/audio web/app web/scenes web/battle tests/web
git commit -m "feat: integrate procedural game audio"
```

## Task 6: 建立设置面板并立即应用

**Files:**

- Create: `web/views/SettingsPanelView.ts`
- Create: `tests/web/SettingsPanelView.spec.ts`
- Create: `web/styles/settings-panel.css`
- Modify: `web/app/AppShell.ts`
- Modify: `web/app/GameApp.ts`
- Modify: `web/styles.css`

**Interfaces:**

- `renderSettingsPanel(model): string`
- `AppShell.openSettings()/closeSettings()`
- `GameApp.updateSettings(patch)`

- [ ] **Step 1: 写设置界面测试**

验证 HTML 包含：

- 音乐开关。
- 音效开关。
- 减少动态效果。
- 自动/高/中/低画质。
- 音频不可用时的说明。
- 关闭按钮和遮罩。

- [ ] **Step 2: 实现设置面板**

设置按钮常驻顶栏，但不遮挡货币。面板使用轻量底部抽屉：

- 选择后立即调用 `SettingsRepository.save`。
- 立即调用 `AudioManager.applySettings`。
- 立即更新 `EffectSystem.reducedMotion`。
- 画质选择由计划 05 的 `QualityMonitor` 消费；此阶段先保存并传递。
- `Escape`、遮罩点击和关闭键都可关闭。

- [ ] **Step 3: 合并系统减少动态偏好**

有效值：

```ts
const effectiveReducedMotion =
  settings.reducedMotion
  || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

监听媒体查询变化并在 `GameApp.destroy()` 移除监听器。

- [ ] **Step 4: 验证和提交**

```powershell
npm test -- tests/web/SettingsPanelView.spec.ts tests/web/SettingsRepository.spec.ts
npm run typecheck
npm run build
git add web/app web/views web/styles web/styles.css tests/web
git commit -m "feat: add persistent game settings panel"
```

## Task 7: 实现切后台暂停与玩家确认恢复

**Files:**

- Create: `web/app/PageLifecycleController.ts`
- Create: `tests/web/PageLifecycleController.spec.ts`
- Modify: `web/app/GameApp.ts`
- Modify: `web/scenes/BattleScene.ts`
- Modify: `web/battle/BattleHUD.ts`

**Interfaces:**

- `PageLifecycleController.start()/dispose()`
- `BattleScene.pauseForVisibility()`
- `BattleScene.resumeAfterVisibility(): Promise<void>`

- [ ] **Step 1: 写生命周期失败测试**

```ts
// tests/web/PageLifecycleController.spec.ts
import { describe, expect, it } from 'vitest';
import { PageLifecycleController } from '../../web/app/PageLifecycleController';

describe('PageLifecycleController', () => {
  it('pauses immediately when hidden and requires explicit resume when visible', async () => {
    const calls: string[] = [];
    const listeners = new Set<() => void>();
    let hidden = false;
    const page = {
      get hidden() { return hidden; },
      addEventListener(_name: 'visibilitychange', listener: () => void) {
        listeners.add(listener);
      },
      removeEventListener(_name: 'visibilitychange', listener: () => void) {
        listeners.delete(listener);
      },
      setHidden(value: boolean) {
        hidden = value;
        for (const listener of listeners) listener();
      },
      listenerCount() { return listeners.size; },
    };
    const controller = new PageLifecycleController(page, {
      onHidden: () => calls.push('hidden'),
      onVisible: () => calls.push('visible-awaiting-user'),
    });
    controller.start();

    page.setHidden(true);
    page.setHidden(false);

    expect(calls).toEqual(['hidden', 'visible-awaiting-user']);
    controller.dispose();
    expect(page.listenerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: 实现页面可见性控制器**

控制器只监听 `visibilitychange`：

- hidden → `BattleScene.pauseForVisibility()`、`AudioManager.pause()`。
- visible → 保持暂停，HUD 显示“继续战斗”。
- 玩家点击继续 → `await AudioManager.resume()`，然后 `BattleScene.resumeAfterVisibility()`。

如果当前不在战斗，只暂停/恢复车站音乐，不显示战斗覆盖层。

- [ ] **Step 3: 防止追帧风暴**

隐藏或手动暂停时：

- 停止 scheduler。
- 清空 `FixedStepLoop` 的 lastTimestamp 和 accumulator。
- 恢复时从新时间起点开始。
- 不补算隐藏期间经过的时间。

- [ ] **Step 4: 处理异常**

- AudioContext 恢复失败：保持静音但恢复游戏。
- 页面在升级层隐藏：回来后仍显示原升级层，不跳过选择。
- 页面在失败层隐藏：回来后仍保持失败，不重复触发广告或结算。
- 多次 hidden/visible 不重复注册覆盖层或监听器。

- [ ] **Step 5: 验证和提交**

```powershell
npm test -- tests/web/PageLifecycleController.spec.ts tests/web/battle/BattleScene.spec.ts tests/web/audio
npm run typecheck
npm run build
git diff --check
git add web tests/web
git commit -m "feat: pause battles safely across page lifecycle"
```

## Task 8: 音频和生命周期人工验收

- [ ] **Step 1: 本地预览**

```powershell
npm run build
npx vite preview --host 127.0.0.1 --port 4173 --strictPort
```

- [ ] **Step 2: 检查声音**

- 首次打开页面不自动播放。
- 点击出发后声音解锁。
- 车站 92 BPM、战斗 122 BPM，Boss 叠层不从头重播。
- 主炮声音至少有三种细微变化。
- 密集怪潮没有明显爆音。
- 技能、破甲、击杀、掉落、Boss 和结算声音可区分。
- 音乐关、音效开以及音乐开、音效关都独立生效。
- 刷新页面后设置保留。

- [ ] **Step 3: 检查生命周期**

- 战斗切后台后敌人、时钟、冷却全部停止。
- 返回页面先显示继续层。
- 点击继续后从原位置恢复，不快速补帧。
- 升级、Boss 演出、失败层分别切后台再回来均保持原状态。
- 音频不可用或被浏览器拒绝时，游戏仍完整可玩。

- [ ] **Step 4: 全量门禁**

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
git diff --check
```

Expected: 全部退出码为 0。
