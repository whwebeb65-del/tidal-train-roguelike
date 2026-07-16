# Dynamic Game 02 Canvas Battle Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立与画面和音频解耦的确定性竖屏守线引擎，实现自动主炮、四轮怪潮、精英、Boss、三个技能、九种强化、暂停、复活、胜负和唯一结算输入。

**Architecture:** `BattleEngine` 使用 60 Hz 固定步长和本局种子。引擎内部保存可变实体数组，通过稳定的 `BattleFrameView` 给渲染层只读访问，并把一次性表现请求写入事件队列。永久成长在开局前由 `BattleRunInputFactory` 聚合；引擎不读取存档、不发货币、不播放声音、不操作 DOM。

**Tech Stack:** TypeScript、Vitest、现有进度/军团/每日试炼领域模块。

## Global Constraints

- 逻辑坐标固定为 `390 × 844`，防线 `y = 716`。
- 固定步长为 `1000 / 60` 毫秒，每次浏览器帧最多补 5 步。
- 相同种子、输入和命令序列必须产生相同结果。
- 自动主炮基础间隔 400ms，目标为最接近防线的存活怪物，距离相同时按创建序号。
- 引擎不得引用 `window`、`document`、Canvas、HTMLImageElement、AudioContext 或 localStorage。
- 引擎只发出 `BattleOutcome`，不直接修改永久钱包。

---

## 目标文件结构

```text
web/battle/
├─ BattleTypes.ts
├─ BattleConfig.ts
├─ SeededRandom.ts
├─ WaveScheduler.ts
├─ UpgradeSystem.ts
├─ BattleEngine.ts
└─ BattleRunInputFactory.ts
web/app/
└─ BattleSettlementAdapter.ts
tests/web/battle/
├─ SeededRandom.spec.ts
├─ WaveScheduler.spec.ts
├─ BattleEngineAutoFire.spec.ts
├─ BattleEngineSkills.spec.ts
├─ UpgradeSystem.spec.ts
├─ BattleEngineUpgrade.spec.ts
├─ BattleEngineBoss.spec.ts
└─ BattleSettlementAdapter.spec.ts
```

## Task 1: 冻结战斗类型、配置和随机数

**Files:**

- Create: `web/battle/BattleTypes.ts`
- Create: `web/battle/BattleConfig.ts`
- Create: `web/battle/SeededRandom.ts`
- Create: `tests/web/battle/SeededRandom.spec.ts`

**Interfaces:**

- `SeededRandom.next(): number`
- `SeededRandom.int(min, max): number`
- `SeededRandom.pick(values): T`
- All later battle modules consume `BattleTypes` and `BattleConfig`.

- [ ] **Step 1: 写随机数失败测试**

```ts
// tests/web/battle/SeededRandom.spec.ts
import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../../../web/battle/SeededRandom';

describe('SeededRandom', () => {
  it('replays the same sequence and validates integer ranges', () => {
    const first = new SeededRandom(42);
    const second = new SeededRandom(42);
    expect([
      first.next(),
      first.next(),
      first.int(3, 9),
      first.pick(['a', 'b', 'c']),
    ]).toEqual([
      second.next(),
      second.next(),
      second.int(3, 9),
      second.pick(['a', 'b', 'c']),
    ]);
    expect(() => first.int(5, 4)).toThrow('Random integer range is invalid');
    expect(() => first.pick([])).toThrow('Cannot pick from an empty collection');
  });
});
```

- [ ] **Step 2: 实现随机数**

```ts
// web/battle/SeededRandom.ts
export class SeededRandom {
  private state: number;

  public constructor(seed: number) {
    if (!Number.isInteger(seed)) {
      throw new Error('Battle seed must be an integer');
    }
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  public next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }

  public int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new Error('Random integer range is invalid');
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  public pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new Error('Cannot pick from an empty collection');
    }
    return values[this.int(0, values.length - 1)] as T;
  }
}
```

- [ ] **Step 3: 定义战斗类型**

