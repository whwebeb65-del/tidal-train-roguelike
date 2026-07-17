import { describe, expect, it } from 'vitest';
import { SceneRouter } from '../../web/app/SceneRouter';
import type { GameScene } from '../../web/scenes/Scene';

function createHost(): HTMLElement {
  return {
    innerHTML: '',
    className: '',
    dataset: {},
    classList: {
      add() {},
      remove() {},
    },
    replaceChildren() {},
  } as unknown as HTMLElement;
}

describe('SceneRouter', () => {
  it('unmounts the previous scene before mounting the next one', async () => {
    const calls: string[] = [];
    const factory = (id: GameScene['id']): GameScene => ({
      id,
      mount() {
        calls.push(`mount:${id}`);
      },
      unmount() {
        calls.push(`unmount:${id}`);
      },
    });
    const host = createHost();
    const router = new SceneRouter(host, factory, {
      transitionMs: 0,
      reducedMotion: true,
    });

    await router.go('station', 'replace');
    await router.go('captain', 'forward');

    expect(calls).toEqual([
      'mount:station',
      'unmount:station',
      'mount:captain',
    ]);
    expect(router.currentSceneId).toBe('captain');
    expect(host.dataset.sceneId).toBe('captain');
  });

  it('does not let an older transition clear a newer entering state', async () => {
    let releaseStation = (): void => undefined;
    const stationMounted = new Promise<void>((resolve) => {
      releaseStation = resolve;
    });
    const host = createHost();
    const removed: string[] = [];
    host.classList.remove = (...tokens: string[]) => {
      removed.push(...tokens);
    };
    const factory = (id: GameScene['id']): GameScene => ({
      id,
      mount() {
        return id === 'station' ? stationMounted : undefined;
      },
      unmount() {},
    });
    const router = new SceneRouter(host, factory, {
      transitionMs: 0,
      reducedMotion: true,
    });

    const older = router.go('station', 'replace');
    const newer = router.go('captain', 'forward');
    releaseStation();
    await Promise.all([older, newer]);

    expect(router.currentSceneId).toBe('captain');
    expect(removed).toEqual(['scene-host--entering']);
  });

  it('refreshes the mounted scene without replacing its lifecycle owner', async () => {
    const calls: string[] = [];
    const scene: GameScene = {
      id: 'station',
      mount() {
        calls.push('mount');
      },
      unmount() {
        calls.push('unmount');
      },
    };
    const router = new SceneRouter(createHost(), () => scene, {
      transitionMs: 0,
      reducedMotion: true,
    });

    await router.go('station', 'replace');
    await router.refresh();

    expect(calls).toEqual(['mount', 'mount']);
  });

  it('reports a completed scene change once and ignores refreshes', async () => {
    const changes: string[] = [];
    const scene: GameScene = {
      id: 'station',
      mount() {},
      unmount() {},
    };
    const router = new SceneRouter(createHost(), () => scene, {
      transitionMs: 0,
      reducedMotion: true,
      onSceneChanged: (sceneId) => changes.push(sceneId),
    });

    await router.go('station', 'replace');
    await router.refresh();

    expect(changes).toEqual(['station']);
  });

  it('applies reduced-motion changes to later transitions', async () => {
    const router = new SceneRouter(createHost(), (id) => ({
      id,
      mount() {},
      unmount() {},
    }), {
      transitionMs: 1,
      reducedMotion: false,
    });

    router.setReducedMotion(true);
    await router.go('station', 'replace');

    expect(router.currentSceneId).toBe('station');
  });
});
