import type { FeatureSceneContext, GameScene } from './Scene';
import type { StationAmbientController } from '../station/StationAmbientDirector';

export interface StationScene extends GameScene {
  pauseForVisibility(): void;
  resumeForVisibility(): void;
  setReducedMotion(value: boolean): void;
  setLowPerformance(value: boolean): void;
  requestCaptainGreeting(): boolean;
  pauseAmbient(): void;
}

export function createStationScene(
  context: FeatureSceneContext,
): StationScene {
  let host: HTMLElement | null = null;
  let hero: HTMLElement | null = null;
  let ambient: StationAmbientController | null = null;
  let errorListener: EventListener | null = null;

  const releaseMount = (): void => {
    if (host && errorListener) {
      host.removeEventListener('error', errorListener, true);
    }
    errorListener = null;
    ambient?.dispose();
    ambient = null;
    hero = null;
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
      hero = host.querySelector<HTMLElement>('.station-hero');
      if (!hero) return;
      hero.dataset.lowPerformance = String(context.isStationLowPerformance());
      ambient = context.createStationAmbient(hero);
      if (context.isPageHidden()) ambient.pause();
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
      if (context.isPageHidden()) return;
      ambient?.resume();
    },
    setReducedMotion(value: boolean): void {
      if (hero) hero.dataset.reducedMotion = String(value);
      ambient?.setReducedMotion(value);
    },
    setLowPerformance(value: boolean): void {
      if (hero) hero.dataset.lowPerformance = String(value);
      ambient?.setLowPerformance(value);
    },
    requestCaptainGreeting(): boolean {
      return ambient?.requestCaptainGreeting() ?? false;
    },
    pauseAmbient(): void {
      ambient?.pause();
    },
  };
}
