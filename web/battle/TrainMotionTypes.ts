import type { BattleEvent, BattleFrameView } from './BattleTypes';
import type { QualityLevel } from './QualityMonitor';

export type TrainMotionPhase = 'cruise' | 'elite' | 'boss' | 'victory' | 'defeat';

export interface TrainMotionFrameView {
  readonly phase: TrainMotionPhase;
  readonly motionTimeMs: number;
  readonly speed: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotation: number;
  readonly scale: number;
  readonly cannonRecoil: number;
  readonly surge: number;
  readonly damagePulse: number;
  readonly laneOffset: number;
  readonly wakeStrength: number;
  readonly engineGlow: number;
  readonly windowGlowPhase: number;
  readonly lowPowerPulse: number;
  readonly detailAlpha: number;
}

export interface TrainMotionControllerPort {
  readonly view: TrainMotionFrameView;
  reset(frame: BattleFrameView): void;
  update(stepMs: number, frame: BattleFrameView, events: readonly BattleEvent[]): void;
  setReducedMotion(reducedMotion: boolean): void;
  setPresentationFrozen(frozen: boolean): void;
  setQualityLevel(level: QualityLevel): void;
}
