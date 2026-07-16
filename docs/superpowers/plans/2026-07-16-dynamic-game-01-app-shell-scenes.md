# Dynamic Game 01 App Shell and Scenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有存档、运营和商业化流程的前提下，建立常驻应用外壳、严格 Web 类型检查以及车站、角色、装备、军团、商店五个独立场景。

**Architecture:** 先把浏览器存储封装成可测试的 `AppStateRepository`，再用 `AppShell` 创建一次顶栏、场景宿主、提示层和底部导航。`SceneRouter` 只负责场景生命周期和过渡，`GameApp` 负责命令分派；旧战斗流程暂时封装为 `LegacyRunScene`，直到计划 02/03 用 Canvas 战斗替换。

**Tech Stack:** TypeScript、Vite、Vitest、HTML/CSS、现有领域模块和视图函数。

## Global Constraints

- 本计划结束时，签到、每日试炼入口、内测礼、礼包码、军团、购买、男女列车长、皮肤和装备必须继续工作。
- 五个底部入口必须分别进入 `station`、`captain`、`equipment`、`legion`、`store` 场景。
- 不能再使用 `open-hub-anchor` 或 `scrollIntoView` 进入军团和商店。
- 应用外壳只能挂载一次，场景切换只替换 `#scene-host`。
- `web/**/*.ts` 必须进入 `npm run typecheck`。
- 本阶段继续使用现有静态战斗作为兼容层，不提前修改战斗规则。

---

## 目标文件结构

```text
web/
├─ main.ts
├─ app/
│  ├─ AppTypes.ts
│  ├─ AppStateRepository.ts
│  ├─ AppShell.ts
│  ├─ SceneRouter.ts
│  ├─ GameApp.ts
│  └─ dom.ts
├─ scenes/
│  ├─ Scene.ts
│  ├─ StationScene.ts
│  ├─ CaptainScene.ts
│  ├─ EquipmentScene.ts
│  ├─ LegionScene.ts
│  ├─ StoreScene.ts
│  └─ LegacyRunScene.ts
└─ styles/
   ├─ app-shell-v2.css
   └─ scene-transitions.css
```

## Task 1: 把 Web 入口纳入严格类型检查

**Files:**

- Create: `web/app/dom.ts`
- Create: `tests/web/dom.spec.ts`
- Modify: `tsconfig.json`
- Modify: `web/main.ts`

**Interfaces:**

- Produces: `requireElement<T extends Element>(root, selector): T`
- Consumers: `web/main.ts`、`AppShell`、`BattleHUD`

- [ ] **Step 1: 写失败测试**

```ts
// tests/web/dom.spec.ts
import { describe, expect, it } from 'vitest';
import { requireElement } from '../../web/app/dom';

describe('requireElement', () => {
  it('returns a matching element and rejects a missing selector', () => {
    const expected = { id: 'app' } as unknown as HTMLDivElement;
    const root = {
      querySelector(selector: string) {
        return selector === '#app' ? expected : null;
      },
    } as ParentNode;

    expect(requireElement<HTMLDivElement>(root, '#app')).toBe(expected);
    expect(() => requireElement(root, '#missing')).toThrow(
      'Required element not found: #missing',
    );
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
npm test -- tests/web/dom.spec.ts
```

Expected: FAIL，提示 `../../web/app/dom` 不存在。

- [ ] **Step 3: 实现非空 DOM 查询**

```ts
// web/app/dom.ts
export function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}
```

- [ ] **Step 4: 扩大 TypeScript 检查范围**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts", "web/**/*.ts", "tests/**/*.ts"]
}
```

把 `web/main.ts` 的入口改为：

```ts
import { requireElement } from './app/dom';

