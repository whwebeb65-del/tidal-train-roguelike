import { describe, expect, it } from 'vitest';
import {
  BATTLE_SKILL_IDS,
  SKILL_VARIANT_IDS,
  SKILL_VARIANTS_BY_SKILL,
} from '../../../src/domain/skill/SkillProgressionTypes';

describe('SkillProgressionTypes', () => {
  it('declares three skills and four unique variants per skill', () => {
    expect(BATTLE_SKILL_IDS).toEqual([
      'tidal-volley',
      'bubble-barrier',
      'extreme-tide',
    ]);
    expect(SKILL_VARIANT_IDS).toHaveLength(12);
    expect(new Set(SKILL_VARIANT_IDS).size).toBe(12);
    for (const skillId of BATTLE_SKILL_IDS) {
      expect(SKILL_VARIANTS_BY_SKILL[skillId]).toHaveLength(4);
    }
  });
});
