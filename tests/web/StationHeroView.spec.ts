import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderStationHero } from '../../web/views/StationHeroView';

const scenesCss = readFileSync(
  new URL('../../web/styles/scenes.css', import.meta.url),
  'utf8',
);
const stationCssUrl = new URL(
  '../../web/styles/handdrawn-station.css',
  import.meta.url,
);
const stationCss = existsSync(stationCssUrl)
  ? readFileSync(stationCssUrl, 'utf8')
  : '';
const styleImports = readFileSync(
  new URL('../../web/styles.css', import.meta.url),
  'utf8',
);
const tokensCss = readFileSync(
  new URL('../../web/styles/tokens.css', import.meta.url),
  'utf8',
);
const responsiveCss = readFileSync(
  new URL('../../web/styles/responsive.css', import.meta.url),
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

const vehicleRoles = [
  'train',
  'captain',
  'otter',
  'jellyfish',
  'wake',
  'engine',
] as const;

function findMatchingDivEnd(html: string, divStart: number): number {
  const divTag = /<\/?div\b[^>]*>/g;
  divTag.lastIndex = divStart;
  let depth = 0;
  let match = divTag.exec(html);

  while (match) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
    match = divTag.exec(html);
  }

  return -1;
}

function expectSharedVehicleOwnership(html: string): void {
  const vehicleStart = html.indexOf(
    '<div class="station-hero__vehicle" data-motion-role="vehicle">',
  );

  expect(vehicleStart).toBeGreaterThan(-1);
  const vehicleEnd = findMatchingDivEnd(html, vehicleStart);
  expect(vehicleEnd).toBeGreaterThan(vehicleStart);

  const vehicle = html.slice(vehicleStart, vehicleEnd);
  for (const role of vehicleRoles) {
    const marker = `data-motion-role="${role}"`;
    const roleStart = html.indexOf(marker);

    expect(roleStart).toBeGreaterThan(vehicleStart);
    expect(roleStart).toBeLessThan(vehicleEnd);
    expect(html.indexOf(marker, roleStart + marker.length)).toBe(-1);
  }
  expect(vehicle).not.toContain('station-ticket');
  expect(vehicle).not.toContain('data-action="start-run"');
  expect(html.indexOf('station-ticket')).toBeLessThan(vehicleStart);
  expect(html.indexOf('data-motion-role="background"')).toBeLessThan(
    vehicleStart,
  );
}

function moveWakeAndEngineOutsideVehicle(html: string): string {
  const wake = '      <div class="station-hero__wake" data-motion-role="wake" aria-hidden="true"><i></i><i></i><i></i></div>\n';
  const engine = '      <span class="station-hero__engine-glow" data-motion-role="engine" aria-hidden="true"></span>\n';

  expect(html).toContain(wake);
  expect(html).toContain(engine);
  const withoutVehicleParts = html
    .replace(wake, '')
    .replace(engine, '');
  const sectionClose = withoutVehicleParts.lastIndexOf('  </section>');
  expect(sectionClose).toBeGreaterThan(-1);
  return `${withoutVehicleParts.slice(0, sectionClose)}${wake}${engine}${withoutVehicleParts.slice(sectionClose)}`;
}

