import type {
  BattlePainter,
  CameraPose,
  EllipseDrawCommand,
  ImageDrawCommand,
  LineDrawCommand,
  TextDrawCommand,
} from './BattleDrawTypes';
import type { CanvasViewport } from './CanvasViewport';

export class CanvasPainter implements BattlePainter {
  private viewport: CanvasViewport | null = null;
  private frameOpen = false;

  public constructor(
    private readonly context: CanvasRenderingContext2D,
  ) {}

  public begin(viewport: CanvasViewport, camera: CameraPose): void {
    if (this.frameOpen) this.end();
    this.viewport = viewport;
    this.frameOpen = true;
    const scale = viewport.pixelRatio * viewport.scale;
    this.context.save();
    this.context.setTransform(
      scale,
      0,
      0,
      scale,
      viewport.offsetX * viewport.pixelRatio,
      viewport.offsetY * viewport.pixelRatio,
    );
    this.context.translate(195 + camera.x, 422 + camera.y);
    this.context.rotate(camera.rotation);
    this.context.translate(-195, -422);
  }

  public clear(color: string): void {
    const viewport = this.viewport;
    if (!viewport) return;
    this.context.save();
    this.context.setTransform(
      viewport.pixelRatio,
      0,
      0,
      viewport.pixelRatio,
      0,
      0,
    );
    this.context.fillStyle = color;
    this.context.fillRect(0, 0, viewport.cssWidth, viewport.cssHeight);
    this.context.restore();
  }

  public image(command: ImageDrawCommand): void {
    const dimensions = sourceDimensions(command.source);
    if (!dimensions) {
      this.drawImageFallback(command);
      return;
    }

    this.withCommandState(command, () => {
      this.context.imageSmoothingEnabled = command.smooth !== false;
      const anchorX = command.anchorX ?? 0.5;
      const anchorY = command.anchorY ?? 1;
      const destinationX = -command.width * anchorX;
      const destinationY = -command.height * anchorY;
      const sourceRect = command.sourceRect;
      if (sourceRect) {
        this.context.drawImage(
          command.source,
          sourceRect.x * dimensions.width,
          sourceRect.y * dimensions.height,
          sourceRect.width * dimensions.width,
          sourceRect.height * dimensions.height,
          destinationX,
          destinationY,
          command.width,
          command.height,
        );
      } else {
        this.context.drawImage(
          command.source,
          destinationX,
          destinationY,
          command.width,
          command.height,
        );
      }
    }, command.x, command.y);
  }

  public ellipse(command: EllipseDrawCommand): void {
    this.withCommandState(command, () => {
      this.context.beginPath();
      this.context.ellipse(
        0,
        0,
        Math.max(0, command.radiusX),
        Math.max(0, command.radiusY),
        0,
        0,
        Math.PI * 2,
      );
      if (command.fill) {
        this.context.fillStyle = command.fill;
        this.context.fill();
      }
      if (command.stroke && (command.lineWidth ?? 1) > 0) {
        this.context.strokeStyle = command.stroke;
        this.context.lineWidth = command.lineWidth ?? 1;
        this.context.stroke();
      }
    }, command.x, command.y);
  }

  public line(command: LineDrawCommand): void {
    if (command.points.length < 2) return;
    this.withCommandState(command, () => {
      const first = command.points[0];
      if (!first) return;
      this.context.beginPath();
      this.context.moveTo(first.x, first.y);
      if (command.curve && command.points.length > 2) {
        for (let index = 1; index < command.points.length - 1; index += 1) {
          const current = command.points[index];
          const next = command.points[index + 1];
          if (!current || !next) continue;
          this.context.quadraticCurveTo(
            current.x,
            current.y,
            (current.x + next.x) / 2,
            (current.y + next.y) / 2,
          );
        }
        const last = command.points[command.points.length - 1];
        if (last) this.context.lineTo(last.x, last.y);
      } else {
        for (const point of command.points.slice(1)) {
          this.context.lineTo(point.x, point.y);
        }
      }
      this.context.strokeStyle = command.stroke;
      this.context.lineWidth = command.lineWidth;
      this.context.lineCap = command.lineCap ?? 'round';
      this.context.setLineDash([...(command.dash ?? [])]);
      this.context.stroke();
    }, 0, 0);
  }

  public text(command: TextDrawCommand): void {
    this.withCommandState(command, () => {
      this.context.font = command.font;
      this.context.textAlign = command.align ?? 'center';
      this.context.textBaseline = command.baseline ?? 'middle';
      if (command.stroke) {
        this.context.strokeStyle = command.stroke;
        this.context.lineWidth = command.lineWidth ?? 2;
        this.context.strokeText(command.text, 0, 0);
      }
      this.context.fillStyle = command.fill;
      this.context.fillText(command.text, 0, 0);
    }, command.x, command.y);
  }

  public end(): void {
    if (!this.frameOpen) return;
    this.context.restore();
    this.frameOpen = false;
    this.viewport = null;
  }

  private withCommandState(
    command: {
      readonly alpha?: number;
      readonly rotation?: number;
      readonly blendMode?: GlobalCompositeOperation;
    },
    draw: () => void,
    x: number,
    y: number,
  ): void {
    this.context.save();
    this.context.globalAlpha = clamp(command.alpha ?? 1, 0, 1);
    this.context.globalCompositeOperation =
      command.blendMode ?? 'source-over';
    this.context.translate(x, y);
    this.context.rotate(command.rotation ?? 0);
    draw();
    this.context.restore();
  }

  private drawImageFallback(command: ImageDrawCommand): void {
    this.withCommandState(command, () => {
      const anchorX = command.anchorX ?? 0.5;
      const anchorY = command.anchorY ?? 1;
      const centerX = command.width * (0.5 - anchorX);
      const centerY = command.height * (0.5 - anchorY);
      this.context.beginPath();
      this.context.ellipse(
        centerX,
        centerY,
        command.width * 0.42,
        command.height * 0.44,
        0,
        0,
        Math.PI * 2,
      );
      this.context.fillStyle = command.fallbackColor ?? '#4f9fb2';
      this.context.fill();
      this.context.fillStyle = '#eaffff';
      const eyeY = centerY - command.height * 0.08;
      const eyeRadius = Math.max(1.5, command.width * 0.035);
      for (const direction of [-1, 1]) {
        this.context.beginPath();
        this.context.arc(
          centerX + direction * command.width * 0.12,
          eyeY,
          eyeRadius,
          0,
          Math.PI * 2,
        );
        this.context.fill();
      }
    }, command.x, command.y);
  }
}

function sourceDimensions(
  source: CanvasImageSource,
): { readonly width: number; readonly height: number } | null {
  const candidate = source as unknown as {
    readonly naturalWidth?: number;
    readonly naturalHeight?: number;
    readonly videoWidth?: number;
    readonly videoHeight?: number;
    readonly width?: number;
    readonly height?: number;
  };
  const width = candidate.naturalWidth
    ?? candidate.videoWidth
    ?? candidate.width
    ?? 0;
  const height = candidate.naturalHeight
    ?? candidate.videoHeight
    ?? candidate.height
    ?? 0;
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    return null;
  }
  return { width, height };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
