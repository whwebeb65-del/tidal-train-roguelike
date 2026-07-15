import { describe, expect, it } from 'vitest';
import {
  applyRevive,
  applySkillRefresh,
  createRecoveryState,
  startCombatNode,
  useSkill,
} from '../../../src/domain/recovery/RecoverySystem';

describe('RecoverySystem', () => {
  it('allows one ad revive and caps hp at max hp', () => {
    const first = applyRevive({
      state: createRecoveryState(),
      source: 'ad',
      encounter: 'combat',
      playerHp: 0,
      maxPlayerHp: 50,
      nowMs: 10,
    });
    const retry = applyRevive({
      state: first.state,
      source: 'ad',
      encounter: 'combat',
      playerHp: first.playerHp,
      maxPlayerHp: 50,
      nowMs: 20,
    });

    expect(first.result).toBe('completed');
    expect(first.playerHp).toBe(50);
    expect(first.hpRestored).toBe(50);
    expect(first.state.reviveProtectionUntilMs).toBe(3010);
    expect(retry.result).toBe('duplicate');
    expect(retry.hpRestored).toBe(0);
  });

  it('keeps ad and share revive counters independent', () => {
    const ad = applyRevive({
      state: createRecoveryState(),
      source: 'ad',
      encounter: 'boss',
      playerHp: 0,
      maxPlayerHp: 100,
      nowMs: 1,
    });
    const share = applyRevive({
      state: ad.state,
      source: 'share',
      encounter: 'boss',
      playerHp: 0,
      maxPlayerHp: 100,
      nowMs: 2,
    });

    expect(ad.playerHp).toBe(50);
    expect(share.playerHp).toBe(40);
    expect(share.result).toBe('completed');
    expect(share.state.adReviveUsed).toBe(true);
    expect(share.state.shareReviveUsed).toBe(true);
  });

  it('consumes one skill charge and refreshes it only once per run', () => {
    const used = useSkill(createRecoveryState());
    const refreshed = applySkillRefresh(used.state);
    const duplicate = applySkillRefresh(refreshed.state);

    expect(used.accepted).toBe(true);
    expect(used.state.skillCharges).toBe(0);
    expect(refreshed.chargesGranted).toBe(1);
    expect(refreshed.state.skillCharges).toBe(1);
    expect(duplicate.result).toBe('duplicate');
  });

  it('restores one skill charge at every new combat node without resetting run limits', () => {
    const state = applySkillRefresh(useSkill(createRecoveryState()).state).state;
    const nextNode = startCombatNode(state);

    expect(nextNode.skillCharges).toBe(1);
    expect(nextNode.skillRefreshUsed).toBe(true);
    expect(nextNode.adReviveUsed).toBe(false);
    expect(nextNode.reviveProtectionUntilMs).toBe(0);
  });
});
