import { describe, expect, it } from 'vitest';
import { settlePurchase } from '../../../src/domain/commerce/PurchaseService';
import {
  equipEquipment,
  type EquipmentState,
} from '../../../src/domain/equipment/EquipmentSystem';
import { createProgressionSnapshot } from '../../../src/domain/progression/ProgressionStatService';
import {
  claimInteractionReward,
  createInteractionState,
} from '../../../src/domain/reward/InteractionRewardService';
import {
  createSocialExpeditionState,
  joinLegion,
  toggleSquadMember,
} from '../../../src/domain/social/SocialExpeditionSystem';
import {
  defaultSave,
  type PlayerSave,
} from '../../../src/save/SaveRepository';
import { BattleSettlementAdapter } from '../../../web/app/BattleSettlementAdapter';
import { FIXED_STEP_MS } from '../../../web/battle/BattleConfig';
import { BattleEngine } from '../../../web/battle/BattleEngine';
import { BATTLE_INTERACTIONS } from '../../../web/battle/BattleInteractionSchedule';
import { createBattleRunInput } from '../../../web/battle/BattleRunInputFactory';
import type { BattleOutcome } from '../../../web/battle/BattleTypes';

function equipmentState(save: PlayerSave): EquipmentState {
  let state: EquipmentState = {
    inventory: save.equipmentInventory,
    equippedEquipmentIds: save.equippedEquipmentIds,
    fragments: save.equipmentFragments,
    gears: save.gears,
  };
  for (const item of state.inventory) {
    state = equipEquipment(state, item.instanceId);
  }
  return state;
}

describe('dynamic battle integration', () => {
  it('keeps paid progression, squad and map bonuses in an auto-fire run', () => {
    const purchased = settlePurchase(defaultSave(), {
      productId: 'aurora-whale-song-skin',
      result: {
        status: 'verified',
        transactionId: 'battle-integration-skin',
      },
    });
    expect(purchased.accepted).toBe(true);
    const progression = createProgressionSnapshot({
      baseMaxHp: 100,
      ownedSkinIds: purchased.save.ownedSkinIds,
      equipmentState: equipmentState(purchased.save),
    });

    let social = joinLegion(
      createSocialExpeditionState('2026-W29'),
      'tide-test',
    );
    social = toggleSquadMember(social, 'navigator').state;
    social = toggleSquadMember(social, 'gunner').state;
    const engine = new BattleEngine(createBattleRunInput({
      battleId: 'paid-run-1',
      seed: 17,
      mode: 'normal',
      mapId: 'old-port',
      progression,
      social,
      dailyTrial: null,
    }));

    for (let elapsed = 0; elapsed < 2400; elapsed += FIXED_STEP_MS) {
      engine.update(FIXED_STEP_MS);
    }
    const events = engine.drainEvents();

    expect(engine.inputForTest().maxTrainHp).toBeGreaterThan(100);
    expect(engine.inputForTest().mainCannonDamage).toBeGreaterThan(25);
    expect(engine.inputForTest().enemyHpMultiplier).toBe(1.12);
    expect(events.some((event) => event.type === 'weapon-fired')).toBe(true);
  });

  it('freezes authoritative kill, successful cast, and hard-cap summaries in its outcome', () => {
    const engine = new BattleEngine(createBattleRunInput({
      battleId: 'outcome-summaries',
      seed: 17,
      mode: 'normal',
      mapId: 'old-port',
      progression: createProgressionSnapshot({
        baseMaxHp: 100,
        ownedSkinIds: defaultSave().ownedSkinIds,
        equipmentState: equipmentState(defaultSave()),
      }),
      social: createSocialExpeditionState('2026-W29'),
      dailyTrial: null,
    }));

    expect(engine.useSkill('bubble-barrier')).toBe(true);
    engine.update(480_000);

    expect(engine.outcome).toMatchObject({
      killCounts: { normal: expect.any(Number), elite: expect.any(Number), boss: expect.any(Number) },
      skillCastCounts: {
        'tidal-volley': 0,
        'bubble-barrier': 1,
        'extreme-tide': 0,
      },
      hardCapReached: true,
    });
  });

  it('deduplicates settlement and caps repeated interaction rewards', () => {
    const adapter = new BattleSettlementAdapter<{ gears: number }>();
    const outcome: BattleOutcome = {
      battleId: 'battle-once',
      victory: true,
      elapsedMs: 180_000,
      completedWaves: 6,
      remainingHp: 42,
      kills: 100,
      killCounts: { normal: 100, elite: 0, boss: 0 },
      skillCastCounts: {
        'tidal-volley': 2,
        'bubble-barrier': 0,
        'extreme-tide': 0,
      },
      hardCapReached: false,
      adReviveUsed: false,
    };
    const firstSettlement = adapter.settle(
      { gears: 0 },
      outcome,
      (state) => ({ gears: state.gears + 400 }),
    );
    const duplicateSettlement = adapter.settle(
      firstSettlement.state,
      outcome,
      (state) => ({ gears: state.gears + 400 }),
    );

    const definition = BATTLE_INTERACTIONS.find(
      (candidate) => candidate.actionId === 'salvage-a',
    );
    expect(definition).toBeDefined();
    if (!definition) return;
    const firstClaim = claimInteractionReward(createInteractionState(), {
      runId: outcome.battleId,
      actionId: definition.actionId,
      attempt: 0,
      definition,
    });
    const duplicateClaim = claimInteractionReward(firstClaim.state, {
      runId: outcome.battleId,
      actionId: definition.actionId,
      attempt: 0,
      definition,
    });
    const secondClaim = claimInteractionReward(firstClaim.state, {
      runId: outcome.battleId,
      actionId: definition.actionId,
      attempt: 1,
      definition,
    });
    const thirdClaim = claimInteractionReward(secondClaim.state, {
      runId: outcome.battleId,
      actionId: definition.actionId,
      attempt: 2,
      definition,
    });

    expect(firstSettlement.state.gears).toBe(400);
    expect(duplicateSettlement).toEqual({
      accepted: false,
      state: { gears: 400 },
    });
    expect([
      firstClaim.amount,
      duplicateClaim.amount,
      secondClaim.amount,
      thirdClaim.amount,
    ]).toEqual([8, 0, 8, 0]);
  });
});
