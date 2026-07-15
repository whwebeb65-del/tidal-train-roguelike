import { _decorator, Component } from 'cc';
import { defaultSave, type PlayerSave } from '../../../src/save/SaveRepository';
import { MAP_PROGRESSION } from '../../../src/domain/station/MapProgression';
const { ccclass } = _decorator;

@ccclass('StationSceneController')
export class StationSceneController extends Component {
  private save: PlayerSave = defaultSave();

  public getSave(): PlayerSave {
    return this.save;
  }

  public getMapCards() {
    return MAP_PROGRESSION.map((map) => ({
      ...map,
      unlocked: this.save.unlockedMapIds.includes(map.id),
    }));
  }

  public setSave(save: PlayerSave): void {
    this.save = save;
  }
}

