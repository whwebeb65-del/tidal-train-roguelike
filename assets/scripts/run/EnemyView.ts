import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('EnemyView')
export class EnemyView extends Component {
  @property
  public maxHp = 100;

  @property
  public hp = 100;

  public setHp(nextHp: number): void {
    this.hp = Math.max(0, Math.min(this.maxHp, nextHp));
  }
}

