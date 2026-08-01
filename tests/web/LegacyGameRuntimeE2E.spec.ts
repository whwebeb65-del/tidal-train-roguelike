import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as runtimeModule from '../../web/LegacyGameRuntime';

interface RuntimeE2EConfig {
  readonly enabled: boolean;
  readonly equipmentEmpty: boolean;
  readonly purchaseDelayMs: number;
}

describe('LegacyGameRuntime E2E purchase controls', () => {
  it('parses exact E2E gates and clamps every purchase-delay boundary', () => {
    const parse = (
      runtimeModule as unknown as {
        readonly parseRuntimeE2EConfig?: (search: string) => RuntimeE2EConfig;
      }
    ).parseRuntimeE2EConfig;

    expect(parse).toBeTypeOf('function');
    if (!parse) return;

    expect(parse('?e2e=1&e2ePurchaseDelayMs=-1')).toEqual({
      enabled: true,
      equipmentEmpty: false,
      purchaseDelayMs: 0,
    });
    expect(parse('?e2e=1&e2ePurchaseDelayMs=5001')).toMatchObject({
      enabled: true,
      purchaseDelayMs: 5_000,
    });
    expect(parse('?e2e=1&e2ePurchaseDelayMs=not-a-number')).toMatchObject({
      enabled: true,
      purchaseDelayMs: 0,
    });
    expect(parse('?e2e=1&e2ePurchaseDelayMs=12.9')).toMatchObject({
      enabled: true,
      purchaseDelayMs: 12,
    });
    expect(parse('?e2e=1&e2eEquipmentEmpty=1')).toEqual({
      enabled: true,
      equipmentEmpty: true,
      purchaseDelayMs: 0,
    });
    for (const gate of ['0', 'true']) {
      expect(parse(`?e2e=${gate}&e2eEquipmentEmpty=1&e2ePurchaseDelayMs=5000`))
        .toEqual({
          enabled: false,
          equipmentEmpty: false,
          purchaseDelayMs: 0,
        });
    }
  });

  it('allows a purchase delay only behind the exact e2e gate', () => {
    const source = readFileSync(
      new URL('../../web/LegacyGameRuntime.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('parseRuntimeE2EConfig(window.location.search)');
    expect(source).toMatch(/const e2ePurchaseDelayMs = runtimeE2EConfig\.purchaseDelayMs;[\s\S]*new MockStore\('verified', e2ePurchaseDelayMs\)/);
  });

  it('allows empty-equipment visual QA only behind the exact e2e gate', () => {
    const source = readFileSync(
      new URL('../../web/LegacyGameRuntime.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('const e2eEquipmentEmpty = runtimeE2EConfig.equipmentEmpty;');
    expect(source).toMatch(/const e2eEquipmentEmpty = runtimeE2EConfig\.equipmentEmpty;[\s\S]*equipmentInventory: \[\]/);
  });
});
