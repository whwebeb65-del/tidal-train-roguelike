import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { SimulationRateController } from '../../../web/battle/SimulationRateController';

describe('SimulationRateController', () => {
  it.each([1, 1.5, 2, 3] as const)(
    'emits fixed world steps totaling %sx simulated time',
    (speed) => {
      const controller = new SimulationRateController(FIXED_STEP_MS, speed);
      let simulated = 0;

      for (let index = 0; index < 120; index += 1) {
        controller.consume(FIXED_STEP_MS, (step) => {
          expect(step).toBe(FIXED_STEP_MS);
          simulated += step;
        });
      }

      expect(simulated).toBeCloseTo(120 * FIXED_STEP_MS * speed, 5);
    },
  );

  it('alternates 1.5x fixed steps without passing fractional engine steps', () => {
    const controller = new SimulationRateController(FIXED_STEP_MS, 1.5);
    const steps: number[] = [];

    controller.consume(FIXED_STEP_MS, (step) => steps.push(step));
    controller.consume(FIXED_STEP_MS, (step) => steps.push(step));

    expect(steps).toEqual([FIXED_STEP_MS, FIXED_STEP_MS, FIXED_STEP_MS]);
    expect(new Set(steps)).toEqual(new Set([FIXED_STEP_MS]));
  });

  it('keeps capped catch-up backlog and drains it across later frames', () => {
    const controller = new SimulationRateController(10, 3, 5);
    const steps: number[] = [];

    controller.consume(100, (step) => steps.push(step));
    expect(steps).toHaveLength(5);
    for (let frame = 0; frame < 5; frame += 1) {
      const before = steps.length;
      controller.consume(0, (step) => steps.push(step));
      expect(steps.length - before).toBeLessThanOrEqual(5);
    }

    expect(steps).toEqual(Array.from({ length: 30 }, () => 10));
  });

  it.each([1, 1.5, 2, 3] as const)(
    'preserves all world time after a one-second hitch at %sx speed',
    (speed) => {
      const controller = new SimulationRateController(10, speed, 5);
      let simulated = 0;

      controller.consume(1000, (step) => {
        simulated += step;
      });
      for (let frame = 0; frame < 600; frame += 1) {
        controller.consume(0, (step) => {
          simulated += step;
        });
      }

      expect(simulated).toBeCloseTo(1000 * speed, 8);
    },
  );

  it('does not accumulate a backlog while no real time elapses', () => {
    const controller = new SimulationRateController(10, 3, 5);
    let simulated = 0;

    for (let frame = 0; frame < 10; frame += 1) {
      controller.consume(0, (step) => {
        simulated += step;
      });
    }

    expect(simulated).toBe(0);
  });
});