```ts
// web/battle/BattleTypes.ts
import type { MapId } from '../../src/domain/station/MapProgression';
import type { RunMode } from '../app/AppTypes';

export type BattleStatus =
  | 'running'
  | 'upgrade'
  | 'boss-intro'
  | 'paused'
  | 'victory'
  | 'defeat';

export type EnemyKind =
  | 'bubble-fin'
  | 'needle-jelly'
  | 'reef-crab'
  | 'storm-ray-elite'
  | 'deep-echo-boss';

export type BattleSkillId =
  | 'tidal-volley'
  | 'bubble-barrier'
  | 'extreme-tide';

export type BattleUpgradeId =
  | 'multi-barrel'
  | 'rapid-reload'
  | 'coral-warhead'
  | 'echo-chain'
  | 'precision-lens'
  | 'bubble-capacitor'
  | 'tidal-resonance'
  | 'magnetic-salvage'
  | 'overload-core';

export type PauseReason =
  | 'manual'
  | 'visibility'
  | 'upgrade'
  | 'rewarded-ad'
  | 'revive'
  | 'boss-intro';

export interface BattleRunInput {
  readonly battleId: string;
  readonly seed: number;
  readonly mode: RunMode;
  readonly mapId: MapId;
  readonly maxTrainHp: number;
  readonly mainCannonDamage: number;
  readonly initialEnergy: number;
  readonly repairBonus: number;
  readonly enemyHpFlatBonus: number;
  readonly enemyHpMultiplier: number;
  readonly enemyDamageMultiplier: number;
}

export interface EnemyState {
  readonly id: number;
  readonly kind: EnemyKind;
  readonly lane: 0 | 1 | 2;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shield: number;
  speedPerSecond: number;
  defenceBroken: boolean;
  attackCooldownMs: number;
  ageMs: number;
  alive: boolean;
}

export interface ProjectileState {
  readonly id: number;
  readonly source: 'main' | 'volley' | 'chain';
  x: number;
  y: number;
  readonly targetId: number;
  readonly speedPerSecond: number;
  readonly damage: number;
  readonly splashRadius: number;
  readonly chainRemaining: number;
  readonly critical: boolean;
  active: boolean;
}

export interface LootState {
  readonly id: number;
  readonly kind: 'experience' | 'gear';
  x: number;
  y: number;
  readonly amount: number;
  ageMs: number;
  collected: boolean;
}

export interface BattleModifiers {
  mainProjectileCount: number;
  mainProjectileDamageMultiplier: number;
  reloadMultiplier: number;
  splashRadius: number;
  splashDamageMultiplier: number;
  chainCount: number;
  chainDamageMultiplier: number;
  criticalChance: number;
  criticalMultiplier: number;
  barrierShieldMultiplier: number;
  barrierHealPercent: number;
  activeCooldownMultiplier: number;
  lootAttractMultiplier: number;
  experienceMultiplier: number;
  energyGainMultiplier: number;
  extremeDamageMultiplier: number;
}

export interface BattleFrameView {
  readonly battleId: string;
  readonly mode: RunMode;
  readonly mapId: MapId;
  readonly status: BattleStatus;
  readonly elapsedMs: number;
  readonly phaseElapsedMs: number;
  readonly wave: number;
  readonly trainHp: number;
  readonly maxTrainHp: number;
  readonly shield: number;
  readonly shieldRemainingMs: number;
  readonly energy: number;
  readonly combo: number;
  readonly kills: number;
  readonly experience: number;
  readonly nextExperienceThreshold: number | null;
  readonly offeredUpgradeIds: readonly BattleUpgradeId[];
  readonly upgradeLevels: Readonly<Record<BattleUpgradeId, number>>;
  readonly cooldowns: Readonly<Record<BattleSkillId, number>>;
  readonly adReviveUsed: boolean;
  readonly skillRefreshUsed: boolean;
  readonly upgradeRerollUsed: boolean;
  readonly enemies: readonly EnemyState[];
  readonly projectiles: readonly ProjectileState[];
  readonly loot: readonly LootState[];
}

export type BattleEvent =
  | { readonly type: 'wave-started'; readonly wave: number }
  | { readonly type: 'enemy-spawned'; readonly enemyId: number; readonly kind: EnemyKind }
  | { readonly type: 'weapon-fired'; readonly projectileId: number; readonly source: ProjectileState['source'] }
  | { readonly type: 'projectile-hit'; readonly enemyId: number; readonly damage: number; readonly critical: boolean; readonly source: ProjectileState['source'] | 'extreme-tide' | 'splash' }
  | { readonly type: 'enemy-armour-broken'; readonly enemyId: number }
  | { readonly type: 'enemy-killed'; readonly enemyId: number; readonly kind: EnemyKind; readonly x: number; readonly y: number }
  | { readonly type: 'loot-created'; readonly lootId: number; readonly kind: LootState['kind'] }
  | { readonly type: 'loot-collected'; readonly lootId: number; readonly kind: LootState['kind']; readonly amount: number }
  | { readonly type: 'train-damaged'; readonly amount: number; readonly shieldAbsorbed: number; readonly remainingHp: number }
  | { readonly type: 'shield-changed'; readonly shield: number }
  | { readonly type: 'skill-used'; readonly skillId: BattleSkillId }
  | { readonly type: 'skill-cooldowns-refreshed' }
  | { readonly type: 'upgrade-offered'; readonly upgradeIds: readonly BattleUpgradeId[] }
  | { readonly type: 'upgrade-rerolled'; readonly upgradeIds: readonly BattleUpgradeId[] }
  | { readonly type: 'upgrade-selected'; readonly upgradeId: BattleUpgradeId; readonly level: number }
  | { readonly type: 'elite-entered'; readonly enemyId: number }
  | { readonly type: 'boss-intro-started' }
  | { readonly type: 'boss-intro-ended'; readonly enemyId: number }
  | { readonly type: 'boss-charge-started'; readonly durationMs: number }
  | { readonly type: 'battle-won' }
  | { readonly type: 'battle-lost' };

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

- [ ] **Step 4: 定义精确配置**

```ts
// web/battle/BattleConfig.ts
import type {
  BattleModifiers,
  BattleSkillId,
  BattleUpgradeId,
  EnemyKind,
} from './BattleTypes';

export const LOGICAL_WIDTH = 390;
export const LOGICAL_HEIGHT = 844;
export const DEFENCE_LINE_Y = 716;
export const FIXED_STEP_MS = 1000 / 60;
export const MAX_CATCH_UP_STEPS = 5;
export const MAIN_CANNON_INTERVAL_MS = 400;
export const MAIN_PROJECTILE_SPEED = 620;
export const EXPERIENCE_THRESHOLDS = [180, 560, 1080] as const;

export const LANE_X = [92, 195, 298] as const;

export const ENEMY_CONFIG: Readonly<Record<EnemyKind, {
  readonly hp: number;
  readonly speedPerSecond: number;
  readonly defenceDamage: number;
  readonly attackIntervalMs: number;
  readonly experience: number;
}>> = {
  'bubble-fin': { hp: 80, speedPerSecond: 52, defenceDamage: 7, attackIntervalMs: 1200, experience: 10 },
  'needle-jelly': { hp: 45, speedPerSecond: 85, defenceDamage: 4, attackIntervalMs: 800, experience: 8 },
  'reef-crab': { hp: 180, speedPerSecond: 34, defenceDamage: 12, attackIntervalMs: 1500, experience: 18 },
  'storm-ray-elite': { hp: 1200, speedPerSecond: 26, defenceDamage: 16, attackIntervalMs: 1200, experience: 120 },
  'deep-echo-boss': { hp: 4200, speedPerSecond: 0, defenceDamage: 0, attackIntervalMs: 0, experience: 0 },
};

export const SKILL_CONFIG: Readonly<Record<BattleSkillId, {
  readonly cooldownMs: number;
}>> = {
  'tidal-volley': { cooldownMs: 12_000 },
  'bubble-barrier': { cooldownMs: 18_000 },
  'extreme-tide': { cooldownMs: 0 },
};

export const UPGRADE_IDS: readonly BattleUpgradeId[] = [
  'multi-barrel',
  'rapid-reload',
  'coral-warhead',
  'echo-chain',
  'precision-lens',
  'bubble-capacitor',
  'tidal-resonance',
  'magnetic-salvage',
  'overload-core',
];

export function createBaseModifiers(): BattleModifiers {
  return {
    mainProjectileCount: 1,
    mainProjectileDamageMultiplier: 1,
    reloadMultiplier: 1,
    splashRadius: 0,
    splashDamageMultiplier: 0,
    chainCount: 0,
    chainDamageMultiplier: 0,
    criticalChance: 0,
    criticalMultiplier: 1.8,
    barrierShieldMultiplier: 1,
    barrierHealPercent: 0.08,
    activeCooldownMultiplier: 1,
    lootAttractMultiplier: 1,
    experienceMultiplier: 1,
    energyGainMultiplier: 1,
    extremeDamageMultiplier: 1,
  };
}
```

- [ ] **Step 5: 验证和提交**

```powershell
npm test -- tests/web/battle/SeededRandom.spec.ts
npm run typecheck
git add web/battle tests/web/battle
git commit -m "feat: define deterministic battle contracts"
```

## Task 2: 生成固定怪潮计划

**Files:**

- Create: `web/battle/WaveScheduler.ts`
- Create: `tests/web/battle/WaveScheduler.spec.ts`

**Interfaces:**

- `createWaveSchedule(seed): readonly SpawnInstruction[]`
- `getWaveAtTime(elapsedMs): number`

- [ ] **Step 1: 写失败测试**

```ts
// tests/web/battle/WaveScheduler.spec.ts
import { describe, expect, it } from 'vitest';
import {
  createWaveSchedule,
  getWaveAtTime,
} from '../../../web/battle/WaveScheduler';

