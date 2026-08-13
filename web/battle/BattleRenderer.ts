import type { BattleArtId } from '../assets/BattleArtCatalog';
import type { BattleAssetSet } from './AssetLoader';
import type {
  BattlePainter,
  CameraPose,
  ImageDrawCommand,
} from './BattleDrawTypes';
import type { CanvasViewport } from './CanvasViewport';
import { LANE_X } from './BattleConfig';
import type {
  EffectFrameView,
  EffectParticleView,
} from './EffectSystem';
import {
  createCaptainRig,
  type SpritePartPose,
} from './LayeredSpriteRig';
import { createHandDrawnParallax } from './HandDrawnParallax';
import type {
  BattleFrameView,
  EnemyKind,
  EnemyState,
} from './BattleTypes';
import type { RenderBudget } from './QualityMonitor';
import type { TrainMotionFrameView } from './TrainMotionTypes';
import { ENEMY_GEOMETRY, ENEMY_LABELS } from './EnemyGeometry';
import { getBossWeakPoint } from './BossWeakPointSystem';
import { getBattleAtmosphere } from './BattleAtmosphere';

export interface BattleRenderInput {
  readonly frame: BattleFrameView;
  readonly assets: BattleAssetSet<BattleArtId>;
  readonly viewport: CanvasViewport;
  readonly captainArtId: BattleArtId;
  readonly timeMs: number;
  readonly reducedMotion: boolean;
  readonly effects: EffectFrameView;
  readonly renderBudget: RenderBudget;
  readonly trainMotion: TrainMotionFrameView;
}

const TRAIN_PIVOT_X = 195;
const TRAIN_PIVOT_Y = 842;

const ENEMY_ART: Readonly<Record<EnemyKind, BattleArtId>> = {
  'bubble-fin': 'bubbleFin',
  'needle-jelly': 'needleJelly',
  'reef-crab': 'reefCrab',
  'tide-shell-hatchling': 'tideShellHatchling',
  'lantern-ray': 'lanternRay',
  'tide-parasite-snail': 'tideParasiteSnail',
  'storm-ray-elite': 'stormRayElite',
  'deep-echo-boss': 'deepEchoBoss',
};

const captainRig = createCaptainRig();

function laneX(lane: 0 | 1 | 2): number {
  return LANE_X[lane];
}

export class BattleRenderer {
  public constructor(private readonly painter: BattlePainter) {}

  public render(input: BattleRenderInput): void {
    const trainMotion = input.trainMotion;
    const camera: CameraPose = {
      x: input.effects.camera.x,
      y: input.effects.camera.y,
      rotation: input.effects.camera.rotation,
      amplitude: input.effects.camera.amplitude,
    };
    this.painter.begin(input.viewport, camera);
    try {
      this.painter.clear('#d98a62');
      this.drawBackground(input);
      this.drawAtmosphere(input);
      this.drawBackgroundParticles(input);
      this.drawWaterLanes(input, trainMotion);
      this.drawLoot(input);
      this.drawEnemies(input);
      this.drawEffectParticles(input, 'enemies');
      this.drawProjectiles(input);
      this.drawTrain(input, trainMotion);
      this.drawCrew(input, trainMotion);
      this.drawAimReticle(input);
      this.drawFrontEffects(input, trainMotion);
      this.drawEffectParticles(input, 'front-effects');
      this.drawImpactRings(input);
      this.drawDamageNumbers(input);
      this.drawCinematicOverlay(input);
    } finally {
      this.painter.end();
    }
  }

  private drawAtmosphere(input: BattleRenderInput): void {
    const atmosphere = getBattleAtmosphere(input.frame);
    const pulse = input.reducedMotion
      ? 0
      : Math.sin(input.timeMs / 620) * atmosphere.danger * 0.025;
    this.painter.ellipse({
      kind: 'atmosphere-wash',
      layer: 'background',
      x: 195,
      y: 422,
      radiusX: 290,
      radiusY: 560,
      fill: atmosphere.wash,
      alpha: 0.08 + atmosphere.danger * 0.12,
      blendMode: 'multiply',
    });
    this.painter.ellipse({
      kind: 'horizon-glow',
      layer: 'background',
      x: 195,
      y: 176,
      radiusX: 176 + atmosphere.boss * 24,
      radiusY: 62 + atmosphere.boss * 12,
      fill: atmosphere.horizonGlow,
      alpha: 0.14 + atmosphere.boss * 0.16,
      blendMode: 'screen',
    });
    this.painter.ellipse({
      kind: 'danger-vignette',
      layer: 'background',
      x: 195,
      y: 422,
      radiusX: 214,
      radiusY: 438,
      stroke: atmosphere.boss ? '#211d51' : '#17344c',
      lineWidth: 54,
      alpha: atmosphere.vignette + pulse,
      blendMode: 'multiply',
    });
  }

  private drawBackgroundParticles(input: BattleRenderInput): void {
    const count = input.renderBudget.backgroundParticles;
    for (let index = 0; index < count; index += 1) {
      const timeOffset = input.reducedMotion ? 0 : input.timeMs * 0.018;
      const y = 844 - ((index * 137 + timeOffset) % 920);
      const x = (
        index * 83
        + Math.sin((input.timeMs + index * 211) / 1300) * 12
      ) % 390;
      const radius = 1.4 + index % 4 * 0.55;
      this.painter.ellipse({
        kind: 'background-particle',
        layer: 'water-lanes',
        x: x < 0 ? x + 390 : x,
        y,
        radiusX: radius,
        radiusY: radius * 1.35,
        fill: 'rgba(228, 255, 255, 0.72)',
        alpha: 0.22 + index % 5 * 0.07,
      });
    }
  }

  private drawBackground(input: BattleRenderInput): void {
    const poses = createHandDrawnParallax({
      timeMs: input.timeMs,
      laneOffset: input.trainMotion.laneOffset,
      backgroundLayers: input.renderBudget.backgroundLayers,
      reducedMotion: input.reducedMotion,
    });
    for (const pose of poses) {
      const source = input.assets.get(pose.artId);
      if (!source) continue;
      const y = 422 + pose.offsetY;
      const repeatPositions = pose.repeatY ? [y, y - 860] : [y];
      for (const repeatY of repeatPositions) {
        this.painter.image({
          kind: `background-${pose.id}`,
          layer: 'background',
          source,
          x: 195 + pose.offsetX,
          y: repeatY,
          width: 398,
          height: 860,
          anchorX: 0.5,
          anchorY: 0.5,
          fallbackColor: '#d98a62',
          alpha: pose.alpha,
        });
      }
    }
  }

