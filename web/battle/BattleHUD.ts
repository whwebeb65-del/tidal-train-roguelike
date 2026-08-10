import { requireElement } from '../app/dom';
import {
  createBattleHudModel,
  type BattleHudModel,
} from './BattleHudModel';
import type {
  BattleSkillId,
  BattleUpgradeId,
} from './BattleTypes';
import type { BattleSpeed } from '../../src/domain/progression/AccountProgressionSystem';
import { BATTLE_ART_URLS, BATTLE_VARIANT_GLYPH_URLS } from '../assets/BattleArtCatalog';

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
  onBattleSpeed?(speed: BattleSpeed): void;
}

interface HudNodes {
  readonly wave: HTMLElement;
  readonly timer: HTMLElement;
  readonly runLevel: HTMLElement;
  readonly hpLabel: HTMLElement;
  readonly hpFill: HTMLElement;
  readonly shield: HTMLElement;
  readonly energyLabel: HTMLElement;
  readonly energyFill: HTMLElement;
  readonly combo: HTMLElement;
  readonly experienceLabel: HTMLElement;
  readonly experienceFill: HTMLElement;
  readonly skillButtons: ReadonlyMap<BattleSkillId, HTMLButtonElement>;
  readonly speedButton: HTMLButtonElement;
  readonly upgradeOverlay: HTMLElement;
  readonly upgradeOptions: HTMLElement;
  readonly evolutionRibbon: HTMLElement;
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
  readonly settlementRewards: HTMLElement;
  readonly settlementProgression: HTMLElement;
  readonly settlementAccount: HTMLElement;
  readonly settlementMastery: HTMLElement;
  readonly expedition: HTMLElement;
  readonly dailyScore: HTMLElement;
  readonly firstClearTicket: HTMLElement;
  readonly repeatClearTicket: HTMLElement;
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
    <header class="battle-hud__tide-log">
      <div class="battle-hud__run">
        <strong data-hud-wave>第 1 波</strong>
        <span data-hud-time>00:00</span>
        <b data-hud-run-level>Lv.1</b>
      </div>
      <div class="battle-hud__rails">
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
        <div><span>经验轨道</span><b data-hud-experience-label>0 / 180</b></div>
        <div class="battle-meter battle-meter--experience"><i data-hud-experience-fill></i></div>
      </div>
      <button class="battle-hud__speed" type="button" data-battle-action="speed" aria-label="战斗速度 1×">1×</button>
      <button class="battle-hud__pause" type="button" data-battle-action="pause" aria-label="暂停战斗">暂停</button>
    </header>

    <aside class="battle-interaction" aria-live="polite">
      <button type="button" data-battle-action="claim-interaction" hidden>
        <span class="battle-interaction__symbol" aria-hidden="true">潮</span>
        <span><b data-interaction-title></b><small data-interaction-meta></small></span>
        <strong>领取</strong>
      </button>
      <p data-interaction-notice></p>
    </aside>

    <div class="battle-hud__skills" aria-label="主动技能">
      ${skillButton('tidal-volley', '潮汐齐射', '1', BATTLE_ART_URLS.skillTidalVolley)}
      ${skillButton('bubble-barrier', '泡泡屏障', '2', BATTLE_ART_URLS.skillBubbleBarrier)}
      ${skillButton('extreme-tide', '极潮爆发', '3', BATTLE_ART_URLS.skillExtremeTide)}
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

    <section class="battle-overlay battle-overlay--upgrade living-zone cargo-unloading" data-upgrade-overlay hidden>
      <div class="battle-dialog battle-dialog--upgrade cargo-unloading__manifest">
        <span class="battle-dialog__eyebrow">CARGO UNLOADING / ROGUELITE UPGRADE</span>
        <h2>打开一只潮汐奖励箱</h2>
        <p>三选一立即装车，最高可叠加至 3 级。</p>
        <span class="battle-evolution-ribbon" data-evolution-ribbon hidden>技能进化 · 改变战斗方式</span>
        <div class="battle-upgrade-grid" data-upgrade-options>
          ${Array.from({ length: 3 }, (_, index) => upgradeSlot(index)).join('')}
        </div>
        <div class="battle-upgrade-countdown" data-upgrade-countdown hidden>3 · 2 · 1</div>
        <button type="button" class="battle-button battle-button--ghost" data-battle-action="upgrade-reroll" hidden>看广告刷新三选一</button>
      </div>
    </section>