const app = requireElement<HTMLDivElement>(document, '#app');
```

删除原有的可空查询和 `if (!app)` 分支。

- [ ] **Step 5: 验证**

```powershell
npm test -- tests/web/dom.spec.ts
npm run typecheck
npm run build
```

Expected: 三条命令全部 PASS；此前 `app is possibly null` 不再出现。

- [ ] **Step 6: 提交**

```powershell
git add tsconfig.json web/main.ts web/app/dom.ts tests/web/dom.spec.ts
git commit -m "refactor: typecheck the web application"
```

## Task 2: 封装浏览器存储和持久状态

**Files:**

- Create: `web/app/AppTypes.ts`
- Create: `web/app/AppStateRepository.ts`
- Create: `tests/web/AppStateRepository.spec.ts`
- Modify: `web/main.ts`

**Interfaces:**

- Produces:
  - `SceneId`
  - `RunMode`
  - `PersistentAppState`
  - `AppStateRepository`
  - `createBrowserAppStateRepository(storage, now)`
- Consumes existing normalizers from `src/domain/**` and `src/save/SaveRepository.ts`.

- [ ] **Step 1: 定义应用类型**

```ts
// web/app/AppTypes.ts
import type { LaunchCampaignState } from '../../src/domain/campaign/LaunchCampaignSystem';
import type { DailyTrialState } from '../../src/domain/challenge/DailyTrialSystem';
import type { DailyCheckInState } from '../../src/domain/retention/DailyCheckInSystem';
import type { SocialExpeditionState } from '../../src/domain/social/SocialExpeditionSystem';
import type { MapId } from '../../src/domain/station/MapProgression';
import type { PlayerSave } from '../../src/save/SaveRepository';

export type SceneId =
  | 'station'
  | 'captain'
  | 'equipment'
  | 'legion'
  | 'store'
  | 'battle';

export type RunMode = 'normal' | 'daily-trial';

export interface PersistentAppState {
  readonly save: PlayerSave;
  readonly social: SocialExpeditionState;
  readonly campaign: LaunchCampaignState;
  readonly dailyTrial: DailyTrialState;
  readonly dailyCheckIn: DailyCheckInState;
  readonly selectedMapId: MapId;
}

export interface StartBattleRequest {
  readonly mode: RunMode;
  readonly mapId: MapId;
}
```

- [ ] **Step 2: 写存储仓库失败测试**

```ts
// tests/web/AppStateRepository.spec.ts
import { describe, expect, it } from 'vitest';
import { defaultSave } from '../../src/save/SaveRepository';
import {
  APP_STORAGE_KEYS,
  createBrowserAppStateRepository,
} from '../../web/app/AppStateRepository';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('AppStateRepository', () => {
  it('loads safe defaults, persists slices and clears only game keys', () => {
    const storage = new MemoryStorage();
    storage.setItem('unrelated', 'keep');
    const repository = createBrowserAppStateRepository(
      storage,
      () => new Date('2026-07-16T08:00:00Z'),
    );

    const initial = repository.load();
    expect(initial.save).toEqual(defaultSave());
    expect(initial.selectedMapId).toBe('drift-suburb');

    repository.savePlayer({ ...initial.save, gears: 77 });
    expect(repository.load().save.gears).toBe(77);

    repository.clear();
    expect(storage.getItem('unrelated')).toBe('keep');
    for (const key of Object.values(APP_STORAGE_KEYS)) {
      expect(storage.getItem(key)).toBeNull();
    }
  });

  it('falls back when stored json is invalid', () => {
    const storage = new MemoryStorage();
    storage.setItem(APP_STORAGE_KEYS.player, '{bad json');
    const repository = createBrowserAppStateRepository(
      storage,
      () => new Date('2026-07-16T08:00:00Z'),
    );

    expect(repository.load().save).toEqual(defaultSave());
  });
});
```

- [ ] **Step 3: 运行并确认失败**

```powershell
npm test -- tests/web/AppStateRepository.spec.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现仓库**

```ts
// web/app/AppStateRepository.ts
import {
  createLaunchCampaignState,
  normalizeLaunchCampaignState,
  type LaunchCampaignState,
} from '../../src/domain/campaign/LaunchCampaignSystem';
import {
  createDailyTrialState,
  getChinaDayId,
  normalizeDailyTrialState,
  type DailyTrialState,
} from '../../src/domain/challenge/DailyTrialSystem';
import {
  createDailyCheckInState,
  normalizeDailyCheckInState,
  type DailyCheckInState,
} from '../../src/domain/retention/DailyCheckInSystem';
import {
  createSocialExpeditionState,
  getIsoWeekCycleId,
  normalizeSocialExpeditionState,
  type SocialExpeditionState,
} from '../../src/domain/social/SocialExpeditionSystem';
import type { MapId } from '../../src/domain/station/MapProgression';
import {
  defaultSave,
  normalizePlayerSave,
  type PlayerSave,
} from '../../src/save/SaveRepository';
import type { PersistentAppState } from './AppTypes';

export const APP_STORAGE_KEYS = {
  player: 'tidal-train-prototype-save-v1',
  social: 'tidal-train-social-v1',
  campaign: 'tidal-train-launch-campaign-v1',
  dailyTrial: 'tidal-train-daily-trial-v1',
  dailyCheckIn: 'tidal-train-daily-checkin-v1',
  selectedMap: 'tidal-train-selected-map-v1',
} as const;

export interface AppStateRepository {
  load(): PersistentAppState;
  savePlayer(state: PlayerSave): void;
  saveSocial(state: SocialExpeditionState): void;
  saveCampaign(state: LaunchCampaignState): void;
  saveDailyTrial(state: DailyTrialState): void;
  saveDailyCheckIn(state: DailyCheckInState): void;
  saveSelectedMap(mapId: MapId): void;
  clear(): void;
}

function parse(storage: Storage, key: string): unknown {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function createBrowserAppStateRepository(
  storage: Storage,
  now: () => Date = () => new Date(),
): AppStateRepository {
  function context(): { dayId: string; cycleId: string } {
    const date = now();
    return {
      dayId: getChinaDayId(date.getTime()),
      cycleId: getIsoWeekCycleId(date),
    };
  }

  return {
    load(): PersistentAppState {
      const { dayId, cycleId } = context();
      let save = defaultSave();
      try {
        const candidate = parse(storage, APP_STORAGE_KEYS.player);
        if (candidate) save = normalizePlayerSave(candidate);
      } catch {
        save = defaultSave();
      }
      const selectedMapCandidate = storage.getItem(APP_STORAGE_KEYS.selectedMap);
      const selectedMapId = save.unlockedMapIds.includes(selectedMapCandidate ?? '')
        ? selectedMapCandidate as MapId
        : 'drift-suburb';
      return {
        save,
        social: normalizeSocialExpeditionState(
          parse(storage, APP_STORAGE_KEYS.social),
          cycleId,
        ),
        campaign: normalizeLaunchCampaignState(
          parse(storage, APP_STORAGE_KEYS.campaign),
        ),
        dailyTrial: normalizeDailyTrialState(
          parse(storage, APP_STORAGE_KEYS.dailyTrial),
          dayId,
        ),
        dailyCheckIn: normalizeDailyCheckInState(
          parse(storage, APP_STORAGE_KEYS.dailyCheckIn),
        ),
        selectedMapId,
      };
    },
    savePlayer(state): void {
      storage.setItem(APP_STORAGE_KEYS.player, JSON.stringify(state));
    },
    saveSocial(state): void {
      storage.setItem(APP_STORAGE_KEYS.social, JSON.stringify(state));
    },
    saveCampaign(state): void {
      storage.setItem(APP_STORAGE_KEYS.campaign, JSON.stringify(state));
    },
    saveDailyTrial(state): void {
      storage.setItem(APP_STORAGE_KEYS.dailyTrial, JSON.stringify(state));
    },
    saveDailyCheckIn(state): void {
      storage.setItem(APP_STORAGE_KEYS.dailyCheckIn, JSON.stringify(state));
    },
    saveSelectedMap(mapId): void {
      storage.setItem(APP_STORAGE_KEYS.selectedMap, mapId);
    },
    clear(): void {
      for (const key of Object.values(APP_STORAGE_KEYS)) {
        storage.removeItem(key);
      }
    },
  };
}
```

删除 `web/main.ts` 中 `SAVE_KEY` 到 `readDailyCheckInState()` 的读取函数，改为：

```ts
const appStateRepository = createBrowserAppStateRepository(window.localStorage);
const initialState = appStateRepository.load();
let save = initialState.save;
let socialState = initialState.social;
let campaignState = initialState.campaign;
let dailyTrialState = initialState.dailyTrial;
let dailyCheckInState = initialState.dailyCheckIn;
let currentMapId = initialState.selectedMapId;
```

所有原 `window.localStorage.setItem` 改为对应仓库方法；重置动作改为 `appStateRepository.clear()`。

- [ ] **Step 5: 验证和提交**

```powershell
npm test -- tests/web/AppStateRepository.spec.ts tests/save/SaveRepository.spec.ts
npm run typecheck
npm run build
git add web/app web/main.ts tests/web/AppStateRepository.spec.ts
git commit -m "refactor: centralize browser game state"
```

## Task 3: 建立常驻应用外壳

**Files:**

- Create: `web/app/AppShell.ts`
- Create: `tests/web/AppShell.spec.ts`
- Create: `web/styles/app-shell-v2.css`
- Modify: `web/styles.css`

**Interfaces:**

- Produces: `mountAppShell(root): AppShellHandles`
- `AppShellHandles` exposes `sceneHost`, `noticeHost`, `navigation`, `setCurrencies`, `setActiveScene`, `setNotice`, `setNavigationHidden`.

- [ ] **Step 1: 写失败测试**

```ts
// tests/web/AppShell.spec.ts
import { describe, expect, it } from 'vitest';
import { renderAppShell } from '../../web/app/AppShell';

describe('AppShell', () => {
  it('renders five independent scene actions and one scene host', () => {
    const html = renderAppShell({
      gears: 7,
      routeMarks: 2,
      starTickets: 1,
    });

    expect(html.match(/data-nav-scene=/g)).toHaveLength(5);
    expect(html).toContain('data-nav-scene="station"');
    expect(html).toContain('data-nav-scene="captain"');
    expect(html).toContain('data-nav-scene="equipment"');
    expect(html).toContain('data-nav-scene="legion"');
    expect(html).toContain('data-nav-scene="store"');
    expect(html).toContain('id="scene-host"');
    expect(html).not.toContain('open-hub-anchor');
  });
});
```

- [ ] **Step 2: 实现外壳**

```ts
// web/app/AppShell.ts
import type { SceneId } from './AppTypes';
import { requireElement } from './dom';

export interface CurrencySnapshot {
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
}

export interface AppShellHandles {
  readonly sceneHost: HTMLElement;
  readonly noticeHost: HTMLElement;
  readonly navigation: HTMLElement;
  setCurrencies(snapshot: CurrencySnapshot): void;
  setActiveScene(sceneId: SceneId): void;
  setNotice(message: string): void;
  setNavigationHidden(hidden: boolean): void;
}

function currency(id: string, label: string, value: number): string {
  return `<span class="currency" data-currency="${id}"><b>${value}</b><span>${label}</span></span>`;
}

export function renderAppShell(snapshot: CurrencySnapshot): string {
  return `<div class="app-shell app-shell--v2">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">潮</span><div><strong>最后一班</strong><small>潮汐列车</small></div></div>
      <div class="currencies">
        ${currency('gears', '齿轮', snapshot.gears)}
        ${currency('routeMarks', '航线徽记', snapshot.routeMarks)}
        ${currency('starTickets', '星票', snapshot.starTickets)}
      </div>
    </header>
    <main class="scene-viewport">
      <div id="scene-host" class="scene-host" aria-live="polite"></div>
      <div id="app-notice" class="notice app-notice" role="status"></div>
    </main>
    <nav class="hub-nav" aria-label="主要功能">
      <button class="hub-nav__item" data-nav-scene="station">车站</button>
      <button class="hub-nav__item" data-nav-scene="captain">角色</button>
      <button class="hub-nav__item" data-nav-scene="equipment">装备</button>
      <button class="hub-nav__item" data-nav-scene="legion">军团</button>
      <button class="hub-nav__item" data-nav-scene="store">商店</button>
    </nav>
  </div>`;
}

export function mountAppShell(
  root: HTMLElement,
  snapshot: CurrencySnapshot,
): AppShellHandles {
  root.innerHTML = renderAppShell(snapshot);
  const sceneHost = requireElement<HTMLElement>(root, '#scene-host');
  const noticeHost = requireElement<HTMLElement>(root, '#app-notice');
  const navigation = requireElement<HTMLElement>(root, '.hub-nav');

  return {
    sceneHost,
    noticeHost,
    navigation,
    setCurrencies(next): void {
      for (const [key, value] of Object.entries(next)) {
        const target = requireElement<HTMLElement>(
          root,
          `[data-currency="${key}"] b`,
        );
        target.textContent = String(value);
      }
    },
    setActiveScene(sceneId): void {
      for (const button of root.querySelectorAll<HTMLButtonElement>('[data-nav-scene]')) {
        const active = button.dataset.navScene === sceneId;
        button.classList.toggle('is-active', active);
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
    },
    setNotice(message): void {
      noticeHost.textContent = message;
      noticeHost.classList.toggle('is-visible', message.length > 0);
    },
    setNavigationHidden(hidden): void {
      navigation.hidden = hidden;
    },
  };
}
```

- [ ] **Step 3: 添加外壳样式**

```css
/* web/styles/app-shell-v2.css */
.app-shell--v2 {
  min-height: 100dvh;
  padding-bottom: calc(82px + env(safe-area-inset-bottom));
}

