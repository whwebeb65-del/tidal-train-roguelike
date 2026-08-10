import {
  createBaseModifiers,
  DEFENCE_LINE_Y,
  ENEMY_CONFIG,
  EXPERIENCE_THRESHOLDS,
  LANE_X,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAIN_CANNON_INTERVAL_MS,
  MAIN_PROJECTILE_SPEED,
  SKILL_COOLDOWN_MULTIPLIER,
  SKILL_CONFIG,
  SKILL_STRENGTH_MULTIPLIER,
} from './BattleConfig';
import {
  BATTLE_UPGRADE_DEFINITIONS,
  getBattleUpgradeDefinition,
} from './BattleUpgradeCatalog';
import { SeededRandom } from './SeededRandom';
import type {
  BattleEvent,
  BattleFrameView,
  BattleOutcome,
  BattleRunInput,
  BattleSkillId,
  BattleStatus,
  BattleUpgradeId,
  BattleBuildState,
  BattleAimPoint,
  EnemyKind,
  EnemyState,
  LootState,
  PauseReason,
  ProjectileState,
  UpgradeSelectionSource,
} from './BattleTypes';
import {
  applyBattleUpgrade,
  applyUpgrade,
  createEmptyBattleBuild,
  createUpgradeOffer,
} from './UpgradeSystem';
import {
  createWaveSchedule,
  getWaveAtTime,
  type SpawnInstruction,
} from './WaveScheduler';
import { ENEMY_GEOMETRY, HUD_SAFE_BOTTOM_Y, enemySpawnY } from './EnemyGeometry';
import {
  advanceEnemyBehaviour,
  createEnemyBehaviour,
  type EnemyBehaviourIntent,
} from './EnemyBehaviourSystem';
import {
  EntityPool,
  type EntityPoolStats,
} from './EntityPool';
import { barrierProfile, extremeProfile, reflectBarrierDamage, shouldEmergencyTrigger, volleyProfile } from './SkillVariantSystem';

type Mutable<T> = {
  -readonly [Property in keyof T]: T[Property];
};

type MutableProjectileState = Mutable<ProjectileState> & {
  pierceRemaining: number;
  splitMultiplier: number;
};
type MutableLootState = Mutable<LootState>;
type DelayedVolleyAction = {
  readonly dueAtMs: number;
  readonly damage: number;
  readonly count: number;
  readonly pierceRemaining: number;
  readonly splitMultiplier: number;
};
type DelayedExtremeCrestAction = {
  readonly dueAtMs: number;
  readonly damage: number;
  readonly durationMs: number;
};
type ActiveExtremeEffect = {
  pullRemainingMs: number;
  vortexRemainingMs: number;
  vortexTickElapsedMs: number;
  vortexTicksApplied: number;
  readonly vortexTotalDamage: number;
  readonly energyPerKill: number;
  readonly energyRefundCap: number;
  energyRefunded: number;
  pendingCrestActions: number;
};

export interface BattleEntityPoolStats {
  readonly projectiles: EntityPoolStats;
  readonly loot: EntityPoolStats;
}

export class BattleEngine {
  private readonly events: BattleEvent[] = [];
  private readonly enemies: EnemyState[] = [];
  private readonly projectiles: MutableProjectileState[] = [];
  private readonly loot: MutableLootState[] = [];
  private readonly delayedVolleyActions: DelayedVolleyAction[] = [];
  private readonly delayedExtremeCrestActions: DelayedExtremeCrestAction[] = [];
  private readonly projectilePool = new EntityPool<MutableProjectileState>(
    () => ({
      id: 0,
      source: 'main',
      x: 0,
      y: 0,
      targetId: 0,
      trajectory: 'homing',
      velocityX: 0,
      velocityY: 0,
      speedPerSecond: 0,
      damage: 0,
      splashRadius: 0,
      chainRemaining: 0,
      pierceRemaining: 0,
      splitMultiplier: 0,
      critical: false,
      active: false,
    }),
    resetProjectile,
    256,
  );
  private readonly lootPool = new EntityPool<MutableLootState>(
    () => ({
      id: 0,
      kind: 'experience',
      x: 0,
      y: 0,
      amount: 0,
      ageMs: 0,
      collected: false,
    }),
    resetLoot,
    128,
  );
  private readonly schedule: readonly SpawnInstruction[];
  private readonly random: SeededRandom;
  private readonly modifiers = createBaseModifiers();
  private readonly upgradeLevels = Object.fromEntries(
    Object.keys(BATTLE_UPGRADE_DEFINITIONS).map((id) => [id, 0]),
  ) as Record<BattleUpgradeId, number>;
  private battleBuild: BattleBuildState = createEmptyBattleBuild();

  private status: BattleStatus = 'running';
  private pausedFrom: Exclude<BattleStatus, 'paused'> | null = null;
  private pauseReason: PauseReason | null = null;
  private elapsedMs = 0;
  private phaseElapsedMs = 0;
  private nextSpawnIndex = 0;
  private nextEntityId = 1;
  private fireCooldownMs = 0;
  private mainCannonAim: BattleAimPoint | null = null;
  private trainHp: number;
  private shield = 0;
  private shieldRemainingMs = 0;
  private barrierOrigin: 'manual' | 'emergency' | null = null;
  private barrierAbsorbedDamage = 0;
  private barrierLastAttackerId: number | null = null;
  private emergencyBarrierConsumed = false;
  private energy: number;
  private combo = 0;
  private kills = 0;
  private readonly killCounts = { normal: 0, elite: 0, boss: 0 };
  private readonly skillCastCounts: Record<BattleSkillId, number> = {
    'tidal-volley': 0,
    'bubble-barrier': 0,
    'extreme-tide': 0,
  };
  private experience = 0;
  private offeredUpgradeIds: BattleUpgradeId[] = [];
  private runLevel = 1;
  private upgradeOfferRoll = 0;
  private adReviveUsed = false;
  private skillRefreshUsed = false;
  private upgradeRerollUsed = false;
  private reviveProtectionMs = 0;
  private resolvedOutcome: BattleOutcome | null = null;
  private lastStartedWave = 0;
  private eliteKilled = false;
  private eliteSpawned = false;
  private eliteSummonIndex = 0;
  private eliteShieldCycle = 0;
  private eliteEnraged = false;
  private bossIntroStarted = false;
  private bossId: number | null = null;
  private bossPressureAtMs = 420_000;
  private bossSummonIndex = 0;
  private bossChargeIndex = 0;
  private pendingBossChargeAtMs: number | null = null;
  private activeExtremeEffect: ActiveExtremeEffect | null = null;
  private readonly cooldowns: Record<BattleSkillId, number> = {
    'tidal-volley': 0,
    'bubble-barrier': 0,
    'extreme-tide': 0,
  };

  public constructor(private readonly input: BattleRunInput) {
    if (input.battleId.trim().length === 0) {
      throw new Error('Battle id is required');
    }
    if (!Number.isFinite(input.maxTrainHp) || input.maxTrainHp <= 0) {
      throw new Error('Battle train hp must be positive');
    }
    this.schedule = createWaveSchedule(input.seed);
    this.random = new SeededRandom(input.seed);
    this.trainHp = input.maxTrainHp;
    this.energy = Math.max(0, Math.min(100, input.initialEnergy));
  }