describe('WaveScheduler', () => {
  it('creates the exact four-wave composition with stable lanes', () => {
    const first = createWaveSchedule(99);
    const second = createWaveSchedule(99);

    expect(first).toEqual(second);
    expect(first.filter((item) => item.kind === 'bubble-fin')).toHaveLength(60);
    expect(first.filter((item) => item.kind === 'needle-jelly')).toHaveLength(28);
    expect(first.filter((item) => item.kind === 'reef-crab')).toHaveLength(12);
    expect(first.every((item) => item.spawnAtMs >= 0 && item.spawnAtMs <= 127_000)).toBe(true);
    expect(getWaveAtTime(0)).toBe(1);
    expect(getWaveAtTime(31_000)).toBe(2);
    expect(getWaveAtTime(96_000)).toBe(4);
    expect(getWaveAtTime(131_000)).toBe(5);
  });
});
```

- [ ] **Step 2: 实现波次调度**

```ts
// web/battle/WaveScheduler.ts
import type { EnemyKind } from './BattleTypes';
import { SeededRandom } from './SeededRandom';

export interface SpawnInstruction {
  readonly spawnAtMs: number;
  readonly wave: number;
  readonly kind: Exclude<EnemyKind, 'storm-ray-elite' | 'deep-echo-boss'>;
  readonly lane: 0 | 1 | 2;
  readonly xOffset: number;
}

const WAVES = [
  { wave: 1, startMs: 0, endMs: 27_000, counts: { 'bubble-fin': 18, 'needle-jelly': 0, 'reef-crab': 0 } },
  { wave: 2, startMs: 30_000, endMs: 59_000, counts: { 'bubble-fin': 14, 'needle-jelly': 8, 'reef-crab': 0 } },
  { wave: 3, startMs: 62_000, endMs: 92_000, counts: { 'bubble-fin': 12, 'needle-jelly': 8, 'reef-crab': 6 } },
  { wave: 4, startMs: 95_000, endMs: 127_000, counts: { 'bubble-fin': 16, 'needle-jelly': 12, 'reef-crab': 6 } },
] as const;

export function createWaveSchedule(seed: number): readonly SpawnInstruction[] {
  const random = new SeededRandom(seed ^ 0x54_49_44_45);
  const result: SpawnInstruction[] = [];
  for (const wave of WAVES) {
    const kinds = Object.entries(wave.counts)
      .flatMap(([kind, count]) => Array.from(
        { length: count },
        () => kind as SpawnInstruction['kind'],
      ));
    for (let index = kinds.length - 1; index > 0; index -= 1) {
      const swap = random.int(0, index);
      [kinds[index], kinds[swap]] = [kinds[swap] as SpawnInstruction['kind'], kinds[index] as SpawnInstruction['kind']];
    }
    const spacing = (wave.endMs - wave.startMs) / Math.max(1, kinds.length - 1);
    kinds.forEach((kind, index) => {
      result.push({
        spawnAtMs: Math.round(wave.startMs + spacing * index),
        wave: wave.wave,
        kind,
        lane: random.int(0, 2) as 0 | 1 | 2,
        xOffset: random.int(-14, 14),
      });
    });
  }
  return result.sort((left, right) => left.spawnAtMs - right.spawnAtMs);
}

export function getWaveAtTime(elapsedMs: number): number {
  if (elapsedMs < 30_000) return 1;
  if (elapsedMs < 62_000) return 2;
  if (elapsedMs < 95_000) return 3;
  if (elapsedMs < 130_000) return 4;
  return 5;
}
```

- [ ] **Step 3: 验证和提交**

```powershell
npm test -- tests/web/battle/WaveScheduler.spec.ts
npm run typecheck
git add web/battle/WaveScheduler.ts tests/web/battle/WaveScheduler.spec.ts
git commit -m "feat: schedule deterministic monster waves"
```

## Task 3: 实现移动、自动锁定、炮弹和基础击杀

**Files:**

- Create: `web/battle/BattleEngine.ts`
- Create: `tests/web/battle/BattleEngineAutoFire.spec.ts`

**Interfaces:**

- `BattleEngine.update(stepMs): void`
- `BattleEngine.frame: BattleFrameView`
- `BattleEngine.drainEvents(): readonly BattleEvent[]`
- `BattleEngine.pause(reason): void`
- `BattleEngine.resume(): void`

- [ ] **Step 1: 写自动战斗测试**

```ts
// tests/web/battle/BattleEngineAutoFire.spec.ts
import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../../../web/battle/BattleEngine';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';

function runFor(engine: BattleEngine, durationMs: number): void {
  const steps = Math.ceil(durationMs / FIXED_STEP_MS);
  for (let index = 0; index < steps; index += 1) engine.update(FIXED_STEP_MS);
}

describe('BattleEngine auto fire', () => {
  it('spawns enemies and fires automatically without an attack command', () => {
    const engine = new BattleEngine({
      battleId: 'auto-1',
      seed: 7,
      mode: 'normal',
      mapId: 'drift-suburb',
      maxTrainHp: 100,
      mainCannonDamage: 25,
      initialEnergy: 0,
      repairBonus: 0,
      enemyHpFlatBonus: 0,
      enemyHpMultiplier: 1,
      enemyDamageMultiplier: 1,
    });

    runFor(engine, 2400);
    const events = engine.drainEvents();
    expect(events.some((event) => event.type === 'enemy-spawned')).toBe(true);
    expect(events.some((event) => event.type === 'weapon-fired')).toBe(true);
    expect(events.some((event) => event.type === 'projectile-hit')).toBe(true);
    expect(engine.frame.energy).toBeGreaterThan(0);
  });

  it('freezes all simulation values while paused', () => {
    const engine = new BattleEngine({
      battleId: 'pause-1',
      seed: 7,
      mode: 'normal',
      mapId: 'drift-suburb',
      maxTrainHp: 100,
      mainCannonDamage: 25,
      initialEnergy: 0,
      repairBonus: 0,
      enemyHpFlatBonus: 0,
      enemyHpMultiplier: 1,
      enemyDamageMultiplier: 1,
    });
    runFor(engine, 1000);
    engine.pause('manual');
    const before = JSON.stringify({
      elapsedMs: engine.frame.elapsedMs,
      enemies: engine.frame.enemies.map((enemy) => [enemy.id, enemy.x, enemy.y, enemy.hp]),
    });
    runFor(engine, 5000);
    expect(JSON.stringify({
      elapsedMs: engine.frame.elapsedMs,
      enemies: engine.frame.enemies.map((enemy) => [enemy.id, enemy.x, enemy.y, enemy.hp]),
    })).toBe(before);
  });
});
```

- [ ] **Step 2: 实现引擎骨架**

`BattleEngine.ts` 必须使用以下字段和公开 API：

```ts
export class BattleEngine {
  private readonly events: BattleEvent[] = [];
  private readonly enemies: EnemyState[] = [];
  private readonly projectiles: ProjectileState[] = [];
  private readonly loot: LootState[] = [];
  private readonly schedule: readonly SpawnInstruction[];
  private readonly random: SeededRandom;
  private readonly modifiers = createBaseModifiers();
  private readonly upgradeLevels = Object.fromEntries(
    UPGRADE_IDS.map((id) => [id, 0]),
  ) as Record<BattleUpgradeId, number>;
  private status: BattleStatus = 'running';
  private pausedFrom: Exclude<BattleStatus, 'paused'> | null = null;
  private elapsedMs = 0;
  private phaseElapsedMs = 0;
  private nextSpawnIndex = 0;
  private nextEntityId = 1;
  private fireCooldownMs = 0;
  private trainHp: number;
  private shield = 0;
  private shieldRemainingMs = 0;
  private energy: number;
  private combo = 0;
  private kills = 0;
  private experience = 0;
  private offeredUpgradeIds: BattleUpgradeId[] = [];
  private upgradeOfferRoll = 0;
  private adReviveUsed = false;
  private skillRefreshUsed = false;
  private upgradeRerollUsed = false;
  private reviveProtectionMs = 0;
  private resolvedOutcome: BattleOutcome | null = null;
  private readonly cooldowns: Record<BattleSkillId, number> = {
    'tidal-volley': 0,
    'bubble-barrier': 0,
    'extreme-tide': 0,
  };