    <section class="battle-overlay battle-overlay--failure failure-panel repair-bay" data-failure-overlay hidden>
      <div class="battle-dialog repair-bay__sheet">
        <div class="repair-bay__train" aria-hidden="true"><i></i><i></i><i></i></div>
        <span class="battle-dialog__eyebrow">REPAIR BAY / DAMAGE REPORT</span>
        <h2>列车进入维修库</h2>
        <div class="damage-report"><span>损伤报告</span><p data-failure-summary></p></div>
        <div class="battle-dialog__actions repair-actions">
          <button type="button" class="battle-button battle-button--primary" data-battle-action="revive">看广告复活</button>
          <button type="button" class="battle-button battle-button--ghost" data-battle-action="give-up">放弃本局并结算</button>
        </div>
      </div>
    </section>

    <section class="battle-overlay battle-overlay--settlement living-zone" data-settlement-overlay hidden>
      <div class="battle-dialog battle-dialog--settlement">
        <div class="settlement-symbol" aria-hidden="true">潮</div>
        <span class="battle-dialog__eyebrow">RUN SETTLED</span>
        <h2 data-settlement-title></h2>
        <p data-settlement-description></p>
        <div class="arrival-ticket arrival-ticket--first-clear" data-arrival-ticket="first" aria-label="首次通关到站票" hidden><span>ARRIVAL PASS</span><b>FIRST CLEAR</b></div>
        <div class="arrival-ticket arrival-ticket--repeat-clear" data-arrival-ticket="repeat" aria-label="重复通关到站票" hidden><span>ARRIVAL PASS</span><b>REPEAT RUN</b></div>
        <div class="daily-score score-stamp" data-trial-score-stamp data-settlement-daily-score hidden></div>
        <div class="battle-settlement-rewards reward-luggage">
          <span class="currency"><i>齿轮</i><b data-settlement-gears>0</b><small>齿轮</small></span>
          <span class="currency"><i>徽记</i><b data-settlement-route-marks>0</b><small>航线徽记</small></span>
          <span class="currency"><i>星票</i><b data-settlement-star-tickets>0</b><small>星票</small></span>
        </div>
        <div class="battle-settlement-progression">
          <p data-settlement-account hidden></p>
          <p data-settlement-mastery hidden></p>
        </div>
        <div class="battle-settlement-meta">
          <span data-settlement-expedition hidden></span>
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
    if (action === 'speed' && this.model) {
      const available = this.model.speed.available;
      const currentIndex = available.indexOf(this.model.speed.current);
      const nextSpeed = available[(currentIndex + 1) % available.length];
      if (nextSpeed !== undefined) this.callbacks.onBattleSpeed?.(nextSpeed);
      return;
    }
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
    setText(nodes.runLevel, model.runLevelLabel);
    setText(nodes.hpLabel, model.hpLabel);
    setWidth(nodes.hpFill, model.hpPercent);
    setText(nodes.shield, model.shieldLabel);
    setText(nodes.energyLabel, model.energyLabel);
    setWidth(nodes.energyFill, model.energyPercent);
    setText(nodes.combo, model.comboLabel);
    setText(nodes.experienceLabel, model.experienceLabel);
    setWidth(nodes.experienceFill, model.experiencePercent);

    setText(nodes.speedButton, formatBattleSpeed(model.speed.current));
    nodes.speedButton.setAttribute(
      'aria-label',
      `战斗速度 ${formatBattleSpeed(model.speed.current)}${model.speed.nextUnlockLevel === null ? '' : `，下一级解锁 Lv.${model.speed.nextUnlockLevel}`}`,
    );
    const speedEnabled = this.callbacks.onBattleSpeed !== undefined
      && model.speed.available.length > 0;
    nodes.speedButton.disabled = !speedEnabled;
    nodes.speedButton.setAttribute('aria-disabled', String(!speedEnabled));

