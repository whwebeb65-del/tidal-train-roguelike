import type { BattleArtId } from '../assets/BattleArtCatalog';
import type { BattleAssetSet } from './AssetLoader';
import type {
  BattlePainter,
  CameraPose,
  ImageDrawCommand,
} from './BattleDrawTypes';
import type { CanvasViewport } from './CanvasViewport';
import type {
  EffectFrameView,
  EffectParticleView,
} from './EffectSystem';
import {
  createCaptainRig,
  type SpritePartPose,
} from './LayeredSpriteRig';
import type {
  BattleFrameView,
  EnemyKind,
  EnemyState,
} from './BattleTypes';
import type { RenderBudget } from './QualityMonitor';
import type { TrainMotionFrameView } from './TrainMotionTypes';

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
  'storm-ray-elite': 'stormRayElite',
  'deep-echo-boss': 'deepEchoBoss',
};

const ENEMY_SIZE: Readonly<Record<EnemyKind, {
  readonly width: number;
  readonly height: number;
  readonly fallback: string;
}>> = {
  'bubble-fin': { width: 62, height: 62, fallback: '#7bd4de' },
  'needle-jelly': { width: 54, height: 66, fallback: '#77cbe9' },
  'reef-crab': { width: 68, height: 58, fallback: '#77cbd2' },
  'storm-ray-elite': { width: 158, height: 114, fallback: '#516ec7' },
  'deep-echo-boss': { width: 238, height: 178, fallback: '#304f9a' },
};

const captainRig = createCaptainRig();

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
      this.painter.clear('#8edbe7');
      this.drawBackground(input);
      this.drawBackgroundParticles(input);
      this.drawWaterLanes(input, trainMotion);
      this.drawLoot(input);
      this.drawEnemies(input);
      this.drawEffectParticles(input, 'enemies');
      this.drawProjectiles(input);
      this.drawTrain(input, trainMotion);
      this.drawCrew(input, trainMotion);
      this.drawFrontEffects(input, trainMotion);
      this.drawEffectParticles(input, 'front-effects');
      this.drawImpactRings(input);
      this.drawDamageNumbers(input);
      this.drawCinematicOverlay(input);
    } finally {
      this.painter.end();
    }
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
    const background = input.assets.get('background');
    if (!background) return;
    const drift = input.reducedMotion
      ? 0
      : Math.sin(input.timeMs / 2600) * 4;
    this.painter.image({
      kind: 'background',
      layer: 'background',
      source: background,
      x: 195,
      y: 422 + drift,
      width: 398,
      height: 860,
      anchorX: 0.5,
      anchorY: 0.5,
      fallbackColor: '#69cbd8',
    });
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
    const size = ENEMY_SIZE[enemy.kind];
    const artId = ENEMY_ART[enemy.kind];
    const source = input.assets.get(artId);
    const bob = input.reducedMotion || enemy.kind === 'deep-echo-boss'
      ? 0
      : Math.sin((input.timeMs + enemy.id * 97) / 260) * 2.5;
    const y = enemy.y + bob;
    this.painter.ellipse({
      kind: 'enemy-shadow',
      layer: 'enemies',
      x: enemy.x,
      y: y + size.height * 0.38,
      radiusX: size.width * 0.32,
      radiusY: Math.max(3, size.height * 0.08),
      fill: 'rgba(18, 90, 126, 0.22)',
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

    const barWidth = size.width * 0.72;
    const hpRatio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    this.painter.line({
      kind: 'enemy-hp-track',
      layer: 'enemies',
      points: [
        { x: enemy.x - barWidth / 2, y: y - size.height * 0.52 },
        { x: enemy.x + barWidth / 2, y: y - size.height * 0.52 },
      ],
      stroke: 'rgba(14, 49, 74, 0.42)',
      lineWidth: enemy.kind === 'deep-echo-boss' ? 6 : 4,
    });
    this.painter.line({
      kind: 'enemy-hp',
      layer: 'enemies',
      points: [
        { x: enemy.x - barWidth / 2, y: y - size.height * 0.52 },
        {
          x: enemy.x - barWidth / 2 + barWidth * hpRatio,
          y: y - size.height * 0.52,
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
        this.painter.line({
          kind: 'projectile-trail',
          layer: 'projectiles',
          points: [
            { x: projectile.x, y: projectile.y + 14 },
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
    const angle = target
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

  private drawTrainPower(
    input: BattleRenderInput,
    motion: TrainMotionFrameView,
  ): void {
    const powerAlpha = clamp01(
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
      alpha: clamp01(
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
        kind: 'impact-ring',
        layer: 'front-effects',
        x: ring.x,
        y: ring.y,
        radiusX: ring.radius,
        radiusY: ring.radius * 0.72,
        stroke: ring.color,
        lineWidth: 2.5,
        alpha: ring.alpha,
        blendMode: 'screen',
      });
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
