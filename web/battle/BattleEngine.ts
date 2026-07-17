import {
  createBaseModifiers,
  DEFENCE_LINE_Y,
  ENEMY_CONFIG,
  EXPERIENCE_THRESHOLDS,
  LANE_X,
  MAIN_CANNON_INTERVAL_MS,
  MAIN_PROJECTILE_SPEED,
  SKILL_CONFIG,
  UPGRADE_IDS,
} from './BattleConfig';
import { SeededRandom } from './SeededRandom';
import type {
  BattleEvent,
  BattleFrameView,
  BattleOutcome,
  BattleRunInput,
  BattleSkillId,
  BattleStatus,
  BattleUpgradeId,
  EnemyKind,
  EnemyState,
  LootState,
  PauseReason,
  ProjectileState,
} from './BattleTypes';
import {
  applyUpgrade,
  createUpgradeOffer,
} from './UpgradeSystem';
import {
  createWaveSchedule,
  getWaveAtTime,
  type SpawnInstruction,
} from './WaveScheduler';
import {
  EntityPool,
  type EntityPoolStats,
} from './EntityPool';

type Mutable<T> = {
  -readonly [Property in keyof T]: T[Property];
};

type MutableProjectileState = Mutable<ProjectileState>;
type MutableLootState = Mutable<LootState>;

export interface BattleEntityPoolStats {
  readonly projectiles: EntityPoolStats;
  readonly loot: EntityPoolStats;
}

