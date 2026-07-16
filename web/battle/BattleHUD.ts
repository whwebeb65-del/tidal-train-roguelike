import { requireElement } from '../app/dom';
import {
  createBattleHudModel,
  type BattleHudModel,
} from './BattleHudModel';
import type {
  BattleSkillId,
  BattleUpgradeId,
} from './BattleTypes';

export {
  createBattleHudModel,
  type BattleHudModel,
  type BattleHudModelOptions,
  type BattleSettlementPresentation,
} from './BattleHudModel';

export interface BattleHudCallbacks {
  onSkill(skillId: BattleSkillId): void;
  onChooseUpgrade(upgradeId: BattleUpgradeId): void;
  onClaimInteraction(actionId: string, attempt: number): void;
  onRequestUpgradeReroll(): void;
  onRequestSkillRefresh(): void;
  onPause(): void;
  onResume(): void;
  onRequestRevive(): void;
  onRequestDoubleSettlement(): void;
  onGiveUp(): void;
  onReturnStation(): void;
}

interface HudNodes {
  readonly wave: HTMLElement;
  readonly timer: HTMLElement;
  readonly hpLabel: HTMLElement;
  readonly hpFill: HTMLElement;
  readonly shield: HTMLElement;
  readonly energyLabel: HTMLElement;
  readonly energyFill: HTMLElement;
  readonly combo: HTMLElement;
  readonly experienceLabel: HTMLElement;
  readonly experienceFill: HTMLElement;
  readonly boss: HTMLElement;
  readonly bossLabel: HTMLElement;
  readonly bossHpFill: HTMLElement;
  readonly bossShieldFill: HTMLElement;
  readonly upgradeIcons: readonly HTMLElement[];
  readonly skillButtons: ReadonlyMap<BattleSkillId, HTMLButtonElement>;
  readonly upgradeOverlay: HTMLElement;
  readonly upgradeOptions: HTMLElement;
  readonly upgradeButtons: readonly HTMLButtonElement[];
  readonly upgradeCountdown: HTMLElement;
  readonly rerollButton: HTMLButtonElement;
  readonly skillRefreshButton: HTMLButtonElement;
  readonly interactionCard: HTMLButtonElement;
  readonly interactionTitle: HTMLElement;
  readonly interactionMeta: HTMLElement;
  readonly interactionNotice: HTMLElement;
  readonly pauseOverlay: HTMLElement;
  readonly failureOverlay: HTMLElement;
  readonly failureSummary: HTMLElement;
  readonly reviveButton: HTMLButtonElement;
  readonly settlementOverlay: HTMLElement;
  readonly settlementTitle: HTMLElement;
  readonly settlementDescription: HTMLElement;
  readonly settlementGears: HTMLElement;
  readonly settlementRouteMarks: HTMLElement;
  readonly settlementStarTickets: HTMLElement;
  readonly expedition: HTMLElement;
  readonly dailyScore: HTMLElement;
  readonly doubleButton: HTMLButtonElement;
  readonly returnButton: HTMLButtonElement;
}

const SKILL_IDS: readonly BattleSkillId[] = [
  'tidal-volley',
  'bubble-barrier',
  'extreme-tide',
];

