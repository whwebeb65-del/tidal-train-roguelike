const stationSky = new URL('./chibi/station-sky-dusk.webp', import.meta.url).href;
const stationHorizon = new URL('./chibi/station-horizon-dusk.webp', import.meta.url).href;
const stationPlatform = new URL('./chibi/station-platform-dusk.webp', import.meta.url).href;
const stationForeground = new URL('./chibi/station-foreground-dusk.webp', import.meta.url).href;

export const CHIBI_ART = {
  station: {
    sky: stationSky,
    horizon: stationHorizon,
    platform: stationPlatform,
    foreground: stationForeground,
    mailFish: new URL('./chibi/flying-fish-post.webp', import.meta.url).href,
    distantTrain: new URL('./chibi/station-distant-train.webp', import.meta.url).href,
  },
  stationBackground: stationPlatform,
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
