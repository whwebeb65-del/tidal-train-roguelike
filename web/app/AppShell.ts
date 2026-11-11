import type { SceneId } from './AppTypes';
import { requireElement } from './dom';
import { renderResetSaveDialog } from '../views/ResetSaveDialogView';
import {
  renderSettingsPanel,
  updateSettingsPanel,
  type SettingsPanelModel,
} from '../views/SettingsPanelView';

const STATION_NOTICE_DURATION_MS = 4200;
const BATTLE_NOTICE_DURATION_MS = 2400;

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
  setBattleChrome(active: boolean): void;
  setReducedMotion(reduced: boolean): void;
  openResetSaveDialog(): boolean;
  closeResetSaveDialog(): void;
  isResetSaveDialogOpen(): boolean;
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
    <span class="app-account-ticket__xp" data-account-xp data-compact-xp="XP ${Math.floor(snapshot.xp / snapshot.nextLevelXp * 100)}%">${snapshot.xp} / ${snapshot.nextLevelXp} XP</span>
    <span data-account-stamina>体力 ${snapshot.stamina} / ${snapshot.maxStamina}</span>
    <span data-account-speed>${nextSpeed}</span>
  </div>`;
}

function currency(
  id: keyof CurrencySnapshot,
  label: string,
  value: number,
): string {
  return `<span class="currency app-currency" data-currency="${id}">
    <span class="app-currency__copy"><b>${value}</b><span>${label}</span></span>
  </span>`;
}

function navigationItem(
  sceneId: Exclude<SceneId, 'battle'>,
  label: string,
): string {
  return `<button class="hub-nav__item" type="button" data-nav-scene="${sceneId}">
    <span class="hub-nav__icon" aria-hidden="true">${navigationIcon(sceneId)}</span>
    <span>${label}</span>
  </button>`;
}

function navigationIcon(sceneId: Exclude<SceneId, 'battle'>): string {
  const drawings: Readonly<Record<Exclude<SceneId, 'battle'>, string>> = {
    station: '<path d="M3 26h26M6 23V12l10-7 10 7v11M11 23v-7h10v7M12 11h8"/>',
    captain: '<path d="M7 14c1-6 4-9 9-9s8 3 9 9M5 15c6 4 16 4 22 0M9 20c3 5 11 5 14 0M16 8v6"/>',
    equipment: '<path d="M6 25 23 8M20 5l7 7M5 20l7 7M7 7l5 5M5 5l4-1 3 3-1 4"/>',
    legion: '<path d="M11 27h10M13 23l2-14h2l2 14M12 23h8M10 9h12M7 7 3 5M25 7l4-2M16 4V1"/>',
    store: '<path d="M5 10h22v16H5zM11 10V6h10v4M5 16h22M13 16v3h6v-3"/>',
  };
  return `<svg data-nav-glyph="${sceneId}" viewBox="0 0 32 32" focusable="false"><g>${drawings[sceneId]}</g></svg>`;
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
        ${currency('gears', '齿轮', snapshot.gears)}
        ${currency('routeMarks', '航线徽记', snapshot.routeMarks)}
        ${currency('starTickets', '星票', snapshot.starTickets)}
        <button class="app-shell__reset" type="button" data-action="reset-save" aria-label="清空本地存档"
          aria-haspopup="dialog" aria-controls="reset-save-dialog">重置</button>
        <button class="app-shell__settings" type="button"
          data-action="open-settings" aria-label="打开游戏设置"
          aria-haspopup="dialog">设置</button>
      </div>
    </header>
    <main class="scene-viewport">
      <div id="scene-host" class="scene-host" aria-live="polite"></div>
      <div id="app-notice" class="notice app-notice station-announcement" role="status" aria-atomic="true"><span data-notice-copy></span></div>
    </main>
    <nav class="hub-nav app-hub-nav" aria-label="主要功能">
      ${navigationItem('station', '车站')}
      ${navigationItem('captain', '角色')}
      ${navigationItem('equipment', '装备')}
      ${navigationItem('legion', '军团')}
      ${navigationItem('store', '商店')}
    </nav>
    <div id="settings-host" hidden></div>
    ${renderResetSaveDialog()}
  </div>`;
}

