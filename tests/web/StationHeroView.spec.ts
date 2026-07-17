import { describe, expect, it } from 'vitest';
import { renderStationHero } from '../../web/views/StationHeroView';

describe('StationHeroView', () => {
  it('renders the selected captain, train and real departure action', () => {
    const html = renderStationHero({
      captainId: 'captain-tide-female',
      skinId: 'skin-tide-base',
      mapName: '漂流近郊',
      stationLevel: 3,
      maxHp: 116,
      damagePercent: 8,
      reducedMotion: false,
    });

    expect(html).toContain('data-action="start-run"');
    expect(html).toContain('alt="泡泡列车"');
    expect(html).toContain('alt="潮灯列车长 · 潮汐制服"');
    expect(html).toContain('alt=""');
    expect(html).toContain('data-reduced-motion="false"');
    expect(html.match(/data-motion-role=/g)).toHaveLength(7);
    expect(html).toContain('data-motion-role="captain"');
    expect(html).toContain('data-motion-role="train"');
    expect(html).toContain('data-motion-role="wake"');
    expect(html).toContain('data-motion-role="engine"');
  });

  it('exposes effective reduced motion on the station hero', () => {
    const html = renderStationHero({
      captainId: 'captain-tide-male',
      skinId: 'skin-tide-base',
      mapName: '漂流近郊',
      stationLevel: 2,
      maxHp: 100,
      damagePercent: 0,
      reducedMotion: true,
    });

    expect(html).toContain('data-reduced-motion="true"');
  });
});
