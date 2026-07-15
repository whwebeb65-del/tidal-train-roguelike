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
      encounter: 'combat',
      playerHp: 0,
      maxPlayerHp: 50,
      nowMs: 10,
    });
    const retry = applyRevive({
      state: first.state,
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

  it('exposes only one rewarded ad revive per run', () => {
    const state = createRecoveryState();
    expect(state).not.toHaveProperty('shareReviveUsed');
    const first = applyRevive({
      state,
      encounter: 'boss',
      playerHp: 0,
      maxPlayerHp: 100,
      nowMs: 1,
    });
    const duplicate = applyRevive({
      state: first.state,
      encounter: 'boss',
      playerHp: 0,
      maxPlayerHp: 100,
      nowMs: 2,
    });

    expect(first.playerHp).toBe(50);
    expect(duplicate.result).toBe('duplicate');
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
