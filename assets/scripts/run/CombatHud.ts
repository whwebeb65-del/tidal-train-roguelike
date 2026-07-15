import { _decorator, Component } from 'cc';
import type { CombatAction, CombatLoopState } from '../../../src/domain/combat/CombatLoopSystem';
const { ccclass } = _decorator;

@ccclass('CombatHud')
export class CombatHud extends Component {
  public onCombatActionButtonPressed(action: CombatAction): void {
    this.node.emit('combat-action-requested', action);
  }

  public updateBattleState(state: CombatLoopState): void {
    this.node.emit('battle-state-updated', state);
  }

  public onLaneButtonPressed(lane: number): void {
    this.node.emit('lane-requested', lane);
  }

  public onSkillButtonPressed(skillId: string): void {
    this.node.emit('skill-requested', skillId);
  }

  public onSkillRefreshButtonPressed(): void {
    this.node.emit('skill-refresh-requested');
  }

  public onReviveButtonPressed(source: 'ad' | 'share'): void {
    this.node.emit('revive-requested', source);
  }

  public onDamageButtonPressed(): void {
    this.node.emit('damage-requested', 35);
  }

  public onGiveUpButtonPressed(): void {
    this.node.emit('give-up-requested');
  }

  public updateRecoveryState(
    playerHp: number,
    maxPlayerHp: number,
    skillCharges: number,
    adReviveAvailable: boolean,
    shareReviveAvailable: boolean,
    skillRefreshAvailable: boolean,
  ): void {
    this.node.emit('recovery-state-updated', {
      playerHp,
      maxPlayerHp,
      skillCharges,
      adReviveAvailable,
      shareReviveAvailable,
      skillRefreshAvailable,
    });
  }
}
