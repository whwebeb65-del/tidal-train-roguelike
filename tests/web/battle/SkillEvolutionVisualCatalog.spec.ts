import { describe, expect, it } from 'vitest';
import {
  SKILL_VARIANT_IDS,
  SKILL_VARIANTS_BY_SKILL,
} from '../../../src/domain/skill/SkillProgressionTypes';
import {
  getSkillEvolutionVisualSignature,
  SKILL_EVOLUTION_VISUAL_SIGNATURES,
} from '../../../web/battle/SkillEvolutionVisualCatalog';

describe('SkillEvolutionVisualCatalog', () => {
  it('maps every authoritative evolution once into a frozen signature', () => {
    expect(Object.keys(SKILL_EVOLUTION_VISUAL_SIGNATURES)).toEqual(SKILL_VARIANT_IDS);
    expect(Object.isFrozen(SKILL_EVOLUTION_VISUAL_SIGNATURES)).toBe(true);
    for (const id of SKILL_VARIANT_IDS) {
      const signature = getSkillEvolutionVisualSignature(id);
      expect(signature.id).toBe(id);
      expect(Object.isFrozen(signature)).toBe(true);
      expect(signature.primary).toMatch(/^#[0-9a-f]{6}$/i);
      expect(signature.secondary).toMatch(/^#[0-9a-f]{6}$/i);
      expect(SKILL_VARIANTS_BY_SKILL[signature.skillId]).toContain(id);
    }
  });
});
