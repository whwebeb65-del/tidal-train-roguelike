import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { PRODUCT_CATALOG } from '../../src/domain/commerce/ProductCatalog';
import { createStarterEquipmentState } from '../../src/domain/equipment/EquipmentSystem';
import { createDailyTrialState, getDailyTrialDefinition } from '../../src/domain/challenge/DailyTrialSystem';
import { createDailyCheckInState } from '../../src/domain/retention/DailyCheckInSystem';
import { getSkinCollectionModifiers } from '../../src/domain/skin/SkinCollectionSystem';
import { SKIN_CATALOG } from '../../src/domain/skin/SkinCatalog';
import { defaultGameSettings } from '../../web/app/SettingsRepository';
import { renderBattleHudShell } from '../../web/battle/BattleHUD';
import { renderCaptainSelection } from '../../web/views/CaptainSelectionView';
import { renderCommerceStore } from '../../web/views/CommerceView';
import { renderDailyCheckIn } from '../../web/views/DailyCheckInView';
import { renderDailyTrialHub } from '../../web/views/DailyTrialView';
import { renderEquipment } from '../../web/views/EquipmentView';
import { renderLaunchCampaignView } from '../../web/views/LaunchCampaignView';
import { renderSettingsPanel } from '../../web/views/SettingsPanelView';
import { renderSocialHubView } from '../../web/views/SocialHubView';
import { renderWardrobe } from '../../web/views/WardrobeView';

interface ParsedHtmlDocument {
  readonly window: { readonly document: Document };
}

interface ParsedHtmlConstructor {
  new(markup: string): ParsedHtmlDocument;
}

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as { readonly JSDOM: ParsedHtmlConstructor };

function root(html: string): Element {
  const element = new JSDOM(`<body>${html}</body>`).window.document.body.firstElementChild;
  if (!element) throw new Error('Renderer did not return a root element');
  return element;
}

function expectLivingRoot(html: string, locationClass: string): void {
  const element = root(html);
  expect(element.classList.contains('living-zone')).toBe(true);
  expect(element.classList.contains(locationClass)).toBe(true);
  expect(element.classList.contains('system-card')).toBe(false);
}

describe('living station non-battle coverage', () => {
  it('renders every station district as a non-card location across conditional branches', () => {
    const trialDefinition = getDailyTrialDefinition('2026-07-16');
    const trialState = createDailyTrialState(trialDefinition.dayId);
    const auroraProduct = PRODUCT_CATALOG.find((product) =>
      product.reward.skinIds.includes('skin-aurora-whale-song'));
    if (!auroraProduct) throw new Error('Aurora product missing');

    expectLivingRoot(renderDailyCheckIn({
      state: createDailyCheckInState(), currentDayId: '2026-07-16',
    }), 'daily-check-in');
    expectLivingRoot(renderDailyTrialHub({
      stationLevel: 1, state: trialState, definition: trialDefinition,
    }), 'tide-trial-yard');
    expectLivingRoot(renderDailyTrialHub({
      stationLevel: 2, state: trialState, definition: trialDefinition,
    }), 'tide-trial-yard');
    expectLivingRoot(renderLaunchCampaignView({
      betaApplied: false, betaGiftClaimed: false, launchGiftClaimed: false, badges: [], giftCodeHint: 'TIDE2026',
    }), 'founder-ticket-office');
    expectLivingRoot(renderLaunchCampaignView({
      betaApplied: true, betaGiftClaimed: true, launchGiftClaimed: true, badges: ['先行者'], giftCodeHint: 'TIDE2026',
    }), 'founder-ticket-office');
    expectLivingRoot(renderCommerceStore({
      products: PRODUCT_CATALOG, purchasedProductIds: [], pendingProductId: null,
    }), 'supply-market');
    expectLivingRoot(renderSocialHubView({
      cycleId: '2026-W29', legionId: null, contribution: 0, milestones: [], supports: [], sharePending: false,
    }), 'lighthouse-dock');
    expectLivingRoot(renderSocialHubView({
      cycleId: '2026-W29', legionId: 'beacon', contribution: 0, milestones: [], supports: [], sharePending: false,
    }), 'lighthouse-dock');
    expectLivingRoot(renderCaptainSelection(), 'captain-platform');
    expectLivingRoot(renderWardrobe({
      selectedCaptainId: 'captain-tide-female',
      ownedSkinIds: ['skin-tide-base'],
      equippedSkinIds: { 'captain-tide-female': 'skin-tide-base' },
      skins: SKIN_CATALOG,
      collectionModifiers: getSkinCollectionModifiers(['skin-tide-base']),
      pendingProductId: null,
      productBySkinId: { 'skin-aurora-whale-song': auroraProduct },
    }), 'wardrobe-carriage');
    expectLivingRoot(renderEquipment({ state: createStarterEquipmentState() }), 'otter-workshop');
  });

  it('keeps settings as an accessible cabinet dialog instead of a generic card', () => {
    const panel = root(renderSettingsPanel({
      settings: defaultGameSettings(), audioAvailable: true, effectiveReducedMotion: false,
    }));
    const dialog = panel.querySelector('aside.conductor-cabinet[role="dialog"][aria-modal="true"]');

    expect(panel.classList.contains('settings-panel')).toBe(true);
    expect(dialog).not.toBeNull();
    expect(dialog?.parentElement).toBe(panel);
    expect(dialog?.classList.contains('system-card')).toBe(false);
  });

  it('covers the BattleHUD surfaces instantiated by the production runtime', () => {
    const hud = root(renderBattleHudShell());
    const upgrade = hud.querySelector(
      '[data-upgrade-overlay].living-zone.cargo-unloading',
    );
    const repairBay = hud.querySelector('[data-failure-overlay].repair-bay');
    const settlement = hud.querySelector(
      '[data-settlement-overlay].living-zone > .battle-dialog--settlement',
    );
    const runtime = readFileSync(
      new URL('../../web/LegacyGameRuntime.ts', import.meta.url),
      'utf8',
    );

    expect(hud.matches('[data-battle-hud-root]')).toBe(true);
    expect(upgrade).not.toBeNull();
    expect(upgrade?.querySelectorAll('.reward-crate')).toHaveLength(3);
    expect(repairBay).not.toBeNull();
    expect(settlement).not.toBeNull();
    expect(settlement?.querySelector('.reward-luggage')).not.toBeNull();
    expect(settlement?.querySelector('[data-arrival-ticket="first"]')).not.toBeNull();
    expect(settlement?.querySelector('[data-trial-score-stamp]')).not.toBeNull();
    expect(repairBay?.classList.contains('system-card')).toBe(false);
    expect(settlement?.classList.contains('system-card')).toBe(false);
    expect(runtime).toContain("import { BattleHUD } from './battle/BattleHUD'");
    expect(runtime).toContain('createHud: (callbacks) => new BattleHUD(callbacks)');
  });
});
