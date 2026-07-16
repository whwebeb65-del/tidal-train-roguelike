import { BATTLE_ART_URLS } from '../../../../web/assets/BattleArtCatalog';
import type { BattleArtId } from '../../../../web/assets/BattleArtCatalog';
import type { BattleAssetSet } from '../../../../web/battle/AssetLoader';
import type {
  BattleLayer,
} from '../../../../web/battle/BattleDrawTypes';
import {
  BATTLE_LAYER_ORDER,
} from '../../../../web/battle/BattleDrawTypes';
import type {
  BattleRenderInput,
} from '../../../../web/battle/BattleRenderer';
import {
  computeCanvasViewport,
} from '../../../../web/battle/CanvasViewport';
import {
  EMPTY_EFFECT_FRAME_VIEW,
  type EffectFrameView,
} from '../../../../web/battle/EffectSystem';
import type {
  BattleFrameView,
} from '../../../../web/battle/BattleTypes';
import {
  getRenderBudget,
} from '../../../../web/battle/QualityMonitor';

export function createFrameFixture(
  patch: Partial<BattleFrameView> = {},
): BattleFrameView {
  return {
    battleId: 'presentation-1',
    mode: 'normal',
    mapId: 'drift-suburb',
    status: 'running',
    elapsedMs: 42_000,
    phaseElapsedMs: 42_000,
    wave: 2,
    trainHp: 88,
    maxTrainHp: 100,
    shield: 20,
    shieldRemainingMs: 3000,
    energy: 72,
    combo: 12,
    kills: 8,
    experience: 240,
    nextExperienceThreshold: 560,
    offeredUpgradeIds: [],
    upgradeLevels: {
      'multi-barrel': 0,
      'rapid-reload': 1,
      'coral-warhead': 0,
      'echo-chain': 0,
      'precision-lens': 0,
      'bubble-capacitor': 0,
      'tidal-resonance': 0,
      'magnetic-salvage': 0,
      'overload-core': 0,
    },
    cooldowns: {
      'tidal-volley': 4000,
      'bubble-barrier': 0,
      'extreme-tide': 0,
    },
    adReviveUsed: false,
    skillRefreshUsed: false,
    upgradeRerollUsed: false,
    enemies: [
      {
        id: 1,
        kind: 'needle-jelly',
        lane: 0,
        x: 92,
        y: 250,
        hp: 30,
        maxHp: 45,
        shield: 0,
        speedPerSecond: 85,
        defenceBroken: false,
        attackCooldownMs: 800,
        ageMs: 1200,
        alive: true,
      },
      {
        id: 2,
        kind: 'reef-crab',
        lane: 2,
        x: 298,
        y: 420,
        hp: 120,
        maxHp: 180,
        shield: 20,
        speedPerSecond: 34,
        defenceBroken: true,
        attackCooldownMs: 1000,
        ageMs: 1800,
        alive: true,
      },
    ],
    projectiles: [
      {
        id: 3,
        source: 'main',
        x: 190,
        y: 530,
        targetId: 2,
        speedPerSecond: 620,
        damage: 25,
        splashRadius: 0,
        chainRemaining: 0,
        critical: false,
        active: true,
      },
    ],
    loot: [
      {
        id: 4,
        kind: 'experience',
        x: 140,
        y: 360,
        amount: 10,
        ageMs: 160,
        collected: false,
      },
    ],
    ...patch,
  };
}

export function createPresentationFixture(input: {
  readonly failedArtIds?: readonly BattleArtId[];
  readonly frame?: Partial<BattleFrameView>;
  readonly reducedMotion?: boolean;
  readonly effects?: EffectFrameView;
} = {}): BattleRenderInput {
  const failed = new Set(input.failedArtIds ?? []);
  const sources = new Map<BattleArtId, CanvasImageSource>();
  for (const id of Object.keys(BATTLE_ART_URLS) as BattleArtId[]) {
    sources.set(id, {
      width: 256,
      height: 256,
    } as unknown as CanvasImageSource);
  }
  const assets: BattleAssetSet<BattleArtId> = {
    failedIds: [...failed],
    get: (id) => failed.has(id) ? null : sources.get(id) ?? null,
  };

  return {
    frame: createFrameFixture(input.frame),
    assets,
    viewport: computeCanvasViewport({
      cssWidth: 390,
      cssHeight: 844,
      devicePixelRatio: 1,
      maxDevicePixelRatio: 2,
    }),
    captainArtId: 'captainFemaleBase',
    timeMs: 42_000,
    reducedMotion: input.reducedMotion ?? false,
    effects: input.effects ?? EMPTY_EFFECT_FRAME_VIEW,
    renderBudget: getRenderBudget('high'),
  };
}

export function byBattleLayer(
  left: BattleLayer,
  right: BattleLayer,
): number {
  return BATTLE_LAYER_ORDER.indexOf(left)
    - BATTLE_LAYER_ORDER.indexOf(right);
}
