import { describe, expect, it } from 'vitest';
import {
  createWebAudioBackend,
} from '../../../web/audio/WebAudioBackend';

class FakeParam {
  public value = 0;
  public readonly calls: string[] = [];
  public throwOnSet = false;
  public throwOnRamp = false;
  public throwOnCancel = false;

  public setValueAtTime(value: number, time: number): void {
    if (this.throwOnSet) throw new Error('parameter set failed');
    this.value = value;
    this.calls.push(`set:${value}:${time}`);
  }

  public linearRampToValueAtTime(value: number, time: number): void {
    if (this.throwOnRamp) throw new Error('parameter ramp failed');
    this.value = value;
    this.calls.push(`ramp:${value}:${time}`);
  }

  public cancelScheduledValues(time: number): void {
    if (this.throwOnCancel) throw new Error('parameter cancel failed');
    this.calls.push(`cancel:${time}`);
  }
}

class FakeNode {
  public disconnectCalls = 0;
  public connectCalls = 0;
  public throwOnConnect = false;
  public throwOnDisconnect = false;
  public readonly connections: FakeNode[] = [];

  public connect<T extends FakeNode>(node: T): T {
    this.connectCalls += 1;
    if (this.throwOnConnect) throw new Error('connect failed');
    this.connections.push(node);
    return node;
  }