  public constructor(private readonly input: BattleRunInput) {
    this.schedule = createWaveSchedule(input.seed);
    this.random = new SeededRandom(input.seed);
    this.trainHp = input.maxTrainHp;
    this.energy = Math.max(0, Math.min(100, input.initialEnergy));
  }

  public get outcome(): BattleOutcome | null {
    return this.resolvedOutcome;
  }

  public get frame(): BattleFrameView {
    return {
      battleId: this.input.battleId,
      mode: this.input.mode,
      mapId: this.input.mapId,
      status: this.status,
      elapsedMs: this.elapsedMs,
      phaseElapsedMs: this.phaseElapsedMs,
      wave: getWaveAtTime(this.elapsedMs),
      trainHp: this.trainHp,
      maxTrainHp: this.input.maxTrainHp,
      shield: this.shield,
      shieldRemainingMs: this.shieldRemainingMs,
      energy: this.energy,
      combo: this.combo,
      kills: this.kills,
      experience: this.experience,
      nextExperienceThreshold: this.nextUpgradeThreshold(),
      offeredUpgradeIds: this.offeredUpgradeIds,
      upgradeLevels: this.upgradeLevels,
      cooldowns: this.cooldowns,
      adReviveUsed: this.adReviveUsed,
      skillRefreshUsed: this.skillRefreshUsed,
      upgradeRerollUsed: this.upgradeRerollUsed,
      enemies: this.enemies,
      projectiles: this.projectiles,
      loot: this.loot,
    };
  }

  public drainEvents(): readonly BattleEvent[] {
    const drained = this.events.splice(0);
    return drained;
  }

  public pause(reason: PauseReason): void {
    if (this.status === 'paused' || this.isTerminal()) return;
    this.pausedFrom = this.status;
    this.status = 'paused';
    this.pauseReason = reason;
  }

  public resume(): void {
    if (this.status !== 'paused' || !this.pausedFrom) return;
    this.status = this.pausedFrom;
    this.pausedFrom = null;
    this.pauseReason = null;
  }
}
```

同时添加 `private pauseReason: PauseReason | null = null`，并实现：

- `update(stepMs)` 验证 `stepMs > 0` 且只在 `running` 或 `boss-intro` 状态推进。
- `spawnScheduledEnemies()` 根据 `elapsedMs` 消耗 schedule。
- `spawnEnemy(kind, lane, xOffset)` 使用 `ENEMY_CONFIG`、输入的生命倍率和固定创建序号。
- `moveEnemies(stepMs)`；到达防线后停止移动并按攻击间隔调用 `damageTrain`。
- `findTarget()` 使用最大 `y`、再使用最小 `id`。
- `fireMainCannon()` 根据主炮间隔创建炮弹。
- `moveProjectiles(stepMs)` 追踪目标；目标死亡时重新锁定最近目标，找不到则释放炮弹。
- `hitEnemy(projectile, enemy)` 处理礁甲蟹第一次 35% 伤害、普通伤害、能量和击杀，并发出带 `source` 的 `projectile-hit`。
- `killEnemy(enemy)` 只执行一次，发出事件并创建经验掉落。
- `updateLoot(stepMs)` 在 280ms 散开后向列车吸附，收集时增加经验。
- `damageTrain(amount)` 先扣护盾，后扣生命；`train-damaged` 同时记录 `shieldAbsorbed` 和实际扣血，生命归零进入 `defeat` 并发 `battle-lost`。

基础伤害规则：

```ts
const critical = this.random.next() < this.modifiers.criticalChance;
const damage = Math.floor(
  this.input.mainCannonDamage
  * this.modifiers.mainProjectileDamageMultiplier
  * (critical ? this.modifiers.criticalMultiplier : 1),
);
```

基础能量：

```ts
this.energy = Math.min(
  100,
  this.energy + Math.floor(2 * this.modifiers.energyGainMultiplier),
);
```

击杀额外增加：

```ts
this.energy = Math.min(
  100,
  this.energy + Math.floor(4 * this.modifiers.energyGainMultiplier),
);
```

- [ ] **Step 3: 验证**

```powershell
npm test -- tests/web/battle/BattleEngineAutoFire.spec.ts
npm run typecheck
```

- [ ] **Step 4: 提交**

```powershell
git add web/battle/BattleEngine.ts tests/web/battle/BattleEngineAutoFire.spec.ts
git commit -m "feat: add automatic cannon battle simulation"
```

## Task 4: 实现三个主动技能、护盾和复活

**Files:**

- Modify: `web/battle/BattleEngine.ts`
- Create: `tests/web/battle/BattleEngineSkills.spec.ts`

**Interfaces:**

- `BattleEngine.useSkill(skillId): boolean`
- `BattleEngine.refreshActiveSkillCooldowns(): boolean`
- `BattleEngine.revive(hpRestored, protectionMs): boolean`

- [ ] **Step 1: 写技能测试**

```ts
// tests/web/battle/BattleEngineSkills.spec.ts
import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../../../web/battle/BattleEngine';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';

const input = {
  battleId: 'skills',
  seed: 11,
  mode: 'normal' as const,
  mapId: 'drift-suburb' as const,
  maxTrainHp: 100,
  mainCannonDamage: 25,
  initialEnergy: 100,
  repairBonus: 6,
  enemyHpFlatBonus: 0,
  enemyHpMultiplier: 1,
  enemyDamageMultiplier: 1,
};

function runFor(engine: BattleEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed < durationMs; elapsed += FIXED_STEP_MS) {
    engine.update(FIXED_STEP_MS);
  }
}