.scene-viewport {
  width: min(1060px, 100%);
  margin: 0 auto;
  padding: 24px 18px;
  overflow: clip;
}

.scene-host {
  position: relative;
  min-height: calc(100dvh - 184px);
}

.app-notice {
  position: sticky;
  z-index: 35;
  bottom: calc(86px + env(safe-area-inset-bottom));
  margin: 14px auto 0;
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px);
}

.app-notice.is-visible {
  opacity: 1;
  transform: translateY(0);
}

[hidden] { display: none !important; }
```

在 `web/styles.css` 末尾加入：

```css
@import "./styles/app-shell-v2.css";
@import "./styles/scene-transitions.css";
```

- [ ] **Step 4: 验证和提交**

```powershell
npm test -- tests/web/AppShell.spec.ts
npm run typecheck
npm run build
git add web/app/AppShell.ts web/styles web/styles.css tests/web/AppShell.spec.ts
git commit -m "feat: add persistent game app shell"
```

## Task 4: 实现场景生命周期和过渡

**Files:**

- Create: `web/scenes/Scene.ts`
- Create: `web/app/SceneRouter.ts`
- Create: `tests/web/SceneRouter.spec.ts`
- Create: `web/styles/scene-transitions.css`

**Interfaces:**

- `GameScene.mount(host): void | Promise<void>`
- `GameScene.unmount(): void`
- `SceneRouter.go(sceneId, direction): Promise<void>`

- [ ] **Step 1: 定义场景接口**

```ts
// web/scenes/Scene.ts
import type { SceneId } from '../app/AppTypes';