  private drawWaterLanes(
    input: BattleRenderInput,
    motion: TrainMotionFrameView,
  ): void {
    for (let lane = 0; lane < 3; lane += 1) {
      const bottomX = [92, 195, 298][lane] ?? 195;
      const topX = [154, 195, 236][lane] ?? 195;
      this.painter.line({
        kind: 'water-lane',
        layer: 'water-lanes',
        points: [
          { x: topX, y: 96 },
          { x: (topX + bottomX) / 2, y: 390 },
          { x: bottomX, y: 704 },
        ],
        stroke: 'rgba(229, 255, 255, 0.34)',
        lineWidth: lane === 1 ? 19 : 14,
        curve: true,
      });
    }
    this.drawTravelMarkers(input, motion);
    this.drawTrainWake(input, motion);
  }

  private drawTravelMarkers(
    input: BattleRenderInput,
    motion: TrainMotionFrameView,
  ): void {
    const count = input.renderBudget.travelMarkers;
    const markersPerLane = Math.max(1, Math.ceil(count / 3));
    for (let index = 0; index < count; index += 1) {
      const lane = index % 3;
      const laneIndex = Math.floor(index / 3);
      const progress = wrapUnit(
        motion.laneOffset / 610 + laneIndex / markersPerLane,
      );
      const topX = [154, 195, 236][lane] ?? 195;
      const bottomX = [92, 195, 298][lane] ?? 195;
      const x = topX + (bottomX - topX) * progress;
      const y = 106 + progress * 598;
      const width = 7 + progress * 22;
      this.painter.line({
        kind: 'travel-marker',
        layer: 'water-lanes',
        points: [
          { x: x - width / 2, y },
          { x: x + width / 2, y },
        ],
        stroke: 'rgba(229, 255, 255, 0.9)',
        lineWidth: 1.2 + progress * 2.8,
        alpha: (0.2 + progress * 0.6) * motion.detailAlpha,
      });
    }
  }

  private drawTrainWake(
    input: BattleRenderInput,
    motion: TrainMotionFrameView,
  ): void {
    const pairCount = Math.max(
      1,
      Math.ceil(input.renderBudget.trainWakeSegments / 2),
    );
    for (
      let index = 0;
      index < input.renderBudget.trainWakeSegments;
      index += 1
    ) {
      const side = index % 2 === 0 ? -1 : 1;
      const pair = Math.floor(index / 2);
      const progress = (pair + 1) / (pairCount + 1);
      const innerX = 195 + side * (72 + progress * 18);
      const outerX = innerX + side * (24 + progress * 18);
      const startY = 812 + progress * 22;
      const endY = startY + 12 + progress * 14;
      this.painter.line({
        kind: 'train-wake',
        layer: 'water-lanes',
        points: [
          {
            x: posedX(innerX, startY, motion),
            y: posedY(innerX, startY, motion),
          },
          {
            x: posedX(outerX, endY, motion),
            y: posedY(outerX, endY, motion),
          },
        ],
        stroke: 'rgba(221, 255, 252, 0.88)',
        lineWidth: 2.4 + progress * 2.6,
        alpha: clamp01(
          (0.3 + motion.wakeStrength * 0.38)
            * (1 - progress * 0.28)
            * motion.detailAlpha,
        ),
        curve: true,
      });
    }
  }

  private drawLoot(input: BattleRenderInput): void {
    for (const loot of input.frame.loot) {
      if (loot.collected) continue;
      const bob = input.reducedMotion
        ? 0
        : Math.sin((input.timeMs + loot.id * 71) / 180) * 2;
      this.painter.ellipse({
        kind: 'loot',
        layer: 'loot-behind',
        x: loot.x,
        y: loot.y + bob,
        radiusX: loot.kind === 'experience' ? 7 : 9,
        radiusY: loot.kind === 'experience' ? 9 : 7,
        rotation: input.timeMs / 500,
        fill: loot.kind === 'experience' ? '#d7fff8' : '#ffcb78',
        stroke: '#ffffff',
        lineWidth: 1.5,
        alpha: 0.94,
      });
    }
  }

  private drawEnemies(input: BattleRenderInput): void {
    const enemies = input.frame.enemies
      .filter((enemy) => enemy.alive)
      .sort((left, right) => left.y - right.y || left.id - right.id);
    for (const enemy of enemies) this.drawEnemy(input, enemy);
  }

  private drawEnemy(
    input: BattleRenderInput,
    enemy: EnemyState,
  ): void {
    const size = ENEMY_GEOMETRY[enemy.kind];
    const artId = ENEMY_ART[enemy.kind];
    const source = input.assets.get(artId);
    const bob = input.reducedMotion || enemy.kind === 'deep-echo-boss'
      ? 0
      : Math.sin((input.timeMs + enemy.id * 97) / 260) * 2.5;
    const y = enemy.y + bob;
    const atmosphere = getBattleAtmosphere(input.frame);
    this.painter.ellipse({
      kind: 'enemy-contact-shadow',
      layer: 'enemies',
      x: enemy.x,
      y: y + size.height * 0.38,
      radiusX: size.width * 0.32,
      radiusY: Math.max(3, size.height * 0.08),
      fill: atmosphere.boss
        ? 'rgba(26, 26, 70, 0.42)'
        : 'rgba(18, 65, 86, 0.3)',
      alpha: 0.72 + atmosphere.danger * 0.2,
    });

    if (source) {
      this.painter.image({
        kind: 'enemy',
        layer: 'enemies',
        source,
        enemyKind: enemy.kind,
        x: enemy.x,
        y: y + size.height * 0.45,
        width: size.width,
        height: size.height,
        anchorX: 0.5,
        anchorY: 1,
        fallbackColor: size.fallback,
      });
    } else {
      this.painter.ellipse({
        kind: 'fallback-silhouette',
        layer: 'enemies',
        enemyKind: enemy.kind,
        x: enemy.x,
        y,
        radiusX: size.width * 0.42,
        radiusY: size.height * 0.4,
        fill: size.fallback,
        stroke: '#dffeff',
        lineWidth: 2,
      });
      this.drawFallbackEyes(enemy.x, y, size.width);
    }

    this.drawEnemyBehaviour(enemy, y, size.width, size.height);

    const barWidth = size.width * 0.72;
    const hpRatio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    const infoY = y - size.height * 0.52;
    this.painter.text({
      kind: 'enemy-name',
      layer: 'enemies',
      text: ENEMY_LABELS[enemy.kind],
      x: enemy.x,
      y: infoY,
      fill: '#17344c',
      font: enemy.kind === 'deep-echo-boss' ? '700 15px sans-serif' : '700 12px sans-serif',
      align: 'center',
      baseline: 'top',
      stroke: '#fff4df',
      lineWidth: 2,
    });
    this.painter.line({
      kind: 'enemy-hp-track',
      layer: 'enemies',
      points: [
        { x: enemy.x - barWidth / 2, y: infoY + 13 },
        { x: enemy.x + barWidth / 2, y: infoY + 13 },
      ],
      stroke: 'rgba(14, 49, 74, 0.42)',
      lineWidth: enemy.kind === 'deep-echo-boss' ? 6 : 4,
    });
    this.painter.line({
      kind: 'enemy-hp',
      layer: 'enemies',
      points: [
        { x: enemy.x - barWidth / 2, y: infoY + 13 },
        {
          x: enemy.x - barWidth / 2 + barWidth * hpRatio,
          y: infoY + 13,
        },
      ],
      stroke: enemy.kind === 'storm-ray-elite'
        ? '#9b8cff'
        : '#ff7f7a',
      lineWidth: enemy.kind === 'deep-echo-boss' ? 6 : 4,
    });
    if (enemy.shield > 0) {
      this.painter.ellipse({
        kind: 'enemy-shield',
        layer: 'enemies',
        x: enemy.x,
        y,
        radiusX: size.width * 0.54,
        radiusY: size.height * 0.51,
        stroke: 'rgba(180, 248, 255, 0.84)',
        lineWidth: 2,
      });
    }
    if (enemy.defenceBroken) {
      this.painter.line({
        kind: 'armour-break',
        layer: 'enemies',
        points: [
          { x: enemy.x - 15, y: y - 9 },
          { x: enemy.x - 3, y: y + 2 },
          { x: enemy.x + 8, y: y - 5 },
          { x: enemy.x + 17, y: y + 8 },
        ],
        stroke: '#fff4df',
        lineWidth: 2.5,
      });
    }
  }

