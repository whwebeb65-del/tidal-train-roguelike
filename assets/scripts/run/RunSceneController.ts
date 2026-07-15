import { _decorator, Component, EventTarget } from 'cc';
const { ccclass } = _decorator;

export interface RunScenePorts {
  onLaneChanged(lane: number): void;
  onSkillPressed(skillId: string): void;
  onRouteSelected(nodeId: string): void;
  onRewardSelected(optionId: string): void;
}

@ccclass('RunSceneController')
export class RunSceneController extends Component implements RunScenePorts {
  public readonly events = new EventTarget();

  public onLaneChanged(lane: number): void {
    this.events.emit('lane-changed', lane);
  }

  public onSkillPressed(skillId: string): void {
    this.events.emit('skill-pressed', skillId);
  }

  public onRouteSelected(nodeId: string): void {
    this.events.emit('route-selected', nodeId);
  }

  public onRewardSelected(optionId: string): void {
    this.events.emit('reward-selected', optionId);
  }
}