export interface GameScene {
  readonly id: SceneId;
  mount(host: HTMLElement): void | Promise<void>;
  unmount(): void;
}

export type SceneFactory = (sceneId: SceneId) => GameScene;
```

- [ ] **Step 2: 写路由失败测试**

```ts
// tests/web/SceneRouter.spec.ts
import { describe, expect, it } from 'vitest';
import { SceneRouter } from '../../web/app/SceneRouter';
import type { GameScene } from '../../web/scenes/Scene';

describe('SceneRouter', () => {
  it('unmounts the previous scene and ignores stale transitions', async () => {
    const calls: string[] = [];
    const host = {
      innerHTML: '',
      className: '',
      dataset: {},
      classList: {
        add() {},
        remove() {},
      },
      addEventListener() {},
      removeEventListener() {},
      replaceChildren() {},
    } as unknown as HTMLElement;
    const factory = (id: GameScene['id']): GameScene => ({
      id,
      mount() { calls.push(`mount:${id}`); },
      unmount() { calls.push(`unmount:${id}`); },
    });
    const router = new SceneRouter(host, factory, {
      transitionMs: 0,
      reducedMotion: true,
    });

    await router.go('station', 'replace');
    await router.go('captain', 'forward');

    expect(calls).toEqual([
      'mount:station',
      'unmount:station',
      'mount:captain',
    ]);
    expect(router.currentSceneId).toBe('captain');
  });
});
```

- [ ] **Step 3: 实现路由**

```ts
// web/app/SceneRouter.ts
import type { SceneId } from './AppTypes';
import type { GameScene, SceneFactory } from '../scenes/Scene';

