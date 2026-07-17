import type { BattleEvent, BattleFrameView } from './BattleTypes';
import type { QualityLevel } from './QualityMonitor';
import type {
  TrainMotionControllerPort,
  TrainMotionFrameView,
  TrainMotionPhase,
} from './TrainMotionTypes';

const DEGREES_TO_RADIANS = Math.PI / 180;
const MAX_OFFSET_X = 5.7;
const MAX_OFFSET_Y = 6.8;
const MAX_ROTATION = 0.02;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function targetSpeed(phase: TrainMotionPhase): number {
  switch (phase) {
    case 'elite': return 1.08;
    case 'boss': return 1.22;
    case 'victory': return 0.25;
    case 'defeat': return 0;
    default: return 1;
  }
}

function transitionDuration(phase: TrainMotionPhase): number {
  switch (phase) {
    case 'elite': return 500;
    case 'boss': return 1200;
    case 'victory': return 1400;
    case 'defeat': return 900;
    default: return 600;
  }
}

function easeOutCubic(progress: number): number {
  const inverse = 1 - clamp(progress, 0, 1);
  return 1 - inverse * inverse * inverse;
}

function detailAlphaFor(level: QualityLevel): number {
  switch (level) {
    case 'medium': return 0.82;
    case 'low': return 0.65;
    default: return 1;
  }
}

export class TrainMotionController implements TrainMotionControllerPort {
  private readonly mutableView: {
    phase: TrainMotionPhase;
    motionTimeMs: number;
    speed: number;
    offsetX: number;
    offsetY: number;
    rotation: number;
    scale: number;
    cannonRecoil: number;
    surge: number;
    damagePulse: number;
    laneOffset: number;
    wakeStrength: number;
    engineGlow: number;
    windowGlowPhase: number;
    lowPowerPulse: number;
    detailAlpha: number;
  } = {
    phase: 'cruise',
    motionTimeMs: 0,
    speed: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    scale: 1,
    cannonRecoil: 0,
    surge: 0,
    damagePulse: 0,
    laneOffset: 0,
    wakeStrength: 1,
    engineGlow: 0.73,
    windowGlowPhase: 0,
    lowPowerPulse: 0,
    detailAlpha: 1,
  };

  private reducedMotion: boolean;
  private presentationFrozen = false;
  private qualityLevel: QualityLevel;
  private speedFrom = 1;
  private phaseElapsedMs = 0;
  private recoil = 0;
  private surge = 0;
  private damagePulse = 0;
  private damageDirection = 0;

  public constructor(reducedMotion: boolean, qualityLevel: QualityLevel) {
    this.reducedMotion = reducedMotion;
    this.qualityLevel = qualityLevel;
  }

  public get view(): TrainMotionFrameView {
    return this.mutableView;
  }

  public reset(frame: BattleFrameView): void {
    const phase = this.derivePhase(frame);
    const speed = targetSpeed(phase);
    this.mutableView.phase = phase;
    this.mutableView.motionTimeMs = 0;
    this.mutableView.speed = speed;
    this.mutableView.offsetX = 0;
    this.mutableView.offsetY = 0;
    this.mutableView.rotation = 0;
    this.mutableView.scale = 1;
    this.mutableView.cannonRecoil = 0;
    this.mutableView.surge = 0;
    this.mutableView.damagePulse = 0;
    this.mutableView.laneOffset = 0;
    const hpRatio = this.healthRatio(frame);
    const lowPowerPulse = this.lowPowerPulseFor(hpRatio, 0);
    this.mutableView.wakeStrength = speed * (hpRatio < 0.3 ? 0.72 : 1);
    this.mutableView.engineGlow = clamp(
      0.45 + speed * 0.28 + this.energyRatio(frame) * 0.15
        - lowPowerPulse * 0.22,
      0,
      1,
    );
    this.mutableView.windowGlowPhase = 0;
    this.mutableView.lowPowerPulse = lowPowerPulse;
    this.mutableView.detailAlpha = detailAlphaFor(this.qualityLevel);
    this.speedFrom = speed;
    this.phaseElapsedMs = 0;
    this.recoil = 0;
    this.surge = 0;
    this.damagePulse = 0;
    this.damageDirection = 0;
  }

  public update(
    stepMs: number,
    frame: BattleFrameView,
    events: readonly BattleEvent[],
  ): void {
    if (
      this.presentationFrozen
      || frame.status === 'paused'
      || frame.status === 'upgrade'
    ) {
      return;
    }

    const phase = this.derivePhase(frame);
    if (phase !== this.mutableView.phase) {
      this.speedFrom = phase === 'victory' || phase === 'defeat'
        ? 1
        : this.mutableView.speed;
      this.phaseElapsedMs = 0;
      this.mutableView.phase = phase;
    }
    this.phaseElapsedMs += stepMs;
    this.mutableView.speed = this.speedFrom + (
      targetSpeed(phase) - this.speedFrom
    ) * easeOutCubic(this.phaseElapsedMs / transitionDuration(phase));
    this.mutableView.motionTimeMs += stepMs;
    this.mutableView.laneOffset += stepMs * this.mutableView.speed * 0.16;
    this.mutableView.windowGlowPhase = (
      this.mutableView.motionTimeMs * 0.001
    ) % 1;

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (!event) continue;
      if (event.type === 'weapon-fired' && event.source === 'main') {
        this.recoil = 1;
      }
      if (event.type === 'train-damaged') {
        this.damagePulse = 1;
        this.damageDirection = event.impactDirectionX;
      }
      if (event.type === 'skill-used' && event.skillId === 'tidal-volley') {
        this.surge = Math.max(this.surge, 0.35);
      }
      if (event.type === 'skill-used' && event.skillId === 'extreme-tide') {
        this.surge = 1;
      }
    }

