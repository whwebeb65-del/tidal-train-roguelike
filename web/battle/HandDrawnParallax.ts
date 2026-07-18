export type HandDrawnParallaxId =
  | 'sky'
  | 'horizon'
  | 'track'
  | 'foreground';

export interface HandDrawnParallaxInput {
  readonly timeMs: number;
  readonly laneOffset: number;
  readonly backgroundLayers: 2 | 3 | 4;
  readonly reducedMotion: boolean;
}

export interface HandDrawnParallaxPose {
  readonly id: HandDrawnParallaxId;
  readonly artId:
    | 'backgroundSky'
    | 'backgroundHorizon'
    | 'backgroundTrack'
    | 'backgroundForeground';
  readonly offsetX: number;
  readonly offsetY: number;
  readonly repeatY: boolean;
  readonly alpha: number;
}

const REPEAT_HEIGHT = 844;

export function createHandDrawnParallax(
  input: HandDrawnParallaxInput,
): readonly HandDrawnParallaxPose[] {
  const timeMs = finiteOrZero(input.timeMs);
  const laneOffset = finiteOrZero(input.laneOffset);
  const reduced = input.reducedMotion;
  const poses: HandDrawnParallaxPose[] = [{
    id: 'sky',
    artId: 'backgroundSky',
    offsetX: reduced ? 0 : Math.sin(timeMs / 5000) * 3,
    offsetY: 0,
    repeatY: false,
    alpha: 1,
  }];

  if (input.backgroundLayers >= 3) {
    poses.push({
      id: 'horizon',
      artId: 'backgroundHorizon',
      offsetX: 0,
      offsetY: reduced ? 0 : -laneOffset * 0.08,
      repeatY: false,
      alpha: 1,
    });
  }

  poses.push({
    id: 'track',
    artId: 'backgroundTrack',
    offsetX: 0,
    offsetY: reduced ? 6 : wrapRepeat(laneOffset),
    repeatY: true,
    alpha: 1,
  });

  if (input.backgroundLayers === 4) {
    poses.push({
      id: 'foreground',
      artId: 'backgroundForeground',
      offsetX: 0,
      offsetY: reduced ? 0 : wrapRepeat(laneOffset * 1.42),
      repeatY: true,
      alpha: 1,
    });
  }

  return poses;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function wrapRepeat(value: number): number {
  return ((value % REPEAT_HEIGHT) + REPEAT_HEIGHT) % REPEAT_HEIGHT;
}
