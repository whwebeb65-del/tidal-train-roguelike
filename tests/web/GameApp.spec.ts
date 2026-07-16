import { describe, expect, it } from 'vitest';
import { appSceneForAction } from '../../web/app/GameApp';

describe('GameApp navigation', () => {
  it('maps every bottom action to a real scene and reserves battle for departure', () => {
    expect(appSceneForAction('station')).toBe('station');
    expect(appSceneForAction('captain')).toBe('captain');
    expect(appSceneForAction('equipment')).toBe('equipment');
    expect(appSceneForAction('legion')).toBe('legion');
    expect(appSceneForAction('store')).toBe('store');
    expect(appSceneForAction('start-run')).toBe('battle');
    expect(appSceneForAction('start-daily-trial')).toBe('battle');
    expect(appSceneForAction('unknown')).toBeNull();
  });
});