    for (const skill of model.skills) {
      const button = nodes.skillButtons.get(skill.id);
      if (!button) continue;
      button.dataset.rank = String(skill.rank);
      setText(requireElement(button, '[data-skill-rank]'), `Rank ${skill.rank}`);
      const icon = requireElement<HTMLImageElement>(button, '[data-skill-icon]');
      if (icon.src !== skill.iconUrl) icon.src = skill.iconUrl;
      const glyphs = [...button.querySelectorAll<HTMLImageElement>('[data-skill-variant]')];
      glyphs.forEach((glyph, index) => {
        const variantId = skill.variantIds[index];
        glyph.hidden = !variantId;
        if (!variantId) {
          glyph.removeAttribute('src');
          glyph.removeAttribute('alt');
          return;
        }
        const glyphUrl = BATTLE_VARIANT_GLYPH_URLS[variantId];
        if (glyph.src !== glyphUrl) glyph.src = glyphUrl;
        glyph.alt = variantId;
      });
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
      const variantStatus = skill.variantIds.length > 0
        ? `，变体 ${skill.variantIds.join('、')}`
        : '';
      const status = `${skill.name}，Rank ${skill.rank}${variantStatus}，${skill.cooldownLabel}`;
      setText(requireElement(button, '[data-skill-status]'), status);
      button.setAttribute('aria-label', status);
    }

