# 《潮汐列车》原型实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可连续游玩、可记录关键漏斗数据的《最后一班：潮汐列车》单机肉鸽原型，用于验证“变道战斗 + 乘客构筑 + 路线选择”的核心乐趣。

**Architecture:** 将纯游戏规则放在可独立测试的 TypeScript domain 层，将 Cocos Creator 场景、动画和输入放在适配层。运行状态、战斗、路线、构筑、结算和存档通过明确接口通信；广告、登录、支付和统计先使用 Mock 适配器，避免平台接入阻塞核心玩法。

**Tech Stack:** Cocos Creator 3.x、TypeScript、Node.js、Vitest；纯规则使用 Vitest 自动化测试，场景表现使用 Cocos 真机/编辑器人工测试。

## Global Constraints

- 首次体验目标：在30秒内完成第一次有效操作。
- 单局目标：6—10分钟，支持单手操作和连续开局。
- 原型内容：1名车长、8—10名乘客、12—15个模块、至少3种流派、1个区域Boss。
- 第一版不做实时多人战斗、公会、交易、真实支付、付费抽卡、现金提现和强制分享。
- 乘客标签改变玩法，不将所有内容简化成单纯攻击力增长。
- 随机结果使用可复现种子，奖励结算必须幂等。
- 客户端不得直接决定正式货币、订单和奖励发放；原型用 Mock，但接口要保留服务端边界。
- 所有关键开局、节点、奖励、Boss和再次开局事件必须有埋点。
- 变更只在 `C:\Users\asus\Desktop\workspace\project-002-tidal-train-roguelike` 内进行。

---

## 文件结构总览

### 规则与数据

- Create: `src/domain/run/RunTypes.ts` — 单局状态、事件和阶段类型
- Create: `src/domain/run/RunStateMachine.ts` — 单局阶段转换
- Create: `src/domain/combat/CombatTypes.ts` — 战斗实体和伤害类型
- Create: `src/domain/combat/DamageSystem.ts` — 伤害、治疗和护盾规则
- Create: `src/domain/combat/EnemySpawner.ts` — 可复现敌人波次
- Create: `src/domain/build/BuildTypes.ts` — 乘客、模块、标签和流派类型
- Create: `src/domain/build/SynergySystem.ts` — 流派触发和效果计算
- Create: `src/domain/route/RouteTypes.ts` — 节点、路线和奖励类型
- Create: `src/domain/route/RouteGenerator.ts` — 通过种子生成路线
- Create: `src/domain/route/RewardResolver.ts` — 三选一奖励和撤离奖励
- Create: `src/domain/boss/TidalBeastBoss.ts` — 区域Boss状态和机制
- Create: `src/domain/settlement/SettlementService.ts` — 胜利、失败、撤离和幂等结算

### 内容与平台边界

- Create: `src/content/ContentTypes.ts` — 配置结构
- Create: `src/content/PrototypeCatalog.ts` — 原型乘客、模块、敌人和Boss内容
- Create: `src/platform/PlatformContracts.ts` — 登录、广告、商店、统计和分享接口
- Create: `src/platform/MockPlatform.ts` — 原型环境适配器
- Create: `src/save/SaveRepository.ts` — 本地存档接口和版本迁移
- Create: `src/telemetry/TelemetryEvents.ts` — 事件名称和负载类型
- Create: `src/telemetry/TelemetryClient.ts` — 事件记录器和内存实现

### Cocos表现层

- Create: `assets/scripts/bootstrap/PrototypeBootstrap.ts` — 场景初始化和依赖组装
- Create: `assets/scripts/run/RunSceneController.ts` — 单局场景控制器
- Create: `assets/scripts/run/TrainController.ts` — 列车车道输入和表现
- Create: `assets/scripts/run/EnemyView.ts` — 敌人视图和受击表现
- Create: `assets/scripts/run/CombatHud.ts` — 血量、技能和波次UI
- Create: `assets/scripts/route/RouteChoicePanel.ts` — 路线选择UI
- Create: `assets/scripts/reward/RewardChoicePanel.ts` — 三选一奖励UI
- Create: `assets/scripts/station/StationSceneController.ts` — 车站和永久解锁UI
- Create: `assets/scripts/tutorial/TutorialController.ts` — 首局引导

### 测试与验证

