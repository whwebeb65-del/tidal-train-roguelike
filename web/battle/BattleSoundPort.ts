import type {
  BattleEvent,
  BattleFrameView,
} from './BattleTypes';

export type BattleSoundPhase =
  | 'battle'
  | 'boss'
  | 'victory'
  | 'defeat';

export interface BattleSoundPort {
  update?(nowMs: number): void;
  consume(
    events: readonly BattleEvent[],
    frame: BattleFrameView,
  ): void;
  setBattlePhase(phase: BattleSoundPhase): void;
  pause(): void;
  resume(): Promise<void>;
  dispose(): void;
}

export const SILENT_BATTLE_SOUND: BattleSoundPort = {
  update() {},
  consume() {},
  setBattlePhase() {},
  pause() {},
  resume: async () => undefined,
  dispose() {},
};