  public get outcome(): BattleOutcome | null {
    return this.resolvedOutcome;
  }

  public get poolStats(): BattleEntityPoolStats {
    return {
      projectiles: this.projectilePool.stats,
      loot: this.lootPool.stats,
    };
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
      eliteEncountered: this.eliteSpawned,
      experience: this.experience,
      nextExperienceThreshold: this.nextUpgradeThreshold(),
      runLevel: this.runLevel,
      skillRanks: this.battleBuild.skillRanks,
      skillVariants: this.battleBuild.skillVariants,
      offeredUpgradeIds: this.offeredUpgradeIds,
      upgradeLevels: this.upgradeLevels,
      cooldowns: this.cooldowns,
      adReviveUsed: this.adReviveUsed,
      skillRefreshUsed: this.skillRefreshUsed,
      upgradeRerollUsed: this.upgradeRerollUsed,
      mainCannonAim: this.mainCannonAim === null
        ? null
        : Object.freeze({ ...this.mainCannonAim }),
      enemies: this.enemies,
      projectiles: this.projectiles,
      loot: this.loot,
    };
  }

  public inputForTest(): BattleRunInput {
    return { ...this.input };
  }

  public drainEvents(): readonly BattleEvent[] {
    return this.events.splice(0);
  }

  public setMainCannonAim(aim: BattleAimPoint | null): boolean {
    if (this.status !== 'running') return false;
    if (aim === null) {
      this.mainCannonAim = null;
      return true;
    }
    if (!Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return false;
    this.mainCannonAim = {
      x: Math.max(0, Math.min(LOGICAL_WIDTH, aim.x)),
      y: Math.max(HUD_SAFE_BOTTOM_Y, Math.min(DEFENCE_LINE_Y, aim.y)),
    };
    return true;
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

  public useSkill(skillId: BattleSkillId): boolean {
    if (this.status !== 'running') return false;
    if (skillId === 'extreme-tide') {
      if (this.energy < 100) return false;
      this.energy = 0;
      const damage = Math.floor(
        this.input.mainCannonDamage
          * 8
          * this.modifiers.extremeDamageMultiplier
          * this.skillStrengthMultiplier(skillId),
      );
      const profile = extremeProfile(this.battleBuild.skillVariants['extreme-tide']);
      this.activeExtremeEffect = {
        pullRemainingMs: profile.pullDurationMs,
        vortexRemainingMs: profile.vortexDurationMs,
        vortexTickElapsedMs: 0,
        vortexTicksApplied: 0,
        vortexTotalDamage: Math.floor(
          this.input.mainCannonDamage
            * profile.vortexTotalDamageMultiplier
            * this.skillStrengthMultiplier(skillId),
        ),
        energyPerKill: profile.energyPerKill,
        energyRefundCap: profile.energyRefundCap,
        energyRefunded: 0,
        pendingCrestActions: profile.secondCrestDelayMs > 0 ? 1 : 0,
      };
      for (const enemy of this.enemies) {
        if (enemy.alive) {
          this.applyDamage(enemy, damage, false, 'extreme-tide');
        }
      }
      if (profile.pullDurationMs > 0) {
        this.events.push({ type: 'extreme-pull-started', durationMs: profile.pullDurationMs });
      }
      if (profile.vortexDurationMs > 0) {
        this.events.push({ type: 'extreme-vortex-started', durationMs: profile.vortexDurationMs });
      }
      if (profile.secondCrestDelayMs > 0) {
        this.delayedExtremeCrestActions.push({
          dueAtMs: this.elapsedMs + profile.secondCrestDelayMs,
          damage: Math.floor(damage * profile.secondCrestDamageRatio),
          durationMs: profile.secondCrestDelayMs,
        });
      }
    } else {
      if (this.cooldowns[skillId] > 0) return false;
      if (skillId === 'tidal-volley' && !this.hasLivingTarget()) {
        return false;
      }
      this.cooldowns[skillId] = Math.round(
        SKILL_CONFIG[skillId].cooldownMs
          * this.modifiers.activeCooldownMultiplier
          * this.skillCooldownMultiplier(skillId)
          * (skillId === 'tidal-volley'
            ? volleyProfile(this.battleBuild.skillVariants['tidal-volley']).cooldownMultiplier
            : 1),
      );
      if (skillId === 'tidal-volley') this.fireVolley();
      if (skillId === 'bubble-barrier') this.applyBarrier();
    }
    this.events.push({ type: 'skill-used', skillId });
    this.skillCastCounts[skillId] += 1;
    return true;
  }

  public refreshActiveSkillCooldowns(): boolean {
    if (
      this.status !== 'running'
      || this.skillRefreshUsed
      || (
        this.cooldowns['tidal-volley'] <= 0
        && this.cooldowns['bubble-barrier'] <= 0
      )
    ) {
      return false;
    }
    this.cooldowns['tidal-volley'] = 0;
    this.cooldowns['bubble-barrier'] = 0;
    this.skillRefreshUsed = true;
    this.events.push({ type: 'skill-cooldowns-refreshed' });
    return true;
  }

  public revive(hpRestored: number, protectionMs: number): boolean {
    if (
      this.status !== 'defeat'
      || this.adReviveUsed
      || !Number.isFinite(hpRestored)
      || hpRestored <= 0
      || !Number.isFinite(protectionMs)
      || protectionMs < 0
    ) {
      return false;
    }
    this.trainHp = Math.min(this.input.maxTrainHp, hpRestored);
    this.reviveProtectionMs = protectionMs;
    this.adReviveUsed = true;
    this.resolvedOutcome = null;
    this.status = 'running';
    return true;
  }

  public debugDamageTrain(amount: number): void {
    this.damageTrain(amount, 0);
  }

  public rerollUpgradeOffer(): boolean {
    if (
      this.status !== 'upgrade'
      || this.input.mode !== 'normal'
      || this.upgradeRerollUsed
    ) {
      return false;
    }
    const previous = this.offeredUpgradeIds.join('|');
    let next = this.offeredUpgradeIds;
    for (
      let attempt = 0;
      attempt < 8 && next.join('|') === previous;
      attempt += 1
    ) {
      this.upgradeOfferRoll += 1;
      next = [...createUpgradeOffer(
        this.input.seed,
        this.runLevel,
        this.battleBuild,
        this.input.unlockedSkillVariants,
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

  public chooseUpgrade(
    upgradeId: BattleUpgradeId,
    source: UpgradeSelectionSource,
  ): boolean {
    if (
      this.status !== 'upgrade'
      || !this.offeredUpgradeIds.includes(upgradeId)
    ) {
      return false;
    }
    const nextBuild = applyBattleUpgrade(this.battleBuild, upgradeId);
    if (JSON.stringify(nextBuild) === JSON.stringify(this.battleBuild)) return false;
    this.battleBuild = nextBuild;
    const definition = getBattleUpgradeDefinition(upgradeId);
    if (definition.kind === 'general') {
      const result = applyUpgrade(this.modifiers, this.upgradeLevels, upgradeId);
      Object.assign(this.modifiers, result.modifiers);
      Object.assign(this.upgradeLevels, result.levels);
    } else if (definition.kind === 'skill-rank') {
      this.upgradeLevels[upgradeId] = this.battleBuild.skillRanks[definition.skillId!] - 1;
    } else {
      this.upgradeLevels[upgradeId] = 1;
    }
    this.runLevel += 1;
    this.offeredUpgradeIds = [];
    this.status = 'running';
    this.events.push({
      type: 'upgrade-selected',
      upgradeId,
      source,
      level: this.upgradeLevels[upgradeId],
      runLevel: this.runLevel,
      nextExperienceThreshold: this.nextUpgradeThreshold(),
      skillRanks: this.battleBuild.skillRanks,
      skillVariants: this.battleBuild.skillVariants,
    });
    this.events.push({
      type: 'run-level-reached',
      runLevel: this.runLevel,
      nextExperienceThreshold: this.nextUpgradeThreshold(),
      skillRanks: this.battleBuild.skillRanks,
      skillVariants: this.battleBuild.skillVariants,
    });
    return true;
  }

  public update(stepMs: number): void {
    if (!Number.isFinite(stepMs) || stepMs <= 0) {
      throw new Error('Battle step must be positive');
    }
    if (this.status !== 'running' && this.status !== 'boss-intro') return;

    try {
      if (this.status === 'boss-intro') {
        this.updateBossIntro(stepMs);
        return;
      }

      this.elapsedMs += stepMs;
      this.phaseElapsedMs += stepMs;
      if (this.elapsedMs >= 480_000) {
        this.finish(false, true);
        return;
      }
      this.updateTimers(stepMs);
      this.runDelayedVolleyActions();
      this.runDelayedExtremeCrestActions();
      this.spawnScheduledEnemies();
      this.maybeSpawnElite();
      this.updateExtremeEffects(stepMs);
      this.updateEnemyBehaviours(stepMs);
      this.moveEnemies(stepMs);
      this.updateEliteMechanics();
      this.updateBossMechanics(stepMs);
      if (this.status !== 'running') return;
      this.updateMainCannon(stepMs);
      this.moveProjectiles(stepMs);
      if (this.status !== 'running') return;
      this.updateLoot(stepMs);
      this.maybeOfferUpgrade();
      if (this.status === 'running') this.maybeStartBossIntro();
    } finally {
      this.recycleInactiveEntities();
    }
  }

  private updateTimers(stepMs: number): void {
    this.reviveProtectionMs = Math.max(0, this.reviveProtectionMs - stepMs);
    for (const skillId of Object.keys(this.cooldowns) as BattleSkillId[]) {
      this.cooldowns[skillId] = Math.max(
        0,
        this.cooldowns[skillId] - stepMs,
      );
    }
    if (this.shieldRemainingMs > 0) {
      this.shieldRemainingMs = Math.max(0, this.shieldRemainingMs - stepMs);
      if (this.shieldRemainingMs === 0 && this.shield > 0) {
        this.breakBarrier();
      }
    }
  }

  private spawnScheduledEnemies(): void {
    while (
      this.nextSpawnIndex < this.schedule.length
      && (this.schedule[this.nextSpawnIndex]?.spawnAtMs ?? Infinity)
        <= this.elapsedMs
    ) {
      const instruction = this.schedule[this.nextSpawnIndex];
      if (!instruction) break;
      if (instruction.wave > this.lastStartedWave) {
        this.lastStartedWave = instruction.wave;
        this.events.push({
          type: 'wave-started',
          wave: instruction.wave,
        });
      }
      this.spawnEnemy(
        instruction.kind,
        instruction.lane,
        instruction.xOffset,
      );
      this.nextSpawnIndex += 1;
    }
  }

  private spawnEnemy(
    kind: EnemyKind,
    lane: 0 | 1 | 2,
    xOffset = 0,
  ): EnemyState {
    const definition = ENEMY_CONFIG[kind];
    const maxHp = Math.max(
      1,
      Math.floor(
        (definition.hp + this.input.enemyHpFlatBonus)
          * this.input.enemyHpMultiplier,
      ),
    );
    const enemy: EnemyState = {
      id: this.nextEntityId++,
      kind,
      lane,
      x: (LANE_X[lane] ?? LANE_X[1]) + xOffset,
      y: enemySpawnY(kind),
      hp: maxHp,
      maxHp,
      shield: 0,
      speedPerSecond: definition.speedPerSecond,
      defenceBroken: false,
      attackCooldownMs: definition.attackIntervalMs,
      ageMs: 0,
      alive: true,
      behaviour: createEnemyBehaviour(kind, this.nextEntityId - 1, lane),
    };
    this.enemies.push(enemy);
    this.events.push({
      type: 'enemy-spawned',
      enemyId: enemy.id,
      kind,
    });
    return enemy;
  }

  private maybeSpawnElite(): void {
    if (this.eliteSpawned || this.elapsedMs < 300_000) return;
    this.eliteSpawned = true;
    const elite = this.spawnEnemy('storm-ray-elite', 1);
    this.events.push({
      type: 'elite-entered',
      enemyId: elite.id,
    });
  }

  private updateEliteMechanics(): void {
    const elite = this.enemies.find(
      (enemy) => enemy.alive && enemy.kind === 'storm-ray-elite',
    );
    if (!elite) return;

    const summonAtMs = [6000, 14_000, 22_000] as const;
    while (
      this.eliteSummonIndex < summonAtMs.length
      && elite.ageMs >= (summonAtMs[this.eliteSummonIndex] ?? Infinity)
    ) {
      const lane = (this.eliteSummonIndex % 3) as 0 | 1 | 2;
      this.spawnEnemy('needle-jelly', lane, -12);
      this.spawnEnemy('needle-jelly', ((lane + 1) % 3) as 0 | 1 | 2, 12);
      this.eliteSummonIndex += 1;
    }

    const shieldCycle = Math.floor(elite.ageMs / 8000);
    if (shieldCycle > this.eliteShieldCycle) {
      this.eliteShieldCycle = shieldCycle;
      elite.shield = Math.max(elite.shield, Math.floor(elite.maxHp * 0.2));
    }

    if (!this.eliteEnraged && elite.ageMs >= 45_000) {
      this.eliteEnraged = true;
      elite.speedPerSecond *= 0.7;
      elite.attackCooldownMs *= 0.7;
    }

  }

  private updateEnemyBehaviours(stepMs: number): void {
    for (const enemy of [...this.enemies].sort((left, right) => left.id - right.id)) {
      if (!enemy.alive || !enemy.behaviour) continue;
      const result = advanceEnemyBehaviour({
        kind: enemy.kind,
        enemyId: enemy.id,
        lane: enemy.lane,
        hpRatio: enemy.hp / Math.max(1, enemy.maxHp),
        stepMs,
        state: enemy.behaviour,
      });
      enemy.behaviour = result.state;
      this.applyEnemyBehaviourIntent(enemy, result.intent);
      if (this.status !== 'running') return;
    }
  }

  private applyEnemyBehaviourIntent(
    enemy: EnemyState,
    intent: EnemyBehaviourIntent,
  ): void {
    if (intent.rangedWarning) {
      this.events.push({ type: 'enemy-ranged-warning', enemyId: enemy.id });
    }
    if (intent.rangedFire) {
      this.damageTrain(
        ENEMY_CONFIG[enemy.kind].defenceDamage * this.input.enemyDamageMultiplier,
        enemy.x < 195 ? 1 : enemy.x > 195 ? -1 : 0,
        enemy.id,
      );
      this.events.push({ type: 'enemy-ranged-fired', enemyId: enemy.id });
    }
    if (intent.supportPulse) this.applySupportPulse(enemy);
    if (intent.eliteWarning) {
      this.events.push({
        type: 'elite-charge-telegraph',
        enemyId: enemy.id,
        lane: enemy.behaviour?.targetLane ?? enemy.lane,
        durationMs: 800,
      });
    }
    if (intent.eliteCharge) {
      this.events.push({ type: 'elite-charge-started', enemyId: enemy.id });
    }
    if (intent.eliteExposed) {
      this.events.push({ type: 'elite-exposed', enemyId: enemy.id, durationMs: 1200 });
    }
    if (intent.bossPhaseChanged) {
      this.events.push({ type: 'boss-phase-changed', phase: intent.bossPhaseChanged });
    }
    if (intent.bossSummon) {
      for (let index = 0; index < 3; index += 1) {
        this.spawnEnemy(index === 1 ? 'lantern-ray' : 'tide-shell-hatchling', index as 0 | 1 | 2);
      }
    }
    if (intent.tideWarning) {
      this.events.push({
        type: 'boss-tide-warning',
        safeLane: enemy.behaviour?.safeLane ?? 1,
        durationMs: 1200,
      });
    }
    if (intent.tideImpact) {
      const safeLane = enemy.behaviour?.safeLane ?? 1;
      const avoided = this.aimLane() === safeLane;
      if (!avoided) {
        this.damageTrain(
          this.input.maxTrainHp * 0.12 * this.input.enemyDamageMultiplier,
          0,
          enemy.id,
        );
      }
      this.events.push({ type: 'boss-tide-impact', safeLane, avoided });
    }
  }

  private applySupportPulse(source: EnemyState): void {
    const targets = this.enemies
      .filter((candidate) => (
        candidate.alive
        && candidate.id !== source.id
        && candidate.kind !== 'deep-echo-boss'
        && candidate.lane === source.lane
      ))
      .sort((left, right) => right.y - left.y || left.id - right.id)
      .slice(0, 3);
    for (const target of targets) {
      target.shield = Math.max(target.shield, Math.floor(target.maxHp * 0.18));
    }
    this.events.push({
      type: 'enemy-support-pulse',
      enemyId: source.id,
      targetIds: targets.map((target) => target.id),
    });
  }

  private aimLane(): 0 | 1 | 2 | null {
    if (!this.mainCannonAim) return null;
    if (this.mainCannonAim.x < (LANE_X[0] + LANE_X[1]) / 2) return 0;
    if (this.mainCannonAim.x > (LANE_X[1] + LANE_X[2]) / 2) return 2;
    return 1;
  }

  private maybeStartBossIntro(): void {
    if (
      this.bossIntroStarted
      || !this.eliteKilled
      || this.elapsedMs < 360_000
      || this.runLevel < 4
    ) {
      return;
    }
    this.bossIntroStarted = true;
    this.status = 'boss-intro';
    this.phaseElapsedMs = 0;
    this.events.push({ type: 'boss-intro-started' });
  }

  private updateBossIntro(stepMs: number): void {
    this.phaseElapsedMs += stepMs;
    if (this.phaseElapsedMs < 6000) return;
    const boss = this.spawnEnemy('deep-echo-boss', 1);
    boss.x = 195;
    boss.y = enemySpawnY('deep-echo-boss');
    this.bossId = boss.id;
    this.status = 'running';
    this.phaseElapsedMs = 0;
    this.events.push({
      type: 'boss-intro-ended',
      enemyId: boss.id,
    });
  }

  private updateBossMechanics(stepMs: number): void {
    if (this.bossId === null) return;
    const boss = this.enemies.find(
      (enemy) => enemy.id === this.bossId && enemy.alive,
    );
    if (!boss) return;
    boss.ageMs += stepMs;

    while (this.elapsedMs >= this.bossPressureAtMs) {
      this.damageTrain(
        this.input.maxTrainHp * 0.09 * this.input.enemyDamageMultiplier,
        0,
      );
      if (this.status !== 'running') return;
      this.bossPressureAtMs += this.elapsedMs >= 450_000
        ? 4200
        : 6000;
    }

    const summonAtMs = [10_000, 24_000, 38_000] as const;
    while (
      this.bossSummonIndex < summonAtMs.length
      && this.phaseElapsedMs
        >= (summonAtMs[this.bossSummonIndex] ?? Infinity)
    ) {
      for (let index = 0; index < 4; index += 1) {
        this.spawnEnemy(
          'needle-jelly',
          (index % 3) as 0 | 1 | 2,
          (index - 1.5) * 8,
        );
      }
      this.bossSummonIndex += 1;
    }

    const chargeAtMs = [16_000, 34_000] as const;
    while (
      this.bossChargeIndex < chargeAtMs.length
      && this.phaseElapsedMs
        >= (chargeAtMs[this.bossChargeIndex] ?? Infinity)
    ) {
      this.pendingBossChargeAtMs = this.phaseElapsedMs + 1200;
      this.bossChargeIndex += 1;
      this.events.push({
        type: 'boss-charge-started',
        durationMs: 1200,
      });
    }
    if (
      this.pendingBossChargeAtMs !== null
      && this.phaseElapsedMs >= this.pendingBossChargeAtMs
    ) {
      this.pendingBossChargeAtMs = null;
      this.damageTrain(
        this.input.maxTrainHp * 0.18 * this.input.enemyDamageMultiplier,
        0,
      );
      if (this.status !== 'running') return;
    }

  }

  private moveEnemies(stepMs: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.kind === 'deep-echo-boss') continue;
      enemy.ageMs += stepMs;
      this.moveEnemyTowardBehaviourLane(enemy, stepMs);
      if (enemy.kind === 'lantern-ray' && enemy.y >= 300) continue;
      if (enemy.y < DEFENCE_LINE_Y) {
        enemy.y = Math.min(
          DEFENCE_LINE_Y,
          enemy.y + enemy.speedPerSecond * stepMs / 1000,
        );
        continue;
      }

      enemy.attackCooldownMs -= stepMs;
      if (enemy.attackCooldownMs > 0) continue;
      const definition = ENEMY_CONFIG[enemy.kind];
      this.damageTrain(
        definition.defenceDamage * this.input.enemyDamageMultiplier,
        enemy.x < 195 ? 1 : enemy.x > 195 ? -1 : 0,
        enemy.id,
      );
      const attackIntervalMultiplier = (
        enemy.kind === 'storm-ray-elite' && this.eliteEnraged
      ) ? 0.7 : 1;
      enemy.attackCooldownMs += Math.max(
        1,
        definition.attackIntervalMs * attackIntervalMultiplier,
      );
      if (this.status !== 'running') return;
    }
  }

  private moveEnemyTowardBehaviourLane(enemy: EnemyState, stepMs: number): void {
    const targetLane = enemy.behaviour?.targetLane ?? enemy.lane;
    const targetX = LANE_X[targetLane];
    const distance = targetX - enemy.x;
    if (Math.abs(distance) < 0.01) {
      enemy.x = targetX;
      if (enemy.lane !== targetLane) {
        enemy.lane = targetLane;
        this.events.push({ type: 'enemy-lane-shifted', enemyId: enemy.id, lane: targetLane });
      }
      return;
    }
    const speed = enemy.behaviour?.phase === 'elite-charge' ? 360 : 120;
    enemy.x += Math.sign(distance) * Math.min(Math.abs(distance), speed * stepMs / 1000);
  }

  private updateMainCannon(stepMs: number): void {
    this.fireCooldownMs -= stepMs;
    const interval = Math.max(
      80,
      MAIN_CANNON_INTERVAL_MS * this.modifiers.reloadMultiplier,
    );
    while (this.fireCooldownMs <= 0) {
      if (this.mainCannonAim === null && !this.hasLivingTarget()) {
        this.fireCooldownMs = 0;
        return;
      }
      this.fireMainCannon();
      this.fireCooldownMs += interval;
    }
  }

  private fireMainCannon(): void {
    const aim = this.mainCannonAim;
    for (
      let index = 0;
      index < this.modifiers.mainProjectileCount;
      index += 1
    ) {
      const target = aim === null ? this.findTarget() : undefined;
      if (aim === null && !target) return;
      const critical = this.random.next() < this.modifiers.criticalChance;
      const damage = Math.floor(
        this.input.mainCannonDamage
          * this.modifiers.mainProjectileDamageMultiplier
          * (critical ? this.modifiers.criticalMultiplier : 1),
      );
      this.createProjectile({
        source: 'main',
        targetId: target?.id,
        damage,
        critical,
        splashRadius: this.modifiers.splashRadius,
        chainRemaining: this.modifiers.chainCount,
        xOffset: (index - (this.modifiers.mainProjectileCount - 1) / 2) * 8,
        direction: aim === null ? undefined : this.mainCannonDirection(aim, index),
      });
    }
  }

  private fireVolley(): void {
    const targets = this.enemies
      .filter((enemy) => enemy.alive)
      .sort((left, right) => right.y - left.y || left.id - right.id);
    if (targets.length === 0) return;
    const profile = volleyProfile(this.battleBuild.skillVariants['tidal-volley']);
    const damage = Math.floor(
      this.input.mainCannonDamage * 0.7 * this.skillStrengthMultiplier('tidal-volley') * profile.projectileDamageMultiplier,
    );
    for (let index = 0; index < profile.projectileCount; index += 1) {
      const target = targets[index % targets.length];
      if (!target) continue;
      this.createProjectile({
        source: 'volley',
        targetId: target.id,
        damage,
        critical: false,
        splashRadius: 0,
        chainRemaining: 0,
        pierceRemaining: profile.pierceCount,
        splitMultiplier: profile.splitMultiplier,
        xOffset: (index - (profile.projectileCount - 1) / 2) * 5,
      });
    }
    if (profile.returningCount > 0) this.delayedVolleyActions.push({
      dueAtMs: this.elapsedMs + 500,
      damage: Math.floor(damage * profile.returningMultiplier),
      count: profile.returningCount,
      pierceRemaining: profile.pierceCount,
      splitMultiplier: profile.splitMultiplier,
    });
  }

  private applyBarrier(effectRatio = 1, origin: 'manual' | 'emergency' = 'manual'): void {
    const profile = barrierProfile(this.battleBuild.skillVariants['bubble-barrier']);
    const baseHeal = Math.floor(
      this.input.maxTrainHp * this.modifiers.barrierHealPercent,
    ) * this.skillStrengthMultiplier('bubble-barrier') + this.input.repairBonus;
    const heal = effectRatio === 1 ? baseHeal : Math.floor(baseHeal * effectRatio);
    const appliedHeal = Math.min(this.input.maxTrainHp - this.trainHp, heal);
    const overflow = Math.max(0, heal - appliedHeal);
    this.trainHp += appliedHeal;
    this.shield = this.input.maxTrainHp
        * 0.25
        * this.modifiers.barrierShieldMultiplier
        * this.skillStrengthMultiplier('bubble-barrier') * effectRatio
      + Math.min(overflow, this.input.maxTrainHp * profile.overflowShieldCapRatio);
    this.shieldRemainingMs = 4000;
    this.barrierOrigin = origin;
    this.barrierAbsorbedDamage = 0;
    this.barrierLastAttackerId = null;
    this.events.push({
      type: 'shield-changed',
      shield: this.shield,
    });
  }

  private createProjectile(input: {
    readonly source: MutableProjectileState['source'];
    readonly targetId?: number;
    readonly damage: number;
    readonly critical: boolean;
    readonly splashRadius: number;
    readonly chainRemaining: number;
    readonly pierceRemaining?: number;
    readonly splitMultiplier?: number;
    readonly xOffset?: number;
    readonly startX?: number;
    readonly startY?: number;
    readonly direction?: Readonly<{ x: number; y: number }>;
  }): MutableProjectileState {
    const projectile = this.projectilePool.acquire();
    projectile.id = this.nextEntityId++;
    projectile.source = input.source;
    projectile.x = (input.startX ?? 195) + (input.xOffset ?? 0);
    projectile.y = input.startY ?? 690;
    projectile.targetId = input.targetId ?? 0;
    projectile.trajectory = input.direction ? 'manual' : 'homing';
    projectile.speedPerSecond = MAIN_PROJECTILE_SPEED;
    projectile.velocityX = (input.direction?.x ?? 0) * projectile.speedPerSecond;
    projectile.velocityY = (input.direction?.y ?? 0) * projectile.speedPerSecond;
    projectile.damage = Math.max(0, input.damage);
    projectile.splashRadius = Math.max(0, input.splashRadius);
    projectile.chainRemaining = Math.max(0, input.chainRemaining);
    projectile.pierceRemaining = Math.max(0, input.pierceRemaining ?? 0);
    projectile.splitMultiplier = Math.max(0, input.splitMultiplier ?? 0);
    projectile.critical = input.critical;
    projectile.active = true;
    this.projectiles.push(projectile);
    this.events.push({
      type: 'weapon-fired',
      projectileId: projectile.id,
      source: projectile.source,
    });
    return projectile;
  }

  private moveProjectiles(stepMs: number): void {
    const maxDistance = MAIN_PROJECTILE_SPEED * stepMs / 1000;
    for (const projectile of this.projectiles) {
      if (!projectile.active) continue;
      if (projectile.trajectory === 'manual') {
        this.moveManualProjectile(projectile, maxDistance);
        continue;
      }
      let target = this.enemies.find(
        (enemy) => enemy.id === projectile.targetId && enemy.alive,
      );
      if (!target) {
        target = this.findTarget();
        if (!target) {
          projectile.active = false;
          continue;
        }
        projectile.targetId = target.id;
      }

      const deltaX = target.x - projectile.x;
      const deltaY = target.y - projectile.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance <= maxDistance || distance <= 14) {
        projectile.x = target.x;
        projectile.y = target.y;
        this.hitEnemy(projectile, target);
        if (projectile.pierceRemaining > 0) {
          const nextTarget = this.findSecondaryTarget(target);
          if (nextTarget) {
            projectile.pierceRemaining -= 1;
            projectile.damage = Math.floor(projectile.damage * volleyProfile(this.battleBuild.skillVariants['tidal-volley']).pierceRetention);
            projectile.targetId = nextTarget.id;
            continue;
          }
        }
        projectile.active = false;
        continue;
      }
      projectile.x += deltaX / distance * maxDistance;
      projectile.y += deltaY / distance * maxDistance;
    }
  }

  private mainCannonDirection(
    aim: BattleAimPoint,
    projectileIndex: number,
  ): Readonly<{ x: number; y: number }> {
    const startX = 195 + (projectileIndex - (this.modifiers.mainProjectileCount - 1) / 2) * 8;
    const startY = 690;
    const baseAngle = Math.atan2(aim.y - startY, aim.x - startX);
    const fanOffset = (projectileIndex - (this.modifiers.mainProjectileCount - 1) / 2) * 0.075;
    const angle = Number.isFinite(baseAngle) ? baseAngle + fanOffset : -Math.PI / 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  private moveManualProjectile(
    projectile: MutableProjectileState,
    maxDistance: number,
  ): void {
    const startX = projectile.x;
    const startY = projectile.y;
    const endX = startX + projectile.velocityX * maxDistance / projectile.speedPerSecond;
    const endY = startY + projectile.velocityY * maxDistance / projectile.speedPerSecond;
    const collision = this.findManualProjectileCollision(startX, startY, endX, endY);
    if (collision) {
      projectile.x = startX + (endX - startX) * collision.progress;
      projectile.y = startY + (endY - startY) * collision.progress;
      this.hitEnemy(projectile, collision.enemy);
      projectile.active = false;
      return;
    }
    projectile.x = endX;
    projectile.y = endY;
    if (
      projectile.x < 0
      || projectile.x > LOGICAL_WIDTH
      || projectile.y < 0
      || projectile.y > LOGICAL_HEIGHT
    ) {
      projectile.active = false;
    }
  }

  private findManualProjectileCollision(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): { readonly enemy: EnemyState; readonly progress: number } | undefined {
    return this.enemies
      .filter((enemy) => enemy.alive)
      .map((enemy) => ({
        enemy,
        progress: segmentCircleEntryProgress(
          startX,
          startY,
          endX,
          endY,
          enemy.x,
          enemy.y,
          Math.max(
            ENEMY_GEOMETRY[enemy.kind].width,
            ENEMY_GEOMETRY[enemy.kind].height,
          ) * 0.4,
        ),
      }))
      .filter((candidate): candidate is { readonly enemy: EnemyState; readonly progress: number } => (
        candidate.progress !== null
      ))
      .sort((left, right) => left.progress - right.progress || left.enemy.id - right.enemy.id)[0];
  }

  private hitEnemy(
    projectile: MutableProjectileState,
    enemy: EnemyState,
  ): void {
    this.applyDamage(
      enemy,
      projectile.damage,
      projectile.critical,
      projectile.source,
    );
    this.energy = Math.min(
      100,
      this.energy + Math.floor(2 * this.modifiers.energyGainMultiplier),
    );
    this.combo += 1;

    if (projectile.splitMultiplier > 0) {
      const splitTarget = this.findSecondaryTarget(enemy);
      if (splitTarget) this.createProjectile({
        source: 'volley', targetId: splitTarget.id,
        damage: Math.floor(projectile.damage * projectile.splitMultiplier),
        critical: false, splashRadius: 0, chainRemaining: 0,
        startX: enemy.x, startY: enemy.y,
      });
    }

    if (projectile.splashRadius > 0) {
      const splashDamage = Math.floor(
        projectile.damage * this.modifiers.splashDamageMultiplier,
      );
      for (const nearby of this.enemies) {
        if (
          !nearby.alive
          || nearby.id === enemy.id
          || Math.hypot(nearby.x - enemy.x, nearby.y - enemy.y)
            > projectile.splashRadius
        ) {
          continue;
        }
        this.applyDamage(nearby, splashDamage, false, 'splash');
      }
    }

    if (projectile.chainRemaining > 0) {
      const nextTarget = this.enemies
        .filter((candidate) => candidate.alive && candidate.id !== enemy.id)
        .sort((left, right) => {
          const leftDistance = Math.hypot(
            left.x - enemy.x,
            left.y - enemy.y,
          );
          const rightDistance = Math.hypot(
            right.x - enemy.x,
            right.y - enemy.y,
          );
          return leftDistance - rightDistance || left.id - right.id;
        })[0];
      if (nextTarget) {
        this.createProjectile({
          source: 'chain',
          targetId: nextTarget.id,
          damage: Math.max(
            1,
            Math.floor(
              projectile.damage * this.modifiers.chainDamageMultiplier,
            ),
          ),
          critical: false,
          splashRadius: 0,
          chainRemaining: projectile.chainRemaining - 1,
          startX: enemy.x,
          startY: enemy.y,
        });
      }
    }
  }

  private applyDamage(
    enemy: EnemyState,
    rawDamage: number,
    critical: boolean,
    source: ProjectileState['source'] | 'extreme-tide' | 'splash',
  ): void {
    if (!enemy.alive || rawDamage <= 0) return;
    if (enemy.behaviour?.invulnerable) return;
    let damage = Math.max(
      0,
      Math.floor(rawDamage * (enemy.behaviour?.damageTakenMultiplier ?? 1)),
    );
    if (enemy.kind === 'deep-echo-boss' && enemy.behaviour?.weakPointOpen) {
      const bonusDamage = Math.max(1, Math.floor(damage * 0.5));
      damage += bonusDamage;
      this.energy = Math.min(100, this.energy + 2);
      this.events.push({ type: 'boss-weakpoint-hit', enemyId: enemy.id, bonusDamage });
    }
    if (enemy.kind === 'reef-crab' && !enemy.defenceBroken) {
      enemy.defenceBroken = true;
      damage = Math.max(1, Math.floor(damage * 0.35));
      this.events.push({
        type: 'enemy-armour-broken',
        enemyId: enemy.id,
      });
    }

    const shieldAbsorbed = Math.min(enemy.shield, damage);
    enemy.shield -= shieldAbsorbed;
    const hpDamage = Math.min(enemy.hp, damage - shieldAbsorbed);
    enemy.hp = Math.max(0, enemy.hp - hpDamage);
    this.events.push({
      type: 'projectile-hit',
      enemyId: enemy.id,
      damage: shieldAbsorbed + hpDamage,
      critical,
      source,
    });
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  private killEnemy(enemy: EnemyState): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    enemy.hp = 0;
    this.kills += 1;
    if (enemy.kind === 'storm-ray-elite') this.killCounts.elite += 1;
    else if (enemy.kind === 'deep-echo-boss') this.killCounts.boss += 1;
    else this.killCounts.normal += 1;
    const effect = this.activeExtremeEffect;
    if (!effect) {
      this.energy = Math.min(
        100,
        this.energy + Math.floor(4 * this.modifiers.energyGainMultiplier),
      );
    } else if (effect.energyPerKill > 0 && effect.energyRefunded < effect.energyRefundCap) {
      const amount = Math.min(
        effect.energyPerKill,
        effect.energyRefundCap - effect.energyRefunded,
      );
      effect.energyRefunded += amount;
      this.energy = Math.min(100, this.energy + amount);
      this.events.push({ type: 'extreme-energy-refunded', amount });
    }
    this.events.push({
      type: 'enemy-killed',
      enemyId: enemy.id,
      kind: enemy.kind,
      x: enemy.x,
      y: enemy.y,
    });
    const experience = ENEMY_CONFIG[enemy.kind].experience;
    if (experience > 0) {
      this.createLoot('experience', experience, enemy.x, enemy.y);
    }
    if (enemy.kind === 'storm-ray-elite') this.eliteKilled = true;
    if (enemy.kind === 'deep-echo-boss') this.finish(true);
  }

  private createLoot(
    kind: LootState['kind'],
    amount: number,
    x: number,
    y: number,
  ): void {
    const loot = this.lootPool.acquire();
    loot.id = this.nextEntityId++;
    loot.kind = kind;
    loot.x = x + this.random.int(-8, 8);
    loot.y = y + this.random.int(-5, 5);
    loot.amount = amount;
    loot.ageMs = 0;
    loot.collected = false;
    this.loot.push(loot);
    this.events.push({
      type: 'loot-created',
      lootId: loot.id,
      kind,
    });
  }

  private updateLoot(stepMs: number): void {
    const targetX = 195;
    const targetY = 724;
    const speed = 520 * this.modifiers.lootAttractMultiplier;
    const maxDistance = speed * stepMs / 1000;

    for (const loot of this.loot) {
      if (loot.collected) continue;
      loot.ageMs += stepMs;
      if (loot.ageMs < 280) continue;
      const deltaX = targetX - loot.x;
      const deltaY = targetY - loot.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance <= maxDistance || distance <= 12) {
        loot.x = targetX;
        loot.y = targetY;
        loot.collected = true;
        const amount = Math.max(
          0,
          Math.floor(loot.amount * this.modifiers.experienceMultiplier),
        );
        if (loot.kind === 'experience') this.experience += amount;
        this.events.push({
          type: 'loot-collected',
          lootId: loot.id,
          kind: loot.kind,
          amount,
        });
        continue;
      }
      loot.x += deltaX / distance * maxDistance;
      loot.y += deltaY / distance * maxDistance;
    }
  }

  private findTarget(): EnemyState | undefined {
    return this.enemies
      .filter((enemy) => enemy.alive)
      .sort((left, right) => right.y - left.y || left.id - right.id)[0];
  }

  private recycleInactiveEntities(): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      if (!projectile || projectile.active) continue;
      this.projectiles.splice(index, 1);
      this.projectilePool.release(projectile);
    }
    for (let index = this.loot.length - 1; index >= 0; index -= 1) {
      const item = this.loot[index];
      if (!item || !item.collected) continue;
      this.loot.splice(index, 1);
      this.lootPool.release(item);
    }
  }

  private hasLivingTarget(): boolean {
    return this.enemies.some((enemy) => enemy.alive);
  }

  private findSecondaryTarget(excluded: EnemyState): EnemyState | undefined {
    return this.enemies.filter((enemy) => enemy.alive && enemy.id !== excluded.id)
      .sort((left, right) => right.y - left.y || left.id - right.id)[0];
  }

  private runDelayedVolleyActions(): void {
    for (let index = this.delayedVolleyActions.length - 1; index >= 0; index -= 1) {
      const action = this.delayedVolleyActions[index];
      if (!action || action.dueAtMs > this.elapsedMs) continue;
      this.delayedVolleyActions.splice(index, 1);
      for (let projectileIndex = 0; projectileIndex < action.count; projectileIndex += 1) {
        const target = this.findTarget();
        if (!target) break;
        this.createProjectile({
          source: 'volley', targetId: target.id, damage: action.damage,
          critical: false, splashRadius: 0, chainRemaining: 0,
          pierceRemaining: action.pierceRemaining,
          splitMultiplier: action.splitMultiplier,
          xOffset: (projectileIndex - (action.count - 1) / 2) * 5,
        });
      }
    }
  }

  private runDelayedExtremeCrestActions(): void {
    for (let index = this.delayedExtremeCrestActions.length - 1; index >= 0; index -= 1) {
      const action = this.delayedExtremeCrestActions[index];
      if (!action || action.dueAtMs > this.elapsedMs) continue;
      this.delayedExtremeCrestActions.splice(index, 1);
      if (this.activeExtremeEffect) this.activeExtremeEffect.pendingCrestActions = Math.max(
        0,
        this.activeExtremeEffect.pendingCrestActions - 1,
      );
      for (const enemy of this.enemies) {
        if (enemy.alive) this.applyDamage(enemy, action.damage, false, 'extreme-tide');
      }
      this.events.push({
        type: 'extreme-second-crest',
        durationMs: action.durationMs,
        amount: action.damage,
      });
    }
  }

  private updateExtremeEffects(stepMs: number): void {
    const effect = this.activeExtremeEffect;
    if (!effect) return;
    if (effect.pullRemainingMs > 0) {
      const activeMs = Math.min(stepMs, effect.pullRemainingMs);
      const maxDistance = 220 * activeMs / 1000;
      const centreX = LANE_X[1];
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const deltaX = centreX - enemy.x;
        enemy.x += Math.sign(deltaX) * Math.min(Math.abs(deltaX), maxDistance);
      }
      effect.pullRemainingMs -= activeMs;
    }
    if (effect.vortexRemainingMs > 0) {
      const activeMs = Math.min(stepMs, effect.vortexRemainingMs);
      effect.vortexRemainingMs -= activeMs;
      effect.vortexTickElapsedMs += activeMs;
      while (effect.vortexTickElapsedMs >= 500 && effect.vortexTicksApplied < 8) {
        effect.vortexTickElapsedMs -= 500;
        effect.vortexTicksApplied += 1;
        const damage = Math.floor(effect.vortexTotalDamage * effect.vortexTicksApplied / 8)
          - Math.floor(effect.vortexTotalDamage * (effect.vortexTicksApplied - 1) / 8);
        for (const enemy of this.enemies) {
          if (enemy.alive) this.applyDamage(enemy, damage, false, 'extreme-tide');
        }
      }
    }
    if (
      effect.pullRemainingMs <= 0
      && effect.vortexRemainingMs <= 0
      && effect.pendingCrestActions <= 0
    ) {
      this.activeExtremeEffect = null;
    }
  }

  private damageTrain(rawAmount: number, impactDirectionX: -1 | 0 | 1 = 0, attackerId: number | null = null): void {
    if (this.reviveProtectionMs > 0 || this.isTerminal()) return;
    const damage = Math.max(0, Math.floor(rawAmount));
    const shieldAbsorbed = Math.min(this.shield, damage);
    this.shield -= shieldAbsorbed;
    if (shieldAbsorbed > 0 && this.barrierOrigin) {
      this.barrierAbsorbedDamage += shieldAbsorbed;
      this.barrierLastAttackerId = attackerId;
    }
    if (shieldAbsorbed > 0) {
      this.events.push({
        type: 'shield-changed',
        shield: this.shield,
      });
    }
    const hpDamage = Math.min(this.trainHp, damage - shieldAbsorbed);
    this.trainHp = Math.max(0, this.trainHp - hpDamage);
    this.events.push({
      type: 'train-damaged',
      amount: hpDamage,
      shieldAbsorbed,
      remainingHp: this.trainHp,
      impactDirectionX,
    });
    if (this.shield === 0 && shieldAbsorbed > 0) this.breakBarrier();
    const profile = barrierProfile(this.battleBuild.skillVariants['bubble-barrier']);
    if (shouldEmergencyTrigger({ currentHp: this.trainHp, maxHp: this.input.maxTrainHp,
      consumed: this.emergencyBarrierConsumed, effectRatio: profile.emergencyEffectRatio })) {
      this.emergencyBarrierConsumed = true;
      this.applyBarrier(profile.emergencyEffectRatio, 'emergency');
    }
    if (this.trainHp <= 0) this.finish(false);
  }

  private breakBarrier(): void {
    if (!this.barrierOrigin) return;
    const profile = barrierProfile(this.battleBuild.skillVariants['bubble-barrier']);
    this.shield = 0;
    this.shieldRemainingMs = 0;
    this.events.push({ type: 'shield-changed', shield: 0 });
    if (profile.breakDamageMultiplier > 0) {
      const damage = Math.floor(this.input.mainCannonDamage * profile.breakDamageMultiplier);
      for (const enemy of this.enemies) {
        if (enemy.alive && enemy.y <= DEFENCE_LINE_Y) this.applyDamage(enemy, damage, false, 'splash');
      }
      this.events.push({ type: 'barrier-burst' });
    }
    if (this.barrierLastAttackerId !== null && profile.reflectRatio > 0) {
      const attacker = this.enemies.find((enemy) => enemy.id === this.barrierLastAttackerId);
      if (attacker) this.applyDamage(attacker, reflectBarrierDamage(this.barrierAbsorbedDamage, profile.reflectRatio), false, 'splash');
    }
    this.barrierOrigin = null;
    this.barrierAbsorbedDamage = 0;
    this.barrierLastAttackerId = null;
  }

  private nextUpgradeThreshold(): number | null {
    return EXPERIENCE_THRESHOLDS[this.runLevel - 1] ?? null;
  }

  private maybeOfferUpgrade(): void {
    const threshold = this.nextUpgradeThreshold();
    if (threshold === null || this.experience < threshold) return;
    this.upgradeOfferRoll = 0;
    this.offeredUpgradeIds = [...createUpgradeOffer(
      this.input.seed,
      this.runLevel,
      this.battleBuild,
      this.input.unlockedSkillVariants,
      this.upgradeOfferRoll,
    )];
    this.status = 'upgrade';
    this.events.push({
      type: 'upgrade-offered',
      upgradeIds: this.offeredUpgradeIds,
    });
  }

  private skillStrengthMultiplier(skillId: BattleSkillId): number {
    const rank = this.battleBuild.skillRanks[skillId];
    return this.input.skillMasteryPower[skillId] * SKILL_STRENGTH_MULTIPLIER[rank - 1];
  }

  private skillCooldownMultiplier(skillId: Exclude<BattleSkillId, 'extreme-tide'>): number {
    return SKILL_COOLDOWN_MULTIPLIER[this.battleBuild.skillRanks[skillId] - 1];
  }

  private finish(victory: boolean, hardCapReached = false): void {
    if (this.resolvedOutcome) return;
    this.status = victory ? 'victory' : 'defeat';
    this.resolvedOutcome = Object.freeze({
      battleId: this.input.battleId,
      victory,
      elapsedMs: this.elapsedMs,
      completedWaves: victory
        ? 6
        : Math.min(5, getWaveAtTime(this.elapsedMs)),
      remainingHp: Math.max(0, this.trainHp),
      kills: this.kills,
      killCounts: Object.freeze({ ...this.killCounts }),
      skillCastCounts: Object.freeze({ ...this.skillCastCounts }),
      hardCapReached,
      adReviveUsed: this.adReviveUsed,
    });
    this.events.push({
      type: victory ? 'battle-won' : 'battle-lost',
    });
  }

  private isTerminal(): boolean {
    return this.status === 'victory' || this.status === 'defeat';
  }
}

