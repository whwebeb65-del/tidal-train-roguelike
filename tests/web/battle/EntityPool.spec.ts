import { describe, expect, it } from 'vitest';
import { EntityPool } from '../../../web/battle/EntityPool';

describe('EntityPool', () => {
  it('reuses released instances and resets them before the next acquire', () => {
    let created = 0;
    const pool = new EntityPool(
      () => ({ id: ++created, active: false, value: 0 }),
      (item) => {
        item.active = false;
        item.value = 0;
      },
      4,
    );

    const first = pool.acquire();
    first.active = true;
    first.value = 99;
    pool.release(first);
    const second = pool.acquire();

    expect(second).toBe(first);
    expect(second).toMatchObject({ active: false, value: 0 });
    expect(pool.stats).toMatchObject({
      created: 1,
      reused: 1,
      inUse: 1,
      available: 0,
      discarded: 0,
    });
  });

  it('rejects duplicate releases and caps retained instances', () => {
    const pool = new EntityPool(
      () => ({ value: 0 }),
      (item) => {
        item.value = 0;
      },
      1,
    );
    const first = pool.acquire();
    const second = pool.acquire();

    pool.release(first);
    pool.release(second);

    expect(pool.stats).toMatchObject({
      created: 2,
      inUse: 0,
      available: 1,
      discarded: 1,
    });
    expect(() => pool.release(first)).toThrow(/already released/i);
  });

  it('releases all active instances without retaining more than its limit', () => {
    const pool = new EntityPool(
      () => ({ value: 0 }),
      (item) => {
        item.value = 0;
      },
      2,
    );
    pool.acquire();
    pool.acquire();
    pool.acquire();

    pool.releaseAll();

    expect(pool.stats).toMatchObject({
      created: 3,
      inUse: 0,
      available: 2,
      discarded: 1,
    });
  });
});