export function renderBattleHudShell(): string {
  return `<div class="battle-hud" data-battle-hud-root>
    <header class="battle-hud__top">
      <div class="battle-hud__run">
        <strong data-hud-wave>第 1 波</strong>
        <span data-hud-time>00:00</span>
      </div>
      <button class="battle-hud__pause" type="button" data-battle-action="pause" aria-label="暂停战斗">Ⅱ</button>
      <div class="battle-hud__boss" data-boss-bar hidden>
        <div><strong data-boss-label></strong><span>目标锁定</span></div>
        <div class="battle-meter battle-meter--boss">
          <i data-boss-hp-fill></i>
          <b data-boss-shield-fill></b>
        </div>
      </div>
      <div class="battle-hud__vitals">
        <div class="battle-vital battle-vital--hp">
          <span>列车耐久</span><b data-hud-hp-label>100 / 100</b>
          <div class="battle-meter"><i data-hud-hp-fill></i></div>
          <small data-hud-shield>护盾未展开</small>
        </div>
        <div class="battle-vital battle-vital--energy">
          <span>极潮能量</span><b data-hud-energy-label>0 / 100</b>
          <div class="battle-meter"><i data-hud-energy-fill></i></div>
          <small data-hud-combo>等待命中</small>
        </div>
      </div>
      <div class="battle-hud__progress">
        <div><span>本局强化</span><b data-hud-experience-label>0 / 180</b></div>
        <div class="battle-meter battle-meter--experience"><i data-hud-experience-fill></i></div>
        <div class="battle-hud__upgrade-icons" aria-label="已获得强化">
          ${Array.from({ length: 6 }, (_, index) => (
            `<span data-upgrade-icon="${index}" hidden></span>`
          )).join('')}
        </div>
      </div>
    </header>

    <aside class="battle-interaction" aria-live="polite">
      <button type="button" data-battle-action="claim-interaction" hidden>
        <span class="battle-interaction__symbol" aria-hidden="true">◇</span>
        <span><b data-interaction-title></b><small data-interaction-meta></small></span>
        <strong>领取</strong>
      </button>
      <p data-interaction-notice></p>
    </aside>

    <div class="battle-hud__skills" aria-label="主动技能">
      ${skillButton('tidal-volley', '潮汐齐射', '1', '≈')}
      ${skillButton('bubble-barrier', '泡泡屏障', '2', '◌')}
      ${skillButton('extreme-tide', '极潮爆发', '3', '✦')}
      <button class="battle-hud__refresh" type="button" data-battle-action="skill-refresh" hidden>广告刷新技能</button>
    </div>

    <section class="battle-overlay battle-overlay--pause" data-pause-overlay hidden>
      <div class="battle-dialog battle-dialog--compact">
        <span class="battle-dialog__eyebrow">PAUSED</span>
        <h2>列车暂时减速</h2>
        <p>战斗时钟和怪潮已经暂停。</p>
        <button type="button" class="battle-button battle-button--primary" data-battle-action="resume">继续战斗</button>
      </div>
    </section>

    <section class="battle-overlay battle-overlay--upgrade" data-upgrade-overlay hidden>
      <div class="battle-dialog battle-dialog--upgrade">
        <span class="battle-dialog__eyebrow">ROGUELITE UPGRADE</span>
        <h2>选择一项潮汐强化</h2>
        <p>本次选择立即生效，最高可叠加至 3 级。</p>
        <div class="battle-upgrade-grid" data-upgrade-options>
          ${Array.from({ length: 3 }, (_, index) => upgradeSlot(index)).join('')}
        </div>
        <div class="battle-upgrade-countdown" data-upgrade-countdown hidden>3 · 2 · 1</div>
        <button type="button" class="battle-button battle-button--ghost" data-battle-action="upgrade-reroll" hidden>看广告刷新三选一</button>
      </div>
    </section>

    <section class="battle-overlay battle-overlay--failure" data-failure-overlay hidden>
      <div class="battle-dialog">
        <span class="battle-dialog__eyebrow">TRAIN BREACHED</span>
        <h2>列车防线失守</h2>
        <p data-failure-summary></p>
        <div class="battle-dialog__actions">
          <button type="button" class="battle-button battle-button--primary" data-battle-action="revive">看广告复活</button>
          <button type="button" class="battle-button battle-button--ghost" data-battle-action="give-up">放弃本局并结算</button>
        </div>
      </div>
    </section>

    <section class="battle-overlay battle-overlay--settlement" data-settlement-overlay hidden>
      <div class="battle-dialog battle-dialog--settlement">
        <span class="battle-dialog__eyebrow">RUN SETTLED</span>
        <h2 data-settlement-title></h2>
        <p data-settlement-description></p>
        <div class="battle-settlement-rewards">
          <span><i>⚙</i><b data-settlement-gears>0</b><small>齿轮</small></span>
          <span><i>◇</i><b data-settlement-route-marks>0</b><small>航线徽记</small></span>
          <span><i>✦</i><b data-settlement-star-tickets>0</b><small>星票</small></span>
        </div>
        <div class="battle-settlement-meta">
          <span data-settlement-expedition hidden></span>
          <span data-settlement-daily-score hidden></span>
        </div>
        <div class="battle-dialog__actions">
          <button type="button" class="battle-button battle-button--accent" data-battle-action="double-settlement" hidden>看广告领取重复通关双倍</button>
          <button type="button" class="battle-button battle-button--primary" data-battle-action="return-station">返回车站</button>
        </div>
      </div>
    </section>
  </div>`;
}