export type SceneDirection = 'forward' | 'back' | 'replace';

export interface SceneRouterOptions {
  readonly transitionMs: number;
  readonly reducedMotion: boolean;
}

export class SceneRouter {
  private current: GameScene | null = null;
  private transitionToken = 0;

  public constructor(
    private readonly host: HTMLElement,
    private readonly factory: SceneFactory,
    private readonly options: SceneRouterOptions,
  ) {}

  public get currentSceneId(): SceneId | null {
    return this.current?.id ?? null;
  }

  public async go(
    sceneId: SceneId,
    direction: SceneDirection = 'forward',
  ): Promise<void> {
    if (this.current?.id === sceneId) return;
    const token = ++this.transitionToken;
    const previous = this.current;
    previous?.unmount();

    const next = this.factory(sceneId);
    this.current = next;
    this.host.dataset.sceneDirection = direction;
    this.host.classList.add('scene-host--entering');
    await next.mount(this.host);

    if (!this.options.reducedMotion && this.options.transitionMs > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, this.options.transitionMs);
      });
    }
    if (token !== this.transitionToken) return;
    this.host.classList.remove('scene-host--entering');
  }

  public destroy(): void {
    this.transitionToken += 1;
    this.current?.unmount();
    this.current = null;
    this.host.replaceChildren();
  }
}
```

- [ ] **Step 4: 添加过渡 CSS**

```css
/* web/styles/scene-transitions.css */
.scene-host > .game-scene {
  animation: scene-enter 220ms cubic-bezier(.2, .75, .2, 1) both;
}

