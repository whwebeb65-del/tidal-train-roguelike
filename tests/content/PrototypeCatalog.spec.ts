import { describe, expect, it } from 'vitest';
import { getPrototypeCatalog } from '../../src/content/PrototypeCatalog';

describe('PrototypeCatalog', () => {
  it('contains the prototype content budget', () => {
    const catalog = getPrototypeCatalog();
    expect(catalog.passengers.length).toBeGreaterThanOrEqual(8);
    expect(catalog.passengers.length).toBeLessThanOrEqual(10);
    expect(catalog.modules.length).toBeGreaterThanOrEqual(12);
    expect(catalog.modules.length).toBeLessThanOrEqual(15);
  });

  it('has unique IDs and valid tags', () => {
    const catalog = getPrototypeCatalog();
    const passengerIds = catalog.passengers.map((item) => item.id);
    const moduleIds = catalog.modules.map((item) => item.id);
    const validTags = new Set(['mechanic', 'fire', 'healing', 'sound', 'illusion', 'defense']);

    expect(new Set(passengerIds).size).toBe(passengerIds.length);
    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    expect(catalog.passengers.every((item) => item.tags.length >= 1)).toBe(true);
    expect(catalog.modules.every((item) => item.tags.every((tag) => validTags.has(tag)))).toBe(true);
  });

  it('contains the fixed synergy content IDs', () => {
    const catalog = getPrototypeCatalog();
    const moduleIds = new Set(catalog.modules.map((item) => item.id));
    expect(moduleIds.has('steam-cannon')).toBe(true);
    expect(moduleIds.has('sound-mirror')).toBe(true);
    expect(moduleIds.has('repair-drone')).toBe(true);
  });
});
