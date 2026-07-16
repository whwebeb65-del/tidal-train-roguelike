import { CHIBI_ART } from './ChibiArtCatalog';

export const BATTLE_ART_URLS = {
  background: new URL('./chibi/battle-ocean-bg.webp', import.meta.url).href,
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
} as const;

export type BattleArtId = keyof typeof BATTLE_ART_URLS;

export const DEFERRED_BATTLE_ART_IDS = [
  'stormRayElite',
  'deepEchoBoss',
] as const satisfies readonly BattleArtId[];

export function getCriticalBattleArtIds(
  captainArtId: BattleArtId,
): readonly BattleArtId[] {
  return [
    'background',
    'train',
    captainArtId,
    'otter',
    'jellyMedic',
    'bubbleFin',
    'needleJelly',
    'reefCrab',
  ];
}
