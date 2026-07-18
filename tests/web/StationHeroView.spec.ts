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

function extractCssBlock(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex, marker).toBeGreaterThanOrEqual(0);
  const openIndex = source.indexOf('{', markerIndex);
  expect(openIndex, marker).toBeGreaterThan(markerIndex);
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openIndex + 1, index);
  }
  throw new Error(`Unclosed CSS block: ${marker}`);
}

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
    expect(stationCss).toMatch(
      /data-departure-state="departing"[^}]*data-motion-role="vehicle"[^}]*{[^}]*animation:\s*station-vehicle-departing 1200ms cubic-bezier\(\.3, \.04, \.26, 1\) both;/s,
    );
    expect(scenesCss).not.toContain('station-party-departing');
    expect(scenesCss).not.toContain('will-change:');
  });

  it('stages charging indefinitely and keeps the 1200 ms departure transform-and-opacity only', () => {
    expect(stationCss).toMatch(
      /data-departure-state="charging"[^}]*station-ticket__stamp[^}]*{[^}]*animation:\s*station-stamp-charging 360ms ease-in-out infinite alternate;/s,
    );
    expect(stationCss).toMatch(
      /data-departure-state="charging"[^}]*lamp-left[^}]*lamp-right[^}]*{[^}]*animation:\s*station-lamps-charging 520ms ease-in-out infinite alternate;/s,
    );
    expect(stationCss).toMatch(
      /data-departure-state="charging"[^}]*data-motion-role="otter"[^}]*{[^}]*animation:\s*station-otter-charging 640ms ease-in-out infinite alternate;/s,
    );
    expect(stationCss).toMatch(
      /data-departure-state="charging"[^}]*data-motion-role="engine"[^}]*{[^}]*animation:\s*station-engine-charging-drawn 480ms ease-in-out infinite alternate;/s,
    );

    expect(stationCss).toMatch(
      /data-departure-state="departing"[^}]*service-hatch[^}]*{[^}]*animation:\s*station-door-closing 220ms ease-in both;/s,
    );
    expect(stationCss).toMatch(
      /data-departure-state="departing"[^}]*data-motion-role="otter"[^}]*{[^}]*animation:\s*station-otter-boarding 300ms ease-in 120ms both;/s,
    );
    expect(stationCss).toMatch(
      /data-departure-state="departing"[^}]*data-motion-role="wake"[^}]*{[^}]*animation:\s*station-wake-departing-drawn 940ms ease-out 260ms both;/s,
    );
    expect(stationCss).toMatch(
      /data-departure-state="departing"[^}]*station-layer--foreground[^}]*{[^}]*animation:\s*station-foreground-departing 940ms ease-out 260ms both;/s,
    );

    const vehicleDeparture = extractCssBlock(
      stationCss,
      '@keyframes station-vehicle-departing',
    );
    expect(vehicleDeparture).toMatch(/21\.6667%\s*{[^}]*transform:/s);
    expect(vehicleDeparture).toMatch(
      /30%\s*{[^}]*translate3d\(24px,/s,
    );
    expect(vehicleDeparture).toMatch(/100%\s*{[^}]*translate3d\(120vw,/s);
    expect(vehicleDeparture).not.toContain('scaleX(');

    for (const keyframes of [
      'station-otter-charging',
      'station-otter-boarding',
    ]) {
      const horizontalOffsets = [
        ...extractCssBlock(stationCss, `@keyframes ${keyframes}`).matchAll(
          /transform:\s*translate3d\(([^,]+),/g,
        ),
      ].map((match) => match[1]);
      expect(horizontalOffsets.length, keyframes).toBeGreaterThan(0);
      expect(horizontalOffsets, keyframes).toEqual(
        horizontalOffsets.map(() => '0'),
      );
    }

    for (const keyframes of [
      'station-door-closing',
      'station-otter-boarding',
      'station-vehicle-departing',
      'station-wake-departing-drawn',
      'station-foreground-departing',
    ]) {
      const declarations = [
        ...extractCssBlock(stationCss, `@keyframes ${keyframes}`).matchAll(
          /([a-z-]+)\s*:/g,
        ),
      ].map((match) => match[1]);
      expect(declarations.length, keyframes).toBeGreaterThan(0);
      expect(
        declarations.every((property) => (
          property === 'transform' || property === 'opacity'
        )),
        keyframes,
      ).toBe(true);
    }

    expect(stationCss).toMatch(
      /data-reduced-motion="true"[^}]*data-departure-state="departing"[^}]*{[^}]*animation:\s*station-departing-opacity-drawn 80ms linear both;/s,
    );
    const reducedDeparture = extractCssBlock(
      stationCss,
      '@keyframes station-departing-opacity-drawn',
    );
    expect(reducedDeparture).toMatch(/from\s*{\s*opacity:\s*1;/s);
    expect(reducedDeparture).toMatch(/to\s*{\s*opacity:\s*0;/s);
    expect(reducedDeparture).not.toContain('transform:');
  });

  it('keeps ticket stamping off in both reduced-motion paths', () => {
    const gameReducedStamp = extractCssBlock(
      stationCss,
      '.station-hero[data-reduced-motion="true"] .station-ticket__stamp',
    );
    expect(gameReducedStamp).toContain('animation: none;');
    expect(gameReducedStamp).toContain('transform: none;');

    const gameReducedCharging = extractCssBlock(
      stationCss,
      '.station-hero[data-reduced-motion="true"][data-departure-state="charging"]',
    );
    expect(gameReducedCharging).toContain(
      'animation: station-charging-opacity-drawn 80ms linear both;',
    );

    const systemReduced = extractCssBlock(
      stationCss,
      '@media (prefers-reduced-motion: reduce)',
    );
    expect(systemReduced).toMatch(
      /data-departure-state="charging"[^}]*station-ticket__stamp[^}]*{[^}]*animation:\s*none;[^}]*transform:\s*none;/s,
    );
    expect(systemReduced).toMatch(
      /data-departure-state="charging"[^}]*{[^}]*animation:\s*station-charging-opacity-drawn 80ms linear both;/s,
    );

    const reducedCharging = extractCssBlock(
      stationCss,
      '@keyframes station-charging-opacity-drawn',
    );
    expect(reducedCharging).not.toContain('transform:');
    expect(reducedCharging).toMatch(/opacity:/);
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

  it('hides the distant train and disables low-priority transforms in low performance', () => {
    const distantTrainRule = extractCssBlock(
      stationCss,
      '.station-hero[data-low-performance="true"] [data-ambient-role="distant-train"]',
    );
    expect(distantTrainRule).toContain('display: none;');
    expect(distantTrainRule).toContain('animation: none;');
    expect(distantTrainRule).toContain('transform: none;');

    const foregroundRule = extractCssBlock(
      stationCss,
      '.station-hero[data-low-performance="true"] .station-layer--foreground',
    );
    expect(foregroundRule).toContain('display: none;');
    expect(foregroundRule).toContain('animation: none;');
    expect(foregroundRule).toContain('transform: none;');
  });

  it('adapts the paper ticket and shared vehicle composition at 430px', () => {
    const mobileCss = extractCssBlock(responsiveCss, '@media (max-width: 430px)');
    const ticketRule = extractCssBlock(mobileCss, '.station-ticket');
    expect(ticketRule).toContain('left: 12px;');
    expect(ticketRule).toContain('right: 12px;');
    expect(ticketRule).toContain('width: auto;');
    expect(mobileCss).toMatch(
      /\.station-hero__captain-button\s*\{[^}]*width:\s*(?:39|40|41|42|43)%/s,
    );
    expect(mobileCss).toMatch(
      /\.station-hero__train\s*\{[^}]*bottom:[^;}]+;[^}]*width:\s*(?:9\d|100)%/s,
    );
  });
});
