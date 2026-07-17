import { describe, expect, it } from 'vitest';
import { TrainMotionController } from '../../../web/battle/TrainMotionController';
import { createFrameFixture } from './helpers/BattleFixtures';

const step = (controller: TrainMotionController, count: number, patch = {}) => {
  const frame = createFrameFixture(patch);
  for (let index = 0; index < count; index += 1) {
    controller.update(100, frame, []);
  }
};

describe('TrainMotionController', () => {
  it('reuses one view and follows the exact phase speed targets', () => {
    const controller = new TrainMotionController(false, 'high');
    controller.reset(createFrameFixture());
    const stableView = controller.view;
    step(controller, 5, {
      enemies: [{ ...createFrameFixture().enemies[0], kind: 'storm-ray-elite' }],
    });
    expect(controller.view).toBe(stableView);
    expect(controller.view.phase).toBe('elite');
    expect(controller.view.speed).toBeCloseTo(1.08, 2);

    step(controller, 12, { status: 'boss-intro' });
    expect(controller.view.phase).toBe('boss');
    expect(controller.view.speed).toBeCloseTo(1.22, 2);

    step(controller, 14, { status: 'victory' });
    expect(controller.view.speed).toBeCloseTo(0.25, 2);
    step(controller, 9, { status: 'defeat' });
    expect(controller.view.speed).toBeCloseTo(0, 2);
  });

  it('gives the boss phase precedence over an elite', () => {
    const controller = new TrainMotionController(false, 'high');
    controller.reset(createFrameFixture({
      enemies: [
        { ...createFrameFixture().enemies[0], kind: 'storm-ray-elite' },
        { ...createFrameFixture().enemies[1], kind: 'deep-echo-boss' },
      ],
    }));

    expect(controller.view.phase).toBe('boss');
  });

  it('starts each terminal speed curve from normalized cruise speed', () => {
    const victory = new TrainMotionController(false, 'high');
    victory.reset(createFrameFixture({
      enemies: [{ ...createFrameFixture().enemies[0], kind: 'storm-ray-elite' }],
    }));
    victory.update(100, createFrameFixture({ status: 'victory' }), []);
    expect(victory.view.speed).toBeCloseTo(0.8505, 3);

    const defeat = new TrainMotionController(false, 'high');
    defeat.reset(createFrameFixture({ status: 'boss-intro' }));
    defeat.update(100, createFrameFixture({ status: 'defeat' }), []);
    expect(defeat.view.speed).toBeCloseTo(0.7023, 3);
  });

  it('keeps the presentation view unchanged while externally frozen', () => {
    const controller = new TrainMotionController(false, 'high');
    const frame = createFrameFixture();
    controller.reset(frame);
    controller.update(100, frame, []);
    const before = { ...controller.view };

    controller.setPresentationFrozen(true);
    controller.update(1000, frame, [{
      type: 'skill-used', skillId: 'extreme-tide',
    }]);

    expect(controller.view).toMatchObject(before);
  });

  it('initializes low-power output from the same formula as updates', () => {
    const controller = new TrainMotionController(false, 'high');
    controller.reset(createFrameFixture({ trainHp: 20, maxTrainHp: 100 }));

    expect(controller.view.lowPowerPulse).toBeCloseTo(0.5, 5);
    expect(controller.view.wakeStrength).toBeCloseTo(0.72, 5);
    expect(controller.view.engineGlow).toBeCloseTo(0.728, 5);
  });

  it('caps and decays recoil, surge and directed damage impulses', () => {
    const controller = new TrainMotionController(false, 'high');
    const frame = createFrameFixture();
    controller.reset(frame);
    controller.update(16.667, frame, [
      { type: 'weapon-fired', projectileId: 1, source: 'main' },
      { type: 'skill-used', skillId: 'extreme-tide' },
      {
        type: 'train-damaged', amount: 12, shieldAbsorbed: 0,
        remainingHp: 76, impactDirectionX: 1,
      },
    ]);
    expect(Math.abs(controller.view.offsetX)).toBeLessThanOrEqual(5.7);
    expect(Math.abs(controller.view.offsetY)).toBeLessThanOrEqual(6.8);
    expect(Math.abs(controller.view.rotation)).toBeLessThanOrEqual(0.02);
    expect(controller.view.cannonRecoil).toBeGreaterThan(0);
    step(controller, 20);
    expect(controller.view.cannonRecoil).toBe(0);
    expect(controller.view.damagePulse).toBe(0);
    expect(controller.view.surge).toBe(0);
  });

  it('freezes while paused and removes body motion in reduced mode', () => {
    const controller = new TrainMotionController(false, 'low');
    controller.reset(createFrameFixture());
    controller.update(100, createFrameFixture(), []);
    const laneOffset = controller.view.laneOffset;
    controller.update(1000, createFrameFixture({ status: 'paused' }), []);
    expect(controller.view.laneOffset).toBe(laneOffset);

    controller.setReducedMotion(true);
    controller.update(100, createFrameFixture(), [{
      type: 'train-damaged', amount: 5, shieldAbsorbed: 0,
      remainingHp: 80, impactDirectionX: -1,
    }]);
    expect(controller.view).toMatchObject({
      offsetX: 0, offsetY: 0, rotation: 0, surge: 0, damagePulse: 0,
    });
    expect(controller.view.speed).toBeGreaterThan(0);
  });

  it('excludes surge from wake strength in reduced-motion mode', () => {
    const controller = new TrainMotionController(true, 'high');
    const frame = createFrameFixture();
    controller.reset(frame);
    controller.update(16.667, frame, [{
      type: 'skill-used', skillId: 'extreme-tide',
    }]);

    expect(controller.view.wakeStrength).toBeCloseTo(controller.view.speed, 5);
  });
});