describe('BattleEngine skills', () => {
  it('fires volley, applies barrier and spends full extreme energy', () => {
    const engine = new BattleEngine(input);
    runFor(engine, 500);

    expect(engine.useSkill('tidal-volley')).toBe(true);
    expect(engine.frame.cooldowns['tidal-volley']).toBe(12_000);

    expect(engine.useSkill('bubble-barrier')).toBe(true);
    expect(engine.frame.shield).toBe(25);
    expect(engine.frame.shieldRemainingMs).toBe(4000);

    expect(engine.refreshActiveSkillCooldowns()).toBe(true);
    expect(engine.frame.cooldowns['tidal-volley']).toBe(0);
    expect(engine.frame.cooldowns['bubble-barrier']).toBe(0);
    expect(engine.frame.skillRefreshUsed).toBe(true);
    expect(engine.refreshActiveSkillCooldowns()).toBe(false);

    expect(engine.useSkill('extreme-tide')).toBe(true);
    expect(engine.frame.energy).toBe(0);
    expect(engine.useSkill('extreme-tide')).toBe(false);
  });

  it('revives only from defeat and grants temporary protection', () => {
    const engine = new BattleEngine({ ...input, maxTrainHp: 1, initialEnergy: 0 });
    engine.debugDamageTrain(999);
    expect(engine.frame.status).toBe('defeat');
    expect(engine.revive(60, 3000)).toBe(true);
    expect(engine.frame.trainHp).toBe(1);
    expect(engine.frame.adReviveUsed).toBe(true);
    expect(engine.frame.status).toBe('running');
    engine.debugDamageTrain(999);
    expect(engine.frame.trainHp).toBe(1);
    runFor(engine, 3100);
    engine.debugDamageTrain(999);
    expect(engine.frame.status).toBe('defeat');
    expect(engine.revive(60, 3000)).toBe(false);
  });
});
```

`debugDamageTrain` 仅为测试公开方法，生产 UI 不渲染对应按钮。

- [ ] **Step 2: 实现技能**

`useSkill` 的精确行为：

```ts
public useSkill(skillId: BattleSkillId): boolean {
  if (this.status !== 'running') return false;
  if (skillId === 'extreme-tide') {
    if (this.energy < 100) return false;
    this.energy = 0;
    const damage = Math.floor(
      this.input.mainCannonDamage
      * 8
      * this.modifiers.extremeDamageMultiplier,
    );
    for (const enemy of this.enemies) {
      if (enemy.alive) this.applyDamage(enemy, damage, false, 'extreme-tide');
    }
  } else {
    if (this.cooldowns[skillId] > 0) return false;
    if (skillId === 'tidal-volley' && !this.hasLivingTarget()) return false;
    this.cooldowns[skillId] = Math.round(
      SKILL_CONFIG[skillId].cooldownMs
      * this.modifiers.activeCooldownMultiplier,
    );
    if (skillId === 'tidal-volley') this.fireVolley();
    if (skillId === 'bubble-barrier') this.applyBarrier();
  }
  this.events.push({ type: 'skill-used', skillId });
  return true;
}
```

`fireVolley()`：

- 生成 8 枚 source=`volley` 的追踪弹。
- 每枚伤害 `floor(mainCannonDamage * 0.7)`。
- 先把存活目标按 `y desc, id asc` 排序并轮询分配。
- 没有目标时 `useSkill` 在写入冷却前返回 `false`，不消耗技能。

`applyBarrier()`：

```ts
const healPercent = this.modifiers.barrierHealPercent;
const heal = Math.floor(this.input.maxTrainHp * healPercent) + this.input.repairBonus;
this.trainHp = Math.min(this.input.maxTrainHp, this.trainHp + heal);
this.shield = Math.floor(
  this.input.maxTrainHp * 0.25 * this.modifiers.barrierShieldMultiplier,
);
this.shieldRemainingMs = 4000;
this.events.push({ type: 'shield-changed', shield: this.shield });
```

`update()` 每步减少非零冷却和护盾时间；护盾到期时清零并发 `shield-changed`。

广告技能刷新只重置两个主动冷却，不补极潮能量：

```ts
public refreshActiveSkillCooldowns(): boolean {
  if (
    this.status !== 'running'
    || this.skillRefreshUsed
    || (
      this.cooldowns['tidal-volley'] <= 0
      && this.cooldowns['bubble-barrier'] <= 0
    )
  ) return false;
  this.cooldowns['tidal-volley'] = 0;
  this.cooldowns['bubble-barrier'] = 0;
  this.skillRefreshUsed = true;
  this.events.push({ type: 'skill-cooldowns-refreshed' });
  return true;
}
```

`revive()`：

```ts
public revive(hpRestored: number, protectionMs: number): boolean {
  if (
    this.status !== 'defeat'
    || this.adReviveUsed
    || !Number.isFinite(hpRestored)
    || hpRestored <= 0
    || !Number.isFinite(protectionMs)
    || protectionMs < 0
  ) return false;
  this.trainHp = Math.min(this.input.maxTrainHp, hpRestored);
  this.reviveProtectionMs = protectionMs;
  this.adReviveUsed = true;
  this.resolvedOutcome = null;
  this.status = 'running';
  return true;
}
```

`damageTrain` 在 `reviveProtectionMs > 0` 时忽略伤害。

- [ ] **Step 3: 验证和提交**

```powershell
npm test -- tests/web/battle/BattleEngineSkills.spec.ts
npm run typecheck
git add web/battle/BattleEngine.ts tests/web/battle/BattleEngineSkills.spec.ts
git commit -m "feat: add active battle skills and revive"
```

## Task 5: 实现九种强化和三次确定性选择

**Files:**

- Create: `web/battle/UpgradeSystem.ts`
- Create: `tests/web/battle/UpgradeSystem.spec.ts`
- Create: `tests/web/battle/BattleEngineUpgrade.spec.ts`
- Modify: `web/battle/BattleEngine.ts`

**Interfaces:**

- `createUpgradeOffer(seed, checkpoint, levels, roll?): readonly BattleUpgradeId[]`
- `applyUpgrade(modifiers, levels, upgradeId): UpgradeApplyResult`
- `BattleEngine.chooseUpgrade(upgradeId): boolean`
- `BattleEngine.rerollUpgradeOffer(): boolean`

- [ ] **Step 1: 写失败测试**

```ts
// tests/web/battle/UpgradeSystem.spec.ts
import { describe, expect, it } from 'vitest';
import { createBaseModifiers, UPGRADE_IDS } from '../../../web/battle/BattleConfig';
import {
  applyUpgrade,
  createUpgradeOffer,
} from '../../../web/battle/UpgradeSystem';

describe('UpgradeSystem', () => {
  it('offers three unique non-maxed choices deterministically', () => {
    const levels = Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0]));
    const first = createUpgradeOffer(17, 1, levels);
    const second = createUpgradeOffer(17, 1, levels);
    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(new Set(first).size).toBe(3);
  });

  it('applies exact level changes and caps every upgrade at level three', () => {
    const levels = Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0]));
    let modifiers = createBaseModifiers();
    for (let level = 1; level <= 3; level += 1) {
      const result = applyUpgrade(modifiers, levels, 'rapid-reload');
      expect(result.accepted).toBe(true);
      modifiers = result.modifiers;
      Object.assign(levels, result.levels);
      expect(levels['rapid-reload']).toBe(level);
    }
    expect(applyUpgrade(modifiers, levels, 'rapid-reload').accepted).toBe(false);
    expect(modifiers.reloadMultiplier).toBeCloseTo(0.64);
  });
});
```

- [ ] **Step 2: 写引擎重选失败测试**

```ts
// tests/web/battle/BattleEngineUpgrade.spec.ts
import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';