  public disconnect(): void {
    this.disconnectCalls += 1;
    if (this.throwOnDisconnect) throw new Error('disconnect failed');
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
  public startCalls = 0;
  public stopCalls = 0;
  public throwOnStart = false;
  public throwOnStop = false;
  public onStop: (() => void) | null = null;

  public start(time: number): void {
    this.startCalls += 1;
    if (this.throwOnStart) throw new Error('start failed');
    this.startAt = time;
  }

  public stop(time = 0): void {
    this.stopCalls += 1;
    this.onStop?.();
    if (this.throwOnStop) throw new Error('stop failed');
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
  public throwOnCreateFilter = false;
  public throwOnCreateGain = false;

  public createGain(): FakeGain {
    if (this.throwOnCreateGain) throw new Error('gain creation failed');
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
    if (this.throwOnCreateFilter) throw new Error('filter creation failed');
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

  it('reuses one continuous chain, ramps updates and stops it idempotently', async () => {
    const context = new FakeContext();
    const backend = createWebAudioBackend({
      createContext: () => context as unknown as AudioContext,
    });
    await backend.unlock();

    backend.setContinuousTone('train-engine', {
      bus: 'sfx',
      waveform: 'triangle',
      frequencyHz: 50,
      gain: 0.02,
      filterHz: 220,
      rampSeconds: 0.12,
    });
    context.currentTime = 2.05;
    backend.setContinuousTone('train-engine', {
      bus: 'sfx',
      waveform: 'triangle',
      frequencyHz: 60,
      gain: 0.03,
      filterHz: 300,
      rampSeconds: 0.12,
    });
    context.currentTime = 2.1;
    backend.setContinuousTone('train-engine', {
      bus: 'sfx',
      waveform: 'triangle',
      frequencyHz: 70,
      gain: 0.04,
      filterHz: 380,
      rampSeconds: 0.12,
    });

    expect(context.oscillators).toHaveLength(1);
    expect(context.filters).toHaveLength(1);
    expect(context.gains).toHaveLength(4);
    const oscillator = context.oscillators[0];
    const filter = context.filters[0];
    const gain = context.gains[3];
    expect(oscillator.startCalls).toBe(1);
    expect(oscillator.frequency.calls).toContain('ramp:70:2.22');
    expect(filter.frequency.calls).toContain('ramp:380:2.22');
    expect(gain.gain.calls).toContain('ramp:0.04:2.22');

    backend.setContinuousTone('train-engine', null);
    backend.setContinuousTone('train-engine', null);
    expect(oscillator.stopCalls).toBe(1);
    expect(oscillator.disconnectCalls).toBe(1);
    expect(filter.disconnectCalls).toBe(1);
    expect(gain.disconnectCalls).toBe(1);
  });

  it('releases continuous chains before close and catches backend failures', async () => {
    const context = new FakeContext();
    const backend = createWebAudioBackend({
      createContext: () => context as unknown as AudioContext,
    });
    await backend.unlock();
    backend.setContinuousTone('train-engine', {
      bus: 'sfx',
      waveform: 'triangle',
      frequencyHz: 60,
      gain: 0.03,
      filterHz: 300,
      rampSeconds: 0.12,
    });
    const oscillator = context.oscillators[0];

    await backend.close();
    await backend.close();
    expect(oscillator.stopCalls).toBe(1);
    expect(oscillator.disconnectCalls).toBe(1);

    const failingContext = new FakeContext();
    failingContext.createOscillator = () => {
      throw new Error('oscillator unavailable');
    };
    const failingBackend = createWebAudioBackend({
      createContext: () => failingContext as unknown as AudioContext,
    });
    await failingBackend.unlock();
    expect(() => failingBackend.setContinuousTone('train-engine', {
      bus: 'sfx',
      waveform: 'triangle',
      frequencyHz: 60,
      gain: 0.03,
      filterHz: 300,
      rampSeconds: 0.12,
    })).not.toThrow();
  });

  it('releases partial nodes and allows the same id after filter or gain creation fails', async () => {
    const context = new FakeContext();
    const backend = createWebAudioBackend({
      createContext: () => context as unknown as AudioContext,
    });
    await backend.unlock();

    context.throwOnCreateFilter = true;
    expect(() => backend.setContinuousTone('partial-filter', {
      bus: 'sfx', waveform: 'triangle', frequencyHz: 60,
      gain: 0.03, filterHz: 300, rampSeconds: 0.12,
    })).not.toThrow();
    expect(context.oscillators[0].stopCalls).toBe(1);
    expect(context.oscillators[0].disconnectCalls).toBe(1);

    context.throwOnCreateFilter = false;
    context.throwOnCreateGain = true;
    expect(() => backend.setContinuousTone('partial-gain', {
      bus: 'sfx', waveform: 'triangle', frequencyHz: 60,
      gain: 0.03, filterHz: 300, rampSeconds: 0.12,
    })).not.toThrow();
    expect(context.oscillators[1].stopCalls).toBe(1);
    expect(context.oscillators[1].disconnectCalls).toBe(1);
    expect(context.filters[0].disconnectCalls).toBe(1);

    context.throwOnCreateGain = false;
    backend.setContinuousTone('partial-filter', {
      bus: 'sfx', waveform: 'triangle', frequencyHz: 60,
      gain: 0.03, filterHz: 300, rampSeconds: 0.12,
    });
    backend.setContinuousTone('partial-gain', {
      bus: 'sfx', waveform: 'triangle', frequencyHz: 60,
      gain: 0.03, filterHz: 300, rampSeconds: 0.12,
    });
    expect(context.oscillators).toHaveLength(4);
  });

  it('releases every created node after parameter, connect or start failure', async () => {
    const context = new FakeContext();
    const backend = createWebAudioBackend({
      createContext: () => context as unknown as AudioContext,
    });
    await backend.unlock();
    const originalCreateGain = context.createGain.bind(context);
    context.createGain = () => {
      const gain = originalCreateGain();
      gain.gain.throwOnSet = true;
      return gain;
    };
    backend.setContinuousTone('parameter-failure', {
      bus: 'sfx', waveform: 'triangle', frequencyHz: 60,
      gain: 0.03, filterHz: 300, rampSeconds: 0.12,
    });

    context.createGain = originalCreateGain;
    const originalCreateOscillator = context.createOscillator.bind(context);
    context.createOscillator = () => {
      const oscillator = originalCreateOscillator();
      oscillator.throwOnConnect = true;
      return oscillator;
    };
    backend.setContinuousTone('connect-failure', {
      bus: 'sfx', waveform: 'triangle', frequencyHz: 60,
      gain: 0.03, filterHz: 300, rampSeconds: 0.12,
    });

    context.createOscillator = () => {
      const oscillator = originalCreateOscillator();
      oscillator.throwOnStart = true;
      return oscillator;
    };
    backend.setContinuousTone('start-failure', {
      bus: 'sfx', waveform: 'triangle', frequencyHz: 60,
      gain: 0.03, filterHz: 300, rampSeconds: 0.12,
    });

    expect(context.oscillators).toHaveLength(3);
    expect(context.filters).toHaveLength(3);
    expect(context.gains).toHaveLength(6);
    for (const oscillator of context.oscillators) {
      expect(oscillator.stopCalls).toBe(1);
      expect(oscillator.disconnectCalls).toBe(1);
    }
    for (const filter of context.filters) {
      expect(filter.disconnectCalls).toBe(1);
    }
    for (const gain of context.gains.slice(3)) {
      expect(gain.disconnectCalls).toBe(1);
    }

    context.createOscillator = originalCreateOscillator;
    for (const id of [
      'parameter-failure',
      'connect-failure',
      'start-failure',
    ]) {
      backend.setContinuousTone(id, {
        bus: 'sfx', waveform: 'triangle', frequencyHz: 60,
        gain: 0.03, filterHz: 300, rampSeconds: 0.12,
      });
    }
    expect(context.oscillators).toHaveLength(6);
    expect(context.filters).toHaveLength(6);
    expect(context.gains).toHaveLength(9);
  });

  it('continues parameter updates when one AudioParam throws', async () => {
    const context = new FakeContext();
    const backend = createWebAudioBackend({
      createContext: () => context as unknown as AudioContext,
    });
    await backend.unlock();
    backend.setContinuousTone('train-engine', {
      bus: 'sfx', waveform: 'triangle', frequencyHz: 60,
      gain: 0.03, filterHz: 300, rampSeconds: 0.12,
    });
    const oscillator = context.oscillators[0];
    const filter = context.filters[0];
    const gain = context.gains[3];
    oscillator.frequency.throwOnCancel = true;

    expect(() => backend.setContinuousTone('train-engine', {
      bus: 'sfx', waveform: 'triangle', frequencyHz: 70,
      gain: 0.04, filterHz: 380, rampSeconds: 0.12,
    })).not.toThrow();
    expect(filter.frequency.calls).toContain('ramp:380:2.12');
    expect(gain.gain.calls).toContain('ramp:0.04:2.12');
  });

  it('drains multiple ids when stop and disconnect throw during close', async () => {
    const context = new FakeContext();
    const backend = createWebAudioBackend({
      createContext: () => context as unknown as AudioContext,
    });
    await backend.unlock();
    for (const id of ['train-engine', 'auxiliary']) {
      backend.setContinuousTone(id, {
        bus: 'sfx', waveform: 'triangle', frequencyHz: 60,
        gain: 0.03, filterHz: 300, rampSeconds: 0.12,
      });
    }
    context.oscillators[0].throwOnStop = true;
    context.oscillators[0].throwOnDisconnect = true;
    context.filters[0].throwOnDisconnect = true;
    context.gains[3].throwOnDisconnect = true;

    await expect(backend.close()).resolves.toBeUndefined();
    await expect(backend.close()).resolves.toBeUndefined();
    expect(context.oscillators.map((node) => node.stopCalls)).toEqual([1, 1]);
    expect(context.oscillators.map((node) => node.disconnectCalls)).toEqual([1, 1]);
    expect(context.filters.map((node) => node.disconnectCalls)).toEqual([1, 1]);
    expect(context.gains.slice(3).map((node) => node.disconnectCalls)).toEqual([1, 1]);
    expect(context.closeCalls).toBe(1);
  });

  it('rejects a reentrant continuous id while close drains existing ids', async () => {
    const context = new FakeContext();
    const backend = createWebAudioBackend({
      createContext: () => context as unknown as AudioContext,
    });
    await backend.unlock();
    for (const id of ['train-engine', 'auxiliary']) {
      backend.setContinuousTone(id, {
        bus: 'sfx', waveform: 'triangle', frequencyHz: 60,
        gain: 0.03, filterHz: 300, rampSeconds: 0.12,
      });
    }
    context.oscillators[0].onStop = () => {
      backend.setContinuousTone('late-entry', {
        bus: 'sfx', waveform: 'triangle', frequencyHz: 70,
        gain: 0.04, filterHz: 380, rampSeconds: 0.12,
      });
    };

    await backend.close();

    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators.map((node) => node.stopCalls)).toEqual([1, 1]);
    expect(context.oscillators.map((node) => node.disconnectCalls)).toEqual([1, 1]);
  });
});