  private drawEnemyBehaviour(
    enemy: EnemyState,
    y: number,
    width: number,
    height: number,
  ): void {
    if (enemy.kind === 'tide-shell-hatchling') {
      for (const direction of [-1, 1] as const) {
        this.painter.line({
          kind: 'hatchling-claw',
          layer: 'enemies',
          points: [
            { x: enemy.x + direction * width * 0.22, y: y + 2 },
            { x: enemy.x + direction * width * 0.5, y: y - 8 },
            { x: enemy.x + direction * width * 0.42, y: y + 8 },
          ],
          stroke: '#ffcf8a',
          lineWidth: 4,
          alpha: 0.96,
        });
      }
    }
    if (enemy.kind === 'lantern-ray') {
      this.painter.ellipse({
        kind: 'lantern-core',
        layer: 'enemies',
        x: enemy.x,
        y: y + height * 0.05,
        radiusX: width * 0.16,
        radiusY: height * 0.18,
        fill: '#ffe184',
        stroke: '#fff7cc',
        lineWidth: 2,
        alpha: 0.95,
      });
      if (enemy.behaviour?.phase === 'lantern-charge') {
        this.painter.ellipse({
          kind: 'lantern-warning',
          layer: 'front-effects',
          x: enemy.x,
          y,
          radiusX: width * 0.58,
          radiusY: height * 0.58,
          stroke: '#ff725f',
          lineWidth: 4,
          alpha: 0.9,
        });
      }
    }
    if (enemy.kind === 'tide-parasite-snail') {
      this.painter.ellipse({
        kind: 'snail-spiral',
        layer: 'enemies',
        x: enemy.x,
        y: y - height * 0.02,
        radiusX: width * 0.24,
        radiusY: width * 0.24,
        stroke: '#d9ffb0',
        lineWidth: 4,
        alpha: 0.95,
      });
      this.painter.ellipse({
        kind: 'snail-spiral-core',
        layer: 'enemies',
        x: enemy.x + 3,
        y: y - 2,
        radiusX: width * 0.1,
        radiusY: width * 0.1,
        stroke: '#5b9b72',
        lineWidth: 3,
      });
    }
    if (
      enemy.kind === 'storm-ray-elite'
      && enemy.behaviour?.phase === 'elite-telegraph'
    ) {
      this.painter.line({
        kind: 'elite-lane-telegraph',
        layer: 'front-effects',
        points: [
          { x: laneX(enemy.behaviour.targetLane), y: 124 },
          { x: laneX(enemy.behaviour.targetLane), y: 686 },
        ],
        stroke: 'rgba(255, 111, 91, 0.72)',
        lineWidth: 22,
        alpha: 0.82,
      });
    }
    if (enemy.kind === 'storm-ray-elite' && enemy.behaviour?.phase === 'elite-exposed') {
      this.painter.ellipse({
        kind: 'elite-exposed-mark',
        layer: 'front-effects',
        x: enemy.x,
        y,
        radiusX: width * 0.58,
        radiusY: height * 0.58,
        stroke: '#ffe28a',
        lineWidth: 5,
      });
    }
    if (
      enemy.kind === 'deep-echo-boss'
      && (enemy.behaviour?.phase === 'boss-tide' || enemy.behaviour?.phase === 'boss-enraged')
    ) {
      const safeLane = enemy.behaviour.safeLane;
      for (const lane of [0, 1, 2] as const) {
        this.painter.line({
          kind: lane === safeLane ? 'boss-safe-lane' : 'boss-danger-lane',
          layer: 'front-effects',
          points: [
            { x: laneX(lane), y: 124 },
            { x: laneX(lane), y: 686 },
          ],
          stroke: lane === safeLane
            ? 'rgba(111, 255, 212, 0.72)'
            : 'rgba(255, 93, 78, 0.64)',
          lineWidth: lane === safeLane ? 9 : 18,
          alpha: 0.78,
        });
      }
    }
    const weakPoint = getBossWeakPoint(enemy);
    if (weakPoint) {
      this.painter.ellipse({
        kind: 'boss-weakpoint',
        layer: 'front-effects',
        x: weakPoint.x,
        y: weakPoint.y + (y - enemy.y),
        radiusX: weakPoint.radius,
        radiusY: weakPoint.radius,
        fill: 'rgba(255, 247, 185, 0.34)',
        stroke: '#fff2a2',
        lineWidth: 5,
      });
    }
  }

  private drawFallbackEyes(x: number, y: number, width: number): void {
    for (const direction of [-1, 1]) {
      this.painter.ellipse({
        kind: 'fallback-eye',
        layer: 'enemies',
        x: x + direction * width * 0.12,
        y: y - width * 0.04,
        radiusX: Math.max(2, width * 0.035),
        radiusY: Math.max(2.5, width * 0.045),
        fill: '#efffff',
      });
    }
  }

