import { describe, expect, it } from 'vitest';
import {
  createSocialExpeditionState,
  joinLegion,
  toggleSquadMember,
} from '../../../src/domain/social/SocialExpeditionSystem';
import { createBattleRunInput } from '../../../web/battle/BattleRunInputFactory';

describe('createBattleRunInput', () => {
  it('combines progression, squad, map and daily rule once', () => {
    let social = joinLegion(
      createSocialExpeditionState('2026-W29'),
      'tide',
    );
    social = toggleSquadMember(social, 'navigator').state;
    social = toggleSquadMember(social, 'gunner').state;

    const result = createBattleRunInput({
      battleId: 'daily-1',
      seed: 9,
      mode: 'daily-trial',
      mapId: 'old-port',
      progression: {
        maxPlayerHp: 110,
        damageFlat: 2,
        damageMultiplier: 1.1,
        gearsMultiplier: 1,
        initialMomentum: 5,
        repairBonus: 6,
        skinModifiers: {
          maxHpFlat: 0,
          maxHpPercent: 0,
          damageFlat: 0,
          damagePercent: 0,
          gearsPercent: 0,
          initialMomentum: 0,
          repairFlat: 0,
        },
        equipmentModifiers: {
          maxHpFlat: 0,
          maxHpPercent: 0,
          damageFlat: 0,
          damagePercent: 0,
          gearsPercent: 0,
          initialMomentum: 0,
          repairFlat: 0,
        },
      },
      social,
      dailyTrial: {
        dayId: '2026-07-16',
        seed: 9,
        rule: {
          id: 'armored-current',
          name: 'Armored Current',
          description: '',
          enemyHpBonus: 20,
          maxPlayerHpDelta: 0,
          initialMomentumBonus: 20,
          damageBonus: 0,
        },
      },
    });

    expect(result.maxTrainHp).toBe(110);
    expect(result.mainCannonDamage).toBe(35);
    expect(result.initialEnergy).toBe(45);
    expect(result.repairBonus).toBe(6);
    expect(result.enemyHpFlatBonus).toBe(20);
    expect(result.enemyHpMultiplier).toBe(1.12);
    expect(result.enemyDamageMultiplier).toBe(1.08);
  });
});
