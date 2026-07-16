import type {
  BattleDrawCommand,
  BattleLayer,
  BattlePainter,
  CameraPose,
  EllipseDrawCommand,
  ImageDrawCommand,
  LineDrawCommand,
  TextDrawCommand,
} from '../../../../web/battle/BattleDrawTypes';
import type {
  CanvasViewport,
} from '../../../../web/battle/CanvasViewport';

export interface RecordingPainter extends BattlePainter {
  readonly commands: BattleDrawCommand[];
  layers(): BattleLayer[];
}

export function createRecordingPainter(): RecordingPainter {
  const commands: BattleDrawCommand[] = [];
  return {
    commands,
    begin(_viewport: CanvasViewport, _camera: CameraPose) {},
    clear(_color: string) {},
    image(command: ImageDrawCommand) {
      commands.push(command);
    },
    ellipse(command: EllipseDrawCommand) {
      commands.push(command);
    },
    line(command: LineDrawCommand) {
      commands.push(command);
    },
    text(command: TextDrawCommand) {
      commands.push(command);
    },
    end() {},
    layers() {
      return commands.map((command) => command.layer);
    },
  };
}
