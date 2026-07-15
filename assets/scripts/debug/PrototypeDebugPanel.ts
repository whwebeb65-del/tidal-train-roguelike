import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('PrototypeDebugPanel')
export class PrototypeDebugPanel extends Component {
  public enabledInPrototype = true;

  public skipTutorial(): void {
    this.node.emit('debug-skip-tutorial');
  }

  public jumpToBoss(): void {
    this.node.emit('debug-jump-boss');
  }

  public simulateRewardedAd(): void {
    this.node.emit('debug-rewarded-ad-completed');
  }

  public clearLocalSave(): void {
    this.node.emit('debug-clear-save');
  }
}

