import type {
  QualityPreference,
} from '../app/SettingsRepository';

export type QualityLevel = Exclude<QualityPreference, 'auto'>;

export interface QualityChange {
  readonly from: QualityLevel;
  readonly to: QualityLevel;
  readonly averageFrameMs: number;
}

export interface RenderBudget {
  readonly backgroundLayers: 4 | 3 | 2;
  readonly backgroundParticles: number;
  readonly visibleProjectileTrails: number;
  readonly particles: number;
  readonly damageNumbers: number;
  readonly impactRings: number;
  readonly travelMarkers: number;
  readonly trainWakeSegments: number;
  readonly dprCap: number;
}

export const RENDER_BUDGETS: Readonly<
  Record<QualityLevel, RenderBudget>
> = {
  high: {
    backgroundLayers: 4,
    backgroundParticles: 36,
    visibleProjectileTrails: 120,
    particles: 200,
    damageNumbers: 18,
    impactRings: 24,
    travelMarkers: 15,
    trainWakeSegments: 6,
    dprCap: 2,
  },
  medium: {
    backgroundLayers: 3,
    backgroundParticles: 18,
    visibleProjectileTrails: 100,
    particles: 130,
    damageNumbers: 12,
    impactRings: 16,
    travelMarkers: 9,
    trainWakeSegments: 4,
    dprCap: 1.75,
  },
  low: {
    backgroundLayers: 2,
    backgroundParticles: 0,
    visibleProjectileTrails: 80,
    particles: 80,
    damageNumbers: 8,
    impactRings: 10,
    travelMarkers: 3,
    trainWakeSegments: 2,
    dprCap: 1.5,
  },
};

const WINDOW_SIZE = 120;

export class QualityMonitor {
  private preference: QualityPreference;
  private currentLevel: QualityLevel;
  private frameTotalMs = 0;
  private frameCount = 0;
  private slowWindowCount = 0;
  private severeWindowCount = 0;

  public constructor(preference: QualityPreference) {
    this.preference = preference;
    this.currentLevel = preference === 'auto' ? 'high' : preference;
  }

  public get level(): QualityLevel {
    return this.currentLevel;
  }

  public setPreference(preference: QualityPreference): QualityLevel {
    if (preference === this.preference) return this.currentLevel;
    this.preference = preference;
    this.currentLevel = preference === 'auto' ? 'high' : preference;
    this.resetWindows();
    return this.currentLevel;
  }

  public recordFrame(deltaMs: number): QualityChange | null {
    if (
      this.preference !== 'auto'
      || !Number.isFinite(deltaMs)
      || deltaMs <= 0
      || deltaMs > 250
    ) {
      return null;
    }

    this.frameTotalMs += deltaMs;
    this.frameCount += 1;
    if (this.frameCount < WINDOW_SIZE) return null;

    const averageFrameMs = this.frameTotalMs / this.frameCount;
    this.frameTotalMs = 0;
    this.frameCount = 0;

    if (averageFrameMs > 28) {
      this.severeWindowCount += 1;
      this.slowWindowCount += 1;
    } else {
      this.severeWindowCount = 0;
      this.slowWindowCount = averageFrameMs > 22
        ? this.slowWindowCount + 1
        : 0;
    }

    if (
      this.severeWindowCount >= 2
      && this.currentLevel !== 'low'
    ) {
      return this.changeLevel('low', averageFrameMs);
    }
    if (
      this.slowWindowCount >= 2
      && this.currentLevel === 'high'
    ) {
      return this.changeLevel('medium', averageFrameMs);
    }
    return null;
  }

  private changeLevel(
    next: QualityLevel,
    averageFrameMs: number,
  ): QualityChange {
    const change = {
      from: this.currentLevel,
      to: next,
      averageFrameMs,
    };
    this.currentLevel = next;
    this.slowWindowCount = 0;
    this.severeWindowCount = 0;
    return change;
  }

  private resetWindows(): void {
    this.frameTotalMs = 0;
    this.frameCount = 0;
    this.slowWindowCount = 0;
    this.severeWindowCount = 0;
  }
}

export function getRenderBudget(level: QualityLevel): RenderBudget {
  return RENDER_BUDGETS[level];
}
