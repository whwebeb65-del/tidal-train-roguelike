import { CHIBI_ART } from './ChibiArtCatalog';
import type { SkillVariantId } from '../../src/domain/skill/SkillProgressionTypes';

export const BATTLE_ART_URLS = {
  backgroundSky: new URL('./chibi/battle-sky-dusk.webp', import.meta.url).href,
  backgroundHorizon: new URL('./chibi/battle-horizon-dusk.webp', import.meta.url).href,
  backgroundTrack: new URL('./chibi/battle-track-dusk.webp', import.meta.url).href,
  backgroundForeground: new URL('./chibi/battle-foreground-dusk.webp', import.meta.url).href,
  train: CHIBI_ART.train,
  captainFemaleBase:
    CHIBI_ART.captains['captain-tide-female']['skin-tide-base'],
  captainFemaleSeafoam:
    CHIBI_ART.captains[
      'captain-tide-female'
    ]['skin-seafoam-departure'],
  captainFemaleAurora:
    CHIBI_ART.captains[
      'captain-tide-female'
    ]['skin-aurora-whale-song'],
  captainMaleBase:
    CHIBI_ART.captains['captain-tide-male']['skin-tide-base'],
  captainMaleSeafoam:
    CHIBI_ART.captains[
      'captain-tide-male'
    ]['skin-seafoam-departure'],
  captainMaleAurora:
    CHIBI_ART.captains[
      'captain-tide-male'
    ]['skin-aurora-whale-song'],
  otter: CHIBI_ART.otter,
  jellyMedic: CHIBI_ART.jellyfish,
  bubbleFin: CHIBI_ART.pufferDragon,
  needleJelly:
    new URL('./chibi/needle-jelly-enemy.webp', import.meta.url).href,
  reefCrab: CHIBI_ART.crystalCrab,
  stormRayElite:
    new URL('./chibi/storm-ray-elite.webp', import.meta.url).href,
  deepEchoBoss: CHIBI_ART.tidalBoss,
  skillTidalVolley:
    new URL('./chibi/skills/tidal-volley-badge.webp', import.meta.url).href,
  skillBubbleBarrier:
    new URL('./chibi/skills/bubble-barrier-badge.webp', import.meta.url).href,
  skillExtremeTide:
    new URL('./chibi/skills/extreme-tide-badge.webp', import.meta.url).href,
} as const;

export type BattleArtId = keyof typeof BATTLE_ART_URLS;

export const BATTLE_VARIANT_GLYPH_URLS: Readonly<
  Record<SkillVariantId, string>
> = {
  'split-tide-arrow': new URL(
    './chibi/skills/split-tide-arrow-glyph.webp',
    import.meta.url,
  ).href,
  'reef-piercer': new URL(
    './chibi/skills/reef-piercer-glyph.webp',
    import.meta.url,
  ).href,
  'returning-volley': new URL(
    './chibi/skills/returning-volley-glyph.webp',
    import.meta.url,
  ).href,
  'rainstorm-school': new URL(
    './chibi/skills/rainstorm-school-glyph.webp',
    import.meta.url,
  ).href,
  'bursting-bubble': new URL(
    './chibi/skills/bursting-bubble-glyph.webp',
    import.meta.url,
  ).href,
  'reflective-spines': new URL(
    './chibi/skills/reflective-spines-glyph.webp',
    import.meta.url,
  ).href,
  'overflow-membrane': new URL(
    './chibi/skills/overflow-membrane-glyph.webp',
    import.meta.url,
  ).href,
  'emergency-trigger': new URL(
    './chibi/skills/emergency-trigger-glyph.webp',
    import.meta.url,
  ).href,
  'undertow-eye': new URL(
    './chibi/skills/undertow-eye-glyph.webp',
    import.meta.url,
  ).href,
  'lingering-vortex': new URL(
    './chibi/skills/lingering-vortex-glyph.webp',
    import.meta.url,
  ).href,
  'energy-return': new URL(
    './chibi/skills/energy-return-glyph.webp',
    import.meta.url,
  ).href,
  'double-crest': new URL(
    './chibi/skills/double-crest-glyph.webp',
    import.meta.url,
  ).href,
};

export const DEFERRED_BATTLE_ART_IDS = [
  'stormRayElite',
  'deepEchoBoss',
] as const satisfies readonly BattleArtId[];

export function getCriticalBattleArtIds(
  captainArtId: BattleArtId,
): readonly BattleArtId[] {
  return [
    'backgroundSky',
    'backgroundHorizon',
    'backgroundTrack',
    'backgroundForeground',
    'train',
    captainArtId,
    'otter',
    'jellyMedic',
    'bubbleFin',
    'needleJelly',
    'reefCrab',
    'skillTidalVolley',
    'skillBubbleBarrier',
    'skillExtremeTide',
  ];
}
