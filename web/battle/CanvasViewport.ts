import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
} from './BattleConfig';

export interface CanvasViewportInput {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly maxDevicePixelRatio: number;
}

export interface LogicalPoint {
  readonly x: number;
  readonly y: number;
}

export interface CanvasViewport {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly scale: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly pixelRatio: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  toLogical(clientX: number, clientY: number): LogicalPoint;
}

export function computeCanvasViewport(
  input: CanvasViewportInput,
): CanvasViewport {
  assertPositive(input.cssWidth, 'Canvas css width');
  assertPositive(input.cssHeight, 'Canvas css height');
  assertPositive(input.devicePixelRatio, 'Canvas device pixel ratio');
  assertPositive(
    input.maxDevicePixelRatio,
    'Canvas max device pixel ratio',
  );

  const scale = Math.min(
    input.cssWidth / LOGICAL_WIDTH,
    input.cssHeight / LOGICAL_HEIGHT,
  );
  const contentWidth = Math.min(
    input.cssWidth,
    LOGICAL_WIDTH * scale,
  );
  const contentHeight = Math.min(
    input.cssHeight,
    LOGICAL_HEIGHT * scale,
  );
  const offsetX = Math.max(0, (input.cssWidth - contentWidth) / 2);
  const offsetY = Math.max(0, (input.cssHeight - contentHeight) / 2);
  const pixelRatio = Math.min(
    input.devicePixelRatio,
    input.maxDevicePixelRatio,
  );

  return {
    logicalWidth: LOGICAL_WIDTH,
    logicalHeight: LOGICAL_HEIGHT,
    cssWidth: input.cssWidth,
    cssHeight: input.cssHeight,
    scale,
    contentWidth,
    contentHeight,
    offsetX,
    offsetY,
    pixelRatio,
    pixelWidth: Math.max(1, Math.round(input.cssWidth * pixelRatio)),
    pixelHeight: Math.max(1, Math.round(input.cssHeight * pixelRatio)),
    toLogical(clientX, clientY) {
      return {
        x: clamp(
          (finiteOr(clientX, offsetX) - offsetX) / scale,
          0,
          LOGICAL_WIDTH,
        ),
        y: clamp(
          (finiteOr(clientY, offsetY) - offsetY) / scale,
          0,
          LOGICAL_HEIGHT,
        ),
      };
    },
  };
}

export function resizeCanvas(
  canvas: HTMLCanvasElement,
  viewport: CanvasViewport,
): void {
  if (canvas.width !== viewport.pixelWidth) {
    canvas.width = viewport.pixelWidth;
  }
  if (canvas.height !== viewport.pixelHeight) {
    canvas.height = viewport.pixelHeight;
  }

  const cssWidth = `${viewport.cssWidth}px`;
  const cssHeight = `${viewport.cssHeight}px`;
  if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
  if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive`);
  }
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