function reachFirstUpgrade(mode: 'normal' | 'daily-trial'): BattleEngine {
  const engine = new BattleEngine({
    battleId: `upgrade-${mode}`,
    seed: 17,
    mode,
    mapId: 'drift-suburb',
    maxTrainHp: 10_000,
    mainCannonDamage: 500,
    initialEnergy: 0,
    repairBonus: 0,
    enemyHpFlatBonus: 0,
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
  });
  while (engine.frame.status !== 'upgrade') {
    engine.update(FIXED_STEP_MS);
  }
  return engine;
}

describe('BattleEngine upgrade reroll', () => {
  it('allows one changed offer in normal mode and none in daily trial', () => {
    const normal = reachFirstUpgrade('normal');
    const first = [...normal.frame.offeredUpgradeIds];
    expect(normal.rerollUpgradeOffer()).toBe(true);
    expect(normal.frame.offeredUpgradeIds).not.toEqual(first);
    expect(normal.frame.upgradeRerollUsed).toBe(true);
    expect(normal.rerollUpgradeOffer()).toBe(false);

    const daily = reachFirstUpgrade('daily-trial');
    expect(daily.rerollUpgradeOffer()).toBe(false);
  });
});
```

- [ ] **Step 3: 实现强化规则**

```ts
// web/battle/UpgradeSystem.ts
import { UPGRADE_IDS } from './BattleConfig';
import { SeededRandom } from './SeededRandom';
import type {
  BattleModifiers,
  BattleUpgradeId,
} from './BattleTypes';

export interface UpgradeApplyResult {
  readonly accepted: boolean;
  readonly modifiers: BattleModifiers;
  readonly levels: Record<BattleUpgradeId, number>;
}

export function createUpgradeOffer(
  seed: number,
  checkpoint: number,
  levels: Readonly<Record<BattleUpgradeId, number>>,
  roll = 0,
): readonly BattleUpgradeId[] {
  const candidates = UPGRADE_IDS.filter((id) => levels[id] < 3);
  const random = new SeededRandom(
    seed
    ^ Math.imul(checkpoint, 0x9e3779b1)
    ^ Math.imul(roll, 0x85ebca6b),
  );
  const offer: BattleUpgradeId[] = [];
  while (offer.length < 3 && candidates.length > 0) {
    const index = random.int(0, candidates.length - 1);
    offer.push(candidates.splice(index, 1)[0] as BattleUpgradeId);
  }
  return offer;
}

export function applyUpgrade(
  current: BattleModifiers,
  currentLevels: Readonly<Record<BattleUpgradeId, number>>,
  upgradeId: BattleUpgradeId,
): UpgradeApplyResult {
  if (currentLevels[upgradeId] >= 3) {
    return {
      accepted: false,
      modifiers: { ...current },
      levels: { ...currentLevels },
    };
  }
  const modifiers = { ...current };
  if (upgradeId === 'multi-barrel') {
    modifiers.mainProjectileCount += 1;
    modifiers.mainProjectileDamageMultiplier = 0.72;
  }
  if (upgradeId === 'rapid-reload') modifiers.reloadMultiplier -= 0.12;
  if (upgradeId === 'coral-warhead') {
    modifiers.splashRadius = 54;
    modifiers.splashDamageMultiplier += 0.35;
  }
  if (upgradeId === 'echo-chain') {
    modifiers.chainCount += 1;
    modifiers.chainDamageMultiplier = 0.45;
  }
  if (upgradeId === 'precision-lens') modifiers.criticalChance += 0.08;
  if (upgradeId === 'bubble-capacitor') {
    modifiers.barrierShieldMultiplier += 0.25;
    modifiers.barrierHealPercent += 0.04;
  }
  if (upgradeId === 'tidal-resonance') modifiers.activeCooldownMultiplier -= 0.15;
  if (upgradeId === 'magnetic-salvage') {
    modifiers.lootAttractMultiplier += 0.4;
    modifiers.experienceMultiplier += 0.1;
  }
  if (upgradeId === 'overload-core') {
    modifiers.energyGainMultiplier += 0.25;
    modifiers.extremeDamageMultiplier += 0.2;
  }
  return {
    accepted: true,
    modifiers,
    levels: {
      ...currentLevels,
      [upgradeId]: currentLevels[upgradeId] + 1,
    },
  };
}
```

- [ ] **Step 4: 接入三个检查点**

`BattleEngine` 新增 `upgradeCheckpoint = 0`。检查规则：

```ts
private maybeOfferUpgrade(): void {
  const checkpoints = [
    this.elapsedMs >= 30_000,
    this.elapsedMs >= 95_000,
    this.eliteKilled && this.elapsedMs >= 160_000,
  ];
  if (
    this.upgradeCheckpoint >= checkpoints.length
    || !checkpoints[this.upgradeCheckpoint]
  ) return;
  const threshold = EXPERIENCE_THRESHOLDS[this.upgradeCheckpoint];
  this.experience = Math.max(this.experience, threshold);
  this.upgradeOfferRoll = 0;
  this.offeredUpgradeIds = [...createUpgradeOffer(
    this.input.seed,
    this.upgradeCheckpoint + 1,
    this.upgradeLevels,
    this.upgradeOfferRoll,
  )];
  this.status = 'upgrade';
  this.events.push({
    type: 'upgrade-offered',
    upgradeIds: this.offeredUpgradeIds,
  });
}
```

普通模式每局允许一次广告重选；每日试炼禁止：

```ts
public rerollUpgradeOffer(): boolean {
  if (
    this.status !== 'upgrade'
    || this.input.mode !== 'normal'
    || this.upgradeRerollUsed
  ) return false;
  const previous = this.offeredUpgradeIds.join('|');
  let next = this.offeredUpgradeIds;
  for (let attempt = 0; attempt < 8 && next.join('|') === previous; attempt += 1) {
    this.upgradeOfferRoll += 1;
    next = [...createUpgradeOffer(
      this.input.seed,
      this.upgradeCheckpoint + 1,
      this.upgradeLevels,
      this.upgradeOfferRoll,
    )];
  }
  if (next.join('|') === previous) return false;
  this.offeredUpgradeIds = [...next];
  this.upgradeRerollUsed = true;
  this.events.push({
    type: 'upgrade-rerolled',
    upgradeIds: this.offeredUpgradeIds,
  });
  return true;
}
```

`chooseUpgrade`：

```ts
public chooseUpgrade(upgradeId: BattleUpgradeId): boolean {
  if (
    this.status !== 'upgrade'
    || !this.offeredUpgradeIds.includes(upgradeId)
  ) return false;
  const result = applyUpgrade(this.modifiers, this.upgradeLevels, upgradeId);
  if (!result.accepted) return false;
  Object.assign(this.modifiers, result.modifiers);
  Object.assign(this.upgradeLevels, result.levels);
  this.upgradeCheckpoint += 1;
  this.offeredUpgradeIds = [];
  this.status = 'running';
  this.events.push({
    type: 'upgrade-selected',
    upgradeId,
    level: this.upgradeLevels[upgradeId],
  });
  return true;
}
```

- [ ] **Step 5: 验证和提交**

```powershell
npm test -- tests/web/battle/UpgradeSystem.spec.ts tests/web/battle/BattleEngineUpgrade.spec.ts tests/web/battle/BattleEngineAutoFire.spec.ts
npm run typecheck
git add web/battle tests/web/battle
git commit -m "feat: add three deterministic roguelite upgrades"
```

## Task 6: 实现精英、Boss、狂暴和终局

**Files:**

- Modify: `web/battle/BattleEngine.ts`
- Create: `tests/web/battle/BattleEngineBoss.spec.ts`

**Interfaces:**

- `BattleEngine.outcome: BattleOutcome | null`
- `BattleEngine` emits elite/Boss lifecycle events exactly once.

- [ ] **Step 1: 写精英/Boss测试**

```ts
// tests/web/battle/BattleEngineBoss.spec.ts
import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../../../web/battle/BattleEngine';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';

