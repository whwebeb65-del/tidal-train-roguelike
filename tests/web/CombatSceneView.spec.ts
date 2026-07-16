import { describe, expect, it } from 'vitest';
import { renderCombatScene } from '../../web/views/CombatSceneView';

describe('CombatSceneView', () => {
  it('renders layered combat art and all existing combat actions', () => {
    const html = renderCombatScene({
      captainId: 'captain-tide-male',
      skinId: 'skin-seafoam-departure',
      boss: false,
      enemyHp: 72,
      enemyMaxHp: 100,
      playerHp: 88,
      playerMaxHp: 110,
      skillCharges: 1,
      attackDamage: 27,
      skillDamage: 54,
      repairAmount: 20,
      burstDamage: 64,
      burstReady: true,
      repairReady: true,
    });

    expect(html.match(/data-action="combat-action"/g)).toHaveLength(4);
    expect(html).toContain('data-action="damage"');
    expect(html).toContain('alt="泡泡列车"');
    expect(html).toContain('alt="鼓浪刺豚"');
    expect(html).toContain('alt="罗盘列车长 · 海沫启航"');
  });
});