  private drawProjectiles(input: BattleRenderInput): void {
    let visibleTrails = 0;
    for (const projectile of input.frame.projectiles) {
      if (!projectile.active) continue;
      const color = projectile.source === 'volley'
        ? '#fff0ad'
        : projectile.source === 'chain'
          ? '#9aebff'
          : '#efffff';
      if (
        visibleTrails < input.renderBudget.visibleProjectileTrails
      ) {
        const velocityLength = Math.hypot(
          projectile.velocityX,
          projectile.velocityY,
        );
        const tail = projectile.trajectory === 'manual' && velocityLength > 0
          ? {
            x: projectile.x - projectile.velocityX / velocityLength * 14,
            y: projectile.y - projectile.velocityY / velocityLength * 14,
          }
          : { x: projectile.x, y: projectile.y + 14 };
        this.painter.line({
          kind: 'projectile-trail',
          layer: 'projectiles',
          points: [
            tail,
            { x: projectile.x, y: projectile.y },
          ],
          stroke: color,
          lineWidth: projectile.critical ? 5 : 3,
          alpha: 0.62,
        });
        visibleTrails += 1;
      }
      this.painter.ellipse({
        kind: 'projectile',
        layer: 'projectiles',
        x: projectile.x,
        y: projectile.y,
        radiusX: projectile.critical ? 6 : 4,
        radiusY: projectile.critical ? 9 : 7,
        fill: color,
        stroke: '#ffffff',
        lineWidth: 1,
      });
    }
  }

  private drawTrain(
    input: BattleRenderInput,
    motion: TrainMotionFrameView,
  ): void {
    const train = input.assets.get('train');
    let target: EnemyState | null = null;
    for (let index = 0; index < input.frame.enemies.length; index += 1) {
      const enemy = input.frame.enemies[index];
      if (!enemy || !enemy.alive) continue;
      if (
        !target
        || enemy.y > target.y
        || (enemy.y === target.y && enemy.id < target.id)
      ) {
        target = enemy;
      }
    }
    const aim = input.frame.mainCannonAim;
    const angle = aim
      ? Math.atan2(aim.y - 692, aim.x - 195)
      : target
        ? Math.atan2(target.y - 692, target.x - 195)
      : -Math.PI / 2;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const cannonBaseX = 195 - directionX * motion.cannonRecoil;
    const cannonBaseY = 699 - directionY * motion.cannonRecoil;
    const cannonEndX = 195 + directionX * 38
      - directionX * motion.cannonRecoil;
    const cannonEndY = 699 + directionY * 38
      - directionY * motion.cannonRecoil;
    this.painter.line({
      kind: 'main-cannon',
      layer: 'train',
      points: [
        {
          x: posedX(cannonBaseX, cannonBaseY, motion),
          y: posedY(cannonBaseX, cannonBaseY, motion),
        },
        {
          x: posedX(cannonEndX, cannonEndY, motion),
          y: posedY(cannonEndX, cannonEndY, motion),
        },
      ],
      stroke: '#dffbff',
      lineWidth: 12,
    });
    if (train) {
      this.painter.image({
        kind: 'train',
        layer: 'train',
        source: train,
        x: posedX(195, 842, motion),
        y: posedY(195, 842, motion),
        width: 320 * motion.scale,
        height: 178 * motion.scale,
        anchorX: 0.5,
        anchorY: 1,
        rotation: motion.rotation,
        fallbackColor: '#69bac9',
      });
    } else {
      this.painter.ellipse({
        kind: 'train',
        layer: 'train',
        x: posedX(195, 782, motion),
        y: posedY(195, 782, motion),
        radiusX: 150 * motion.scale,
        radiusY: 58 * motion.scale,
        rotation: motion.rotation,
        fill: '#69bac9',
        stroke: '#efffff',
        lineWidth: 3,
      });
    }
    if (input.frame.shield > 0) {
      this.painter.ellipse({
        kind: 'train-shield',
        layer: 'train',
        x: posedX(195, 758, motion),
        y: posedY(195, 758, motion),
        radiusX: 164 * motion.scale,
        radiusY: 92 * motion.scale,
        rotation: motion.rotation,
        fill: 'rgba(132, 255, 226, 0.1)',
        stroke: 'rgba(159, 255, 234, 0.82)',
        lineWidth: 3,
        alpha: motion.detailAlpha,
      });
    }
    this.drawTrainPower(input, motion);
  }

  private drawAimReticle(input: BattleRenderInput): void {
    const aim = input.frame.mainCannonAim;
    if (!aim) return;
    const pulse = input.reducedMotion
      ? 1
      : 0.9 + Math.sin(input.timeMs / 180) * 0.1;
    const outerRadius = 12 * pulse;
    const innerRadius = 7 * pulse;
    this.painter.ellipse({
      kind: 'aim-reticle-outer',
      layer: 'front-effects',
      x: aim.x,
      y: aim.y,
      radiusX: outerRadius,
      radiusY: outerRadius * 0.88,
      stroke: '#ef785f',
      lineWidth: 2.6,
      alpha: 0.94,
    });
    this.painter.ellipse({
      kind: 'aim-reticle-inner',
      layer: 'front-effects',
      x: aim.x,
      y: aim.y,
      radiusX: innerRadius,
      radiusY: innerRadius * 0.86,
      stroke: '#fff2d2',
      lineWidth: 1.6,
      alpha: 0.92,
    });
    const tickOffset = outerRadius + 3;
    const tickLength = 5 * pulse;
    const ticks = [
      [{ x: aim.x - tickOffset - tickLength, y: aim.y - 1 }, { x: aim.x - tickOffset, y: aim.y + 1 }],
      [{ x: aim.x + tickOffset, y: aim.y - 1 }, { x: aim.x + tickOffset + tickLength, y: aim.y + 1 }],
      [{ x: aim.x - 1, y: aim.y - tickOffset - tickLength }, { x: aim.x + 1, y: aim.y - tickOffset }],
      [{ x: aim.x - 1, y: aim.y + tickOffset }, { x: aim.x + 1, y: aim.y + tickOffset + tickLength }],
    ] as const;
    for (const points of ticks) {
      this.painter.line({
        kind: 'aim-reticle-tick',
        layer: 'front-effects',
        points,
        stroke: '#fff2d2',
        lineWidth: 2,
        lineCap: 'round',
        alpha: 0.9,
      });
    }
  }