function createEngine(): BattleEngine {
  return new BattleEngine({
    battleId: 'boss-1',
    seed: 4,
    mode: 'normal',
    mapId: 'drift-suburb',
    maxTrainHp: 10_000,
    mainCannonDamage: 500,
    initialEnergy: 100,
    repairBonus: 0,
    enemyHpFlatBonus: 0,
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
  });
}

function runFor(engine: BattleEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed < durationMs; elapsed += FIXED_STEP_MS) {
    engine.update(FIXED_STEP_MS);
    if (engine.frame.status === 'upgrade') {
      const choice = engine.frame.offeredUpgradeIds[0];
      if (choice) engine.chooseUpgrade(choice);
    }
  }
}

describe('BattleEngine elite and boss', () => {
  it('enters elite, pauses for boss intro and settles victory once', () => {
    const engine = createEngine();
    runFor(engine, 230_000);
    const events = engine.drainEvents();
    expect(events.filter((event) => event.type === 'elite-entered')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'boss-intro-started')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'boss-intro-ended')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'battle-won')).toHaveLength(1);
    expect(engine.outcome).toMatchObject({
      battleId: 'boss-1',
      victory: true,
    });
    runFor(engine, 5000);
    expect(engine.drainEvents().filter((event) => event.type === 'battle-won')).toHaveLength(0);
  });

  it('fails an elite after 75 seconds and a boss after 90 seconds', () => {
    const eliteFailure = new BattleEngine({
      ...createEngine().inputForTest(),
      battleId: 'elite-timeout',
      mainCannonDamage: 0,
    });
    runFor(eliteFailure, 210_000);
    expect(eliteFailure.outcome?.victory).toBe(false);
  });
});
```

`inputForTest()` 返回输入的只读复制，只在测试中使用。

- [ ] **Step 2: 实现精英阶段**

精英规则：

- `elapsedMs >= 130_000` 且尚未生成精英时，生成一只 `storm-ray-elite`，发 `elite-entered`。
- 精英年龄 6、14、22 秒时各召唤两只 `needle-jelly`。
- 每 8 秒获得最大生命 20% 护盾。
- 45 秒后速度和攻击间隔乘 0.7。
- 75 秒仍存活则调用 `finish(false)`。
- 精英死亡时设置 `eliteKilled = true`。

- [ ] **Step 3: 实现 Boss 演出和技能循环**

Boss 只有在 `eliteKilled && elapsedMs >= 160_000` 且第三次强化完成后进入：

```ts
private startBossIntro(): void {
  this.status = 'boss-intro';
  this.phaseElapsedMs = 0;
  this.events.push({ type: 'boss-intro-started' });
}
```

`boss-intro` 只推进 `phaseElapsedMs`；达到 6000ms 后：

- 生成 `deep-echo-boss`，位置 `(195, 96)`。
- `status = 'running'`。
- `phaseElapsedMs = 0`。
- 发 `boss-intro-ended`。

Boss 循环：

- 每 6 秒潮压：最大生命 9% 伤害。
- 10、24、38 秒各召唤 4 只 `needle-jelly`。
- 16、34 秒开始 1.2 秒冲锋预警，先发 `{ type: 'boss-charge-started', durationMs: 1200 }`，预警结束造成最大生命 18% 伤害。
- 55 秒后技能间隔乘 0.7。
- 90 秒未击败调用 `finish(false)`。

Boss 死亡调用：

```ts
private finish(victory: boolean): void {
  if (this.resolvedOutcome) return;
  this.status = victory ? 'victory' : 'defeat';
  this.resolvedOutcome = {
    battleId: this.input.battleId,
    victory,
    elapsedMs: this.elapsedMs,
    completedWaves: victory ? 6 : Math.min(5, getWaveAtTime(this.elapsedMs)),
    remainingHp: Math.max(0, this.trainHp),
    kills: this.kills,
    adReviveUsed: this.adReviveUsed,
  };
  this.events.push({ type: victory ? 'battle-won' : 'battle-lost' });
}
```

- [ ] **Step 4: 验证和提交**

```powershell
npm test -- tests/web/battle/BattleEngineBoss.spec.ts
npm test -- tests/web/battle
npm run typecheck
git add web/battle/BattleEngine.ts tests/web/battle/BattleEngineBoss.spec.ts
git commit -m "feat: add elite and boss battle phases"
```

## Task 7: 聚合永久成长并建立唯一结算适配器

**Files:**

- Create: `web/battle/BattleRunInputFactory.ts`
- Create: `web/app/BattleSettlementAdapter.ts`
- Create: `tests/web/battle/BattleRunInputFactory.spec.ts`
- Create: `tests/web/battle/BattleSettlementAdapter.spec.ts`
- Modify: `src/telemetry/TelemetryEvents.ts`

**Interfaces:**

- `createBattleRunInput(input): BattleRunInput`
- `BattleSettlementAdapter.settle(input): SettlementAdapterResult`

- [ ] **Step 1: 实现战斗输入聚合**

```ts
// web/battle/BattleRunInputFactory.ts
import type { DailyTrialDefinition } from '../../src/domain/challenge/DailyTrialSystem';
import { getSquadBonuses, type SocialExpeditionState } from '../../src/domain/social/SocialExpeditionSystem';
import type { MapId } from '../../src/domain/station/MapProgression';
import type { ProgressionSnapshot } from '../../src/domain/progression/ProgressionStatService';
import type { RunMode } from '../app/AppTypes';
import type { BattleRunInput } from './BattleTypes';

