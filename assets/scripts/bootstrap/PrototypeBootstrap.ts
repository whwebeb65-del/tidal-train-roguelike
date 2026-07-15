import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

@ccclass('PrototypeBootstrap')
export class PrototypeBootstrap extends Component {
  start(): void {
    this.node.name = 'PrototypeRoot';
  }
}