  private drawTrainPower(
    input: BattleRenderInput,
    motion: TrainMotionFrameView,
  ): void {
    const powerAlpha = motion.engineGlow <= 0
      ? 0
      : clamp01(
        (0.34 + motion.engineGlow * 0.66)
          * (1 - motion.lowPowerPulse * 0.46)
          * motion.detailAlpha,
      );
    this.painter.ellipse({
      kind: 'train-engine-glow',
      layer: 'train',
      x: posedX(195, 806, motion),
      y: posedY(195, 806, motion),
      radiusX: 22 + motion.engineGlow * 10,
      radiusY: 8 + motion.engineGlow * 4,
      rotation: motion.rotation,
      fill: input.frame.shield > 0
        ? 'rgba(132, 255, 226, 0.72)'
        : 'rgba(255, 224, 139, 0.68)',
      alpha: powerAlpha,
      blendMode: 'screen',
    });
    if (input.renderBudget.travelMarkers < 15) return;

    const flow = wrapUnit(motion.windowGlowPhase);
    const startX = 139 + flow * 92;
    const endX = Math.min(251, startX + 28);
    this.painter.line({
      kind: 'train-window-flow',
      layer: 'train',
      points: [
        {
          x: posedX(startX, 756, motion),
          y: posedY(startX, 756, motion),
        },
        {
          x: posedX(endX, 756, motion),
          y: posedY(endX, 756, motion),
        },
      ],
      stroke: input.frame.shield > 0 ? '#9fffea' : '#fff0ad',
      lineWidth: 3,
      alpha: clamp01(powerAlpha * (0.66 + flow * 0.24)),
      blendMode: 'screen',
    });
  }

  private drawCrew(
    input: BattleRenderInput,
    motion: TrainMotionFrameView,
  ): void {
    this.drawCaptain(input, motion);
    const recoil = input.reducedMotion
      ? 0
      : Math.max(0, 1 - input.timeMs % 400 / 100) * 4;
    this.drawWholeActor(
      input.assets.get('otter'),
      'otter',
      132 - recoil,
      760,
      62,
      72,
      '#7dc8cc',
      motion,
    );
    const medicRise = input.frame.shield > 0 ? -12 : 0;
    const medicFloat = input.reducedMotion
      ? 0
      : Math.sin(input.timeMs / 430) * 3;
    this.drawWholeActor(
      input.assets.get('jellyMedic'),
      'jelly-medic',
      258,
      754 + medicRise + medicFloat,
      58,
      68,
      '#9ddff0',
      motion,
    );
    if (input.frame.shield > 0) {
      this.painter.ellipse({
        kind: 'sprite-part',
        layer: 'captain-and-companions',
        actor: 'jelly-medic',
        partId: 'barrier-ring',
        x: posedX(258, 724 + medicRise, motion),
        y: posedY(258, 724 + medicRise, motion),
        radiusX: 34,
        radiusY: 16,
        rotation: motion.rotation,
        stroke: '#ccffff',
        lineWidth: 2,
        alpha: 0.72,
      });
    }
  }

  private drawCaptain(
    input: BattleRenderInput,
    motion: TrainMotionFrameView,
  ): void {
    const source = input.assets.get(input.captainArtId);
    if (!source) {
      this.painter.ellipse({
        kind: 'captain-fallback',
        layer: 'captain-and-companions',
        actor: 'captain',
        x: posedX(195, 720, motion),
        y: posedY(195, 720, motion),
        radiusX: 26,
        radiusY: 42,
        rotation: motion.rotation,
        fill: '#69c8d4',
        stroke: '#ffffff',
        lineWidth: 2,
      });
      return;
    }
    const action = input.frame.shieldRemainingMs > 0 ? 'cast' : 'idle';
    const parts = captainRig.pose(input.timeMs, {
      action,
      hitPulse: 0,
    });
    for (const part of parts) {
      this.drawCaptainPart(source, part, motion);
    }
  }

  private drawCaptainPart(
    source: CanvasImageSource,
    part: SpritePartPose,
    motion: TrainMotionFrameView,
  ): void {
    const x = 195 + part.offsetX;
    const y = 758 + part.offsetY;
    if (part.primitive === 'image' && part.sourceRect) {
      this.painter.image({
        kind: 'sprite-part',
        layer: 'captain-and-companions',
        actor: 'captain',
        partId: part.id,
        source,
        sourceRect: part.sourceRect,
        x: posedX(x, y, motion),
        y: posedY(x, y, motion),
        width: 74 * part.widthScale,
        height: 94 * part.heightScale,
        anchorX: part.anchorX,
        anchorY: part.anchorY,
        rotation: part.rotation + motion.rotation,
        alpha: part.alpha,
        fallbackColor: '#69c8d4',
      });
      return;
    }
    if (part.primitive === 'scarf') {
      this.painter.line({
        kind: 'sprite-part',
        layer: 'captain-and-companions',
        actor: 'captain',
        partId: part.id,
        points: [
          {
            x: posedX(x, y, motion),
            y: posedY(x, y, motion),
          },
          {
            x: posedX(x - 16, y + Math.sin(part.rotation) * 16, motion),
            y: posedY(x - 16, y + Math.sin(part.rotation) * 16, motion),
          },
          {
            x: posedX(x - 31, y + 8 + part.rotation * 12, motion),
            y: posedY(x - 31, y + 8 + part.rotation * 12, motion),
          },
        ],
        stroke: '#ff9a85',
        lineWidth: 6,
        curve: true,
        alpha: part.alpha,
      });
      return;
    }
    this.painter.ellipse({
      kind: 'sprite-part',
      layer: 'captain-and-companions',
      actor: 'captain',
      partId: part.id,
      x: posedX(x, y, motion),
      y: posedY(x, y, motion),
      radiusX: 32,
      radiusY: 18,
      rotation: motion.rotation,
      fill: 'rgba(170, 255, 245, 0.35)',
      stroke: 'rgba(225, 255, 255, 0.65)',
      lineWidth: 2,
      alpha: part.alpha,
    });
  }

  private drawWholeActor(
    source: CanvasImageSource | null,
    actor: 'otter' | 'jelly-medic',
    x: number,
    y: number,
    width: number,
    height: number,
    fallbackColor: string,
    motion: TrainMotionFrameView,
  ): void {
    if (source) {
      this.painter.image({
        kind: 'sprite-part',
        layer: 'captain-and-companions',
        actor,
        partId: 'body',
        source,
        x: posedX(x, y, motion),
        y: posedY(x, y, motion),
        width,
        height,
        anchorX: 0.5,
        anchorY: 1,
        rotation: motion.rotation,
        fallbackColor,
      });
      return;
    }
    this.painter.ellipse({
      kind: 'sprite-part',
      layer: 'captain-and-companions',
      actor,
      partId: 'body',
      x: posedX(x, y - height / 2, motion),
      y: posedY(x, y - height / 2, motion),
      radiusX: width * 0.42,
      radiusY: height * 0.44,
      rotation: motion.rotation,
      fill: fallbackColor,
      stroke: '#ffffff',
      lineWidth: 2,
    });
  }

