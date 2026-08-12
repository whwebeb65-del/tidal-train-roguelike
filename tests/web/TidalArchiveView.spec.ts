import { describe, expect, it } from 'vitest';
import { TIDE_BEAST_ARCHIVE_IDS } from '../../src/domain/collection/TidalArchiveSystem';
import { createStarterEquipmentState } from '../../src/domain/equipment/EquipmentSystem';
import { createSkillMasteryXp } from '../../src/domain/progression/SkillMasterySystem';
import { TIDAL_ARCHIVE_ENEMIES } from '../../web/views/TidalArchiveCatalog';
import {
  buildTidalArchiveViewModel,
  renderTidalArchive,
} from '../../web/views/TidalArchiveView';

describe('TidalArchiveView', () => {
  it('derives an immutable enemy catalog in authoritative ID order', () => {
    expect(TIDAL_ARCHIVE_ENEMIES.map((entry) => entry.id))
      .toEqual(TIDE_BEAST_ARCHIVE_IDS);
    expect(Object.isFrozen(TIDAL_ARCHIVE_ENEMIES)).toBe(true);
    expect(TIDAL_ARCHIVE_ENEMIES.every(Object.isFrozen)).toBe(true);
  });

  it('renders all three complete catalogs from authoritative discovery state', () => {
    const model = buildTidalArchiveViewModel({
      archive: {
        version: 2,
        discoveredEnemyKinds: ['bubble-fin'],
        discoveredSkillVariantIds: ['split-tide-arrow'],
        unreadEntryKeys: [],
      },
      equipmentInventory: createStarterEquipmentState().inventory,
      skillMasteryXp: createSkillMasteryXp(),
    });
    const html = renderTidalArchive(model);

    expect(html).toContain('tidal-archive-carriage');
    expect(html.match(/class="archive-manifest"/g)).toHaveLength(1);
    expect(html.match(/data-archive-enemy=/g)).toHaveLength(8);
    expect(html.match(/data-archive-variant=/g)).toHaveLength(12);
    expect(html.match(/data-archive-equipment=/g)).toHaveLength(8);
    expect(html).toContain('data-archive-enemy="bubble-fin"');
    expect(html).toContain('is-discovered');
    expect(html).toContain('未记录潮兽');
    expect(html).toContain('分汐浪箭');
    expect(html).toContain('命中后分裂至第二目标');
    expect(html).toContain('4 / 8');
    expect(html).not.toContain('收藏奖励');
    expect(model.enemies.slice(0, 6).map((entry) => entry.source)).toEqual([
      '任意航线 · 第 1 波',
      '任意航线 · 第 2 波',
      '任意航线 · 第 3 波',
      '任意航线 · 第 1 波',
      '任意航线 · 第 3 波',
      '任意航线 · 第 5 波',
    ]);

    expect(html.indexOf('archive-ledger--beasts'))
      .toBeLessThan(html.indexOf('archive-ledger--variants'));
    expect(html.indexOf('archive-ledger--variants'))
      .toBeLessThan(html.indexOf('archive-ledger--equipment'));
  });

  it('keeps unlock directions visible while concealing private locked copy', () => {
    const model = buildTidalArchiveViewModel({
      archive: {
        version: 2,
        discoveredEnemyKinds: ['bubble-fin'],
        discoveredSkillVariantIds: ['split-tide-arrow'],
        unreadEntryKeys: [],
      },
      equipmentInventory: createStarterEquipmentState().inventory,
      skillMasteryXp: createSkillMasteryXp(),
    });

    expect(model.enemies[1]).toMatchObject({
      discovered: false,
      name: '未记录潮兽',
      role: '战场记录尚未解密',
    });
    expect(model.variants[1]).toMatchObject({
      discovered: false,
      name: '未发现进化',
      effect: '效果记录尚未解密',
      skillName: '潮汐齐射',
      requiredMasteryLevel: 5,
    });
    expect(model.equipment[4]).toMatchObject({
      discovered: false,
      name: '未获得蓝图',
      effect: '基础属性尚未解密',
      slotName: '主炮',
      setName: '珊瑚突击',
    });

    const host = document.createElement('div');
    host.innerHTML = renderTidalArchive(model);
    const discoveredImage = host.querySelector<HTMLImageElement>(
      '[data-archive-enemy="bubble-fin"] img',
    );
    const lockedImage = host.querySelector<HTMLImageElement>(
      '[data-archive-enemy="needle-jelly"] img',
    );
    expect(discoveredImage?.alt).toMatch(/\S/);
    expect(lockedImage?.alt).toBe('');
    expect(lockedImage?.getAttribute('aria-hidden')).toBe('true');
  });
});
// @vitest-environment jsdom
