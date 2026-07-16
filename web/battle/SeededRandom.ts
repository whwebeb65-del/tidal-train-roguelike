export class SeededRandom {
  private state: number;

  public constructor(seed: number) {
    if (!Number.isInteger(seed)) {
      throw new Error('Battle seed must be an integer');
    }
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  public next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }

  public int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new Error('Random integer range is invalid');
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  public pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new Error('Cannot pick from an empty collection');
    }
    return values[this.int(0, values.length - 1)] as T;
  }
}
