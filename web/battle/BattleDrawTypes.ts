import type { EnemyKind } from './BattleTypes';
import type { CanvasViewport } from './CanvasViewport';

export const BATTLE_LAYER_ORDER = [
  'background',
  'water-lanes',
  'loot-behind',
  'enemies',
  'projectiles',
  'train',
  'captain-and-companions',
  'front-effects',
  'damage-numbers',
  'cinematic-overlay',
] as const;

export type BattleLayer = typeof BATTLE_LAYER_ORDER[number];

export interface CameraPose {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly amplitude: number;
}

export interface NormalizedSourceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface BattleDrawCommandBase {
  readonly kind: string;
  readonly layer: BattleLayer;
  readonly alpha?: number;
  readonly rotation?: number;
  readonly blendMode?: GlobalCompositeOperation;
  readonly actor?: 'captain' | 'otter' | 'jelly-medic';
  readonly partId?: string;
  readonly enemyKind?: EnemyKind;
}

export interface ImageDrawCommand extends BattleDrawCommandBase {
  readonly source: CanvasImageSource;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly anchorX?: number;
  readonly anchorY?: number;
  readonly sourceRect?: NormalizedSourceRect;
  readonly fallbackColor?: string;
  readonly smooth?: boolean;
}

export interface EllipseDrawCommand extends BattleDrawCommandBase {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly fill?: string;
  readonly stroke?: string;
  readonly lineWidth?: number;
}

export interface DrawPoint {
  readonly x: number;
  readonly y: number;
}

export interface LineDrawCommand extends BattleDrawCommandBase {
  readonly points: readonly DrawPoint[];
  readonly stroke: string;
  readonly lineWidth: number;
  readonly dash?: readonly number[];
  readonly curve?: boolean;
  readonly lineCap?: CanvasLineCap;
}

export interface TextDrawCommand extends BattleDrawCommandBase {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fill: string;
  readonly font: string;
  readonly align?: CanvasTextAlign;
  readonly baseline?: CanvasTextBaseline;
  readonly stroke?: string;
  readonly lineWidth?: number;
}

export type BattleDrawCommand =
  | ImageDrawCommand
  | EllipseDrawCommand
  | LineDrawCommand
  | TextDrawCommand;

export interface BattlePainter {
  begin(viewport: CanvasViewport, camera: CameraPose): void;
  clear(color: string): void;
  image(command: ImageDrawCommand): void;
  ellipse(command: EllipseDrawCommand): void;
  line(command: LineDrawCommand): void;
  text(command: TextDrawCommand): void;
  end(): void;
}
