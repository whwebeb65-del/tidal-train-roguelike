import { describe, expect, it } from 'vitest';
import {
  createWebAudioBackend,
} from '../../../web/audio/WebAudioBackend';

class FakeParam {
  public value = 0;
  public readonly calls: string[] = [];

  public setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.calls.push(`set:${value}:${time}`);
  }

  public linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.calls.push(`ramp:${value}:${time}`);
  }

  public cancelScheduledValues(time: number): void {
    this.calls.push(`cancel:${time}`);
  }
}

class FakeNode {
  public disconnectCalls = 0;
  public readonly connections: FakeNode[] = [];

  public connect<T extends FakeNode>(node: T): T {
    this.connections.push(node);
    return node;
  }

  public disconnect(): void {
    this.disconnectCalls += 1;
  }
}

class FakeGain extends FakeNode {
  public readonly gain = new FakeParam();
}

class FakePanner extends FakeNode {
  public readonly pan = new FakeParam();
}

class FakeFilter extends FakeNode {
  public readonly frequency = new FakeParam();
  public type: BiquadFilterType = 'lowpass';
}

class FakeOscillator extends FakeNode {
  public readonly frequency = new FakeParam();
  public readonly detune = new FakeParam();
  public type: OscillatorType = 'sine';
  public onended: (() => void) | null = null;
  public startAt = -1;
  public stopAt = -1;

  public start(time: number): void {
    this.startAt = time;
  }

  public stop(time: number): void {
    this.stopAt = time;
  }
}

class FakeContext {
  public currentTime = 2;
  public state: AudioContextState = 'suspended';
  public readonly destination = new FakeNode();
  public readonly gains: FakeGain[] = [];
  public readonly oscillators: FakeOscillator[] = [];
  public readonly panners: FakePanner[] = [];
  public readonly filters: FakeFilter[] = [];
  public resumeCalls = 0;
  public suspendCalls = 0;
  public closeCalls = 0;

  public createGain(): FakeGain {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }

  public createOscillator(): FakeOscillator {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }

  public createStereoPanner(): FakePanner {
    const node = new FakePanner();
    this.panners.push(node);
    return node;
  }

  public createBiquadFilter(): FakeFilter {
    const node = new FakeFilter();
    this.filters.push(node);
    return node;
  }

  public resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  public suspend(): Promise<void> {
    this.suspendCalls += 1;
    this.state = 'suspended';
    return Promise.resolve();
  }

  public close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
}

describe('WebAudioBackend', () => {
  it('creates one context on unlock and ignores tones while locked', async () => {
    const context = new FakeContext();
    let createCalls = 0;
    const backend = createWebAudioBackend({
      createContext: () => {
        createCalls += 1;
        return context as unknown as AudioContext;
      },
    });

    backend.scheduleTone({
      bus: 'sfx',
      waveform: 'sine',
      frequencyHz: 440,
      startSeconds: 0,
      durationSeconds: 0.1,
      gain: 0.2,
      attackSeconds: 0.01,
      releaseSeconds: 0.03,
      pan: 0,
    });
    expect(context.oscillators).toHaveLength(0);

    await expect(backend.unlock()).resolves.toBe(true);
    await expect(backend.unlock()).resolves.toBe(true);
    expect(createCalls).toBe(1);
    expect(context.resumeCalls).toBe(1);
    expect(context.gains).toHaveLength(3);
  });

  it('clamps tone values and disconnects every transient node', async () => {
    const context = new FakeContext();
    const backend = createWebAudioBackend({
      createContext: () => context as unknown as AudioContext,
    });
    await backend.unlock();
    backend.scheduleTone({
      bus: 'sfx',
      waveform: 'triangle',
      frequencyHz: 50_000,
      startSeconds: -10,
      durationSeconds: 99,
      gain: 4,
      attackSeconds: 5,
      releaseSeconds: 5,
      pan: -4,
      detuneCents: 9000,
      filterHz: 80_000,
    });

    const oscillator = context.oscillators[0];
    const gain = context.gains.at(-1);
    const panner = context.panners[0];
    const filter = context.filters[0];
    expect(oscillator.frequency.value).toBe(20_000);
    expect(oscillator.detune.value).toBe(2400);
    expect(oscillator.startAt).toBe(2);
    expect(oscillator.stopAt).toBeLessThanOrEqual(6.05);
    expect(panner.pan.value).toBe(-1);
    expect(filter.frequency.value).toBe(20_000);
    expect(gain?.gain.calls.some((call) => call.includes('ramp:1:')))
      .toBe(true);

    oscillator.onended?.();
    expect(oscillator.disconnectCalls).toBe(1);
    expect(gain?.disconnectCalls).toBe(1);
    expect(panner.disconnectCalls).toBe(1);
    expect(filter.disconnectCalls).toBe(1);
  });

  it('suspends, resumes and closes idempotently', async () => {
    const context = new FakeContext();
    const backend = createWebAudioBackend({
      createContext: () => context as unknown as AudioContext,
    });
    await backend.unlock();
    await backend.suspend();
    await expect(backend.resume()).resolves.toBe(true);
    await backend.close();
    await backend.close();

    expect(context.suspendCalls).toBe(1);
    expect(context.resumeCalls).toBe(2);
    expect(context.closeCalls).toBe(1);
    expect(backend.unlocked).toBe(false);
  });
});
