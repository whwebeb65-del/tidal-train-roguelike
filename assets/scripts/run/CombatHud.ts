import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('CombatHud')
export class CombatHud extends Component {
  public onLaneButtonPressed(lane: number): void {
    this.node.emit('lane-requested', lane);
  }

  public onSkillButtonPressed(skillId: string): void {
    this.node.emit('skill-requested', skillId);
  }
}