const MAP_DIFFICULTY: Readonly<Record<MapId, {
  readonly hp: number;
  readonly damage: number;
}>> = {
  'drift-suburb': { hp: 1, damage: 1 },
  'old-port': { hp: 1.12, damage: 1.08 },
  'glass-city': { hp: 1.28, damage: 1.16 },
  'deep-tunnel': { hp: 1.48, damage: 1.25 },
};

export function createBattleRunInput(input: {
  readonly battleId: string;
  readonly seed: number;
  readonly mode: RunMode;
  readonly mapId: MapId;
  readonly progression: ProgressionSnapshot;
  readonly social: SocialExpeditionState;
  readonly dailyTrial: DailyTrialDefinition | null;
}): BattleRunInput {
  const squad = getSquadBonuses(input.social);
  const rule = input.dailyTrial?.rule;
  const difficulty = MAP_DIFFICULTY[input.mapId];
  return {
    battleId: input.battleId,
    seed: input.seed,
    mode: input.mode,
    mapId: input.mapId,
    maxTrainHp: Math.max(
      1,
      input.progression.maxPlayerHp
      + squad.maxPlayerHpBonus
      + (rule?.maxPlayerHpDelta ?? 0),
    ),
    mainCannonDamage: Math.floor(
      (
        25
        + input.progression.damageFlat
        + squad.damageBonus
        + (rule?.damageBonus ?? 0)
      ) * input.progression.damageMultiplier,
    ),
    initialEnergy: Math.min(
      100,
      input.progression.initialMomentum
      + squad.initialMomentum
      + (rule?.initialMomentumBonus ?? 0),
    ),
    repairBonus: input.progression.repairBonus,
    enemyHpFlatBonus: rule?.enemyHpBonus ?? 0,
    enemyHpMultiplier: difficulty.hp,
    enemyDamageMultiplier: difficulty.damage,
  };
}
```

- [ ] **Step 2: 写输入测试**

```ts
// tests/web/battle/BattleRunInputFactory.spec.ts
import { describe, expect, it } from 'vitest';
import { createSocialExpeditionState, joinLegion, toggleSquadMember } from '../../../src/domain/social/SocialExpeditionSystem';
import { createBattleRunInput } from '../../../web/battle/BattleRunInputFactory';

describe('createBattleRunInput', () => {
  it('combines progression, squad, map and daily rule once', () => {
    let social = joinLegion(createSocialExpeditionState('2026-W29'), 'tide');
    social = toggleSquadMember(social, 'navigator').state;
    social = toggleSquadMember(social, 'gunner').state;
    const result = createBattleRunInput({
      battleId: 'daily-1',
      seed: 9,
      mode: 'daily-trial',
      mapId: 'old-port',
      progression: {
        maxPlayerHp: 110,
        damageFlat: 2,
        damageMultiplier: 1.1,
        gearsMultiplier: 1,
        initialMomentum: 5,
        repairBonus: 6,
        skinModifiers: {
          maxHpFlat: 0, maxHpPercent: 0, damageFlat: 0, damagePercent: 0,
          gearsPercent: 0, initialMomentum: 0, repairFlat: 0,
        },
        equipmentModifiers: {
          maxHpFlat: 0, maxHpPercent: 0, damageFlat: 0, damagePercent: 0,
          gearsPercent: 0, initialMomentum: 0, repairFlat: 0,
        },
      },
      social,
      dailyTrial: {
        dayId: '2026-07-16',
        seed: 9,
        rule: {
          id: 'armored-current',
          name: '装甲逆潮',
          description: '',
          enemyHpBonus: 20,
          maxPlayerHpDelta: 0,
          initialMomentumBonus: 20,
          damageBonus: 0,
        },
      },
    });

    expect(result.maxTrainHp).toBe(110);
    expect(result.mainCannonDamage).toBe(35);
    expect(result.initialEnergy).toBe(45);
    expect(result.enemyHpFlatBonus).toBe(20);
    expect(result.enemyHpMultiplier).toBe(1.12);
  });
});
```

- [ ] **Step 3: 建立唯一结算适配器**

```ts
// web/app/BattleSettlementAdapter.ts
import type { BattleOutcome } from '../battle/BattleTypes';

export interface SettlementAdapterResult<T> {
  readonly accepted: boolean;
  readonly state: T;
}

export class BattleSettlementAdapter<T> {
  private readonly settledBattleIds = new Set<string>();

  public settle(
    state: T,
    outcome: BattleOutcome,
    settleOnce: (state: T, outcome: BattleOutcome) => T,
  ): SettlementAdapterResult<T> {
    if (this.settledBattleIds.has(outcome.battleId)) {
      return { accepted: false, state };
    }
    const next = settleOnce(state, outcome);
    this.settledBattleIds.add(outcome.battleId);
    return { accepted: true, state: next };
  }

  public hasSettled(battleId: string): boolean {
    return this.settledBattleIds.has(battleId);
  }
}
```

`GameApp` 后续传入现有首通、每日试炼和军团领域调用作为 `settleOnce`；适配器本身不理解钱包结构。

- [ ] **Step 4: 写唯一结算测试**

```ts
// tests/web/battle/BattleSettlementAdapter.spec.ts
import { describe, expect, it } from 'vitest';
import { BattleSettlementAdapter } from '../../../web/app/BattleSettlementAdapter';

describe('BattleSettlementAdapter', () => {
  it('applies a battle outcome exactly once', () => {
    const adapter = new BattleSettlementAdapter<{ gears: number }>();
    const outcome = {
      battleId: 'b-1',
      victory: true,
      elapsedMs: 180_000,
      completedWaves: 6,
      remainingHp: 50,
      kills: 100,
      adReviveUsed: false,
    };
    const first = adapter.settle({ gears: 0 }, outcome, (state) => ({
      gears: state.gears + 400,
    }));
    const duplicate = adapter.settle(first.state, outcome, (state) => ({
      gears: state.gears + 400,
    }));

    expect(first).toEqual({ accepted: true, state: { gears: 400 } });
    expect(duplicate).toEqual({ accepted: false, state: { gears: 400 } });
  });
});
```

- [ ] **Step 5: 扩展战斗埋点名称**

在 `PrototypeEventName` 追加：

```ts
  | 'battle_wave_started'
  | 'battle_skill_used'
  | 'battle_upgrade_offered'
  | 'battle_upgrade_selected'
  | 'battle_elite_entered'
  | 'battle_boss_intro'
  | 'battle_performance_changed'
```

不记录每颗炮弹和每次普通命中，避免事件量失控。

- [ ] **Step 6: 完整验证与提交**

```powershell
npm test -- tests/web/battle tests/domain tests/save tests/telemetry
npm run typecheck
npm run build
git diff --check
git add web/battle web/app/BattleSettlementAdapter.ts tests/web/battle src/telemetry/TelemetryEvents.ts
git commit -m "feat: integrate progression and unique battle settlement"
```
