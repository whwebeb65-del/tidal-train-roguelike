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

  it.each([
    ['manual pause', 'paused', false],
    ['upgrade freeze', 'upgrade', false],
    ['external revive freeze', 'running', true],
  ] as const)(
    'clears motion synchronously during %s without advancing time or lane',
    (_label, frozenStatus, externalFreeze) => {
      const runningFrame = createFrameFixture();
      const controller = new TrainMotionController(false, 'high');
      controller.reset(runningFrame);
      controller.update(100 / 6, runningFrame, [
        { type: 'weapon-fired', projectileId: 1, source: 'main' },
        { type: 'skill-used', skillId: 'extreme-tide' },
        {
          type: 'train-damaged', amount: 8, shieldAbsorbed: 0,
          remainingHp: 80, impactDirectionX: 1,
        },
      ]);
      expect(controller.view.cannonRecoil).toBeGreaterThan(0);
      expect(controller.view.surge).toBeGreaterThan(0);
      expect(controller.view.damagePulse).toBeGreaterThan(0);
      const motionTimeMs = controller.view.motionTimeMs;
      const laneOffset = controller.view.laneOffset;

      if (externalFreeze) controller.setPresentationFrozen(true);
      controller.setReducedMotion(true);

      expect(controller.view).toMatchObject({
        motionTimeMs,
        laneOffset,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        scale: 1,
        cannonRecoil: 0,
        surge: 0,
        damagePulse: 0,
      });
      controller.update(1000, createFrameFixture({
        status: frozenStatus,
      }), []);
      expect(controller.view.motionTimeMs).toBe(motionTimeMs);
      expect(controller.view.laneOffset).toBe(laneOffset);

      controller.setReducedMotion(false);
      if (externalFreeze) controller.setPresentationFrozen(false);
      controller.update(100 / 6, runningFrame, []);
      expect(controller.view).toMatchObject({
        cannonRecoil: 0,
        surge: 0,
        damagePulse: 0,
      });
    },
  );

  it('boosts only route flow with bounded deterministic decay and reduced suppression', () => {
    const frame = createFrameFixture();
    const baseline = new TrainMotionController(false, 'high');
    const boosted = new TrainMotionController(false, 'high');
    const replay = new TrainMotionController(false, 'high');
    baseline.reset(frame);
    boosted.reset(frame);
    replay.reset(frame);
    const extremeTide = [{
      type: 'skill-used' as const,
      skillId: 'extreme-tide' as const,
    }];

    baseline.update(40, frame, []);
    boosted.update(40, frame, extremeTide);
    replay.update(40, frame, extremeTide);
    const baselineFirstDelta = baseline.view.laneOffset;
    const boostedFirstDelta = boosted.view.laneOffset;
    expect(boostedFirstDelta).toBeGreaterThan(baselineFirstDelta);
    expect(boosted.view.speed).toBe(baseline.view.speed);
    expect(replay.view.laneOffset).toBe(boosted.view.laneOffset);

    let previousBoostDelta = boostedFirstDelta - baselineFirstDelta;
    for (let index = 0; index < 7; index += 1) {
      const baselineBefore = baseline.view.laneOffset;
      const boostedBefore = boosted.view.laneOffset;
      baseline.update(40, frame, []);
      boosted.update(40, frame, []);
      replay.update(40, frame, []);
      const baselineDelta = baseline.view.laneOffset - baselineBefore;
      const boostedDelta = boosted.view.laneOffset - boostedBefore;
      const boostDelta = boostedDelta - baselineDelta;
      expect(boostDelta).toBeLessThanOrEqual(previousBoostDelta);
      expect(replay.view.laneOffset).toBe(boosted.view.laneOffset);
      previousBoostDelta = boostDelta;
    }
    const baselineBeforeSettled = baseline.view.laneOffset;
    const boostedBeforeSettled = boosted.view.laneOffset;
    baseline.update(40, frame, []);
    boosted.update(40, frame, []);
    replay.update(40, frame, []);
    expect(
      boosted.view.laneOffset - boostedBeforeSettled,
    ).toBeCloseTo(
      baseline.view.laneOffset - baselineBeforeSettled,
      10,
    );
    expect(replay.view.laneOffset).toBe(boosted.view.laneOffset);

    const bossFrame = createFrameFixture({ status: 'boss-intro' });
    const capped = new TrainMotionController(false, 'high');
    capped.reset(bossFrame);
    capped.update(1, bossFrame, extremeTide);
    const effectiveFlowSpeed = capped.view.laneOffset / (1 * 0.16);
    expect(effectiveFlowSpeed).toBeGreaterThan(capped.view.speed);
    expect(effectiveFlowSpeed).toBeLessThanOrEqual(1.5);

    const reducedBaseline = new TrainMotionController(true, 'high');
    const reducedBoosted = new TrainMotionController(true, 'high');
    reducedBaseline.reset(frame);
    reducedBoosted.reset(frame);
    reducedBaseline.update(40, frame, []);
    reducedBoosted.update(40, frame, extremeTide);
    expect(reducedBoosted.view.laneOffset).toBe(
      reducedBaseline.view.laneOffset,
    );
    expect(reducedBoosted.view.surge).toBe(0);
  });
});
