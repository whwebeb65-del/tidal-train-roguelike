import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderStationHero } from '../../web/views/StationHeroView';

const scenesCss = readFileSync(
  new URL('../../web/styles/scenes.css', import.meta.url),
  'utf8',
);

function renderHero(): string {
  return renderStationHero({
    captainId: 'captain-tide-female',
    skinId: 'skin-tide-base',
    mapName: '漂流近郊',
    stationLevel: 3,
    maxHp: 116,
    damagePercent: 8,
    reducedMotion: false,
  });
}

describe('StationHeroView', () => {
  it('renders the selected captain, train and real departure action', () => {
    const html = renderHero();

    expect(html).toContain('data-action="start-run"');
    expect(html).toContain('alt="泡泡列车"');
    expect(html).toContain('alt="潮灯列车长 · 潮汐制服"');
    expect(html).toContain('alt=""');
    expect(html).toContain('data-reduced-motion="false"');
    expect(html.match(/data-motion-role=/g)).toHaveLength(8);
    expect(html).toContain('data-motion-role="vehicle"');
    expect(html).toContain('data-motion-role="captain"');
    expect(html).toContain('data-motion-role="train"');
    expect(html).toContain('data-motion-role="wake"');
    expect(html).toContain('data-motion-role="engine"');
  });

  it('keeps every vehicle layer in one shared frame and excludes station UI', () => {
    const html = renderHero();
    const vehicleStart = html.indexOf(
      '<div class="station-hero__vehicle" data-motion-role="vehicle">',
    );
    const vehicleEnd = html.indexOf('  </section>', vehicleStart);

    expect(vehicleStart).toBeGreaterThan(-1);
    expect(vehicleEnd).toBeGreaterThan(vehicleStart);

    const vehicle = html.slice(vehicleStart, vehicleEnd);
    for (const role of [
      'train',
      'captain',
      'otter',
      'jellyfish',
      'wake',
      'engine',
    ]) {
      expect(vehicle).toContain(`data-motion-role="${role}"`);
    }
    expect(vehicle).not.toContain('station-hero__copy');
    expect(vehicle).not.toContain('data-action="start-run"');
    expect(html.indexOf('station-hero__copy')).toBeLessThan(vehicleStart);
    expect(html.indexOf('data-motion-role="background"')).toBeLessThan(
      vehicleStart,
    );
  });

  it('assigns idle, charging and departure base motion only to the vehicle frame', () => {
    expect(scenesCss).toMatch(
      /\.station-hero__vehicle\s*{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s,
    );
    expect(scenesCss).toMatch(
      /\[data-motion-role="vehicle"\]\s*{[^}]*animation:\s*station-vehicle-float 3\.8s ease-in-out infinite;/s,
    );
    expect(scenesCss).toMatch(
      /data-departure-state="charging"[^}]*data-motion-role="vehicle"[^}]*{[^}]*animation:\s*station-vehicle-charging 400ms ease-out both;/s,
    );
    expect(scenesCss).toMatch(
      /data-departure-state="departing"[^}]*data-motion-role="vehicle"[^}]*{[^}]*animation:\s*station-vehicle-departing 700ms cubic-bezier\(\.3, \.04, \.26, 1\) both;/s,
    );
    expect(scenesCss).not.toContain('station-party-departing');
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
