import { describe, expect, it, vi } from 'vitest';
import {
  BattleAssetLoader,
  type BattleImageFactory,
} from '../../../web/battle/AssetLoader';

describe('BattleAssetLoader', () => {
  it('keeps successful images and records failed ids without rejecting', async () => {
    const factory: BattleImageFactory = async (url) => {
      if (url.includes('missing')) throw new Error('decode failed');
      return { url } as unknown as CanvasImageSource;
    };
    const loader = new BattleAssetLoader({
      background: '/ok.png',
      enemy: '/missing.png',
    }, factory);

    const assets = await loader.loadAll();

    expect(assets.get('background')).not.toBeNull();
    expect(assets.get('enemy')).toBeNull();
    expect(assets.failedIds).toEqual(['enemy']);
  });

  it('creates an image only once for a cached url', async () => {
    const factory = vi.fn<BattleImageFactory>(async (url) => (
      { url } as unknown as CanvasImageSource
    ));
    const loader = new BattleAssetLoader({
      first: '/shared.png',
      second: '/shared.png',
    }, factory);

    await loader.loadAll();
    await loader.loadAll();

    expect(factory).toHaveBeenCalledTimes(1);
  });
});
