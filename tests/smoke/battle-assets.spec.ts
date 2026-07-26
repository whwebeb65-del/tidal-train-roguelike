import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BATTLE_ART_URLS,
  DEFERRED_BATTLE_ART_IDS,
  getCriticalBattleArtIds,
} from '../../web/assets/BattleArtCatalog';

const skillAssets = [
  ['tidal-volley-badge.webp', 256, 256],
  ['bubble-barrier-badge.webp', 256, 256],
  ['extreme-tide-badge.webp', 256, 256],
  ['split-tide-arrow-glyph.webp', 64, 64],
  ['reef-piercer-glyph.webp', 64, 64],
  ['returning-volley-glyph.webp', 64, 64],
  ['rainstorm-school-glyph.webp', 64, 64],
  ['bursting-bubble-glyph.webp', 64, 64],
  ['reflective-spines-glyph.webp', 64, 64],
  ['overflow-membrane-glyph.webp', 64, 64],
  ['emergency-trigger-glyph.webp', 64, 64],
  ['undertow-eye-glyph.webp', 64, 64],
  ['lingering-vortex-glyph.webp', 64, 64],
  ['energy-return-glyph.webp', 64, 64],
  ['double-crest-glyph.webp', 64, 64],
] as const;

function parseWebpMetadata(buffer: Buffer): {
  dimensions: readonly [number, number];
  hasAlpha: boolean;
} {
  expect(buffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(buffer.subarray(8, 12).toString('ascii')).toBe('WEBP');
  const chunk = buffer.subarray(12, 16).toString('ascii');

  if (chunk === 'VP8X') {
    return {
      dimensions: [
        1 + buffer.readUIntLE(24, 3),
        1 + buffer.readUIntLE(27, 3),
      ],
      hasAlpha:
        Boolean(buffer[20] & 0b0001_0000) ||
        buffer.includes(Buffer.from('ALPH', 'ascii')),
    };
  }

  expect(chunk).toBe('VP8L');
  return {
    dimensions: [
      1 + buffer[21] + ((buffer[22] & 0b0011_1111) << 8),
      1 +
        (buffer[22] >>> 6) +
        (buffer[23] << 2) +
        ((buffer[24] & 0b0000_1111) << 10),
    ],
    hasAlpha: Boolean(buffer[24] & 0b0001_0000),
  };
}

describe('battle art catalog', () => {
  it('references local source files that exist', () => {
    for (const [id, href] of Object.entries(BATTLE_ART_URLS)) {
      const url = new URL(href);
      expect(url.protocol, `${id} must be a local source asset`).toBe('file:');
      expect(existsSync(fileURLToPath(url)), `${id} source asset`).toBe(true);
    }
  });

  it('keeps the first battle stage separate from elite and boss art', () => {
    const critical = getCriticalBattleArtIds('captainFemaleBase');

    expect(BATTLE_ART_URLS).not.toHaveProperty('background');
    expect(critical).toEqual([
      'backgroundSky',
      'backgroundHorizon',
      'backgroundTrack',
      'backgroundForeground',
      'train',
      'captainFemaleBase',
      'otter',
      'jellyMedic',
      'bubbleFin',
      'needleJelly',
      'reefCrab',
    ]);
    expect(critical).not.toContain('stormRayElite');
    expect(critical).not.toContain('deepEchoBoss');
    expect(DEFERRED_BATTLE_ART_IDS).toEqual([
      'stormRayElite',
      'deepEchoBoss',
    ]);
  });
});

describe('production skill art', () => {
  it.each(skillAssets)('ships %s as a transparent %ix%i WebP', async (name, width, height) => {
    const assetPath = join(
      fileURLToPath(new URL('../../web/assets/chibi/skills/', import.meta.url)),
      name,
    );

    expect(existsSync(assetPath), name).toBe(true);
    const buffer = await readFile(assetPath);
    const metadata = parseWebpMetadata(buffer);
    expect(metadata.dimensions).toEqual([width, height]);
    expect(metadata.hasAlpha, `${name} alpha channel`).toBe(true);
  });
});
