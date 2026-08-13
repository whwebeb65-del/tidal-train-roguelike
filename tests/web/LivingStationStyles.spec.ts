import { existsSync, readFileSync } from 'node:fs';
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
  const discoveryCssUrl = new URL(
    '../../web/styles/tidal-archive-discovery.css',
    import.meta.url,
  );
  const discoveryCss = existsSync(discoveryCssUrl)
    ? readFileSync(discoveryCssUrl, 'utf8')
    : '';
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
  const livingStationFlowCss = readFileSync(
    new URL('../../web/styles/living-station-flow.css', import.meta.url),
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

  it('imports scoped archive discovery feedback after the archive foundation', () => {
    const entry = readFileSync(
      new URL('../../web/styles.css', import.meta.url),
      'utf8',
    );
    expect(entry).toContain('@import "./styles/tidal-archive-discovery.css";');
    expect(entry.indexOf('tidal-archive.css')).toBeLessThan(
      entry.indexOf('tidal-archive-discovery.css'),
    );
    expect(discoveryCss).toContain('.app-shell--battle .battle-archive-discovery');
    expect(discoveryCss).toContain('.otter-workshop .archive-unread-seal');
    expect(discoveryCss).toContain('.tidal-archive-carriage .archive-new-stamp');
    expect(discoveryCss).toContain('.battle-overlay--settlement .settlement-archive-luggage');
    expect(discoveryCss).not.toMatch(
      /(^|,)\s*\.(?:battle-archive-discovery|archive-unread-seal|archive-new-stamp|settlement-archive-luggage)/m,
    );
  });

  it('keeps every new feedback pseudo decorative in one pointer-safe rule', () => {
    expect(discoveryCss.match(/pointer-events:\s*none;/g)).toHaveLength(1);
    expect(discoveryCss).toMatch(
      /\.app-shell--battle \.battle-archive-discovery::before,\s*\.app-shell--battle \.battle-archive-discovery::after,\s*\.otter-workshop \.archive-unread-seal::before,\s*\.otter-workshop \.archive-unread-seal::after,\s*\.tidal-archive-carriage \.archive-new-stamp::before,\s*\.tidal-archive-carriage \.archive-new-stamp::after,\s*\.battle-overlay--settlement \.settlement-archive-luggage::before,\s*\.battle-overlay--settlement \[data-settlement-archive-entry\]::before,\s*\.battle-overlay--settlement \[data-settlement-archive-entry\]::after\s*\{[^}]*pointer-events:\s*none;/s,
    );
  });

  it('styles the battle ticket, unread seal and NEW stamp without stealing layout space', () => {
    expect(discoveryCss).toMatch(
      /\.app-shell--battle \.battle-archive-discovery\s*\{[^}]*position:\s*absolute;[^}]*right:\s*max\([^;]*safe-area-inset-right[^;]*\);[^}]*background:\s*#fff1c4;/s,
    );
    expect(discoveryCss).toMatch(
      /\.app-shell--battle \.battle-archive-discovery::after\s*\{[^}]*color:\s*#a63f38;[^}]*border:[^;]*#a63f38;/s,
    );
    expect(discoveryCss).toMatch(
      /\.app-shell--battle \.battle-archive-discovery\[data-archive-discovery-kind="enemy"\]\s*\{[^}]*border-color:\s*#147f7b;/s,
    );
    expect(discoveryCss).toMatch(
      /\.app-shell--battle \.battle-archive-discovery\[data-archive-discovery-kind="skill-variant"\]\s*\{[^}]*border-color:\s*#684086;[^}]*box-shadow:[^;]*#b08a3a;/s,
    );
    expect(discoveryCss).toMatch(
      /\.otter-workshop \.archive-unread-seal\s*\{[^}]*position:\s*absolute;/s,
    );
    expect(archiveCss).toMatch(/\.workshop-tabs button\s*\{[^}]*height:\s*46px;/s);
    expect(discoveryCss).toMatch(
      /\.tidal-archive-carriage \.archive-new-stamp\s*\{[^}]*position:\s*absolute;/s,
    );
  });

  it('wraps settlement luggage, constrains failed images and preserves actions on mobile', () => {
    expect(discoveryCss).toMatch(
      /\.battle-overlay--settlement \.settlement-archive-luggage\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*max-width:\s*100%;/s,
    );
    expect(discoveryCss).toMatch(
      /\.battle-overlay--settlement \[data-settlement-archive-entry\]\s*\{[^}]*grid-template-columns:\s*44px minmax\(0,\s*1fr\);[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s,
    );
    expect(discoveryCss).toMatch(
      /\.battle-overlay--settlement \[data-settlement-archive-entry\] img\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*object-fit:\s*contain;/s,
    );
    expect(discoveryCss).toMatch(
      /\.battle-overlay--settlement \[data-settlement-archive-entry\] (?:small|b),[\s\S]*?overflow-wrap:\s*anywhere;/s,
    );
    expect(discoveryCss).toMatch(
      /@media \(max-width:\s*430px\)[\s\S]*?\.app-shell--battle \.battle-archive-discovery\s*\{[^}]*max-width:\s*calc\(100%[^;]*safe-area-inset-left[^;]*safe-area-inset-right[^;]*\);/s,
    );
    expect(discoveryCss).toMatch(
      /@media \(max-width:\s*430px\)[\s\S]*?\.battle-overlay--settlement \[data-settlement-archive-entry\]\s*\{[^}]*flex-basis:\s*100%;/s,
    );
    expect(discoveryCss).toMatch(
      /\.battle-overlay--settlement \.battle-dialog--settlement\s*\{[^}]*max-height:\s*calc\(100dvh[^;]*\);[^}]*overflow-y:\s*auto;/s,
    );
    expect(discoveryCss).toMatch(
      /\.battle-overlay--settlement \.battle-dialog__actions\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;/s,
    );
  });

  it('wins the later settlement flow cascade with a safe parent and real dialog scrollport', () => {
    const entry = readFileSync(
      new URL('../../web/styles.css', import.meta.url),
      'utf8',
    );
    expect(entry.indexOf('tidal-archive-discovery.css')).toBeLessThan(
      entry.indexOf('living-station-flow.css'),
    );
    expect(livingStationFlowCss).toMatch(
      /\.battle-overlay\.arrival-platform,\s*\.battle-overlay\.trial-record-board\s*\{[^}]*overflow:\s*hidden;[^}]*padding:\s*clamp\(/s,
    );
    expect(discoveryCss).toMatch(
      /\.battle-overlay--settlement\.battle-overlay\.arrival-platform,\s*\.battle-overlay--settlement\.battle-overlay\.trial-record-board\s*\{[^}]*--settlement-safe-block-start:\s*max\([^;]*safe-area-inset-top[^;]*\);[^}]*--settlement-safe-block-end:\s*max\([^;]*safe-area-inset-bottom[^;]*\);[^}]*box-sizing:\s*border-box;[^}]*min-height:\s*0;[^}]*height:\s*100%;[^}]*max-height:\s*100dvh;[^}]*padding:\s*var\(--settlement-safe-block-start\)[^;]*;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s,
    );
    expect(discoveryCss).toMatch(
      /\.battle-overlay--settlement\.battle-overlay\.arrival-platform \.battle-dialog--settlement,\s*\.battle-overlay--settlement\.battle-overlay\.trial-record-board \.battle-dialog--settlement\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*var\(--settlement-safe-block-start\)\s*-\s*var\(--settlement-safe-block-end\)\);[^}]*overflow-y:\s*auto;/s,
    );
  });

  it('keeps arrival and trial settlement geometry bounded on single-column mobile luggage', () => {
    expect(livingStationFlowCss).toMatch(
      /@media \(max-width:\s*760px\)[\s\S]*?\.battle-overlay\.arrival-platform,\s*\.battle-overlay\.trial-record-board\s*\{[^}]*padding:\s*30px 15px 42px;/s,
    );
    expect(discoveryCss).toMatch(
      /@media \(max-width:\s*430px\)[\s\S]*?\.battle-overlay--settlement\.battle-overlay\.arrival-platform,\s*\.battle-overlay--settlement\.battle-overlay\.trial-record-board\s*\{[^}]*--settlement-safe-block-start:\s*max\([^;]*safe-area-inset-top[^;]*\);[^}]*--settlement-safe-block-end:\s*max\([^;]*safe-area-inset-bottom[^;]*\);/s,
    );
    expect(discoveryCss).toMatch(
      /@media \(max-width:\s*430px\)[\s\S]*?\.battle-overlay--settlement \[data-settlement-archive-entry\]\s*\{[^}]*flex-basis:\s*100%;/s,
    );
  });

  it('removes discovery feedback motion from elements and pseudos on request', () => {
    expect(discoveryCss).toMatch(
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.app-shell--battle \.battle-archive-discovery,\s*\.app-shell--battle \.battle-archive-discovery::before,\s*\.app-shell--battle \.battle-archive-discovery::after,\s*\.otter-workshop \.archive-unread-seal,\s*\.otter-workshop \.archive-unread-seal::before,\s*\.otter-workshop \.archive-unread-seal::after,\s*\.tidal-archive-carriage \.archive-new-stamp,\s*\.tidal-archive-carriage \.archive-new-stamp::before,\s*\.tidal-archive-carriage \.archive-new-stamp::after,\s*\.battle-overlay--settlement \.settlement-archive-luggage,\s*\.battle-overlay--settlement \.settlement-archive-luggage::before,\s*\.battle-overlay--settlement \[data-settlement-archive-entry\],\s*\.battle-overlay--settlement \[data-settlement-archive-entry\]::before,\s*\.battle-overlay--settlement \[data-settlement-archive-entry\]::after\s*\{[^}]*animation-name:\s*none\s*!important;[^}]*animation-duration:\s*0s\s*!important;[^}]*transition-duration:\s*0s\s*!important;[^}]*transform:\s*none\s*!important;/s,
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
