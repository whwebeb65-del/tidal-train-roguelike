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

  it('loads requested stages in parallel and updates a live asset set', async () => {
    const releases = new Map<
      string,
      (image: CanvasImageSource) => void
    >();
    const factory = vi.fn<BattleImageFactory>((url) => (
      new Promise((resolve) => releases.set(url, resolve))
    ));
    const loader = new BattleAssetLoader({
      background: '/background.webp',
      normalEnemy: '/normal.webp',
      boss: '/boss.webp',
    }, factory);
    const assets = loader.assets;
    const critical = loader.load(['background', 'normalEnemy']);
    await Promise.resolve();

    expect(factory).toHaveBeenCalledTimes(2);
    expect(assets.get('background')).toBeNull();
    releases.get('/background.webp')?.(
      { id: 'background' } as unknown as CanvasImageSource,
    );
    releases.get('/normal.webp')?.(
      { id: 'normal' } as unknown as CanvasImageSource,
    );
    await critical;

    expect(assets.get('background')).not.toBeNull();
    expect(assets.get('boss')).toBeNull();

    const deferred = loader.load(['boss']);
    await Promise.resolve();
    expect(factory).toHaveBeenCalledTimes(3);
    releases.get('/boss.webp')?.(
      { id: 'boss' } as unknown as CanvasImageSource,
    );
    await deferred;
    expect(assets.get('boss')).not.toBeNull();
  });
});