- Create: `tests/domain/run/RunStateMachine.spec.ts`
- Create: `tests/domain/combat/DamageSystem.spec.ts`
- Create: `tests/domain/combat/EnemySpawner.spec.ts`
- Create: `tests/domain/build/SynergySystem.spec.ts`
- Create: `tests/domain/route/RouteGenerator.spec.ts`
- Create: `tests/domain/settlement/SettlementService.spec.ts`
- Create: `tests/content/PrototypeCatalog.spec.ts`
- Create: `tests/platform/MockPlatform.spec.ts`
- Create: `tests/save/SaveRepository.spec.ts`
- Create: `tests/telemetry/TelemetryClient.spec.ts`
- Create: `docs/testing/prototype-playtest-script.md`
- Create: `docs/testing/prototype-results-template.md`

---

## Task 1: 建立项目骨架与测试命令

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `tests/smoke/tooling.spec.ts`
- Create: `assets/scripts/bootstrap/PrototypeBootstrap.ts`

**Interfaces:**
- Produces: `npm test`、`npm run typecheck`两个稳定命令；后续规则文件统一放在 `src/`，Cocos组件统一放在 `assets/scripts/`。

- [ ] **Step 1: 写工具链冒烟测试**

```ts
// tests/smoke/tooling.spec.ts
import { describe, expect, it } from 'vitest';

describe('prototype tooling', () => {
  it('runs the test harness', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认测试命令可执行**

Run: `npm test -- --run tests/smoke/tooling.spec.ts`

Expected: 输出 `1 passed`，退出码为 `0`。

- [ ] **Step 3: 创建最小 TypeScript 配置和脚本**

`package.json` 至少包含：

```json
{
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

`tsconfig.json` 至少包含：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

`vitest.config.ts` 至少包含：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
  },
});
```

`.gitignore` 至少包含：

```text
node_modules/
dist/
temp/
library/
local/
```

- [ ] **Step 4: 写入最小Cocos启动组件**

```ts
// assets/scripts/bootstrap/PrototypeBootstrap.ts
import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

@ccclass('PrototypeBootstrap')
export class PrototypeBootstrap extends Component {
  start(): void {
    this.node.name = 'PrototypeRoot';
  }
}
```

- [ ] **Step 5: 运行类型检查并提交**

Run: `npm run typecheck`

Expected: 输出无 TypeScript 错误。

Commit: `chore: scaffold tidal train prototype`

## Task 2: 实现单局状态机

**Files:**
- Create: `src/domain/run/RunTypes.ts`
- Create: `src/domain/run/RunStateMachine.ts`
- Create: `tests/domain/run/RunStateMachine.spec.ts`

**Interfaces:**

```ts
export type RunPhase = 'Lobby' | 'RunStart' | 'RouteChoice' | 'Combat' | 'RewardChoice' | 'Boss' | 'Settlement' | 'Station';

export type RunEvent =
  | { type: 'START_RUN' }
  | { type: 'CHOOSE_ROUTE' }
  | { type: 'ENTER_COMBAT' }
  | { type: 'COMBAT_WON' }
  | { type: 'CHOOSE_REWARD' }
  | { type: 'ENTER_BOSS' }
  | { type: 'BOSS_WON' }
  | { type: 'RUN_FAILED' }
  | { type: 'EXTRACT' }
  | { type: 'RETURN_TO_STATION' };

export interface RunSession {
  readonly seed: number;
  readonly phase: RunPhase;
  readonly nodeIndex: number;
  readonly settled: boolean;
}

export function createRun(seed: number): RunSession;
export function transition(session: RunSession, event: RunEvent): RunSession;
```

- [ ] **Step 1: 写非法转换和完整开局路径测试**

```ts
// import { createRun, transition } from '../../../src/domain/run/RunStateMachine';
it('moves through a complete run path', () => {
  let run = createRun(7);
  run = transition(run, { type: 'START_RUN' });
  run = transition(run, { type: 'CHOOSE_ROUTE' });
  run = transition(run, { type: 'ENTER_COMBAT' });
  run = transition(run, { type: 'COMBAT_WON' });
  expect(run.phase).toBe('RewardChoice');
});