function resetProjectile(projectile: MutableProjectileState): void {
  projectile.id = 0;
  projectile.source = 'main';
  projectile.x = 0;
  projectile.y = 0;
  projectile.targetId = 0;
  projectile.trajectory = 'homing';
  projectile.velocityX = 0;
  projectile.velocityY = 0;
  projectile.speedPerSecond = 0;
  projectile.damage = 0;
  projectile.splashRadius = 0;
  projectile.chainRemaining = 0;
  projectile.pierceRemaining = 0;
  projectile.splitMultiplier = 0;
  projectile.critical = false;
  projectile.active = false;
}

function segmentCircleEntryProgress(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  centreX: number,
  centreY: number,
  radius: number,
): number | null {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const originX = startX - centreX;
  const originY = startY - centreY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared <= 0) return null;
  const c = originX * originX + originY * originY - radius * radius;
  if (c <= 0) return 0;
  const b = 2 * (originX * deltaX + originY * deltaY);
  const discriminant = b * b - 4 * lengthSquared * c;
  if (discriminant < 0) return null;
  const entry = (-b - Math.sqrt(discriminant)) / (2 * lengthSquared);
  return entry >= 0 && entry <= 1 ? entry : null;
}

function resetLoot(loot: MutableLootState): void {
  loot.id = 0;
  loot.kind = 'experience';
  loot.x = 0;
  loot.y = 0;
  loot.amount = 0;
  loot.ageMs = 0;
  loot.collected = false;
}
