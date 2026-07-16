import type {
  AudioBus,
  ToneInstruction,
} from './AudioTypes';

export interface AudioBackend {
  readonly available: boolean;
  readonly unlocked: boolean;
  nowSeconds(): number;
  unlock(): Promise<boolean>;
  scheduleTone(instruction: ToneInstruction): void;
  setBusGain(bus: AudioBus, value: number, rampSeconds?: number): void;
  suspend(): Promise<void>;
  resume(): Promise<boolean>;
  close(): Promise<void>;
}
