import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => (
    Number.parseInt(hex.slice(start, start + 2), 16) / 255
  )).map((channel) => (
    channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return channels[0] * 0.2126
    + channels[1] * 0.7152
    + channels[2] * 0.0722;
}

function contrastRatio(left: string, right: string): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  return (Math.max(leftLuminance, rightLuminance) + 0.05)
    / (Math.min(leftLuminance, rightLuminance) + 0.05);
}

describe('living station styles', () => {
  const captainCss = readFileSync(
    new URL('../../web/styles/living-station-captain.css', import.meta.url),
    'utf8',
  );
  const workshopCss = readFileSync(
    new URL('../../web/styles/living-station-workshop.css', import.meta.url),
    'utf8',
  );
  const archiveCss = readFileSync(
    new URL('../../web/styles/tidal-archive.css', import.meta.url),
    'utf8',
  );
  const guidebookCss = readFileSync(
    new URL('../../web/styles/captain-guidebook.css', import.meta.url),
    'utf8',
  );
  const battleHudCss = readFileSync(
    new URL('../../web/styles/battle-hud.css', import.meta.url),
    'utf8',
  );
  const battleTutorialCss = readFileSync(
    new URL('../../web/styles/battle-tutorial.css', import.meta.url),
    'utf8',
  );

  it('imports the scene language after generic progression styles', () => {
    const entry = readFileSync(new URL('../../web/styles.css', import.meta.url), 'utf8');
    expect(entry.indexOf('progression.css')).toBeLessThan(
      entry.indexOf('living-station-foundation.css'),
    );
  });

  it('defines shellless places, physical props and reduced motion', () => {
    const css = readFileSync(
      new URL('../../web/styles/living-station-foundation.css', import.meta.url),
      'utf8',
    );
    expect(css).toContain('.living-zone');
    expect(css).toContain('border: 0');
    expect(css).toContain('background: transparent');
    expect(css).toContain('.station-prop');
    expect(css).toContain('.station-stamp');
    expect(css).toContain('.station-hangtag');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps the carriage mirror positioned and non-interactive on mobile', () => {
    expect(captainCss).toMatch(/\.carriage-mirror\s*\{[^}]*position:\s*relative;/);
    expect(captainCss).toMatch(/\.carriage-mirror::before\s*\{[^}]*pointer-events:\s*none;/);
    expect(captainCss).not.toMatch(/@media \(max-width: 760px\)[\s\S]*?\.carriage-mirror\s*\{[^}]*position:\s*static;/);
  });

  it('keeps the desktop wardrobe mirror sticky while browsing skin luggage', () => {
    expect(captainCss).toMatch(
      /@media \(min-width: 761px\)[\s\S]*?\.wardrobe-carriage \.carriage-mirror\s*\{[^}]*position:\s*sticky;[^}]*top:\s*90px;[^}]*max-height:\s*calc\(100vh - 190px\);[^}]*overflow-y:\s*auto;/,
    );
    expect(captainCss).toMatch(
      /\.scene-viewport:has\(\.wardrobe-carriage\)\s*\{[^}]*overflow:\s*visible;/,
    );
  });

  it('switches the captain lineup to one berth per mobile row', () => {
    const mobileCss = captainCss.slice(
      captainCss.indexOf('@media (max-width: 760px)'),
      captainCss.indexOf('@media (max-width: 430px)'),
    );
    expect(mobileCss).toMatch(/\.captain-platform \.platform-lineup\s*\{[^}]*grid-template-columns:\s*1fr;/);
  });

  it('keeps the berth rail behind the captain art', () => {
    expect(captainCss).toMatch(/\.captain-berth::after\s*\{[^}]*z-index:\s*0;/);
  });

  it('keeps workshop equipment controls at the 44px touch-target minimum', () => {
    expect(workshopCss).toMatch(
      /\.workbench-item button\s*\{[^}]*min-height:\s*(?:4[4-9]|[5-9]\d|\d{3,})px;/,
    );
  });

  it('imports a touch-safe physical archive after the workshop styles', () => {
    const entry = readFileSync(
      new URL('../../web/styles.css', import.meta.url),
      'utf8',
    );
    expect(entry).toContain('@import "./styles/tidal-archive.css";');
    expect(entry.indexOf('living-station-workshop.css')).toBeLessThan(
      entry.indexOf('tidal-archive.css'),
    );
    expect(archiveCss).toMatch(
      /\.workshop-tabs button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s,
    );
    expect(archiveCss).toMatch(
      /\.workshop-tabs button\s*\{[^}]*height:\s*46px;/s,
    );
    expect(archiveCss).toMatch(
      /\.archive-card::before,[\s\S]*?\.archive-card::after\s*\{[^}]*pointer-events:\s*none;/s,
    );
    expect(archiveCss).toMatch(
      /@media \(max-width: 430px\)[\s\S]*?\.archive-card-grid/s,
    );
    expect(archiveCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation:\s*none;[\s\S]*?transform:\s*none;/s,
    );
  });

  it('makes every decorative archive pseudo-element non-interactive', () => {
    expect(archiveCss).toMatch(
      /\.otter-workshop \.workshop-tabs::before,\s*\.tidal-archive-carriage \.archive-manifest::before,\s*\.tidal-archive-carriage \.archive-manifest::after,\s*\.tidal-archive-carriage \.archive-ledger::before,\s*\.tidal-archive-carriage \.archive-ledger > header::after,\s*\.tidal-archive-carriage \.archive-card::before,\s*\.tidal-archive-carriage \.archive-card::after\s*\{[^}]*pointer-events:\s*none;/s,
    );
  });

  it('distinguishes the skill-evolution ledger with an accessible purple and gold palette', () => {
    expect(archiveCss).toMatch(
      /\.archive-ledger--variants > header\s*\{[^}]*color:\s*#fff4d0;[^}]*border-color:\s*#43245f;[^}]*background:\s*linear-gradient\(105deg,\s*#43245f,\s*#684086 68%,\s*#8a6724\);[^}]*box-shadow:[^;]*#e4c45d;/s,
    );
    expect(archiveCss).toMatch(
      /\.archive-card--variant\s*\{[^}]*border-color:\s*#684086;[^}]*box-shadow:[^;]*#b08a3a;/s,
    );
    expect(archiveCss).toMatch(
      /\.archive-card--variant \.archive-card__copy small\s*\{[^}]*color:\s*#5b3275;/s,
    );
    expect(contrastRatio('#fff4d0', '#684086')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#fff4d0', '#8a6724')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#5b3275', '#f5e5b7')).toBeGreaterThanOrEqual(4.5);
  });

  it('removes every archive transform and animation when reduced motion is requested', () => {
    expect(archiveCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.otter-workshop \.workshop-tabs button,\s*\.tidal-archive-carriage \.archive-manifest,\s*\.tidal-archive-carriage \.archive-manifest::before,\s*\.tidal-archive-carriage \.archive-manifest::after,\s*\.tidal-archive-carriage \.archive-ledger::before,\s*\.tidal-archive-carriage \.archive-ledger > header::after,\s*\.tidal-archive-carriage \.archive-card,\s*\.tidal-archive-carriage \.archive-card::before,\s*\.tidal-archive-carriage \.archive-card::after\s*\{[^}]*animation:\s*none;[^}]*transition:\s*none;[^}]*transform:\s*none;/s,
    );
    expect(archiveCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.otter-workshop \.workshop-tabs button\[aria-pressed\]\s*\{[^}]*transform:\s*none;/s,
    );
    expect(archiveCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.tidal-archive-carriage \.archive-card:nth-child\(even\),\s*\.tidal-archive-carriage \.archive-card:nth-child\(3n\)\s*\{[^}]*transform:\s*none;/s,
    );
  });

  it('keeps guidebook controls touch-safe and removes decorative motion', () => {
    expect(guidebookCss).toMatch(
      /\.guidebook-action\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/,
    );
    expect(guidebookCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(guidebookCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.captain-guidebook[\s\S]*?animation:\s*none;/,
    );
    expect(guidebookCss).toMatch(
      /\.captain-guidebook::(?:before|after)\s*\{[^}]*pointer-events:\s*none;/,
    );
  });

  it('gives evolution offers a premium crest with a static reduced-motion fallback', () => {
    expect(battleHudCss).toContain('.battle-dialog--evolution');
    expect(battleHudCss).toContain('.evolution-crest');
    expect(battleHudCss).toMatch(
      /\.evolution-crest b\s*\{[^}]*background:\s*#352356;/,
    );
    expect(battleHudCss).toMatch(
      /\.battle-upgrade-card\s*\{[^}]*min-height:\s*(?:4[4-9]|[5-9]\d|\d{3,})px;/,
    );
    expect(battleHudCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.evolution-crest[\s\S]*?animation:\s*none;/,
    );
  });

  it('keeps first-run direction touch-safe, non-blocking and static on request', () => {
    const entry = readFileSync(
      new URL('../../web/styles.css', import.meta.url),
      'utf8',
    );
    expect(entry).toContain('@import "./styles/battle-tutorial.css";');
    expect(battleTutorialCss).toMatch(
      /\[data-battle-action="skip-tutorial"\]\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/,
    );
    expect(battleTutorialCss).toMatch(
      /\.battle-tutorial-ticket::before,[\s\S]*?\.battle-tutorial-ticket::after\s*\{[^}]*pointer-events:\s*none;/,
    );
    expect(battleTutorialCss).toMatch(
      /@media \(max-width: 370px\)[\s\S]*?\.battle-tutorial-ticket--battle\s*\{[^}]*left:\s*max\(8px,\s*env\(safe-area-inset-left\)\);[^}]*right:\s*max\(8px,\s*env\(safe-area-inset-right\)\);/,
    );
    expect(battleTutorialCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.battle-tutorial-ticket\s*\{[^}]*animation:\s*none;[^}]*transform:\s*none;/,
    );
  });
});
