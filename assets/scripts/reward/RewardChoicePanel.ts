import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('RewardChoicePanel')
export class RewardChoicePanel extends Component {
  public choose(optionId: string): void {
    this.node.emit('reward-selected', optionId);
  }
}

