import type { FeatureSceneContext, GameScene } from './Scene';
import type { StationAmbientController } from '../station/StationAmbientDirector';

export interface StationScene extends GameScene {
  pauseForVisibility(): void;
  resumeForVisibility(): void;
  setReducedMotion(value: boolean): void;
  requestCaptainGreeting(): boolean;
  pauseAmbient(): void;
}

export function createStationScene(
  context: FeatureSceneContext,
): StationScene {
  let host: HTMLElement | null = null;
  let ambient: StationAmbientController | null = null;
  let errorListener: EventListener | null = null;

  const releaseMount = (): void => {
    if (host && errorListener) {
      host.removeEventListener('error', errorListener, true);
    }
    errorListener = null;
    ambient?.dispose();
    ambient = null;
  };

  return {
    id: 'station',
    mount(nextHost): void {
      releaseMount();
      host = nextHost;
      host.innerHTML = `<section class="game-scene game-scene--station">${context.renderStation()}</section>`;
      errorListener = (event: Event): void => {
        const target = event.target as HTMLElement | null;
        if (target?.matches?.('img[data-station-art]')) {
          target.classList.add('is-missing');
        }
      };
      host.addEventListener('error', errorListener, true);
      const hero = host.querySelector<HTMLElement>('.station-hero');
      if (!hero) return;
      ambient = context.createStationAmbient(hero);
      ambient.start();
    },
    unmount(): void {
      releaseMount();
      host = null;
    },
    pauseForVisibility(): void {
      ambient?.pause();
    },
    resumeForVisibility(): void {
      ambient?.resume();
    },
    setReducedMotion(value: boolean): void {
      ambient?.setReducedMotion(value);
    },
    requestCaptainGreeting(): boolean {
      return ambient?.requestCaptainGreeting() ?? false;
    },
    pauseAmbient(): void {
      ambient?.pause();
    },
  };
}
