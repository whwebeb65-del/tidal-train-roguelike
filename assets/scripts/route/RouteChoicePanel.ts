import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('RouteChoicePanel')
export class RouteChoicePanel extends Component {
  public choose(nodeId: string): void {
    this.node.emit('route-selected', nodeId);
  }
}

