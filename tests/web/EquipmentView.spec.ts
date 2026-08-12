import { describe, expect, it } from 'vitest';
import { createStarterEquipmentState } from '../../src/domain/equipment/EquipmentSystem';
import { createSkillMasteryXp } from '../../src/domain/progression/SkillMasterySystem';
import { renderEquipment } from '../../web/views/EquipmentView';
import { buildTidalArchiveViewModel } from '../../web/views/TidalArchiveView';

describe('EquipmentView', () => {
  it('renders four slots, both sets and deterministic progression actions', () => {
    const starter = createStarterEquipmentState();
    const html = renderEquipment({
      state: {
        ...starter,
        gears: 200,
        fragments: { 'tide-cannon': 20 },
      },
    });

    expect(html.match(/class="equipment-slot/g)).toHaveLength(4);
    expect(html).toContain('潮泡守望');
    expect(html).toContain('珊瑚突击');
    expect(html).toContain('data-action="equip-equipment"');
    expect(html).toContain('data-action="upgrade-equipment"');
    expect(html).toContain('data-action="star-equipment"');
    expect(html).toContain('data-action="reroll-equipment"');
    expect(html).toContain('data-nav-scene="captain"');
    expect(html).not.toContain('概率');
    expect(html).toContain('living-zone otter-workshop');
    expect(html).toContain('tool-wall');
    expect(html).toContain('workbench-item');
    expect(html).toContain('parts-bin');
    expect(html).toContain('maintenance-tag');
    expect(html).toContain('data-action="show-equipment-workshop" aria-pressed="true"');
    expect(html).toContain('data-action="show-tidal-archive" aria-pressed="false"');
  });

  it('renders the archive panel without equipment mutation actions', () => {
    const starter = createStarterEquipmentState();
    const archive = buildTidalArchiveViewModel({
      archive: {
        version: 1,
        discoveredEnemyKinds: [],
        discoveredSkillVariantIds: [],
      },
      equipmentInventory: starter.inventory,
      skillMasteryXp: createSkillMasteryXp(),
    });
    const html = renderEquipment({ state: starter, panel: 'archive', archive });

    expect(html).toContain('data-action="show-equipment-workshop" aria-pressed="false"');
    expect(html).toContain('data-action="show-tidal-archive" aria-pressed="true"');
    expect(html).toContain('tidal-archive-carriage');
    expect(html).not.toContain('equipment-layout');
    expect(html).not.toContain('data-action="equip-equipment"');
    expect(html).not.toContain('data-action="upgrade-equipment"');
    expect(html).not.toContain('data-action="star-equipment"');
    expect(html).not.toContain('data-action="reroll-equipment"');
  });
});
