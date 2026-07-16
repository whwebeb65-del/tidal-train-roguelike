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

  public constructor(
    private readonly urls: Readonly<Record<Id, string>>,
    private readonly factory: BattleImageFactory = createBrowserBattleImage,
  ) {}

  public async loadAll(): Promise<BattleAssetSet<Id>> {
    const images = new Map<Id, CanvasImageSource | null>();
    const failedIds: Id[] = [];

    for (
      const [id, url]
      of Object.entries(this.urls) as [Id, string][]
    ) {
      const image = await this.loadUrl(url);
      images.set(id, image);
      if (image === null) failedIds.push(id);
    }

    return {
      failedIds,
      get: (id) => images.get(id) ?? null,
    };
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