export class BattleHUD {
  private host: HTMLElement | null = null;
  private nodes: HudNodes | null = null;
  private model: BattleHudModel | null = null;
  private exitRequested = false;
  private readonly keyboardTarget: EventTarget | null;

  private readonly onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    const skillId = button.dataset.battleSkill as BattleSkillId | undefined;
    if (skillId && SKILL_IDS.includes(skillId)) {
      this.callbacks.onSkill(skillId);
      return;
    }
    const upgradeId = button.dataset.upgradeId as
      | BattleUpgradeId
      | undefined;
    if (upgradeId) {
      this.callbacks.onChooseUpgrade(upgradeId);
      return;
    }
    const action = button.dataset.battleAction;
    if (action === 'pause') this.callbacks.onPause();
    if (action === 'resume') this.callbacks.onResume();
    if (action === 'upgrade-reroll') {
      this.callbacks.onRequestUpgradeReroll();
    }
    if (action === 'skill-refresh') {
      this.callbacks.onRequestSkillRefresh();
    }
    if (action === 'claim-interaction') {
      const actionId = button.dataset.interactionId;
      const attempt = Number(button.dataset.interactionAttempt);
      if (actionId && Number.isInteger(attempt)) {
        this.callbacks.onClaimInteraction(actionId, attempt);
      }
    }
    if (action === 'revive') this.callbacks.onRequestRevive();
    if (action === 'double-settlement') {
      this.callbacks.onRequestDoubleSettlement();
    }
    if (action === 'give-up') this.callbacks.onGiveUp();
    if (action === 'return-station' && !this.exitRequested) {
      this.exitRequested = true;
      button.disabled = true;
      this.callbacks.onReturnStation();
    }
  };

  private readonly onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.repeat || !this.model) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement
      && (
        target.isContentEditable
        || target.matches('input, textarea, select, button')
      )
    ) {
      return;
    }
    const skillIndex = ['1', '2', '3'].indexOf(event.key);
    if (skillIndex >= 0 && this.model.status === 'running') {
      const skillId = SKILL_IDS[skillIndex];
      if (skillId) {
        event.preventDefault();
        this.callbacks.onSkill(skillId);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.model.status === 'paused') this.callbacks.onResume();
      else if (this.model.status === 'running') this.callbacks.onPause();
    }
  };

  public constructor(
    private readonly callbacks: BattleHudCallbacks,
    keyboardTarget?: EventTarget | null,
  ) {
    this.keyboardTarget = keyboardTarget
      ?? (typeof window === 'undefined' ? null : window);
  }

  public mount(host: HTMLElement): void {
    if (this.host) this.dispose();
    this.host = host;
    this.exitRequested = false;
    host.innerHTML = renderBattleHudShell();
    this.nodes = collectNodes(host);
    host.addEventListener('click', this.onClick);
    this.keyboardTarget?.addEventListener('keydown', this.onKeyDown);
  }

  public update(model: BattleHudModel): void {
    const nodes = this.nodes;
    if (!nodes) throw new Error('Battle HUD must be mounted before update');
    this.model = model;

    setText(nodes.wave, model.waveLabel);
    setText(nodes.timer, model.timerLabel);
    setText(nodes.hpLabel, model.hpLabel);
    setWidth(nodes.hpFill, model.hpPercent);
    setText(nodes.shield, model.shieldLabel);
    setText(nodes.energyLabel, model.energyLabel);
    setWidth(nodes.energyFill, model.energyPercent);
    setText(nodes.combo, model.comboLabel);
    setText(nodes.experienceLabel, model.experienceLabel);
    setWidth(nodes.experienceFill, model.experiencePercent);

    nodes.boss.hidden = !model.bossBar.visible;
    setText(nodes.bossLabel, model.bossBar.label);
    setWidth(nodes.bossHpFill, model.bossBar.hpPercent);
    setWidth(nodes.bossShieldFill, model.bossBar.shieldPercent);

    nodes.upgradeIcons.forEach((node, index) => {
      const label = model.upgradeIcons[index];
      node.hidden = !label;
      if (label) setText(node, label);
    });

    for (const skill of model.skills) {
      const button = nodes.skillButtons.get(skill.id);
      if (!button) continue;
      setText(
        requireElement(button, '[data-skill-cooldown]'),
        skill.cooldownLabel,
      );
      button.classList.toggle('is-ready', skill.ready);
      button.classList.toggle('is-charging', !skill.ready);
      button.disabled = (
        model.status !== 'running'
        || model.pendingActions.has(`skill:${skill.id}`)
      );
      button.setAttribute('aria-label', `${skill.name} ${skill.cooldownLabel}`);
    }

    nodes.skillRefreshButton.hidden = !model.skillRefreshVisible;
    nodes.skillRefreshButton.disabled =
      model.pendingActions.has('skill-refresh');
    nodes.upgradeOverlay.hidden = !model.upgradeVisible;
    nodes.upgradeOptions.hidden = model.upgradeCountdownVisible;
    nodes.upgradeCountdown.hidden = !model.upgradeCountdownVisible;
    nodes.upgradeButtons.forEach((button, index) => {
      const card = model.upgradeCards[index];
      button.hidden = !card;
      if (!card) {
        delete button.dataset.upgradeId;
        return;
      }
      button.dataset.upgradeId = card.id;
      button.disabled = model.pendingActions.has('upgrade-choice');
      setText(requireElement(button, '[data-upgrade-name]'), card.name);
      setText(
        requireElement(button, '[data-upgrade-level]'),
        `Lv.${card.currentLevel} → Lv.${card.nextLevel}`,
      );
      setText(requireElement(button, '[data-upgrade-effect]'), card.effect);
      setText(
        requireElement(button, '[data-upgrade-synergy]'),
        card.synergy,
      );
    });
    nodes.rerollButton.hidden = !model.upgradeRerollVisible;
    nodes.rerollButton.disabled = model.pendingActions.has('upgrade-reroll');

    nodes.interactionCard.hidden = model.interaction === null;
    if (model.interaction) {
      nodes.interactionCard.dataset.interactionId =
        model.interaction.actionId;
      nodes.interactionCard.dataset.interactionAttempt =
        String(model.interaction.attempt);
      nodes.interactionCard.disabled =
        model.pendingActions.has('interaction');
      setText(nodes.interactionTitle, model.interaction.label);
      setText(
        nodes.interactionMeta,
        `本局 ${model.interaction.attempt}/${model.interaction.maxClaims} · +${model.interaction.amount} ${model.interaction.currencyLabel}`,
      );
    } else {
      delete nodes.interactionCard.dataset.interactionId;
      delete nodes.interactionCard.dataset.interactionAttempt;
    }
    setText(nodes.interactionNotice, model.interactionNotice);

    nodes.pauseOverlay.hidden = !model.pauseOverlayVisible;
    nodes.failureOverlay.hidden = !model.failureVisible;
    setText(nodes.failureSummary, model.failureSummary);
    nodes.reviveButton.hidden = !model.reviveAvailable;
    nodes.reviveButton.disabled = model.pendingActions.has('revive');

    nodes.settlementOverlay.hidden = !model.settlementVisible;
    if (model.settlement) {
      setText(nodes.settlementTitle, model.settlement.title);
      setText(
        nodes.settlementDescription,
        model.settlement.description,
      );
      setText(
        nodes.settlementGears,
        String(model.settlement.rewards.gears),
      );
      setText(
        nodes.settlementRouteMarks,
        String(model.settlement.rewards.routeMarks),
      );
      setText(
        nodes.settlementStarTickets,
        String(model.settlement.rewards.starTickets),
      );
      nodes.expedition.hidden = model.settlement.expeditionPoints <= 0;
      setText(
        nodes.expedition,
        `军团远征贡献 +${model.settlement.expeditionPoints}`,
      );
      nodes.dailyScore.hidden = model.settlement.dailyTrialScore === null;
      setText(
        nodes.dailyScore,
        model.settlement.dailyTrialScore === null
          ? ''
          : `每日试炼得分 ${model.settlement.dailyTrialScore}`,
      );
    }
    nodes.doubleButton.hidden = !model.doubleSettlementVisible;
    nodes.doubleButton.disabled =
      model.pendingActions.has('double-settlement');
    nodes.returnButton.disabled = this.exitRequested;
  }

  public dispose(): void {
    if (!this.host) return;
    this.host.removeEventListener('click', this.onClick);
    this.keyboardTarget?.removeEventListener('keydown', this.onKeyDown);
    this.host.innerHTML = '';
    this.host = null;
    this.nodes = null;
    this.model = null;
  }
}

