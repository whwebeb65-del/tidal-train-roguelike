import { _decorator, Component, EventTarget } from 'cc';
import type { CombatAction } from '../../../src/domain/combat/CombatLoopSystem';
const { ccclass } = _decorator;

export interface RunScenePorts {
  onCombatActionRequested(action: CombatAction): void;
  onLaneChanged(lane: number): void;
  onSkillPressed(skillId: string): void;
  onSkillRefreshPressed(): void;
  onRevivePressed(source: RecoverySource): void;
  onDamageRequested(amount: number): void;
  onGiveUpPressed(): void;
  onRouteSelected(nodeId: string): void;
  onRewardSelected(optionId: string): void;
}

export type RecoverySource = 'ad' | 'share';

@ccclass('RunSceneController')
export class RunSceneController extends Component implements RunScenePorts {
  public readonly events = new EventTarget();

  public onCombatActionRequested(action: CombatAction): void {
    this.events.emit('combat-action-requested', action);
  }

  public onLaneChanged(lane: number): void {
    this.events.emit('lane-changed', lane);
  }

  public onSkillPressed(skillId: string): void {
    this.events.emit('skill-pressed', skillId);
  }

  public onSkillRefreshPressed(): void {
    this.events.emit('skill-refresh-pressed');
  }

  public onRevivePressed(source: RecoverySource): void {
    this.events.emit('revive-pressed', source);
  }

  public onDamageRequested(amount = 35): void {
    this.events.emit('damage-requested', amount);
  }

  public onGiveUpPressed(): void {
    this.events.emit('give-up-pressed');
  }

  public onRouteSelected(nodeId: string): void {
    this.events.emit('route-selected', nodeId);
  }

  public onRewardSelected(optionId: string): void {
    this.events.emit('reward-selected', optionId);
  }
}