  private drawFrontEffects(
    input: BattleRenderInput,
    motion: TrainMotionFrameView,
  ): void {
    const corePulse = input.reducedMotion
      ? 1
      : 1 + Math.sin(input.timeMs / 190) * 0.12;
    this.painter.ellipse({
      kind: 'train-core',
      layer: 'front-effects',
      x: posedX(195, 782, motion),
      y: posedY(195, 782, motion),
      radiusX: 15 * corePulse,
      radiusY: 9 * corePulse,
      rotation: motion.rotation,
      fill: input.frame.energy >= 100
        ? 'rgba(255, 239, 151, 0.68)'
        : 'rgba(151, 255, 241, 0.48)',
      alpha: motion.engineGlow <= 0
        ? 0
        : clamp01(
          (0.48 + motion.engineGlow * 0.52)
            * (1 - motion.lowPowerPulse * 0.42)
            * motion.detailAlpha,
        ),
      blendMode: 'screen',
    });
  }

  private drawEffectParticles(
    input: BattleRenderInput,
    layer: EffectParticleView['layer'],
  ): void {
    for (const particle of input.effects.particles) {
      if (particle.layer !== layer) continue;
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
      if (particle.kind === 'brush-smear') {
        this.painter.ellipse({
          kind: 'effect-brush-smear',
          layer,
          x: particle.x,
          y: particle.y,
          radiusX: particle.size * 2.2,
          radiusY: particle.size * 0.42,
          rotation: particle.rotation,
          fill: particle.color,
          alpha: particle.alpha,
          blendMode: 'source-over',
        });
        continue;
      }
      if (particle.kind === 'ink-bubble') {
        this.painter.ellipse({
          kind: 'effect-ink-bubble',
          layer,
          x: particle.x,
          y: particle.y,
          radiusX: particle.size,
          radiusY: particle.size,
          fill: particle.color,
          stroke: '#17344c',
          lineWidth: 1.5,
          alpha: particle.alpha,
          blendMode: 'source-over',
        });
        continue;
      }
      const motifSize = particle.size * (0.9 + particle.progress * 0.2);
      if (particle.kind === 'split-chevron') {
        const upper = evolutionMotifPoint(particle, -1.4 * motifSize, -1.1 * motifSize);
        const vertex = evolutionMotifPoint(particle, 0.8 * motifSize, 0);
        const lower = evolutionMotifPoint(particle, -1.4 * motifSize, 1.1 * motifSize);
        for (const points of [[upper, vertex], [vertex, lower]]) {
          this.painter.line({
            kind: 'effect-split-chevron',
            layer,
            points,
            stroke: particle.color,
            lineWidth: particle.size * 0.34,
            lineCap: 'round',
            alpha: particle.alpha,
            blendMode: 'screen',
          });
        }
        continue;
      }
      if (particle.kind === 'returning-arc') {
        const arcProfile = [
          [-2.5, -0.05],
          [-1.7, -0.48],
          [-0.8, -0.66],
          [0.05, -0.48],
          [0.85, -0.12],
          [1.65, 0.18],
          [2.5, 0.02],
        ] as const;
        this.painter.line({
          kind: 'effect-returning-arc',
          layer,
          points: arcProfile.map(([x, y]) => (
            evolutionMotifPoint(particle, x * motifSize, y * motifSize)
          )),
          stroke: particle.color,
          lineWidth: particle.size * 0.3,
          lineCap: 'round',
          alpha: particle.alpha,
          blendMode: 'screen',
        });
        continue;
      }
      if (particle.kind === 'rainstorm-fin') {
        const origin = evolutionMotifPoint(particle, -0.6 * motifSize, 0.5 * motifSize);
        for (const endpointY of [-1.6, 0.15, 1.5]) {
          this.painter.line({
            kind: 'effect-rainstorm-fin',
            layer,
            points: [
              origin,
              evolutionMotifPoint(particle, 2.1 * motifSize, endpointY * motifSize),
            ],
            stroke: particle.color,
            lineWidth: particle.size * 0.28,
            lineCap: 'round',
            alpha: particle.alpha,
            blendMode: 'screen',
          });
        }
        continue;
      }
      if (particle.kind === 'bubble-fracture') {
        for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
          this.painter.line({
            kind: 'effect-bubble-fracture',
            layer,
            points: [
              evolutionMotifPoint(
                particle,
                Math.cos(angle) * motifSize * 0.65,
                Math.sin(angle) * motifSize * 0.65,
              ),
              evolutionMotifPoint(
                particle,
                Math.cos(angle) * motifSize * 2.25,
                Math.sin(angle) * motifSize * 2.25,
              ),
            ],
            stroke: particle.color,
            lineWidth: particle.size * 0.25,
            lineCap: 'round',
            alpha: particle.alpha,
            blendMode: 'screen',
          });
        }
        this.painter.ellipse({
          kind: 'effect-bubble-fracture',
          layer,
          x: particle.x,
          y: particle.y,
          radiusX: motifSize * 0.55,
          radiusY: motifSize * 0.55,
          rotation: particle.rotation,
          stroke: particle.color,
          lineWidth: particle.size * 0.24,
          alpha: particle.alpha,
          blendMode: 'screen',
        });
        continue;
      }
      if (particle.kind === 'overflow-droplet') {
        const outerCenter = evolutionMotifPoint(particle, -0.35 * motifSize, 0);
        const innerCenter = evolutionMotifPoint(particle, 0.45 * motifSize, -0.05 * motifSize);
        for (const [center, radiusX, radiusY] of [
          [outerCenter, motifSize * 2, motifSize * 1.25],
          [innerCenter, motifSize * 1.35, motifSize * 0.82],
        ] as const) {
          this.painter.ellipse({
            kind: 'effect-overflow-droplet',
            layer,
            x: center.x,
            y: center.y,
            radiusX,
            radiusY,
            rotation: particle.rotation,
            stroke: particle.color,
            lineWidth: particle.size * 0.24,
            alpha: particle.alpha,
            blendMode: 'screen',
          });
        }
        this.painter.line({
          kind: 'effect-overflow-droplet',
          layer,
          points: [
            evolutionMotifPoint(particle, 0, motifSize * 1.2),
            evolutionMotifPoint(particle, 0.25 * motifSize, motifSize * 2.15),
          ],
          stroke: particle.color,
          lineWidth: particle.size * 0.28,
          lineCap: 'round',
          alpha: particle.alpha,
          blendMode: 'screen',
        });
        continue;
      }
      if (particle.kind === 'emergency-beacon') {
        const diamond = [
          evolutionMotifPoint(particle, 0, -2.2 * motifSize),
          evolutionMotifPoint(particle, 1.65 * motifSize, 0),
          evolutionMotifPoint(particle, 0, 2.2 * motifSize),
          evolutionMotifPoint(particle, -1.65 * motifSize, 0),
          evolutionMotifPoint(particle, 0, -2.2 * motifSize),
        ];
        this.painter.line({
          kind: 'effect-emergency-beacon',
          layer,
          points: diamond,
          stroke: particle.color,
          lineWidth: particle.size * 0.3,
          lineCap: 'round',
          alpha: particle.alpha,
          blendMode: 'screen',
        });
        for (const direction of [-1, 1]) {
          this.painter.line({
            kind: 'effect-emergency-beacon',
            layer,
            points: [
              evolutionMotifPoint(particle, direction * 2.05 * motifSize, 0),
              evolutionMotifPoint(particle, direction * 2.8 * motifSize, 0),
            ],
            stroke: particle.color,
            lineWidth: particle.size * 0.26,
            lineCap: 'round',
            alpha: particle.alpha,
            blendMode: 'screen',
          });
        }
        continue;
      }
      if (particle.kind === 'undertow-eye') {
        for (const [radiusX, radiusY] of [
          [motifSize * 2.5, motifSize * 1.25],
          [motifSize * 1.15, motifSize * 0.62],
        ] as const) {
          this.painter.ellipse({
            kind: 'effect-undertow-eye',
            layer,
            x: particle.x,
            y: particle.y,
            radiusX,
            radiusY,
            rotation: particle.rotation,
            stroke: particle.color,
            lineWidth: particle.size * 0.24,
            alpha: particle.alpha,
            blendMode: 'screen',
          });
        }
        for (const angle of [
          Math.PI * 0.25,
          Math.PI * 0.75,
          Math.PI * 1.25,
          Math.PI * 1.75,
        ]) {
          this.painter.line({
            kind: 'effect-undertow-eye',
            layer,
            points: [
              evolutionMotifPoint(
                particle,
                Math.cos(angle) * motifSize * 1.8,
                Math.sin(angle) * motifSize,
              ),
              evolutionMotifPoint(
                particle,
                Math.cos(angle) * motifSize * 0.62,
                Math.sin(angle) * motifSize * 0.34,
              ),
            ],
            stroke: particle.color,
            lineWidth: particle.size * 0.22,
            lineCap: 'round',
            alpha: particle.alpha,
            blendMode: 'screen',
          });
        }
        continue;
      }
      if (particle.kind === 'energy-return') {
        const center = evolutionMotifPoint(particle, 0, motifSize * 0.3);
        const returnStart = evolutionMotifPoint(particle, 0, motifSize * 0.95);
        const returnAngle = Math.atan2(
          TRAIN_PIVOT_Y - returnStart.y,
          TRAIN_PIVOT_X - returnStart.x,
        );
        this.painter.ellipse({
          kind: 'effect-energy-return',
          layer,
          x: center.x,
          y: center.y,
          radiusX: motifSize * 0.85,
          radiusY: motifSize * 0.55,
          rotation: particle.rotation,
          stroke: particle.color,
          lineWidth: particle.size * 0.26,
          alpha: particle.alpha,
          blendMode: 'screen',
        });
        this.painter.line({
          kind: 'effect-energy-return',
          layer,
          points: [
            returnStart,
            {
              x: returnStart.x + Math.cos(returnAngle) * motifSize * 1.45,
              y: returnStart.y + Math.sin(returnAngle) * motifSize * 1.45,
            },
          ],
          stroke: particle.color,
          lineWidth: particle.size * 0.28,
          lineCap: 'round',
          alpha: particle.alpha,
          blendMode: 'screen',
        });
        continue;
      }
      if (particle.kind === 'rank-volley-trail' || particle.kind === 'coral-pierce') {
        const length = particle.kind === 'coral-pierce' ? particle.size * 5 : particle.size * 4;
        const angle = particle.rotation - Math.PI / 2;
        this.painter.line({
          kind: `effect-${particle.kind}`,
          layer,
          points: [{ x: particle.x - Math.cos(angle) * length * 0.5, y: particle.y - Math.sin(angle) * length * 0.5 }, { x: particle.x + Math.cos(angle) * length * 0.5, y: particle.y + Math.sin(angle) * length * 0.5 }],
          stroke: particle.color,
          lineWidth: particle.kind === 'coral-pierce' ? particle.size * 0.52 : particle.size * 0.38,
          lineCap: 'round',
          alpha: particle.alpha,
          blendMode: 'screen',
        });
        continue;
      }
      if (particle.kind === 'extreme-radial-stroke' || particle.kind === 'reflection' || particle.kind === 'extreme-pull') {
        const angle = particle.rotation;
        const outer = particle.kind === 'extreme-pull' ? particle.size * 3 : particle.size * 2.8;
        const inner = particle.kind === 'extreme-pull' ? particle.size * 0.55 : particle.size * 1.1;
        this.painter.line({
          kind: `effect-${particle.kind}`,
          layer,
          points: [{ x: particle.x + Math.cos(angle) * outer, y: particle.y + Math.sin(angle) * outer }, { x: particle.x + Math.cos(angle) * inner, y: particle.y + Math.sin(angle) * inner }],
          stroke: particle.color,
          lineWidth: particle.kind === 'reflection' ? particle.size * 0.48 : particle.size * 0.34,
          lineCap: particle.kind === 'reflection' ? 'square' : 'round',
          alpha: particle.alpha,
          blendMode: 'screen',
        });
        continue;
      }
      if (particle.kind === 'extreme-vortex' || particle.kind === 'second-crest') {
        const radius = particle.size * (particle.kind === 'extreme-vortex' ? 2.4 : 2.8);
        const bend = particle.kind === 'extreme-vortex' ? radius * 0.55 : radius * 0.3;
        const points = particle.kind === 'second-crest'
          ? [{ x: particle.x - radius, y: particle.y + bend }, { x: particle.x - radius * 0.5, y: particle.y - bend }, { x: particle.x, y: particle.y + bend }, { x: particle.x + radius * 0.5, y: particle.y - bend }, { x: particle.x + radius, y: particle.y + bend }]
          : [{ x: particle.x - radius, y: particle.y + bend }, { x: particle.x, y: particle.y - bend }, { x: particle.x + radius, y: particle.y + bend }];
        this.painter.line({
          kind: `effect-${particle.kind}`,
          layer,
          points,
          stroke: particle.color,
          lineWidth: particle.size * 0.32,
          curve: true,
          lineCap: 'round',
          alpha: particle.alpha,
          blendMode: 'screen',
        });
        continue;
      }
      if (particle.kind === 'critical-shard' || particle.kind === 'armour-spark') {
        const angle = particle.rotation;
        const length = particle.size * (particle.kind === 'critical-shard' ? 3.1 : 2.2);
        this.painter.line({
          kind: `effect-${particle.kind}`,
          layer,
          points: [
            { x: particle.x - Math.cos(angle) * length * 0.25, y: particle.y - Math.sin(angle) * length * 0.25 },
            { x: particle.x + Math.cos(angle) * length, y: particle.y + Math.sin(angle) * length },
          ],
          stroke: particle.color,
          lineWidth: particle.kind === 'critical-shard' ? 3.6 : 2.8,
          lineCap: 'round',
          alpha: particle.alpha,
          blendMode: 'screen',
        });
        continue;
      }
      if (particle.kind === 'weakpoint-flare') {
        const radius = particle.size * (1.8 - particle.progress * 0.5);
        for (const angle of [particle.rotation, particle.rotation + Math.PI / 2]) {
          this.painter.line({
            kind: 'effect-weakpoint-flare',
            layer,
            points: [
              { x: particle.x - Math.cos(angle) * radius, y: particle.y - Math.sin(angle) * radius },
              { x: particle.x + Math.cos(angle) * radius, y: particle.y + Math.sin(angle) * radius },
            ],
            stroke: particle.color,
            lineWidth: 3,
            lineCap: 'round',
            alpha: particle.alpha,
            blendMode: 'screen',
          });
        }
        continue;
      }
      const stretched = (
        particle.kind === 'armour-shard'
        || particle.kind === 'defeat-shard'
      );
      this.painter.ellipse({
        kind: `effect-${particle.kind}`,
        layer,
        x: particle.x,
        y: particle.y,
        radiusX: stretched ? particle.size * 1.6 : particle.size,
        radiusY: stretched ? particle.size * 0.55 : particle.size,
        rotation: particle.rotation,
        fill: particle.color,
        stroke: particle.kind === 'warning'
          ? 'rgba(255, 255, 255, 0.8)'
          : undefined,
        lineWidth: particle.kind === 'warning' ? 1 : undefined,
        alpha: particle.alpha,
        blendMode: particle.kind === 'skill'
          || particle.kind === 'muzzle'
          ? 'screen'
          : 'source-over',
      });
    }
  }

  private drawImpactRings(input: BattleRenderInput): void {
    for (const ring of input.effects.rings) {
      this.painter.ellipse({
        kind: ring.kind ?? 'impact-ring',
        layer: 'front-effects',
        x: ring.x,
        y: ring.y,
        radiusX: ring.radius,
        radiusY: ring.radius * 0.72,
        stroke: ring.color,
        lineWidth: 2.5,
        alpha: ring.alpha,
        blendMode: 'source-over',
      });
      if (ring.secondaryColor) {
        this.painter.ellipse({
          kind: ring.kind && ring.kind !== 'impact-ring'
            ? `${ring.kind}-secondary`
            : 'impact-ring-secondary',
          layer: 'front-effects',
          x: ring.x,
          y: ring.y,
          radiusX: ring.radius * 0.9,
          radiusY: ring.radius * 0.65,
          stroke: ring.secondaryColor,
          lineWidth: 1.5,
          alpha: ring.alpha,
          blendMode: 'source-over',
        });
      }
    }
  }

  private drawDamageNumbers(input: BattleRenderInput): void {
    for (const number of input.effects.damageNumbers) {
      this.painter.text({
        kind: 'damage-number',
        layer: 'damage-numbers',
        text: number.critical ? `暴击 ${number.value}` : `${number.value}`,
        x: number.x,
        y: number.y,
        fill: number.critical ? '#fff0a6' : '#efffff',
        stroke: 'rgba(22, 65, 94, 0.78)',
        lineWidth: number.critical ? 4 : 3,
        font: number.critical
          ? '800 18px system-ui, sans-serif'
          : '700 14px system-ui, sans-serif',
        alpha: number.alpha,
      });
    }
  }

  private drawCinematicOverlay(input: BattleRenderInput): void {
    const bossProgress = input.frame.status === 'boss-intro'
      ? Math.min(1, input.frame.phaseElapsedMs / 6000)
      : 0;
    const darken = Math.max(
      input.effects.cinematic.darken,
      Math.min(0.48, bossProgress * 0.8),
    );
    if (darken > 0) {
      this.painter.ellipse({
        kind: 'boss-intro-dim',
        layer: 'cinematic-overlay',
        x: 195,
        y: 422,
        radiusX: 310,
        radiusY: 620,
        fill: 'rgba(19, 39, 82, 0.82)',
        alpha: darken,
      });
    }
    const title = input.effects.cinematic.title
      ?? (
        input.frame.status === 'boss-intro'
          ? '深海回响正在靠近'
          : null
      );
    if (title) {
      this.painter.text({
        kind: 'boss-intro-title',
        layer: 'cinematic-overlay',
        text: title,
        x: 195,
        y: 158,
        fill: '#efffff',
        stroke: 'rgba(25, 64, 101, 0.8)',
        lineWidth: 4,
        font: '700 24px system-ui, sans-serif',
      });
    }
    if (input.effects.cinematic.slowMotion > 0) {
      this.painter.ellipse({
        kind: 'victory-slow-motion',
        layer: 'cinematic-overlay',
        x: 195,
        y: 380,
        radiusX: 190,
        radiusY: 240,
        stroke: 'rgba(241, 255, 216, 0.85)',
        lineWidth: 5,
        alpha: input.effects.cinematic.slowMotion,
        blendMode: 'screen',
      });
    }
  }
}

const posedX = (
  x: number,
  y: number,
  motion: TrainMotionFrameView,
): number => TRAIN_PIVOT_X + motion.offsetX
  + (x - TRAIN_PIVOT_X) * Math.cos(motion.rotation)
  - (y - TRAIN_PIVOT_Y) * Math.sin(motion.rotation);

const posedY = (
  x: number,
  y: number,
  motion: TrainMotionFrameView,
): number => TRAIN_PIVOT_Y + motion.offsetY
  + (x - TRAIN_PIVOT_X) * Math.sin(motion.rotation)
  + (y - TRAIN_PIVOT_Y) * Math.cos(motion.rotation);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

function evolutionMotifPoint(
  particle: EffectParticleView,
  localX: number,
  localY: number,
): { readonly x: number; readonly y: number } {
  const cosine = Math.cos(particle.rotation);
  const sine = Math.sin(particle.rotation);
  return {
    x: particle.x + localX * cosine - localY * sine,
    y: particle.y + localX * sine + localY * cosine,
  };
}
