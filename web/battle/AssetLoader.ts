export type BattleImageFactory = (
  url: string,
) => Promise<CanvasImageSource>;

export interface BattleAssetSet<Id extends string = string> {
  readonly failedIds: readonly Id[];
  get(id: Id): CanvasImageSource | null;
}

export async function createBrowserBattleImage(
  url: string,
): Promise<CanvasImageSource> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;

  if (typeof image.decode === 'function') {
    await image.decode();
    return image;
  }

  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener(
        'error',
        () => reject(new Error(`Failed to load battle art: ${url}`)),
        { once: true },
      );
    });
  }
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error(`Battle art has invalid dimensions: ${url}`);
  }
  return image;
}

export class BattleAssetLoader<Id extends string> {
  private readonly urlLoads = new Map<
    string,
    Promise<CanvasImageSource | null>
  >();
  private readonly images = new Map<Id, CanvasImageSource | null>();
  private readonly failed = new Set<Id>();
  private readonly ids: readonly Id[];
  private readonly liveAssets: BattleAssetSet<Id>;

  public constructor(
    private readonly urls: Readonly<Record<Id, string>>,
    private readonly factory: BattleImageFactory = createBrowserBattleImage,
  ) {
    this.ids = Object.keys(urls) as Id[];
    const loader = this;
    this.liveAssets = {
      get failedIds() {
        return loader.ids.filter((id) => loader.failed.has(id));
      },
      get(id) {
        return loader.images.get(id) ?? null;
      },
    };
  }

  public get assets(): BattleAssetSet<Id> {
    return this.liveAssets;
  }

  public async loadAll(): Promise<BattleAssetSet<Id>> {
    return this.load(this.ids);
  }

  public async load(ids: readonly Id[]): Promise<BattleAssetSet<Id>> {
    await Promise.all(ids.map(async (id) => {
      const url = this.urls[id];
      if (!url) throw new Error(`Unknown battle art id: ${id}`);
      const image = await this.loadUrl(url);
      this.images.set(id, image);
      if (image === null) this.failed.add(id);
      else this.failed.delete(id);
    }));
    return this.liveAssets;
  }

  private loadUrl(url: string): Promise<CanvasImageSource | null> {
    const cached = this.urlLoads.get(url);
    if (cached) return cached;

    const pending = Promise.resolve()
      .then(() => this.factory(url))
      .catch(() => null);
    this.urlLoads.set(url, pending);
    return pending;
  }
}
