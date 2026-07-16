export const CHIBI_ART = {
  stationBackground: new URL('./chibi/station-ocean-bg.webp', import.meta.url).href,
  train: new URL('./chibi/bubble-train.webp', import.meta.url).href,
  captains: {
    'captain-tide-female': {
      'skin-tide-base': new URL('./chibi/captain-female-base.webp', import.meta.url).href,
      'skin-seafoam-departure': new URL('./chibi/captain-female-seafoam.webp', import.meta.url).href,
      'skin-aurora-whale-song': new URL('./chibi/captain-female-aurora.webp', import.meta.url).href,
    },
    'captain-tide-male': {
      'skin-tide-base': new URL('./chibi/captain-male-base.webp', import.meta.url).href,
      'skin-seafoam-departure': new URL('./chibi/captain-male-seafoam.webp', import.meta.url).href,
      'skin-aurora-whale-song': new URL('./chibi/captain-male-aurora.webp', import.meta.url).href,
    },
  },
  otter: new URL('./chibi/otter-mechanic.webp', import.meta.url).href,
  jellyfish: new URL('./chibi/jellyfish-medic.webp', import.meta.url).href,
  pufferDragon: new URL('./chibi/puffer-dragon.webp', import.meta.url).href,
  crystalCrab: new URL('./chibi/crystal-crab.webp', import.meta.url).href,
  tidalBoss: new URL('./chibi/tidal-boss.webp', import.meta.url).href,
} as const;