.scene-host[data-scene-direction="back"] > .game-scene {
  animation-name: scene-enter-back;
}

@keyframes scene-enter {
  from { opacity: 0; transform: translate3d(22px, 0, 0) scale(.992); }
  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}

@keyframes scene-enter-back {
  from { opacity: 0; transform: translate3d(-22px, 0, 0) scale(.992); }
  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .scene-host > .game-scene {
    animation-name: scene-fade;
    animation-duration: 80ms;
  }
}

@keyframes scene-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 5: 验证和提交**

```powershell
npm test -- tests/web/SceneRouter.spec.ts
npm run typecheck
npm run build
git add web/app/SceneRouter.ts web/scenes/Scene.ts web/styles/scene-transitions.css tests/web/SceneRouter.spec.ts
git commit -m "feat: add animated scene routing"
```

## Task 5: 拆分五个功能场景

**Files:**

- Create: `web/scenes/StationScene.ts`
- Create: `web/scenes/CaptainScene.ts`
- Create: `web/scenes/EquipmentScene.ts`
- Create: `web/scenes/LegionScene.ts`
- Create: `web/scenes/StoreScene.ts`
- Create: `tests/web/FeatureScenes.spec.ts`
- Modify: `web/main.ts`
- Modify: `web/views/EquipmentView.ts`
- Modify: `web/views/StationHeroView.ts`
- Modify: `web/styles/scenes.css`
- Modify: `tests/web/StationHeroView.spec.ts`

**Interfaces:**

- Every scene receives a `FeatureSceneContext`.
- Every click is forwarded as `context.dispatch(action, dataset, formData?)`.

- [ ] **Step 1: 定义统一场景上下文**

在 `web/scenes/Scene.ts` 追加：

```ts
export interface SceneAction {
  readonly action: string;
  readonly data: Readonly<Record<string, string>>;
}

export interface FeatureSceneContext {
  renderStation(): string;
  renderCaptain(): string;
  renderEquipment(): string;
  renderLegion(): string;
  renderStore(): string;
  dispatch(command: SceneAction): void | Promise<void>;
}
```

- [ ] **Step 2: 实现可复用 HTML 场景**

每个文件都使用同一模式；以下是完整的 `CaptainScene`，其它四个文件只替换 `id` 和对应 render 方法：

```ts
// web/scenes/CaptainScene.ts
import type { FeatureSceneContext, GameScene } from './Scene';

export function createCaptainScene(
  context: FeatureSceneContext,
): GameScene {
  let host: HTMLElement | null = null;
  return {
    id: 'captain',
    mount(nextHost): void {
      host = nextHost;
      host.innerHTML = `<section class="game-scene game-scene--captain">${context.renderCaptain()}</section>`;
    },
    unmount(): void {
      host = null;
    },
  };
}
```

精确对应关系：

```text
StationScene    id='station'   context.renderStation()
CaptainScene    id='captain'   context.renderCaptain()
EquipmentScene  id='equipment' context.renderEquipment()
LegionScene     id='legion'    context.renderLegion()
StoreScene      id='store'     context.renderStore()
```

所有场景只生成一个 `.game-scene` 根元素，不自行绑定全局点击监听。

- [ ] **Step 3: 拆分现有渲染**

将 `web/main.ts` 的渲染拆为以下函数，业务内容保持原样：

```ts
function renderStationScene(): string {
  return [
    renderStationHero(/* 原有模型 */),
    renderMapProgression(),
    renderStationUpgrade(),
    renderDailyCheckIn(/* 原有模型 */),
    renderDailyTrialHub(/* 原有模型 */),
    renderLaunchCampaignCenter(),
  ].join('');
}

function renderCaptainScene(): string {
  return renderWardrobeScreen();
}

function renderEquipmentScene(): string {
  return renderEquipmentScreen();
}

function renderLegionScene(): string {
  return renderSocialHub();
}

function renderStoreScene(): string {
  return renderCommerceStore({
    products: PRODUCT_CATALOG,
    purchasedProductIds: save.purchasedProductIds,
    pendingProductId,
  });
}
```

`renderStation()` 不再包含 `renderSocialHub()` 和 `renderCommerceStore()`。删除 `id="shop-center"`、`id="legion-center"` 和底部导航的 `open-hub-anchor`。

把 `EquipmentView` 中“返回衣柜”按钮改成：

```html
<button class="secondary" data-nav-scene="captain">返回角色</button>
```

- [ ] **Step 4: 让车站首屏持续运动**