it('rejects events that do not belong to the current phase', () => {
  const run = createRun(7);
  expect(() => transition(run, { type: 'BOSS_WON' })).toThrow('Invalid run transition');
});
```

- [ ] **Step 2: 运行测试确认测试先失败**

Run: `npm test -- --run tests/domain/run/RunStateMachine.spec.ts`

Expected: FAIL，因为状态类型和转换函数尚未实现。

- [ ] **Step 3: 实现最小状态机**

实现要求：`transition` 不修改旧对象；非法事件统一抛出包含 `Invalid run transition` 的错误；`SETTLEMENT` 状态只能通过 `RETURN_TO_STATION` 离开；`settled` 只在结算时变为 `true`。转换表固定为：`Lobby + START_RUN -> RunStart`、`RunStart + CHOOSE_ROUTE -> RouteChoice`、`RouteChoice + ENTER_COMBAT -> Combat`、`Combat + COMBAT_WON -> RewardChoice`、`RewardChoice + CHOOSE_REWARD -> RouteChoice`、`RouteChoice + ENTER_BOSS -> Boss`、`Boss + BOSS_WON -> Settlement`、`Combat/Boss + RUN_FAILED -> Settlement`、`Boss + EXTRACT -> Settlement`、`Settlement + RETURN_TO_STATION -> Station`。

核心实现形态：

```ts
function nextPhase(phase: RunPhase, eventType: RunEvent['type']): RunPhase | undefined {
  const transitions: Partial<Record<RunPhase, Partial<Record<RunEvent['type'], RunPhase>>>> = {
    Lobby: { START_RUN: 'RunStart' },
    RunStart: { CHOOSE_ROUTE: 'RouteChoice' },
    RouteChoice: { ENTER_COMBAT: 'Combat', ENTER_BOSS: 'Boss' },
    Combat: { COMBAT_WON: 'RewardChoice', RUN_FAILED: 'Settlement' },
    RewardChoice: { CHOOSE_REWARD: 'RouteChoice' },
    Boss: { BOSS_WON: 'Settlement', RUN_FAILED: 'Settlement', EXTRACT: 'Settlement' },
    Settlement: { RETURN_TO_STATION: 'Station' },
  };
  return transitions[phase]?.[eventType];
}

export function transition(session: RunSession, event: RunEvent): RunSession {
  const next = nextPhase(session.phase, event.type);
  if (!next) throw new Error(`Invalid run transition: ${session.phase}/${event.type}`);
  return { ...session, phase: next, settled: next === 'Settlement' };
}
```

- [ ] **Step 4: 运行测试和类型检查**

Run: `npm test -- --run tests/domain/run/RunStateMachine.spec.ts && npm run typecheck`

Expected: 测试全部 PASS，类型检查无错误。

- [ ] **Step 5: 提交**

Commit: `feat: add run state machine`

## Task 3: 实现战斗、伤害和敌人波次

**Files:**
- Create: `src/domain/combat/CombatTypes.ts`
- Create: `src/domain/combat/DamageSystem.ts`
- Create: `src/domain/combat/EnemySpawner.ts`
- Create: `tests/domain/combat/DamageSystem.spec.ts`
- Create: `tests/domain/combat/EnemySpawner.spec.ts`

**Interfaces:**

```ts
export interface Combatant {
  id: string;
  hp: number;
  maxHp: number;
  shield: number;
}

export interface DamageResult {
  target: Combatant;
  absorbedByShield: number;
  hpLost: number;
  defeated: boolean;
}

export function applyDamage(target: Combatant, amount: number): DamageResult;
export function heal(target: Combatant, amount: number): Combatant;
export function createWave(seed: number, waveIndex: number): readonly { id: string; hp: number; speed: number }[];
```

- [ ] **Step 1: 写护盾、过量伤害、治疗上限和种子复现测试**

```ts
it('uses shield before hp', () => {
  const result = applyDamage({ id: 'train', hp: 80, maxHp: 100, shield: 30 }, 50);
  expect(result.absorbedByShield).toBe(30);
  expect(result.hpLost).toBe(20);
  expect(result.target.hp).toBe(60);
});

