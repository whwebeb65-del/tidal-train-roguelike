import type { SceneId } from './AppTypes';
import { requireElement } from './dom';

export interface CurrencySnapshot {
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
}

export interface AppShellHandles {
  readonly sceneHost: HTMLElement;
  readonly noticeHost: HTMLElement;
  readonly navigation: HTMLElement;
  setCurrencies(snapshot: CurrencySnapshot): void;
  setActiveScene(sceneId: SceneId): void;
  setNotice(message: string): void;
  setNavigationHidden(hidden: boolean): void;
}

function currency(
  id: keyof CurrencySnapshot,
  symbol: string,
  label: string,
  value: number,
): string {
  return `<span class="currency app-currency" data-currency="${id}">
    <span class="app-currency__symbol" aria-hidden="true">${symbol}</span>
    <span class="app-currency__copy"><b>${value}</b><span>${label}</span></span>
  </span>`;
}

function navigationItem(
  sceneId: Exclude<SceneId, 'battle'>,
  icon: string,
  label: string,
): string {
  return `<button class="hub-nav__item" type="button" data-nav-scene="${sceneId}">
    <span class="hub-nav__icon" aria-hidden="true">${icon}</span>
    <span>${label}</span>
  </button>`;
}

export function renderAppShell(snapshot: CurrencySnapshot): string {
  return `<div class="app-shell app-shell--v2">
    <header class="topbar app-topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">潮</span>
        <div class="brand__copy">
          <strong>最后一班</strong>
          <small>潮汐列车</small>
        </div>
      </div>
      <div class="currencies" aria-label="持有资源">
        ${currency('gears', '⚙', '齿轮', snapshot.gears)}
        ${currency('routeMarks', '◇', '航线徽记', snapshot.routeMarks)}
        ${currency('starTickets', '☆', '星票', snapshot.starTickets)}
        <button class="app-shell__reset" type="button" data-action="reset-save" aria-label="清空本地存档">重置</button>
      </div>
    </header>
    <main class="scene-viewport">
      <div id="scene-host" class="scene-host" aria-live="polite"></div>
      <div id="app-notice" class="notice app-notice" role="status"></div>
    </main>
    <nav class="hub-nav app-hub-nav" aria-label="主要功能">
      ${navigationItem('station', '⌂', '车站')}
      ${navigationItem('captain', '♙', '角色')}
      ${navigationItem('equipment', '✦', '装备')}
      ${navigationItem('legion', '⚑', '军团')}
      ${navigationItem('store', '▣', '商店')}
    </nav>
  </div>`;
}

export function mountAppShell(
  root: HTMLElement,
  snapshot: CurrencySnapshot,
): AppShellHandles {
  root.innerHTML = renderAppShell(snapshot);
  const sceneHost = requireElement<HTMLElement>(root, '#scene-host');
  const noticeHost = requireElement<HTMLElement>(root, '#app-notice');
  const navigation = requireElement<HTMLElement>(root, '.hub-nav');
  let noticeTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  return {
    sceneHost,
    noticeHost,
    navigation,

    setCurrencies(next): void {
      for (const [key, value] of Object.entries(next)) {
        const target = requireElement<HTMLElement>(
          root,
          `[data-currency="${key}"] b`,
        );
        target.textContent = String(value);
      }
    },

    setActiveScene(sceneId): void {
      for (const button of root.querySelectorAll<HTMLButtonElement>(
        '[data-nav-scene]',
      )) {
        const active = button.dataset.navScene === sceneId;
        button.classList.toggle('is-active', active);
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
    },

    setNotice(message): void {
      if (noticeTimer !== null) {
        globalThis.clearTimeout(noticeTimer);
        noticeTimer = null;
      }
      noticeHost.textContent = message;
      noticeHost.classList.toggle('is-visible', message.length > 0);
      if (message.length > 0) {
        noticeTimer = globalThis.setTimeout(() => {
          noticeHost.classList.remove('is-visible');
          noticeTimer = null;
        }, 4200);
      }
    },

    setNavigationHidden(hidden): void {
      navigation.hidden = hidden;
    },
  };
}