在 `StationHeroView` 的现有五张图上添加稳定角色标记：

```html
data-motion-role="background"
data-motion-role="train"
data-motion-role="captain"
data-motion-role="otter"
data-motion-role="jellyfish"
```

`web/styles/scenes.css` 新增不依赖 JavaScript 的轻量动画：

- background：18 秒缓慢平移和 1.03 倍呼吸缩放。
- train：4.8 秒上下 4px 悬浮，动力滤镜轻微脉冲。
- captain：3.6 秒上下 2px 呼吸；不做夸张左右摇摆。
- otter：2.4 秒小幅检修点头。
- jellyfish：4.2 秒上下 8px 漂浮。
- `.station-hero::before` 绘制低透明水面高光，9 秒横向移动。

所有动画只改变 `transform`、`opacity` 或 `filter`，不触发布局；加 `will-change` 只限这五个元素。`prefers-reduced-motion: reduce` 时停止位移，只保留 6 秒低透明灯光呼吸。车站不创建 `requestAnimationFrame`。

扩展 `StationHeroView.spec.ts`：

```ts
expect(html.match(/data-motion-role=/g)).toHaveLength(5);
expect(html).toContain('data-motion-role="captain"');
expect(html).toContain('data-motion-role="train"');
```

- [ ] **Step 5: 写场景回归测试**

```ts
// tests/web/FeatureScenes.spec.ts
import { describe, expect, it } from 'vitest';
import {
  createCaptainScene,
} from '../../web/scenes/CaptainScene';
import { createEquipmentScene } from '../../web/scenes/EquipmentScene';
import { createLegionScene } from '../../web/scenes/LegionScene';
import { createStationScene } from '../../web/scenes/StationScene';
import { createStoreScene } from '../../web/scenes/StoreScene';
import type { FeatureSceneContext } from '../../web/scenes/Scene';

describe('feature scenes', () => {
  it('mounts one independent scene body for every bottom navigation item', () => {
    const context: FeatureSceneContext = {
      renderStation: () => '<div>station-only</div>',
      renderCaptain: () => '<div>captain-only</div>',
      renderEquipment: () => '<div>equipment-only</div>',
      renderLegion: () => '<div>legion-only</div>',
      renderStore: () => '<div>store-only</div>',
      dispatch: () => undefined,
    };
    const host = { innerHTML: '' } as HTMLElement;
    const scenes = [
      createStationScene(context),
      createCaptainScene(context),
      createEquipmentScene(context),
      createLegionScene(context),
      createStoreScene(context),
    ];

    expect(scenes.map((scene) => scene.id)).toEqual([
      'station',
      'captain',
      'equipment',
      'legion',
      'store',
    ]);
    for (const scene of scenes) {
      scene.mount(host);
      expect(host.innerHTML).toContain(`game-scene--${scene.id}`);
    }
  });
});
```

- [ ] **Step 6: 运行完整旧功能测试**

```powershell
npm test -- tests/web tests/domain tests/save tests/platform
npm run typecheck
npm run build
```

Expected: 所有已有测试继续 PASS。

- [ ] **Step 7: 提交**

```powershell
git add web/scenes web/main.ts web/views/EquipmentView.ts web/views/StationHeroView.ts web/styles/scenes.css tests/web/FeatureScenes.spec.ts tests/web/StationHeroView.spec.ts
git commit -m "feat: split progression into five scenes"
```

## Task 6: 建立 GameApp 并保留旧战斗兼容层

**Files:**

- Create: `web/app/GameApp.ts`
- Create: `web/scenes/LegacyRunScene.ts`
- Create: `tests/web/GameApp.spec.ts`
- Replace: `web/main.ts`

**Interfaces:**

- `GameApp.start(): Promise<void>`
- `GameApp.destroy(): void`
- `LegacyRunScene` owns the existing phases `combat | reward | route | boss | failure | settlement`.

- [ ] **Step 1: 创建轻量入口**

最终 `web/main.ts` 必须只保留：

```ts
// web/main.ts
import { GameApp } from './app/GameApp';
import { requireElement } from './app/dom';
import './styles.css';

const root = requireElement<HTMLDivElement>(document, '#app');
const game = GameApp.createBrowser(root);
void game.start();
```

- [ ] **Step 2: 把原入口按职责迁移到 GameApp**

`GameApp.ts` 必须包含以下私有状态组，名称保持一致，便于后续计划替换：

