import { describe, expect, it } from 'vitest';
import {
  computeCanvasViewport,
  resizeCanvas,
} from '../../../web/battle/CanvasViewport';

describe('computeCanvasViewport', () => {
  it.each([
    [360, 800],
    [390, 844],
    [412, 915],
    [430, 932],
  ])('fits %d x %d without cropping logical content', (width, height) => {
    const view = computeCanvasViewport({
      cssWidth: width,
      cssHeight: height,
      devicePixelRatio: 3,
      maxDevicePixelRatio: 2,
    });

    expect(view.logicalWidth).toBe(390);
    expect(view.logicalHeight).toBe(844);
    expect(view.pixelRatio).toBe(2);
    expect(view.contentWidth).toBeLessThanOrEqual(width);
    expect(view.contentHeight).toBeLessThanOrEqual(height);
    expect(view.offsetX).toBeGreaterThanOrEqual(0);
    expect(view.offsetY).toBeGreaterThanOrEqual(0);
  });

  it('maps and clamps client coordinates to the logical battlefield', () => {
    const view = computeCanvasViewport({
      cssWidth: 430,
      cssHeight: 844,
      devicePixelRatio: 1,
      maxDevicePixelRatio: 2,
    });

    expect(view.toLogical(view.offsetX, view.offsetY)).toEqual({
      x: 0,
      y: 0,
    });
    expect(view.toLogical(9999, 9999)).toEqual({ x: 390, y: 844 });
  });

  it('does not rewrite canvas pixel dimensions when unchanged', () => {
    let widthWrites = 0;
    let heightWrites = 0;
    let storedWidth = 0;
    let storedHeight = 0;
    const canvas = {
      get width() {
        return storedWidth;
      },
      set width(value: number) {
        widthWrites += 1;
        storedWidth = value;
      },
      get height() {
        return storedHeight;
      },
      set height(value: number) {
        heightWrites += 1;
        storedHeight = value;
      },
      style: {},
    } as unknown as HTMLCanvasElement;
    const view = computeCanvasViewport({
      cssWidth: 390,
      cssHeight: 844,
      devicePixelRatio: 2,
      maxDevicePixelRatio: 2,
    });

    resizeCanvas(canvas, view);
    resizeCanvas(canvas, view);

    expect(widthWrites).toBe(1);
    expect(heightWrites).toBe(1);
    expect(canvas.width).toBe(780);
    expect(canvas.height).toBe(1688);
  });
});
