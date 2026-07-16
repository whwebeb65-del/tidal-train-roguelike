export interface EntityPoolStats {
  readonly created: number;
  readonly reused: number;
  readonly inUse: number;
  readonly available: number;
  readonly discarded: number;
}

export class EntityPool<T extends object> {
  private readonly available: T[] = [];
  private readonly inUse = new Set<T>();
  private readonly known = new WeakSet<T>();
  private created = 0;
  private reused = 0;
  private discarded = 0;

  public constructor(
    private readonly create: () => T,
    private readonly reset: (item: T) => void,
    private readonly maxRetained: number,
  ) {
    if (!Number.isInteger(maxRetained) || maxRetained < 0) {
      throw new Error('Pool retention limit must be a non-negative integer');
    }
  }

  public get stats(): EntityPoolStats {
    return {
      created: this.created,
      reused: this.reused,
      inUse: this.inUse.size,
      available: this.available.length,
      discarded: this.discarded,
    };
  }

  public acquire(): T {
    const retained = this.available.pop();
    const item = retained ?? this.create();
    if (retained) {
      this.reset(item);
      this.reused += 1;
    } else {
      this.known.add(item);
      this.created += 1;
    }
    if (this.inUse.has(item)) {
      throw new Error('Pool attempted to acquire an instance already in use');
    }
    this.inUse.add(item);
    return item;
  }

  public release(item: T): void {
    if (!this.known.has(item)) {
      throw new Error('Cannot release an instance from another pool');
    }
    if (!this.inUse.delete(item)) {
      throw new Error('Pool instance was already released');
    }
    if (this.available.length < this.maxRetained) {
      this.available.push(item);
      return;
    }
    this.discarded += 1;
  }

  public releaseAll(): void {
    for (const item of [...this.inUse]) this.release(item);
  }
}