```ts
interface HubRuntimeState {
  sceneId: Exclude<SceneId, 'battle'>;
  notice: string;
  pendingProductId: string | null;
  squadSharePending: boolean;
  dailyTrialSharePending: boolean;
}

interface LegacyRunRuntimeState {
  mode: RunMode;
  runId: string;
  seed: number;
  phase: 'combat' | 'reward' | 'route' | 'boss' | 'failure' | 'settlement';
}
```

机械迁移规则：

- `read*` 和 `commit*` 改为调用 `AppStateRepository`。
- `renderHeader()` 和 `renderHubNavigation()` 删除，由 `AppShell` 负责。
- 车站/角色/装备/军团/商店 render 函数放入 `FeatureSceneContext`。
- 所有非战斗点击处理保留原领域调用和原埋点名称。
- `start-run` 和 `start-daily-trial` 调用 `router.go('battle')` 并创建 `LegacyRunScene`。
- `back-station` 销毁 `LegacyRunScene` 后回到 `station`。
- `reset-save` 调用仓库 `clear()` 后重新加载页面。
- `purchase-product`、广告和分享仍使用原 `MockStore`、`MockAds` 和 `MockShare`。

- [ ] **Step 3: 封装 LegacyRunScene**

```ts
// web/scenes/LegacyRunScene.ts
import type { SceneAction, GameScene } from './Scene';

export interface LegacyRunAdapter {
  render(): string;
  dispatch(command: SceneAction): void | Promise<void>;
  destroy(): void;
}

export function createLegacyRunScene(
  adapter: LegacyRunAdapter,
): GameScene {
  let host: HTMLElement | null = null;
  return {
    id: 'battle',
    mount(nextHost): void {
      host = nextHost;
      host.innerHTML = `<section class="game-scene game-scene--battle legacy-run">${adapter.render()}</section>`;
    },
    unmount(): void {
      adapter.destroy();
      host = null;
    },
  };
}
```

`GameApp` 在旧战斗每次状态变化时只刷新 `sceneHost`，不能重新创建 `AppShell`。

- [ ] **Step 4: 统一事件代理**

`GameApp` 只绑定一次 click 和 submit：

```ts
private readonly onClick = (event: Event): void => {
  const target = event.target as HTMLElement;
  const nav = target.closest<HTMLButtonElement>('[data-nav-scene]');
  if (nav?.dataset.navScene) {
    void this.navigate(nav.dataset.navScene as SceneId);
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-action]');
  if (!button?.dataset.action) return;
  const data = Object.fromEntries(
    Object.entries(button.dataset)
      .filter(([key]) => key !== 'action')
      .map(([key, value]) => [key, value ?? '']),
  );
  void this.dispatch({ action: button.dataset.action, data });
};
```

`destroy()` 必须移除这两个监听器并调用 `router.destroy()`。

- [ ] **Step 5: 写应用行为测试**

```ts
// tests/web/GameApp.spec.ts
import { describe, expect, it } from 'vitest';
import { appSceneForAction } from '../../web/app/GameApp';

describe('GameApp navigation', () => {
  it('maps every bottom action to a real scene and reserves battle for departure', () => {
    expect(appSceneForAction('station')).toBe('station');
    expect(appSceneForAction('captain')).toBe('captain');
    expect(appSceneForAction('equipment')).toBe('equipment');
    expect(appSceneForAction('legion')).toBe('legion');
    expect(appSceneForAction('store')).toBe('store');
    expect(appSceneForAction('start-run')).toBe('battle');
  });
});
```

在 `GameApp.ts` 导出纯函数：

```ts
export function appSceneForAction(action: string): SceneId | null {
  if (action === 'start-run' || action === 'start-daily-trial') return 'battle';
  if (
    action === 'station'
    || action === 'captain'
    || action === 'equipment'
    || action === 'legion'
    || action === 'store'
  ) return action;
  return null;
}
```

- [ ] **Step 6: 完整验证**

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
git diff --check
```

手工检查：

1. 清空存档后选择男女列车长。
2. 五个底部入口逐个切换，URL 不变且页面不滚动到锚点。
3. 角色切换、皮肤购买、装备强化、军团加入、签到、礼包码和商店购买可用。
4. 进入旧战斗、完成奖励/路线/Boss/结算并返回车站。
5. 顶栏和底部导航在功能场景切换时不被重建。

- [ ] **Step 7: 提交**

```powershell
git add web/main.ts web/app/GameApp.ts web/scenes/LegacyRunScene.ts tests/web/GameApp.spec.ts
git commit -m "refactor: run the prototype through scene-based app shell"
```
