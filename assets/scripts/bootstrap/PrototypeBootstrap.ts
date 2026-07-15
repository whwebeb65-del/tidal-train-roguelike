import { _decorator, Component, director } from 'cc';

const { ccclass } = _decorator;

@ccclass('PrototypeBootstrap')
export class PrototypeBootstrap extends Component {
  start(): void {
    this.node.name = 'PrototypeRoot';
    director.addPersistRootNode(this.node);
  }
}