export function mountAppShell(
  root: HTMLElement,
  snapshot: CurrencySnapshot,
): AppShellHandles {
  root.innerHTML = renderAppShell(snapshot);
  const shellRoot = requireElement<HTMLElement>(root, '.app-shell');
  const sceneHost = requireElement<HTMLElement>(root, '#scene-host');
  const noticeHost = requireElement<HTMLElement>(root, '#app-notice');
  const noticeCopy = requireElement<HTMLElement>(noticeHost, '[data-notice-copy]');
  const navigation = requireElement<HTMLElement>(root, '.hub-nav');
  const settingsHost = requireElement<HTMLElement>(root, '#settings-host');
  const settingsTrigger = requireElement<HTMLButtonElement>(root, '[data-action="open-settings"]');
  const resetDialog = requireElement<HTMLDialogElement>(root, '#reset-save-dialog');
  const resetTrigger = requireElement<HTMLButtonElement>(root, '[data-action="reset-save"]');
  let noticeTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let settingsDialog: HTMLDialogElement | null = null;

  function closeSettings(): void {
    if (settingsDialog?.open) settingsDialog.close();
  }

  resetDialog.addEventListener('close', () => {
    if (!resetDialog.open && settingsHost.hidden
      && !root.firstElementChild?.classList.contains('app-shell--battle')) {
      resetTrigger.focus({ preventScroll: true });
    }
  });

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
      xp.dataset.compactXp = `XP ${Math.floor(next.xp / next.nextLevelXp * 100)}%`;
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
      noticeCopy.textContent = message;
      noticeHost.classList.toggle('is-visible', message.length > 0);
      if (message.length === 0) return;

      const isBattle = root.firstElementChild?.classList
        .contains('app-shell--battle') ?? false;
      const duration = isBattle
        ? BATTLE_NOTICE_DURATION_MS
        : STATION_NOTICE_DURATION_MS;
      noticeTimer = globalThis.setTimeout(() => {
        noticeHost.classList.remove('is-visible');
        noticeTimer = null;
      }, duration);
    },

    setNavigationHidden(hidden): void {
      navigation.hidden = hidden;
    },

    setBattleChrome(active): void {
      root.firstElementChild?.classList.toggle('app-shell--battle', active);
      if (active && resetDialog.open) resetDialog.close();
      if (active) closeSettings();
      // The HUD updates continuously. Announce its own live notices, not the
      // timer, meters, and combat state of the whole scene.
      if (active) sceneHost.removeAttribute('aria-live');
      else if (sceneHost.getAttribute('aria-live') !== 'polite') {
        sceneHost.setAttribute('aria-live', 'polite');
      }
    },

    setReducedMotion(reduced): void {
      const preference = String(reduced);
      if (shellRoot.dataset.reducedMotion !== preference) {
        shellRoot.dataset.reducedMotion = preference;
      }
    },

    openResetSaveDialog(): boolean {
      if (resetDialog.open) return true;
      if (settingsDialog?.open || typeof resetDialog.showModal !== 'function'
        || typeof resetDialog.close !== 'function') return false;
      try {
        resetDialog.showModal();
        return resetDialog.open;
      } catch {
        // Never fall back to a non-modal or automatic reset.
        return false;
      }
    },

    closeResetSaveDialog(): void {
      if (resetDialog.open) resetDialog.close();
    },

    isResetSaveDialogOpen(): boolean {
      return resetDialog.open;
    },

    openSettings(model): void {
      if (resetDialog.open || shellRoot.classList.contains('app-shell--battle')) return;
      if (settingsDialog?.open) {
        updateSettingsPanel(settingsDialog, model);
        return;
      }
      settingsHost.innerHTML = renderSettingsPanel(model);
      const dialog = requireElement<HTMLDialogElement>(settingsHost, '[data-settings-panel]');
      settingsDialog = dialog;
      const clearDialog = () => {
        if (settingsDialog !== dialog || dialog.open) return;
        settingsDialog = null;
        settingsHost.hidden = true;
        settingsHost.replaceChildren();
      };
      dialog.addEventListener('close', () => {
        if (settingsDialog !== dialog || dialog.open) return;
        clearDialog();
        if (!resetDialog.open && !shellRoot.classList.contains('app-shell--battle')) {
          settingsTrigger.focus({ preventScroll: true });
        }
      });
      let backdropPressed = false;
      dialog.addEventListener('pointerdown', (event) => {
        backdropPressed = event.isPrimary && event.button === 0 && event.target === dialog;
      });
      dialog.addEventListener('pointercancel', () => {
        backdropPressed = false;
      });
      dialog.addEventListener('click', (event) => {
        // A drag across the panel can produce a click on the shared dialog
        // ancestor. Treat only a deliberate outside press and release as close.
        const isBackdropClick = backdropPressed && event.target === dialog
          && root.ownerDocument.elementFromPoint(event.clientX, event.clientY) === dialog;
        backdropPressed = false;
        if (isBackdropClick) closeSettings();
      });
      dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
        const controls = [...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled)',
        )];
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) return;
        const active = root.ownerDocument.activeElement;
        if (active !== (event.shiftKey ? first : last)) return;
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      });
      settingsHost.hidden = false;
      try {
        dialog.showModal();
      } catch {
        clearDialog();
        this.setNotice('当前浏览器无法打开设置，请使用较新的浏览器。');
      }
    },

    closeSettings,

    isSettingsOpen(): boolean {
      return settingsDialog?.open === true;
    },
  };
}