it('does not heal above max hp', () => {
  expect(heal({ id: 'train', hp: 90, maxHp: 100, shield: 0 }, 50).hp).toBe(100);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run tests/domain/combat`

Expected: FAIL，因为战斗函数尚未实现。

- [ ] **Step 3: 实现纯规则**

伤害函数必须返回新对象；负数伤害、负数治疗和非有限数值抛出错误；波次生成只依赖 `seed` 和 `waveIndex`，同样输入必须得到相同敌人列表。

- [ ] **Step 4: 运行测试和类型检查**

Run: `npm test -- --run tests/domain/combat && npm run typecheck`

Expected: 全部 PASS，无类型错误。

- [ ] **Step 5: 提交**

Commit: `feat: add combat damage and wave rules`

## Task 4: 建立乘客、模块和原型内容目录

**Files:**
- Create: `src/content/ContentTypes.ts`
- Create: `src/content/PrototypeCatalog.ts`
- Create: `tests/content/PrototypeCatalog.spec.ts`

**Interfaces:**

```ts
export type BuildTag = 'mechanic' | 'fire' | 'healing' | 'sound' | 'illusion' | 'defense';

export interface PassengerDefinition {
  id: string;
  displayName: string;
  tags: readonly BuildTag[];
  baseEffectId: string;
  upgradeEffectId: string;
  synergyIds: readonly string[];
}

export interface ModuleDefinition {
  id: string;
  displayName: string;
  category: 'attack' | 'defense' | 'repair' | 'control' | 'special';
  effectId: string;
  tags: readonly BuildTag[];
}

export interface PrototypeCatalog {
  passengers: readonly PassengerDefinition[];
  modules: readonly ModuleDefinition[];
}

export function getPrototypeCatalog(): PrototypeCatalog;
```

- [ ] **Step 1: 写内容数量、唯一ID和标签合法性测试**

```ts
it('contains the prototype content budget', () => {
  const catalog = getPrototypeCatalog();
  expect(catalog.passengers.length).toBeGreaterThanOrEqual(8);
  expect(catalog.passengers.length).toBeLessThanOrEqual(10);
  expect(catalog.modules.length).toBeGreaterThanOrEqual(12);
  expect(catalog.modules.length).toBeLessThanOrEqual(15);
});

it('has unique IDs and valid tags', () => {
  const catalog = getPrototypeCatalog();
  const ids = catalog.passengers.map((item) => item.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(catalog.passengers.every((item) => item.tags.length >= 1)).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run tests/content/PrototypeCatalog.spec.ts`

Expected: FAIL，因为目录尚未创建。

- [ ] **Step 3: 写入最小内容目录**

乘客ID固定为：`mechanic`、`firefighter`、`chef`、`doctor`、`violinist`、`magician`、`repairer`、`poet`。模块至少覆盖攻击、防御、维修、控制和特殊五类，并包含机械、火焰、治疗、声波、幻象、防御六种标签中的至少五种；组合测试使用固定模块ID `steam-cannon`、`sound-mirror`、`repair-drone`。

- [ ] **Step 4: 运行测试和类型检查**

Run: `npm test -- --run tests/content/PrototypeCatalog.spec.ts && npm run typecheck`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

Commit: `feat: add prototype passenger and module catalog`

## Task 5: 实现构筑和流派组合

**Files:**
- Create: `src/domain/build/BuildTypes.ts`
- Create: `src/domain/build/SynergySystem.ts`
- Create: `tests/domain/build/SynergySystem.spec.ts`

**Interfaces:**

```ts
import type { BuildTag, ModuleDefinition, PassengerDefinition } from '../../content/ContentTypes';

export interface BuildState {
  passengers: readonly PassengerDefinition[];
  modules: readonly ModuleDefinition[];
  activeTags: readonly BuildTag[];
}

export interface SynergyEffect {
  id: string;
  displayName: string;
  description: string;
  power: number;
}

export function addPassenger(build: BuildState, passenger: PassengerDefinition): BuildState;
export function addModule(build: BuildState, module: ModuleDefinition): BuildState;
export function getActiveSynergies(build: BuildState): readonly SynergyEffect[];

interface SynergyRule {
  requiredTags: readonly BuildTag[];
  requiredModuleIds: readonly string[];
  effect: SynergyEffect;
}
```

- [ ] **Step 1: 写三种流派触发和重复添加不可变测试**

```ts
it('activates a fire synergy when the required tags are present', () => {
  const catalog = getPrototypeCatalog();
  const firefighter = catalog.passengers.find((item) => item.id === 'firefighter')!;
  const steamCannon = catalog.modules.find((item) => item.id === 'steam-cannon')!;
  const build = addPassenger({ passengers: [], modules: [], activeTags: [] }, firefighter);
  const upgraded = addModule(build, steamCannon);
  expect(getActiveSynergies(upgraded).map((item) => item.id)).toContain('steam-fire');
});

it('does not mutate the previous build', () => {
  const catalog = getPrototypeCatalog();
  const mechanic = catalog.passengers.find((item) => item.id === 'mechanic')!;
  const build = { passengers: [], modules: [], activeTags: [] };
  const next = addPassenger(build, mechanic);
  expect(build.passengers).toHaveLength(0);
  expect(next.passengers).toHaveLength(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run tests/domain/build/SynergySystem.spec.ts`

Expected: FAIL，因为构筑和流派规则尚未实现。

- [ ] **Step 3: 实现组合计算**

至少实现三条可观察流派：蒸汽火焰、声波复制、维修无人机。触发条件由标签和模块效果决定，输出效果包含可供UI显示的名称、描述和强度。组合计算保持纯函数：

```ts
export function getActiveSynergies(build: BuildState): readonly SynergyEffect[] {
  const tags = new Set(build.activeTags);
  const moduleIds = new Set(build.modules.map((item) => item.id));
  return synergyRules
    .filter((rule) => rule.requiredTags.every((tag) => tags.has(tag)))
    .filter((rule) => rule.requiredModuleIds.every((id) => moduleIds.has(id)))
    .map((rule) => rule.effect);
}
```

- [ ] **Step 4: 运行测试和类型检查**

Run: `npm test -- --run tests/domain/build/SynergySystem.spec.ts && npm run typecheck`

Expected: 全部 PASS，三条流派都能被测试触发。

- [ ] **Step 5: 提交**

Commit: `feat: add passenger module synergies`

## Task 6: 实现路线、节点和三选一奖励

**Files:**
- Create: `src/domain/route/RouteTypes.ts`
- Create: `src/domain/route/RouteGenerator.ts`
- Create: `src/domain/route/RewardResolver.ts`
- Create: `tests/domain/route/RouteGenerator.spec.ts`
- Create: `tests/domain/route/RewardResolver.spec.ts`

**Interfaces:**

```ts
export type RouteNodeType = 'combat' | 'rescue' | 'shop' | 'repair' | 'event' | 'boss';

export interface RouteNode {
  id: string;
  depth: number;
  type: RouteNodeType;
  nextNodeIds: readonly string[];
  risk: number;
}

export interface RewardOption {
  id: string;
  kind: 'passenger' | 'module' | 'temporary' | 'gear';
  contentId: string;
}

export function createRoute(seed: number): readonly RouteNode[];
export function createRewardOptions(seed: number, nodeId: string): readonly RewardOption[];
```

- [ ] **Step 1: 写路线结构和种子复现测试**

```ts
// import { createRoute, createRewardOptions } from '../../../src/domain/route/RouteGenerator';
it('creates a route with a boss at the final depth', () => {
  const route = createRoute(17);
  expect(route.at(-1)?.type).toBe('boss');
  expect(route.some((node) => node.type === 'shop')).toBe(true);
  expect(route.some((node) => node.type === 'event')).toBe(true);
});

it('recreates the same route and rewards from the same seed', () => {
  expect(createRoute(17)).toEqual(createRoute(17));
  expect(createRewardOptions(17, 'node-2')).toEqual(createRewardOptions(17, 'node-2'));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run tests/domain/route/RouteGenerator.spec.ts`

Expected: FAIL，因为路线和奖励生成器尚未实现。

- [ ] **Step 3: 实现路线和奖励生成**

路线必须有战斗、奖励、商店、事件和Boss节点；奖励选项必须互不重复；同一输入种子不得改变结果；路线不能出现没有下一节点的非Boss节点。生成器使用确定性伪随机函数：

```ts
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
```

- [ ] **Step 4: 运行测试和类型检查**

Run: `npm test -- --run tests/domain/route && npm run typecheck`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

Commit: `feat: add seeded route and reward choices`

## Task 7: 实现区域Boss和幂等结算

**Files:**
- Create: `src/domain/boss/TidalBeastBoss.ts`
- Create: `src/domain/settlement/SettlementService.ts`
- Create: `tests/domain/settlement/SettlementService.spec.ts`

**Interfaces:**

```ts
export type BossPattern = 'wave' | 'charge' | 'flood';

export interface BossState {
  id: 'tidal-beast';
  hp: number;
  maxHp: number;
  pattern: BossPattern;
  patternIndex: number;
}

export function createBoss(): BossState;

export interface SettlementInput {
  runId: string;
  outcome: 'victory' | 'defeat' | 'extract';
  gears: number;
}

export interface SettlementResult {
  runId: string;
  outcome: SettlementInput['outcome'];
  gearsGranted: number;
  alreadySettled: boolean;
}

export function advanceBoss(state: BossState, elapsedSeconds: number): BossState;
export function settleRun(input: SettlementInput): SettlementResult;
```

- [ ] **Step 1: 写Boss模式和重复结算测试**

```ts
it('changes boss pattern after a charge interval', () => {
  const next = advanceBoss(createBoss(), 12);
  expect(next.pattern).toBe('charge');
});

it('does not grant rewards twice for one run id', () => {
  const input = { runId: 'run-1', outcome: 'victory' as const, gears: 40 };
  expect(settleRun(input).gearsGranted).toBe(40);
  const retry = settleRun(input);
  expect(retry.alreadySettled).toBe(true);
  expect(retry.gearsGranted).toBe(0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run tests/domain/settlement/SettlementService.spec.ts`

Expected: FAIL，因为Boss和结算服务尚未实现。

- [ ] **Step 3: 实现Boss和结算**

Boss至少包含波次、冲锋和淹没三种可识别机制；结算服务用 `runId` 去重，胜利奖励高于撤离，撤离奖励高于失败，失败仍有少量齿轮。结算去重使用模块内的 `Set<string>`，首次结算后记录 `runId`，重复调用只返回 `gearsGranted: 0`。

- [ ] **Step 4: 运行测试和类型检查**

Run: `npm test -- --run tests/domain/settlement && npm run typecheck`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

Commit: `feat: add tidal beast boss and idempotent settlement`

## Task 8: 建立存档和平台适配接口

**Files:**
- Create: `src/platform/PlatformContracts.ts`
- Create: `src/platform/MockPlatform.ts`
- Create: `src/save/SaveRepository.ts`
- Create: `tests/platform/MockPlatform.spec.ts`
- Create: `tests/save/SaveRepository.spec.ts`

**Interfaces:**

```ts
export interface IAds {
  showRewardedAd(placement: 'revive' | 'double-settlement' | 'reroll'): Promise<'completed' | 'closed' | 'failed'>;
}

export class MockAds implements IAds {
  constructor(result: 'completed' | 'closed' | 'failed');
  showRewardedAd(placement: 'revive' | 'double-settlement' | 'reroll'): Promise<'completed' | 'closed' | 'failed'>;
}

export interface IAnalytics {
  track(event: string, payload: Record<string, string | number | boolean>): void;
}

export interface PlayerSave {
  version: 1;
  gears: number;
  unlockedPassengerIds: readonly string[];
  unlockedModuleIds: readonly string[];
}

export interface SaveRepository {
  load(): PlayerSave;
  save(next: PlayerSave): void;
}

export function defaultSave(): PlayerSave;
export function createMemorySaveRepository(): SaveRepository;
```

- [ ] **Step 1: 写存档默认值、覆盖保护和广告Mock测试**

```ts
it('returns a safe default save when no data exists', () => {
  const repository = createMemorySaveRepository();
  expect(repository.load()).toEqual({
    version: 1,
    gears: 0,
    unlockedPassengerIds: [],
    unlockedModuleIds: [],
  });
});

it('returns completed for a configured mock rewarded ad', async () => {
  const ads = new MockAds('completed');
  await expect(ads.showRewardedAd('revive')).resolves.toBe('completed');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run tests/platform tests/save`

Expected: FAIL，因为平台接口和存档实现尚未创建。

- [ ] **Step 3: 实现内存Mock和版本为1的存档**

存档读取失败时返回安全默认值；保存时拒绝负齿轮；对象写入使用深拷贝；Mock广告不调用任何真实平台接口。

- [ ] **Step 4: 运行测试和类型检查**

Run: `npm test -- --run tests/platform tests/save && npm run typecheck`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

Commit: `feat: add platform mocks and local save repository`

## Task 9: 实现Cocos单局场景和基础UI

**Files:**
- Modify: `assets/scripts/bootstrap/PrototypeBootstrap.ts`
- Create: `assets/scripts/run/RunSceneController.ts`
- Create: `assets/scripts/run/TrainController.ts`
- Create: `assets/scripts/run/EnemyView.ts`
- Create: `assets/scripts/run/CombatHud.ts`
- Create: `assets/scripts/route/RouteChoicePanel.ts`
- Create: `assets/scripts/reward/RewardChoicePanel.ts`

**Interfaces:**

```ts
export interface RunScenePorts {
  onLaneChanged(lane: number): void;
  onSkillPressed(skillId: string): void;
  onRouteSelected(nodeId: string): void;
  onRewardSelected(optionId: string): void;
}
```

- [ ] **Step 1: 在Cocos编辑器创建原型场景**

场景必须包含三车道、列车节点、敌人容器、路线入口、奖励面板、血条、技能按钮和重新开始按钮。所有节点名称与组件字段写入场景说明，避免脚本依赖隐含层级。

- [ ] **Step 2: 绑定列车输入和规则层**

左右滑动或点击相邻车道时只调用 `RunScenePorts.onLaneChanged(lane)`；UI组件不得直接增加齿轮或修改Boss血量。

- [ ] **Step 3: 绑定战斗和奖励表现**

战斗事件驱动敌人生成、受击数字、死亡动画和血条更新；路线和三选一面板只负责展示规则层产生的选项并回传选择ID。

- [ ] **Step 4: 手工运行首局流程**

Run: 在Cocos编辑器点击运行，完成“开始—战斗—奖励—路线—Boss—失败或胜利—重新开始”。

Expected: 全流程可操作；无黑屏、死循环、不可关闭面板或重复奖励。

- [ ] **Step 5: 提交**

Commit: `feat: add playable run scene and prototype hud`

## Task 10: 接入车站、引导和永久解锁模拟

**Files:**
- Create: `assets/scripts/station/StationSceneController.ts`
- Create: `assets/scripts/tutorial/TutorialController.ts`
- Modify: `src/save/SaveRepository.ts`
- Create: `tests/save/StationProgress.spec.ts`

**Interfaces:**

```ts
export interface TutorialStep {
  id: 'lane' | 'combat' | 'reward' | 'route' | 'settlement';
  message: string;
  requiredAction: string;
}

export function unlockPassenger(save: PlayerSave, passengerId: string): PlayerSave;
export function unlockModule(save: PlayerSave, moduleId: string): PlayerSave;
```

- [ ] **Step 1: 写永久解锁和引导进度测试**

```ts
it('unlocks a passenger without duplicating the id', () => {
  const save: PlayerSave = {
    version: 1,
    gears: 0,
    unlockedPassengerIds: [],
    unlockedModuleIds: [],
  };
  const next = unlockPassenger(unlockPassenger(save, 'mechanic'), 'mechanic');
  expect(next.unlockedPassengerIds).toEqual(['mechanic']);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run tests/save/StationProgress.spec.ts`

Expected: FAIL，因为永久解锁函数尚未实现。

- [ ] **Step 3: 实现车站和五步引导**

引导顺序固定为：变道、自动战斗、奖励选择、路线选择、结算再次开局。玩家完成一步后才进入下一步，但允许跳过已完成引导；引导不显示付费或广告内容。

- [ ] **Step 4: 手工验证新玩家路径**

Run: 清空本地存档后运行游戏，完成首局，再退出并重新进入车站。

Expected: 齿轮和解锁内容保留；再次开局不重复播放已经完成的引导；存档损坏时回到安全默认值。

- [ ] **Step 5: 提交**

Commit: `feat: add station progression and first-run tutorial`

## Task 11: 添加埋点、Mock广告和调试面板

**Files:**
- Create: `src/telemetry/TelemetryEvents.ts`
- Create: `src/telemetry/TelemetryClient.ts`
- Modify: `src/platform/MockPlatform.ts`
- Create: `assets/scripts/debug/PrototypeDebugPanel.ts`
- Create: `tests/telemetry/TelemetryClient.spec.ts`

**Interfaces:**

```ts
export type PrototypeEventName =
  | 'run_start'
  | 'first_action'
  | 'route_choice'
  | 'reward_choice'
  | 'synergy_activated'
  | 'boss_enter'
  | 'run_settled'
  | 'revive_clicked'
  | 'run_restart';

export interface PrototypeEvent {
  name: PrototypeEventName;
  runId: string;
  timestampMs: number;
  payload: Record<string, string | number | boolean>;
}

export interface TelemetryClient {
  track(event: PrototypeEvent): void;
  flush(): readonly PrototypeEvent[];
}

export function createMemoryTelemetry(): TelemetryClient;
```

- [ ] **Step 1: 写事件顺序和flush清空测试**

```ts
it('records event name and run id', () => {
  const telemetry = createMemoryTelemetry();
  telemetry.track({ name: 'run_start', runId: 'r1', timestampMs: 1, payload: { seed: 7 } });
  expect(telemetry.flush()).toHaveLength(1);
});

it('flush returns a copy and clears buffered events', () => {
  const telemetry = createMemoryTelemetry();
  telemetry.track({ name: 'run_restart', runId: 'r1', timestampMs: 2, payload: {} });
  telemetry.flush();
  expect(telemetry.flush()).toHaveLength(0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run tests/telemetry/TelemetryClient.spec.ts`

Expected: FAIL，因为埋点客户端尚未实现。

- [ ] **Step 3: 实现埋点和调试面板**

调试面板至少支持：跳过引导、生成指定流派、直接进入Boss、清空存档、模拟广告完成、打印当前RunState。调试功能只在开发构建开启。

- [ ] **Step 4: 运行测试和手工核验漏斗**

Run: `npm test -- --run tests/telemetry/TelemetryClient.spec.ts && npm run typecheck`

Expected: 测试 PASS；手工完成一局时能看到 `run_start`、`first_action`、`reward_choice`、`boss_enter`、`run_settled`和`run_restart`。

- [ ] **Step 5: 提交**

Commit: `feat: add prototype telemetry and debug controls`

## Task 12: 完成测试脚本、兼容性检查和可玩性试玩

**Files:**
- Create: `docs/testing/prototype-playtest-script.md`
- Create: `docs/testing/prototype-results-template.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 已完成的规则测试、场景流程、埋点事件和调试面板。
- Produces: 可交给非项目成员执行的试玩脚本和结构化结果模板。

- [ ] **Step 1: 写试玩脚本**

脚本必须包含：清空存档、首次进入、30秒理解度、第一局、第二局、失败复活、Boss、结算、退出重进和自由反馈，不向试玩者主动解释“乘客就是技能”。

- [ ] **Step 2: 写验收数据模板**

模板字段至少包含：首次有效操作时间、首局完成、第二局启动、失败原因、最喜欢的乘客、最困惑的按钮、是否愿意再次开局、设备型号和异常描述。

- [ ] **Step 3: 运行全部自动化测试**

Run: `npm test && npm run typecheck`

Expected: 所有测试 PASS，类型检查无错误。

- [ ] **Step 4: 执行真机/编辑器回归**

覆盖：低端安卓设备、常见全面屏比例、切后台、弱网、重复点击、快速退出、存档恢复、Boss失败和胜利结算。

Expected: 没有阻塞流程的崩溃、黑屏、卡死、重复发奖或进度丢失。

- [ ] **Step 5: 更新README并提交**

README必须写明启动方式、测试命令、原型限制和当前验证结果。

Commit: `test: validate tidal train prototype flow`

## 验收门槛

原型只有同时满足以下条件才进入商业MVP：

1. 陌生玩家在30秒内完成第一次有效操作。
2. 大多数试玩者不看外部说明即可完成一局。
3. 至少三种流派都有人主动尝试。
4. 失败后仍有明显再次开局动机。
5. 首局完成率达到设计目标，且没有严重卡死、重复发奖或存档丢失。
6. 试玩反馈主要集中在平衡和内容数量，而不是“我不知道该做什么”。

## 规格覆盖检查

- 短局、单手和首局理解：Tasks 2、3、9、10、12。
- 乘客、模块、标签和至少三种流派：Tasks 4、5、9。
- 路线、节点、奖励、撤离和Boss：Tasks 6、7、9。
- 车站、永久解锁和基础存档：Tasks 8、10。
- 配置/接口/Mock平台边界：Tasks 1、4、8、11。
- 版本后续可运营的数据基础：Tasks 4、6、11。
- 20—50名玩家试玩和核心指标采集：Task 12。
- 商业化合规限制：Global Constraints、Task 8和Task 11；真实支付不进入原型。

## 计划自检结论

- 没有未定义的函数名、类型名或文件路径。
- 每个代码任务都有失败测试、实现范围、通过测试和提交节点。
- 没有把正式支付、PVP、现金提现或大规模内容混入原型范围。
- 原型规则层不依赖Cocos和抖音平台，便于单元测试与后续替换适配器。