export class BattleEngine {
  private readonly events: BattleEvent[] = [];
  private readonly enemies: EnemyState[] = [];
  private readonly projectiles: MutableProjectileState[] = [];
  private readonly loot: MutableLootState[] = [];
  private readonly projectilePool = new EntityPool<MutableProjectileState>(
    () => ({
      id: 0,
      source: 'main',
      x: 0,
      y: 0,
      targetId: 0,
      speedPerSecond: 0,
      damage: 0,
      splashRadius: 0,
      chainRemaining: 0,
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
    UPGRADE_IDS.map((id) => [id, 0]),
  ) as Record<BattleUpgradeId, number>;

  private status: BattleStatus = 'running';
  private pausedFrom: Exclude<BattleStatus, 'paused'> | null = null;
  private pauseReason: PauseReason | null = null;
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
  private upgradeCheckpoint = 0;
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
  private bossPressureAtMs = 6000;
  private bossSummonIndex = 0;
  private bossChargeIndex = 0;
  private pendingBossChargeAtMs: number | null = null;
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

  public inputForTest(): BattleRunInput {
    return { ...this.input };
  }

  public drainEvents(): readonly BattleEvent[] {
    return this.events.splice(0);
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
          * this.modifiers.extremeDamageMultiplier,
      );
      for (const enemy of this.enemies) {
        if (enemy.alive) {
          this.applyDamage(enemy, damage, false, 'extreme-tide');
        }
      }
      this.energy = 0;
    } else {
      if (this.cooldowns[skillId] > 0) return false;
      if (skillId === 'tidal-volley' && !this.hasLivingTarget()) {
        return false;
      }
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

  public chooseUpgrade(upgradeId: BattleUpgradeId): boolean {
    if (
      this.status !== 'upgrade'
      || !this.offeredUpgradeIds.includes(upgradeId)
    ) {
      return false;
    }
    const result = applyUpgrade(
      this.modifiers,
      this.upgradeLevels,
      upgradeId,
    );
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
      this.updateTimers(stepMs);
      this.spawnScheduledEnemies();
      this.maybeSpawnElite();
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
        this.shield = 0;
        this.events.push({ type: 'shield-changed', shield: 0 });
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
      y: kind === 'deep-echo-boss' ? 96 : 72,
      hp: maxHp,
      maxHp,
      shield: 0,
      speedPerSecond: definition.speedPerSecond,
      defenceBroken: false,
      attackCooldownMs: definition.attackIntervalMs,
      ageMs: 0,
      alive: true,
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
    if (this.eliteSpawned || this.elapsedMs < 130_000) return;
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

    if (elite.ageMs >= 75_000) this.finish(false);
  }

  private maybeStartBossIntro(): void {
    if (
      this.bossIntroStarted
      || !this.eliteKilled
      || this.elapsedMs < 160_000
      || this.upgradeCheckpoint < 3
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
    boss.y = 96;
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

    while (this.phaseElapsedMs >= this.bossPressureAtMs) {
      this.damageTrain(
        this.input.maxTrainHp * 0.09 * this.input.enemyDamageMultiplier,
        0,
      );
      if (this.status !== 'running') return;
      this.bossPressureAtMs += this.phaseElapsedMs >= 55_000
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

    if (this.phaseElapsedMs >= 90_000) this.finish(false);
  }

  private moveEnemies(stepMs: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.kind === 'deep-echo-boss') continue;
      enemy.ageMs += stepMs;
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

  private updateMainCannon(stepMs: number): void {
    this.fireCooldownMs -= stepMs;
    const interval = Math.max(
      80,
      MAIN_CANNON_INTERVAL_MS * this.modifiers.reloadMultiplier,
    );
    while (this.fireCooldownMs <= 0) {
      if (!this.hasLivingTarget()) {
        this.fireCooldownMs = 0;
        return;
      }
      this.fireMainCannon();
      this.fireCooldownMs += interval;
    }
  }

  private fireMainCannon(): void {
    for (
      let index = 0;
      index < this.modifiers.mainProjectileCount;
      index += 1
    ) {
      const target = this.findTarget();
      if (!target) return;
      const critical = this.random.next() < this.modifiers.criticalChance;
      const damage = Math.floor(
        this.input.mainCannonDamage
          * this.modifiers.mainProjectileDamageMultiplier
          * (critical ? this.modifiers.criticalMultiplier : 1),
      );
      this.createProjectile({
        source: 'main',
        targetId: target.id,
        damage,
        critical,
        splashRadius: this.modifiers.splashRadius,
        chainRemaining: this.modifiers.chainCount,
        xOffset: (index - (this.modifiers.mainProjectileCount - 1) / 2) * 8,
      });
    }
  }

  private fireVolley(): void {
    const targets = this.enemies
      .filter((enemy) => enemy.alive)
      .sort((left, right) => right.y - left.y || left.id - right.id);
    if (targets.length === 0) return;
    const damage = Math.floor(this.input.mainCannonDamage * 0.7);
    for (let index = 0; index < 8; index += 1) {
      const target = targets[index % targets.length];
      if (!target) continue;
      this.createProjectile({
        source: 'volley',
        targetId: target.id,
        damage,
        critical: false,
        splashRadius: 0,
        chainRemaining: 0,
        xOffset: (index - 3.5) * 5,
      });
    }
  }

  private applyBarrier(): void {
    const heal = Math.floor(
      this.input.maxTrainHp * this.modifiers.barrierHealPercent,
    ) + this.input.repairBonus;
    this.trainHp = Math.min(this.input.maxTrainHp, this.trainHp + heal);
    this.shield = Math.floor(
      this.input.maxTrainHp
        * 0.25
        * this.modifiers.barrierShieldMultiplier,
    );
    this.shieldRemainingMs = 4000;
    this.events.push({
      type: 'shield-changed',
      shield: this.shield,
    });
  }

  private createProjectile(input: {
    readonly source: MutableProjectileState['source'];
    readonly targetId: number;
    readonly damage: number;
    readonly critical: boolean;
    readonly splashRadius: number;
    readonly chainRemaining: number;
    readonly xOffset?: number;
    readonly startX?: number;
    readonly startY?: number;
  }): MutableProjectileState {
    const projectile = this.projectilePool.acquire();
    projectile.id = this.nextEntityId++;
    projectile.source = input.source;
    projectile.x = (input.startX ?? 195) + (input.xOffset ?? 0);
    projectile.y = input.startY ?? 690;
    projectile.targetId = input.targetId;
    projectile.speedPerSecond = MAIN_PROJECTILE_SPEED;
    projectile.damage = Math.max(0, input.damage);
    projectile.splashRadius = Math.max(0, input.splashRadius);
    projectile.chainRemaining = Math.max(0, input.chainRemaining);
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
        projectile.active = false;
        this.hitEnemy(projectile, target);
        continue;
      }
      projectile.x += deltaX / distance * maxDistance;
      projectile.y += deltaY / distance * maxDistance;
    }
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
    let damage = Math.max(0, Math.floor(rawDamage));
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
    this.energy = Math.min(
      100,
      this.energy + Math.floor(4 * this.modifiers.energyGainMultiplier),
    );
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

  private damageTrain(rawAmount: number, impactDirectionX: -1 | 0 | 1 = 0): void {
    if (this.reviveProtectionMs > 0 || this.isTerminal()) return;
    const damage = Math.max(0, Math.floor(rawAmount));
    const shieldAbsorbed = Math.min(this.shield, damage);
    this.shield -= shieldAbsorbed;
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
    if (this.trainHp <= 0) this.finish(false);
  }

  private nextUpgradeThreshold(): number | null {
    return EXPERIENCE_THRESHOLDS[this.upgradeCheckpoint] ?? null;
  }

  private maybeOfferUpgrade(): void {
    const checkpoints = [
      this.elapsedMs >= 30_000,
      this.elapsedMs >= 95_000,
      this.eliteKilled && this.elapsedMs >= 160_000,
    ];
    if (
      this.upgradeCheckpoint >= checkpoints.length
      || !checkpoints[this.upgradeCheckpoint]
    ) {
      return;
    }
    const threshold = EXPERIENCE_THRESHOLDS[this.upgradeCheckpoint];
    if (threshold === undefined) return;
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

  private finish(victory: boolean): void {
    if (this.resolvedOutcome) return;
    this.status = victory ? 'victory' : 'defeat';
    this.resolvedOutcome = {
      battleId: this.input.battleId,
      victory,
      elapsedMs: this.elapsedMs,
      completedWaves: victory
        ? 6
        : Math.min(5, getWaveAtTime(this.elapsedMs)),
      remainingHp: Math.max(0, this.trainHp),
      kills: this.kills,
      adReviveUsed: this.adReviveUsed,
    };
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
  projectile.speedPerSecond = 0;
  projectile.damage = 0;
  projectile.splashRadius = 0;
  projectile.chainRemaining = 0;
  projectile.critical = false;
  projectile.active = false;
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
