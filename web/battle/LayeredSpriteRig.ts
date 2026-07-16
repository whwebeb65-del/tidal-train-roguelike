import type { NormalizedSourceRect } from './BattleDrawTypes';

export type SpriteAction = 'idle' | 'fire' | 'cast' | 'hit';

export interface SpriteRigState {
  readonly action: SpriteAction;
  readonly hitPulse: number;
}

export interface SpritePartPose {
  readonly id: string;
  readonly primitive: 'image' | 'scarf' | 'glow';
  readonly sourceRect?: NormalizedSourceRect;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly widthScale: number;
  readonly heightScale: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly rotation: number;
  readonly alpha: number;
}

export interface LayeredSpriteRig {
  pose(
    timeMs: number,
    state: SpriteRigState,
  ): readonly SpritePartPose[];
}

const CAPTAIN_RECTS = {
  body: { x: 0, y: 0.42, width: 1, height: 0.58 },
  head: { x: 0.04, y: 0, width: 0.92, height: 0.52 },
  arm: { x: 0.54, y: 0.34, width: 0.38, height: 0.38 },
} as const satisfies Record<string, NormalizedSourceRect>;

export function createCaptainRig(): LayeredSpriteRig {
  return {
    pose(timeMs, state) {
      const motion = state.action === 'hit' ? 0 : 1;
      const breath = Math.sin(timeMs / 420 * Math.PI * 2)
        * 1.8
        * motion;
      const cast = state.action === 'cast' ? 0.24 : 0;
      const fire = state.action === 'fire' ? -0.12 : 0;
      const hitTilt = state.action === 'hit'
        ? -0.08 * state.hitPulse
        : 0;
      const scarfWave = Math.sin(timeMs / 300 * Math.PI * 2) * 0.12;

      return [
        {
          id: 'body',
          primitive: 'image',
          sourceRect: CAPTAIN_RECTS.body,
          offsetX: 0,
          offsetY: 0,
          widthScale: 1,
          heightScale: 0.58,
          anchorX: 0.5,
          anchorY: 1,
          rotation: hitTilt,
          alpha: 1,
        },
        {
          id: 'head',
          primitive: 'image',
          sourceRect: CAPTAIN_RECTS.head,
          offsetX: 0,
          offsetY: -42 + breath,
          widthScale: 0.92,
          heightScale: 0.52,
          anchorX: 0.5,
          anchorY: 0.5,
          rotation: hitTilt * 0.6,
          alpha: 1,
        },
        {
          id: 'arm',
          primitive: 'image',
          sourceRect: CAPTAIN_RECTS.arm,
          offsetX: 17,
          offsetY: -23 + breath * 0.35,
          widthScale: 0.38,
          heightScale: 0.38,
          anchorX: 0.2,
          anchorY: 0.55,
          rotation: -0.05 + cast + fire + scarfWave * 0.2,
          alpha: 1,
        },
        {
          id: 'scarf',
          primitive: 'scarf',
          offsetX: -14,
          offsetY: -31 + breath * 0.5,
          widthScale: 1,
          heightScale: 1,
          anchorX: 0,
          anchorY: 0,
          rotation: scarfWave,
          alpha: 0.86,
        },
        {
          id: 'glow',
          primitive: 'glow',
          offsetX: 0,
          offsetY: -31,
          widthScale: 1,
          heightScale: 1,
          anchorX: 0.5,
          anchorY: 0.5,
          rotation: 0,
          alpha: state.action === 'cast'
            ? 0.42 + Math.sin(timeMs / 90) * 0.08
            : 0,
        },
      ];
    },
  };
}

export function createMechanicRig(): LayeredSpriteRig {
  return createCompanionRig('fire');
}

export function createMedicRig(): LayeredSpriteRig {
  return createCompanionRig('cast');
}

function createCompanionRig(emphasis: SpriteAction): LayeredSpriteRig {
  return {
    pose(timeMs, state) {
      const float = Math.sin(timeMs / 520 * Math.PI * 2) * 2;
      const active = state.action === emphasis;
      return [
        {
          id: 'body',
          primitive: 'image',
          sourceRect: { x: 0, y: 0, width: 1, height: 1 },
          offsetX: active && emphasis === 'fire' ? -3 : 0,
          offsetY: float + (active && emphasis === 'cast' ? -12 : 0),
          widthScale: 1,
          heightScale: 1,
          anchorX: 0.5,
          anchorY: 1,
          rotation: 0,
          alpha: 1,
        },
        {
          id: 'head',
          primitive: 'glow',
          offsetX: 0,
          offsetY: -24 + float,
          widthScale: 1,
          heightScale: 1,
          anchorX: 0.5,
          anchorY: 0.5,
          rotation: 0,
          alpha: active ? 0.3 : 0,
        },
        {
          id: 'arm',
          primitive: 'glow',
          offsetX: 12,
          offsetY: -18 + float,
          widthScale: 1,
          heightScale: 1,
          anchorX: 0.5,
          anchorY: 0.5,
          rotation: active ? 0.18 : 0,
          alpha: active ? 0.24 : 0,
        },
        {
          id: 'scarf',
          primitive: 'scarf',
          offsetX: -8,
          offsetY: -20 + float,
          widthScale: 1,
          heightScale: 1,
          anchorX: 0,
          anchorY: 0,
          rotation: Math.sin(timeMs / 400) * 0.08,
          alpha: 0,
        },
        {
          id: 'glow',
          primitive: 'glow',
          offsetX: 0,
          offsetY: -16 + float,
          widthScale: 1,
          heightScale: 1,
          anchorX: 0.5,
          anchorY: 0.5,
          rotation: 0,
          alpha: active ? 0.32 : 0,
        },
      ];
    },
  };
}
