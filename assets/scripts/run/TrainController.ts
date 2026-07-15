import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TrainController')
export class TrainController extends Component {
  @property({ min: 0, max: 2 })
  public currentLane = 1;

  public moveToLane(lane: number): void {
    if (!Number.isInteger(lane) || lane < 0 || lane > 2) {
      return;
    }
    this.currentLane = lane;
  }
}

