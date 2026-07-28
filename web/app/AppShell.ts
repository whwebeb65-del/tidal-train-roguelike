import type { SceneId } from './AppTypes';
import { requireElement } from './dom';
import {
  renderSettingsPanel,
  type SettingsPanelModel,
} from '../views/SettingsPanelView';

export interface CurrencySnapshot {
  readonly gears: number;
  readonly routeMarks: number;
  readonly starTickets: number;
  readonly account?: AccountTicketSnapshot;
}

export interface AccountTicketSnapshot {
  readonly level: number;
  readonly xp: number;
  readonly nextLevelXp: number;
  readonly stamina: number;
  readonly maxStamina: number;
  readonly nextSpeedUnlock: { readonly level: number; readonly speed: number } | null;
}

export interface AppShellHandles {
  readonly sceneHost: HTMLElement;
  readonly noticeHost: HTMLElement;
  readonly navigation: HTMLElement;
  setCurrencies(snapshot: CurrencySnapshot): void;
  setAccountTicket(snapshot: AccountTicketSnapshot): void;
  setActiveScene(sceneId: SceneId): void;
  setNotice(message: string): void;
  setNavigationHidden(hidden: boolean): void;
  openSettings(model: SettingsPanelModel): void;
  closeSettings(): void;
  isSettingsOpen(): boolean;
}

function accountTicket(snapshot: AccountTicketSnapshot): string {
  const nextSpeed = snapshot.nextSpeedUnlock === null
    ? '最高倍速已解锁'
    : `下一倍速：Lv.${snapshot.nextSpeedUnlock.level} · ${snapshot.nextSpeedUnlock.speed}×`;
  const label = `账号 Lv.${snapshot.level}，${snapshot.xp} / ${snapshot.nextLevelXp} XP，体力 ${snapshot.stamina} / ${snapshot.maxStamina}，${nextSpeed}`;
  return `<div class="app-account-ticket" data-account-ticket aria-label="${label}">
    <span data-account-level>账号 Lv.${snapshot.level}</span>
    <span class="app-account-ticket__xp" data-account-xp data-compact-xp="Lv.${snapshot.level} · ${Math.floor(snapshot.xp / snapshot.nextLevelXp * 100)}%">${snapshot.xp} / ${snapshot.nextLevelXp} XP</span>
    <span data-account-stamina>体力 ${snapshot.stamina} / ${snapshot.maxStamina}</span>
    <span data-account-speed>${nextSpeed}</span>
  </div>`;
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
      ${snapshot.account ? accountTicket(snapshot.account) : ''}
      <div class="currencies" aria-label="持有资源">
        ${currency('gears', '⚙', '齿轮', snapshot.gears)}
        ${currency('routeMarks', '◇', '航线徽记', snapshot.routeMarks)}
        ${currency('starTickets', '☆', '星票', snapshot.starTickets)}
        <button class="app-shell__reset" type="button" data-action="reset-save" aria-label="清空本地存档">重置</button>
        <button class="app-shell__settings" type="button"
          data-action="open-settings" aria-label="打开游戏设置">设置</button>
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
    <div id="settings-host" hidden></div>
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
  const settingsHost = requireElement<HTMLElement>(root, '#settings-host');
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

    setAccountTicket(next): void {
      const ticket = requireElement<HTMLElement>(root, '[data-account-ticket]');
      const nextSpeed = next.nextSpeedUnlock === null
        ? '最高倍速已解锁'
        : `下一倍速：Lv.${next.nextSpeedUnlock.level} · ${next.nextSpeedUnlock.speed}×`;
      ticket.setAttribute('aria-label', `账号 Lv.${next.level}，${next.xp} / ${next.nextLevelXp} XP，体力 ${next.stamina} / ${next.maxStamina}，${nextSpeed}`);
      requireElement<HTMLElement>(ticket, '[data-account-level]').textContent = `账号 Lv.${next.level}`;
      const xp = requireElement<HTMLElement>(ticket, '[data-account-xp]');
      xp.textContent = `${next.xp} / ${next.nextLevelXp} XP`;
      xp.dataset.compactXp = `Lv.${next.level} · ${Math.floor(next.xp / next.nextLevelXp * 100)}%`;
      requireElement<HTMLElement>(ticket, '[data-account-stamina]').textContent = `体力 ${next.stamina} / ${next.maxStamina}`;
      requireElement<HTMLElement>(ticket, '[data-account-speed]').textContent = nextSpeed;
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

    openSettings(model): void {
      settingsHost.innerHTML = renderSettingsPanel(model);
      settingsHost.hidden = false;
      settingsHost.querySelector<HTMLButtonElement>(
        '[data-action="close-settings"]',
      )?.focus();
    },

    closeSettings(): void {
      settingsHost.hidden = true;
      settingsHost.replaceChildren();
    },

    isSettingsOpen(): boolean {
      return !settingsHost.hidden;
    },
  };
}