function skillButton(
  id: BattleSkillId,
  label: string,
  shortcut: string,
  icon: string,
): string {
  return `<button class="battle-skill" type="button" data-battle-skill="${id}">
    <span class="battle-skill__key">${shortcut}</span>
    <span class="battle-skill__icon" aria-hidden="true">${icon}</span>
    <span class="battle-skill__copy"><b>${label}</b><small data-skill-cooldown>就绪</small></span>
  </button>`;
}

function upgradeSlot(index: number): string {
  return `<button class="battle-upgrade-card" type="button" data-upgrade-slot="${index}" hidden>
    <span data-upgrade-level></span>
    <b data-upgrade-name></b>
    <p data-upgrade-effect></p>
    <small data-upgrade-synergy></small>
  </button>`;
}

function collectNodes(host: HTMLElement): HudNodes {
  const skillButtons = new Map<BattleSkillId, HTMLButtonElement>();
  for (const button of host.querySelectorAll<HTMLButtonElement>(
    '[data-battle-skill]',
  )) {
    const id = button.dataset.battleSkill as BattleSkillId;
    skillButtons.set(id, button);
  }
  return {
    wave: requireElement(host, '[data-hud-wave]'),
    timer: requireElement(host, '[data-hud-time]'),
    hpLabel: requireElement(host, '[data-hud-hp-label]'),
    hpFill: requireElement(host, '[data-hud-hp-fill]'),
    shield: requireElement(host, '[data-hud-shield]'),
    energyLabel: requireElement(host, '[data-hud-energy-label]'),
    energyFill: requireElement(host, '[data-hud-energy-fill]'),
    combo: requireElement(host, '[data-hud-combo]'),
    experienceLabel: requireElement(host, '[data-hud-experience-label]'),
    experienceFill: requireElement(host, '[data-hud-experience-fill]'),
    boss: requireElement(host, '[data-boss-bar]'),
    bossLabel: requireElement(host, '[data-boss-label]'),
    bossHpFill: requireElement(host, '[data-boss-hp-fill]'),
    bossShieldFill: requireElement(host, '[data-boss-shield-fill]'),
    upgradeIcons: [...host.querySelectorAll<HTMLElement>(
      '[data-upgrade-icon]',
    )],
    skillButtons,
    upgradeOverlay: requireElement(host, '[data-upgrade-overlay]'),
    upgradeOptions: requireElement(host, '[data-upgrade-options]'),
    upgradeButtons: [...host.querySelectorAll<HTMLButtonElement>(
      '[data-upgrade-slot]',
    )],
    upgradeCountdown: requireElement(host, '[data-upgrade-countdown]'),
    rerollButton: requireElement(host, '[data-battle-action="upgrade-reroll"]'),
    skillRefreshButton: requireElement(
      host,
      '[data-battle-action="skill-refresh"]',
    ),
    interactionCard: requireElement(
      host,
      '[data-battle-action="claim-interaction"]',
    ),
    interactionTitle: requireElement(host, '[data-interaction-title]'),
    interactionMeta: requireElement(host, '[data-interaction-meta]'),
    interactionNotice: requireElement(host, '[data-interaction-notice]'),
    pauseOverlay: requireElement(host, '[data-pause-overlay]'),
    failureOverlay: requireElement(host, '[data-failure-overlay]'),
    failureSummary: requireElement(host, '[data-failure-summary]'),
    reviveButton: requireElement(host, '[data-battle-action="revive"]'),
    settlementOverlay: requireElement(host, '[data-settlement-overlay]'),
    settlementTitle: requireElement(host, '[data-settlement-title]'),
    settlementDescription: requireElement(
      host,
      '[data-settlement-description]',
    ),
    settlementGears: requireElement(host, '[data-settlement-gears]'),
    settlementRouteMarks: requireElement(
      host,
      '[data-settlement-route-marks]',
    ),
    settlementStarTickets: requireElement(
      host,
      '[data-settlement-star-tickets]',
    ),
    expedition: requireElement(host, '[data-settlement-expedition]'),
    dailyScore: requireElement(host, '[data-settlement-daily-score]'),
    doubleButton: requireElement(
      host,
      '[data-battle-action="double-settlement"]',
    ),
    returnButton: requireElement(
      host,
      '[data-battle-action="return-station"]',
    ),
  };
}

function setText(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function setWidth(node: HTMLElement, percent: number): void {
  const value = `${Math.min(100, Math.max(0, percent)).toFixed(2)}%`;
  if (node.style.width !== value) node.style.width = value;
}