    if (this.reducedMotion) {
      this.recoil = 0;
      this.damagePulse = 0;
      this.surge = 0;
    } else {
      this.recoil = Math.max(0, this.recoil - stepMs / 100);
      this.damagePulse = Math.max(0, this.damagePulse - stepMs / 220);
      this.surge = Math.max(0, this.surge - stepMs / 320);
    }

    const hpRatio = this.healthRatio(frame);
    const lowPowerPulse = this.lowPowerPulseFor(
      hpRatio,
      this.mutableView.motionTimeMs,
    );
    this.mutableView.lowPowerPulse = lowPowerPulse;
    this.mutableView.wakeStrength = this.mutableView.speed * (
      hpRatio < 0.3 ? 0.72 : 1
    ) + this.surge * 0.35;
    this.mutableView.engineGlow = clamp(
      0.45 + this.mutableView.speed * 0.28 + this.energyRatio(frame) * 0.15
        - lowPowerPulse * 0.22,
      0,
      1,
    );
    this.mutableView.detailAlpha = detailAlphaFor(this.qualityLevel);

    if (this.reducedMotion) {
      this.recoil = 0;
      this.surge = 0;
      this.damagePulse = 0;
      this.mutableView.offsetX = 0;
      this.mutableView.offsetY = 0;
      this.mutableView.rotation = 0;
      this.mutableView.scale = 1;
      this.mutableView.cannonRecoil = 0;
      this.mutableView.surge = 0;
      this.mutableView.damagePulse = 0;
      return;
    }

    const time = this.mutableView.motionTimeMs;
    this.mutableView.offsetX = clamp(
      2.2 * Math.sin(time * 0.0032)
        + this.damageDirection * this.damagePulse * 3.5
        + this.surge * Math.sin(time * 0.007) * 1.2,
      -MAX_OFFSET_X,
      MAX_OFFSET_X,
    );
    this.mutableView.offsetY = clamp(
      2.8 * Math.sin(time * 0.0041)
        - this.recoil * 2.1
        - this.surge * 2.4
        + this.damagePulse * 1.6,
      -MAX_OFFSET_Y,
      MAX_OFFSET_Y,
    );
    this.mutableView.rotation = clamp(
      0.55 * DEGREES_TO_RADIANS * Math.sin(time * 0.0037)
        + this.damageDirection * this.damagePulse * 0.01
        + this.surge * 0.004,
      -MAX_ROTATION,
      MAX_ROTATION,
    );
    this.mutableView.scale = 1 + this.surge * 0.025 + this.damagePulse * 0.012;
    this.mutableView.cannonRecoil = this.recoil;
    this.mutableView.surge = this.surge;
    this.mutableView.damagePulse = this.damagePulse;
  }

  public setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
  }

  public setPresentationFrozen(frozen: boolean): void {
    this.presentationFrozen = frozen;
  }

  public setQualityLevel(level: QualityLevel): void {
    this.qualityLevel = level;
    this.mutableView.detailAlpha = detailAlphaFor(level);
  }

  private derivePhase(frame: BattleFrameView): TrainMotionPhase {
    if (frame.status === 'defeat') return 'defeat';
    if (frame.status === 'victory') return 'victory';
    if (frame.status === 'boss-intro') return 'boss';
    for (let index = 0; index < frame.enemies.length; index += 1) {
      const enemy = frame.enemies[index];
      if (!enemy || !enemy.alive) continue;
      if (enemy.kind === 'deep-echo-boss') return 'boss';
    }
    for (let index = 0; index < frame.enemies.length; index += 1) {
      const enemy = frame.enemies[index];
      if (!enemy || !enemy.alive) continue;
      if (enemy.kind === 'storm-ray-elite') return 'elite';
    }
    return 'cruise';
  }

  private energyRatio(frame: BattleFrameView): number {
    return clamp(frame.energy / 100, 0, 1);
  }

  private healthRatio(frame: BattleFrameView): number {
    return frame.maxTrainHp > 0
      ? clamp(frame.trainHp / frame.maxTrainHp, 0, 1)
      : 0;
  }

  private lowPowerPulseFor(hpRatio: number, motionTimeMs: number): number {
    return hpRatio < 0.3
      ? 0.5 + 0.5 * Math.sin(motionTimeMs * 0.012)
      : 0;
  }
}
