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
    });

    expect(html).toContain('data-action="start-run"');
    expect(html).toContain('alt="泡泡列车"');
    expect(html).toContain('alt="潮灯列车长 · 潮汐制服"');
    expect(html).toContain('alt=""');
  });
});
