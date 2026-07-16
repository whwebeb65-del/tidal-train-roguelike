import { describe, expect, it } from 'vitest';
import {
  QualityMonitor,
  getRenderBudget,
} from '../../../web/battle/QualityMonitor';

function feed(
  monitor: QualityMonitor,
  frameMs: number,
  count = 120,
): void {
  for (let index = 0; index < count; index += 1) {
    monitor.recordFrame(frameMs);
  }
}

describe('QualityMonitor', () => {
  it('needs two slow windows, steps down once and never auto-upgrades mid-run', () => {
    const monitor = new QualityMonitor('auto');
    feed(monitor, 24);
    expect(monitor.level).toBe('high');
    feed(monitor, 24);
    expect(monitor.level).toBe('medium');
    feed(monitor, 16, 360);
    expect(monitor.level).toBe('medium');
  });

  it('drops directly toward low when two windows exceed 28 ms', () => {
    const monitor = new QualityMonitor('auto');
    feed(monitor, 30);
    feed(monitor, 30);
    expect(monitor.level).toBe('low');
  });

  it('ignores long pauses and keeps manual preferences fixed', () => {
    const automatic = new QualityMonitor('auto');
    feed(automatic, 300, 360);
    expect(automatic.level).toBe('high');

    const manual = new QualityMonitor('high');
    feed(manual, 40, 360);
    expect(manual.level).toBe('high');
    manual.setPreference('low');
    expect(manual.level).toBe('low');
  });

  it('provides lower visual budgets without changing logical entities', () => {
    expect(getRenderBudget('high')).toMatchObject({
      particles: 200,
      damageNumbers: 18,
      dprCap: 2,
    });
    expect(getRenderBudget('low')).toMatchObject({
      particles: 80,
      damageNumbers: 8,
      dprCap: 1.5,
    });
  });
});