describe('StationHeroView', () => {
  it('renders four ordered station layers, purposeful actors and ticket UI', () => {
    const html = renderHero();

    expect(html.match(/data-station-layer=/g)).toHaveLength(4);
    expect([...html.matchAll(/data-station-layer="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'sky',
      'horizon',
      'platform',
      'foreground',
    ]);
    expect(html).toContain('data-ambient-role="mail-fish"');
    expect(html).toContain('data-ambient-role="distant-train"');
    expect(html).toContain('data-action="captain-greeting"');
    expect(html).toContain('class="station-ticket"');
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
    expect(html).toContain('航线 漂流近郊');
    expect(html).toContain('生命 116');
    expect(html).toContain('永久伤害 +8%');
    expectSharedVehicleOwnership(html);
  });

  it('keeps every vehicle layer in one shared frame and excludes station UI', () => {
    const html = renderHero();
    expectSharedVehicleOwnership(html);
  });

  it('rejects wake and engine moved immediately outside the vehicle frame', () => {
    const invalidHtml = moveWakeAndEngineOutsideVehicle(renderHero());

    expect(() => expectSharedVehicleOwnership(invalidHtml)).toThrow();
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

  it('defines the hand-drawn palette and imports the station sheet after scenes', () => {
    for (const token of [
      '--ink-drawn: #17344c',
      '--paper-warm: #fff2d2',
      '--paper-shadow: #e8c99a',
      '--sunset-coral: #ef785f',
      '--sunset-gold: #f3bb66',
      '--twilight-blue: #234f72',
      '--deep-shadow: #102a40',
      '--line-drawn: rgb(23 52 76 / 76%)',
      '--paper-grain: radial-gradient(circle at 20% 10%, rgb(23 52 76 / 5%) 0 1px, transparent 1.5px)',
    ]) {
      expect(tokensCss).toContain(token);
    }
    expect(styleImports.indexOf('./styles/handdrawn-station.css')).toBeGreaterThan(
      styleImports.indexOf('./styles/scenes.css'),
    );
  });

  it('scopes all six ambient events to their purposeful actors at Task 2 durations', () => {
    const expectations = {
      'mechanic-check': { duration: '1800ms', roles: ['otter', 'service-hatch'] },
      'station-call': { duration: '1600ms', roles: ['jellyfish', 'lamp-left', 'lamp-right'] },
      'mail-drop': { duration: '1700ms', roles: ['mail-fish'] },
      'distant-train': { duration: '2200ms', roles: ['distant-train'] },
      'captain-idle': { duration: '1400ms', roles: ['captain'] },
      'captain-greeting': { duration: '1200ms', roles: ['captain-greeting', 'dialogue'] },
    } as const;

    for (const [eventId, expected] of Object.entries(expectations)) {
      const rules = [...stationCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((match) => match[1]?.includes(`[data-ambient-event="${eventId}"]`));
      expect(rules.length, eventId).toBeGreaterThan(0);
      const selectors = rules.map((match) => match[1]!).join(' ');
      const declarations = rules.map((match) => match[2]!).join(' ');
      const targetedRoles = [...selectors.matchAll(/data-(?:ambient-role|action)="([^"]+)"/g)]
        .map((match) => match[1]);
      expect(new Set(targetedRoles)).toEqual(new Set(expected.roles));
      expect(declarations).toContain(expected.duration);
    }
  });

  it('keeps missing-art fallbacks matte and disables event motion without hiding dialogue', () => {
    expect(stationCss).toMatch(
      /\.station-hero \[data-station-art\]\.is-missing\s*\{[^}]*visibility:\s*hidden;/s,
    );
    expect(stationCss).toMatch(/\.station-art-fallback--train\s*\{[^}]*background:/s);
    expect(stationCss).toMatch(/\.station-art-fallback--captain\s*\{[^}]*background:/s);
    expect(stationCss).not.toContain('backdrop-filter');
    expect(stationCss).not.toContain('glass');
    expect(stationCss).toMatch(
      /\[data-reduced-motion="true"\][^{]*\[data-station-layer\][^{]*\{[^}]*animation:\s*none;[^}]*transform:\s*none;/s,
    );
    expect(stationCss).toMatch(
      /\[data-reduced-motion="true"\][^{]*\[data-ambient-role\][^{]*\{[^}]*animation:\s*none;[^}]*transform:\s*none;/s,
    );
    expect(stationCss).toMatch(
      /\[data-reduced-motion="true"\][^{]*\[data-action="captain-greeting"\][^{]*\{[^}]*animation:\s*none;[^}]*transform:\s*none;/s,
    );
    expect(stationCss).toMatch(
      /\[data-reduced-motion="true"\][^{]*\.station-dialogue\s*\{[^}]*opacity:\s*1;/s,
    );
  });

  it('adapts the paper ticket and shared vehicle composition at 430px', () => {
    expect(responsiveCss).toMatch(/@media \(max-width:\s*430px\)/);
    const ticketRule = responsiveCss.match(/\.station-ticket\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(ticketRule).toContain('left: 12px;');
    expect(ticketRule).toContain('right: 12px;');
    expect(ticketRule).toContain('width: auto;');
    expect(responsiveCss).toMatch(
      /\.station-hero__captain-button\s*\{[^}]*width:\s*(?:39|40|41|42|43)%/s,
    );
    expect(responsiveCss).toMatch(
      /\.station-hero__train\s*\{[^}]*bottom:[^;}]+;[^}]*width:\s*(?:9\d|100)%/s,
    );
  });
});
