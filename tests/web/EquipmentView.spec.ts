import { describe, expect, it } from 'vitest';
import { createStarterEquipmentState } from '../../src/domain/equipment/EquipmentSystem';
import { renderEquipment } from '../../web/views/EquipmentView';

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
    expect(html).not.toContain('概率');
  });
});