    nodes.skillRefreshButton.hidden = !model.skillRefreshVisible;
    nodes.skillRefreshButton.disabled =
      model.pendingActions.has('skill-refresh');
    nodes.upgradeOverlay.hidden = !model.upgradeVisible;
    nodes.upgradeOptions.hidden = model.upgradeCountdownVisible;
    nodes.evolutionRibbon.hidden = !model.upgradeCards.some(
      (card) => card.isEvolution,
    ) || model.upgradeCountdownVisible;
    nodes.upgradeCountdown.hidden = !model.upgradeCountdownVisible;
    nodes.upgradeButtons.forEach((button, index) => {
      const card = model.upgradeCards[index];
      button.hidden = !card;
      if (!card) {
        delete button.dataset.upgradeId;
        button.classList.remove('is-evolution');
        return;
      }
      button.dataset.upgradeId = card.id;
      button.disabled = model.pendingActions.has('upgrade-choice');
      button.classList.toggle('is-evolution', card.isEvolution);
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
    const trialSettlement = model.settlement !== null
      && model.settlement.dailyTrialScore !== null;
    const firstClearSettlement = !trialSettlement
      && model.settlement?.firstClear === true;
    const repeatClearSettlement = !trialSettlement
      && model.settlement?.firstClear === false;
    nodes.settlementOverlay.classList.toggle(
      'arrival-platform',
      model.settlement !== null && !trialSettlement,
    );
    nodes.settlementOverlay.classList.toggle(
      'trial-record-board',
      trialSettlement,
    );
    nodes.settlementOverlay.classList.toggle(
      'is-first-clear',
      firstClearSettlement,
    );
    nodes.settlementOverlay.classList.toggle(
      'is-repeat-clear',
      repeatClearSettlement,
    );
    nodes.settlementOverlay.classList.toggle(
      'is-returned',
      model.settlement !== null
        && !trialSettlement
        && model.settlement.firstClear == null,
    );
    nodes.firstClearTicket.hidden = !firstClearSettlement;
    nodes.repeatClearTicket.hidden = !repeatClearSettlement;
    nodes.settlementRewards.hidden = trialSettlement;
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
      const account = model.settlement.accountProgression;
      nodes.settlementAccount.hidden = !account || account.gainedXp <= 0;
      setText(
        nodes.settlementAccount,
        !account || account.gainedXp <= 0
          ? ''
          : `账号 XP +${account.gainedXp}${account.staminaSpendXp > 0 ? `（含开局体力 +${account.staminaSpendXp}）` : ''}· Lv.${account.level} · ${account.xp} XP${account.levelsGained > 0 ? ` · 升级 +${account.levelsGained}` : ''}`,
      );
      const mastery = Object.entries(model.settlement.skillMastery ?? {})
        .filter(([, result]) => result.gainedXp > 0)
        .map(([skillId, result]) => `${skillLabel(skillId)} 熟练度 +${result.gainedXp} · Lv.${result.level}`)
        .join('；');
      nodes.settlementMastery.hidden = mastery.length === 0;
      setText(nodes.settlementMastery, mastery);
      nodes.settlementProgression.hidden =
        nodes.settlementAccount.hidden && nodes.settlementMastery.hidden;
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
          : `本局得分 ${model.settlement.dailyTrialScore}`,
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
  iconUrl: string,
): string {
  return `<button class="battle-skill" type="button" data-battle-skill="${id}" data-rank="1" aria-label="${label}，Rank 1">
    <span class="battle-skill__key">${shortcut}</span>
    <span class="battle-skill__icon"><img data-skill-icon src="${iconUrl}" alt="" /></span>
    <span class="battle-skill__rank" data-skill-rank>Rank 1</span>
    <span class="battle-skill__variants" data-skill-variants aria-hidden="true"><img data-skill-variant hidden /><img data-skill-variant hidden /></span>
    <span class="battle-skill__copy"><b>${label}</b><small data-skill-cooldown>就绪</small></span>
    <span class="sr-only" data-skill-status>${label}，Rank 1</span>
  </button>`;
}

function upgradeSlot(index: number): string {
  return `<button class="battle-upgrade-card reward-crate" type="button" data-upgrade-slot="${index}" hidden>
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
    runLevel: requireElement(host, '[data-hud-run-level]'),
    hpLabel: requireElement(host, '[data-hud-hp-label]'),
    hpFill: requireElement(host, '[data-hud-hp-fill]'),
    shield: requireElement(host, '[data-hud-shield]'),
    energyLabel: requireElement(host, '[data-hud-energy-label]'),
    energyFill: requireElement(host, '[data-hud-energy-fill]'),
    combo: requireElement(host, '[data-hud-combo]'),
    experienceLabel: requireElement(host, '[data-hud-experience-label]'),
    experienceFill: requireElement(host, '[data-hud-experience-fill]'),
    skillButtons,
    speedButton: requireElement(host, '[data-battle-action="speed"]'),
    upgradeOverlay: requireElement(host, '[data-upgrade-overlay]'),
    upgradeOptions: requireElement(host, '[data-upgrade-options]'),
    evolutionRibbon: requireElement(host, '[data-evolution-ribbon]'),
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
    settlementRewards: requireElement(host, '.battle-settlement-rewards'),
    settlementProgression: requireElement(
      host,
      '.battle-settlement-progression',
    ),
    settlementAccount: requireElement(host, '[data-settlement-account]'),
    settlementMastery: requireElement(host, '[data-settlement-mastery]'),
    expedition: requireElement(host, '[data-settlement-expedition]'),
    dailyScore: requireElement(host, '[data-settlement-daily-score]'),
    firstClearTicket: requireElement(host, '[data-arrival-ticket="first"]'),
    repeatClearTicket: requireElement(host, '[data-arrival-ticket="repeat"]'),
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

function skillLabel(skillId: string): string {
  return ({
    'tidal-volley': '潮汐齐射',
    'bubble-barrier': '泡泡屏障',
    'extreme-tide': '极潮爆发',
  } as Readonly<Record<string, string>>)[skillId] ?? skillId;
}

function setWidth(node: HTMLElement, percent: number): void {
  const value = `${Math.min(100, Math.max(0, percent)).toFixed(2)}%`;
  if (node.style.width !== value) node.style.width = value;
}

function formatBattleSpeed(speed: BattleSpeed): string {
  return `${speed}×`;
}
