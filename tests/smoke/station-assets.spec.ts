import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHIBI_ART } from '../../web/assets/ChibiArtCatalog';

describe('hand-drawn station art catalog', () => {
  it('provides four local scene layers and two local ambient actors', () => {
    expect(Object.keys(CHIBI_ART.station)).toEqual([
      'sky',
      'horizon',
      'platform',
      'foreground',
      'mailFish',
      'distantTrain',
    ]);
    for (const [id, href] of Object.entries(CHIBI_ART.station)) {
      const url = new URL(href);
      expect(url.protocol, id).toBe('file:');
      expect(existsSync(fileURLToPath(url)), id).toBe(true);
    }
  });
});
