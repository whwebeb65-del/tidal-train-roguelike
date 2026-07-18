import type { AudioBackend } from '../../../../web/audio/AudioBackend';
import type {
  AudioBus,
  ContinuousToneInstruction,
  ToneInstruction,
} from '../../../../web/audio/AudioTypes';

export class RecordingAudioBackend implements AudioBackend {
  public available = true;
  public unlocked = true;
  public unlockResult = true;
  public currentSeconds = 0;
  public readonly instructions: ToneInstruction[] = [];
  public readonly continuousTones: {
    readonly id: string;
    readonly instruction: ContinuousToneInstruction | null;
  }[] = [];
  private readonly activeContinuousTones = new Map<
    string,
    ContinuousToneInstruction
  >();
  public readonly lifecycle: string[] = [];
  public readonly busGains: {
    readonly bus: AudioBus;
    readonly value: number;
    readonly rampSeconds: number;
  }[] = [];
  public suspendCalls = 0;
  public resumeCalls = 0;
  public closeCalls = 0;

  public nowSeconds(): number {
    return this.currentSeconds;
  }

  public unlock(): Promise<boolean> {
    this.unlocked = this.unlockResult;
    return Promise.resolve(this.unlockResult);
  }

  public scheduleTone(instruction: ToneInstruction): void {
    if (!this.available || !this.unlocked) return;
    this.instructions.push({ ...instruction });
  }

  public setContinuousTone(
    id: string,
    instruction: ContinuousToneInstruction | null,
  ): void {
    this.continuousTones.push({
      id,
      instruction: instruction ? { ...instruction } : null,
    });
    if (instruction) this.activeContinuousTones.set(id, { ...instruction });
    else this.activeContinuousTones.delete(id);
    this.lifecycle.push(`continuous:${id}:${instruction ? 'set' : 'stop'}`);
  }

  public continuousToneState(id: string): {
    readonly active: boolean;
    readonly gain: number;
  } {
    const instruction = this.activeContinuousTones.get(id);
    return {
      active: instruction !== undefined,
      gain: instruction?.gain ?? 0,
    };
  }

  public setBusGain(
    bus: AudioBus,
    value: number,
    rampSeconds = 0,
  ): void {
    this.busGains.push({ bus, value, rampSeconds });
  }

  public suspend(): Promise<void> {
    this.suspendCalls += 1;
    return Promise.resolve();
  }

  public resume(): Promise<boolean> {
    this.resumeCalls += 1;
    return Promise.resolve(this.available && this.unlocked);
  }

  public close(): Promise<void> {
    this.closeCalls += 1;
    this.lifecycle.push('close');
    this.unlocked = false;
    return Promise.resolve();
  }
}
