import { requireElement } from '../app/dom';
import { getBattleUpgradeCopy } from './BattleUpgradeCopy';
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
import type { TidalArchiveDiscoveryPresentation } from '../app/AppTypes';

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
  onSkipTutorial?(): void;
  onBattleSpeed?(speed: BattleSpeed): void;
  onResetAim?(): void;
}

interface TutorialPanelNodes {
  readonly root: HTMLElement;
  readonly progress: HTMLElement;
  readonly title: HTMLElement;
  readonly body: HTMLElement;
}

interface SkillButtonNodes {
  readonly button: HTMLButtonElement;
  readonly rank: HTMLElement;
  readonly icon: HTMLImageElement;
  readonly glyphs: readonly HTMLImageElement[];
  readonly cooldown: HTMLElement;
  readonly charge: HTMLElement;
  readonly status: HTMLElement;
}

interface UpgradeCardNodes {
  readonly button: HTMLButtonElement;
  readonly family: HTMLElement;
  readonly kind: HTMLElement;
  readonly name: HTMLElement;
  readonly level: HTMLElement;
  readonly icon: HTMLImageElement;
  readonly sigil: HTMLElement;
  readonly effect: HTMLElement;
  readonly synergy: HTMLElement;
}

interface BuildTrackNodes {
  readonly root: HTMLElement;
  readonly rank: HTMLElement;
  readonly variants: HTMLElement;
  readonly pips: readonly HTMLElement[];
}

interface BuildOverviewNodes {
  readonly placement: string | undefined;
  readonly summary: HTMLElement;
  readonly tracks: ReadonlyMap<BattleSkillId, BuildTrackNodes>;
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
  readonly skillButtons: ReadonlyMap<BattleSkillId, SkillButtonNodes>;
  readonly speedButton: HTMLButtonElement;
  readonly speedValue: HTMLElement;
  readonly speedUnlock: HTMLElement;
  readonly resetAimButton: HTMLButtonElement;
  readonly tutorialPanels: readonly TutorialPanelNodes[];
  readonly archiveDiscovery: HTMLElement;
  readonly archiveDiscoveryArt: HTMLImageElement;
  readonly archiveDiscoveryType: HTMLElement;
  readonly archiveDiscoveryName: HTMLElement;
  readonly upgradeOverlay: HTMLElement;
  readonly upgradeDialog: HTMLElement;
  readonly upgradeOptions: HTMLElement;
  readonly evolutionRibbon: HTMLElement;
  readonly evolutionCrest: HTMLElement;
  readonly upgradeCards: readonly UpgradeCardNodes[];
  readonly upgradeCountdown: HTMLElement;
  readonly buildOverviews: readonly BuildOverviewNodes[];
  readonly acquiredBuild: HTMLElement;
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
  readonly settlementArchive: HTMLElement;
  readonly voyageLog: HTMLDetailsElement;
  readonly voyageSummary: HTMLElement;
  readonly voyageTime: HTMLElement;
  readonly voyageWave: HTMLElement;
  readonly voyageHp: HTMLElement;
  readonly voyageInventory: HTMLElement;
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
      <button class="battle-hud__speed" type="button" data-battle-action="speed" aria-label="战斗速度 1×"><span data-speed-value>1×</span><small data-speed-unlock hidden></small></button>
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

    <aside class="battle-archive-discovery" data-archive-discovery aria-live="polite" aria-atomic="true" hidden>
      <img data-archive-discovery-art alt="" />
      <span>NEW ARCHIVE ENTRY</span>
      <small data-archive-discovery-type></small>
      <b data-archive-discovery-name></b>
    </aside>

    ${tutorialTicket('battle')}

    <div class="battle-hud__skills" aria-label="主动技能">
      ${skillButton('tidal-volley', '潮汐齐射', '1', BATTLE_ART_URLS.skillTidalVolley)}
      ${skillButton('bubble-barrier', '泡泡屏障', '2', BATTLE_ART_URLS.skillBubbleBarrier)}
      ${skillButton('extreme-tide', '极潮爆发', '3', BATTLE_ART_URLS.skillExtremeTide)}
      <button class="battle-hud__auto-aim" type="button" data-battle-action="reset-aim" aria-label="恢复自动瞄准" aria-keyshortcuts="R" title="恢复自动瞄准（R）" hidden>恢复<br />自动</button>
      <button class="battle-hud__refresh" type="button" data-battle-action="skill-refresh" aria-label="观看激励广告，重整技能冷却" hidden>补给短片 · 重整技能</button>
    </div>

    <section class="battle-overlay battle-overlay--pause" data-pause-overlay hidden>
      <div class="battle-dialog battle-dialog--compact">
        <span class="battle-dialog__eyebrow">PAUSED</span>
        <h2>列车暂时减速</h2>
        <p>战斗时钟和怪潮已经暂停。</p>
        ${buildOverview('pause')}
        <p class="battle-build-inventory" data-acquired-build></p>
        <button type="button" class="battle-button battle-button--primary" data-battle-action="resume">继续战斗</button>
      </div>
    </section>

    <section class="battle-overlay battle-overlay--upgrade living-zone cargo-unloading" data-upgrade-overlay hidden>
      <div class="battle-dialog battle-dialog--upgrade cargo-unloading__manifest">
        <span class="battle-dialog__eyebrow">潮汐货运 · 本局强化</span>
        <h2>这一程，往哪边变强？</h2>
        <p>三选一 · 选后继续航行</p>
        ${buildOverview('upgrade')}
        ${tutorialTicket('upgrade')}
        <span class="battle-evolution-ribbon" data-evolution-ribbon hidden>技能进化 · 改变战斗方式</span>
        <div class="evolution-crest" data-evolution-crest hidden aria-hidden="true"><i></i><i></i><i></i><b>EVOLVE</b></div>
        <div class="battle-upgrade-grid" data-upgrade-options>
          ${Array.from({ length: 3 }, (_, index) => upgradeSlot(index)).join('')}
        </div>
        <div class="battle-upgrade-countdown" data-upgrade-countdown hidden>3 · 2 · 1</div>
        <button type="button" class="battle-button battle-button--ghost" data-battle-action="upgrade-reroll" aria-label="观看激励广告，重开本次升级货箱" hidden>补给短片 · 重开货箱</button>
      </div>
    </section>

    <section class="battle-overlay battle-overlay--failure failure-panel repair-bay" data-failure-overlay hidden>
      <div class="battle-dialog repair-bay__sheet">
        <div class="repair-bay__train" aria-hidden="true"><i></i><i></i><i></i></div>
        <span class="battle-dialog__eyebrow">REPAIR BAY / DAMAGE REPORT</span>
        <h2>列车进入维修库</h2>
        <div class="damage-report"><span>损伤报告</span><p data-failure-summary></p></div>
        <div class="battle-dialog__actions repair-actions">
          <button type="button" class="battle-button battle-button--primary" data-battle-action="revive" aria-label="观看激励广告，紧急修复并复活列车">救援短片 · 紧急修复</button>
          <button type="button" class="battle-button battle-button--ghost" data-battle-action="give-up">放弃本局并结算</button>
        </div>
      </div>
    </section>

    <section class="battle-overlay battle-overlay--settlement living-zone" data-settlement-overlay hidden>
      <div class="battle-dialog battle-dialog--settlement">
        <div class="settlement-welcome" aria-hidden="true">
          <div class="settlement-symbol">潮</div>
          <div class="settlement-porter" data-settlement-porter>
            <span class="settlement-porter__message settlement-porter__message--victory">货箱点清啦！</span>
            <span class="settlement-porter__message settlement-porter__message--trial">成绩盖章啦！</span>
            <span class="settlement-porter__message settlement-porter__message--returned">先回站维修吧！</span>
            <img src="${BATTLE_ART_URLS.otter}" alt="" />
          </div>
        </div>
        <span class="battle-dialog__eyebrow">RUN SETTLED</span>
        <h2 data-settlement-title></h2>
        <p data-settlement-description></p>
        <div class="arrival-ticket arrival-ticket--first-clear" data-arrival-ticket="first" aria-label="首次通关到站票" hidden><span>ARRIVAL PASS</span><b>FIRST CLEAR</b></div>
        <div class="arrival-ticket arrival-ticket--repeat-clear" data-arrival-ticket="repeat" aria-label="重复通关到站票" hidden><span>ARRIVAL PASS</span><b>REPEAT RUN</b></div>
        <div class="daily-score score-stamp" data-trial-score-stamp data-settlement-daily-score hidden></div>
        <div class="battle-settlement-rewards reward-luggage">
          <span class="currency"><i aria-hidden="true">齿</i><b data-settlement-gears>0</b><small>齿轮</small></span>
          <span class="currency"><i aria-hidden="true">徽</i><b data-settlement-route-marks>0</b><small>航线徽记</small></span>
          <span class="currency"><i aria-hidden="true">星</i><b data-settlement-star-tickets>0</b><small>星票</small></span>
        </div>
        <div class="battle-settlement-progression">
          <p data-settlement-account hidden></p>
          <p data-settlement-mastery hidden></p>
        </div>
        <details class="battle-voyage-log" data-voyage-log hidden>
          <summary><b>航行日志</b><span data-voyage-summary></span></summary>
          <div class="battle-voyage-log__page">
            <dl class="battle-voyage-log__stats">
              <div><dt>航行用时</dt><dd data-voyage-time></dd></div>
              <div><dt>抵达波次</dt><dd data-voyage-wave></dd></div>
              <div><dt>剩余耐久</dt><dd data-voyage-hp></dd></div>
            </dl>
            ${buildOverview('settlement')}
            <p class="battle-build-inventory" data-voyage-inventory></p>
          </div>
        </details>
        <section class="settlement-archive-luggage" data-settlement-archive hidden></section>
        <div class="battle-settlement-meta">
          <span data-settlement-expedition hidden></span>
        </div>
        <div class="battle-dialog__actions">
          <button type="button" class="battle-button battle-button--accent" data-battle-action="double-settlement" aria-label="观看激励广告，领取本次重复通关双倍奖励" hidden>补给短片 · 双倍托运</button>
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
  private lastSettlementArchiveDiscoveries:
    | readonly TidalArchiveDiscoveryPresentation[]
    | null = null;
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
    if (action === 'skip-tutorial') {
      this.callbacks.onSkipTutorial?.();
      return;
    }
    if (action === 'speed' && this.model) {
      const available = this.model.speed.available;
      const currentIndex = available.indexOf(this.model.speed.current);
      const nextSpeed = available[(currentIndex + 1) % available.length];
      if (nextSpeed !== undefined) this.callbacks.onBattleSpeed?.(nextSpeed);
      return;
    }
    if (action === 'pause') this.callbacks.onPause();
    if (action === 'reset-aim' && !button.hidden) this.callbacks.onResetAim?.();
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
      const button = skillId && this.nodes?.skillButtons.get(skillId)?.button;
      if (skillId && button && !button.disabled) {
        event.preventDefault();
        this.callbacks.onSkill(skillId);
      }
      return;
    }
    if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const button = this.nodes?.resetAimButton;
      if (button && !button.hidden) {
        event.preventDefault();
        this.callbacks.onResetAim?.();
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
    nodes.resetAimButton.toggleAttribute('hidden', !model.resetAimVisible || !this.callbacks.onResetAim);

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

    const archiveDiscovery = model.archiveDiscovery;
    nodes.archiveDiscovery.toggleAttribute('hidden', archiveDiscovery === null);
    if (archiveDiscovery) {
      setAttribute(nodes.archiveDiscovery, 'data-archive-discovery-kind', archiveDiscovery.entryType);
      setAttribute(nodes.archiveDiscovery, 'data-archive-discovery-key', archiveDiscovery.key);
      setAttribute(nodes.archiveDiscoveryArt, 'src', archiveDiscovery.artUrl);
      setText(
        nodes.archiveDiscoveryType,
        archiveDiscovery.entryType === 'enemy'
          ? '首次目击已装订'
          : '新进化标本已归档',
      );
      setText(nodes.archiveDiscoveryName, archiveDiscovery.name);
    } else {
      setAttribute(nodes.archiveDiscovery, 'data-archive-discovery-kind', null);
      setAttribute(nodes.archiveDiscovery, 'data-archive-discovery-key', null);
    }

    for (const panel of nodes.tutorialPanels) {
      const prompt = model.firstRunTutorialPrompt;
      const visible = prompt !== null
        && prompt.placement === panel.root.dataset.battleTutorial;
      panel.root.toggleAttribute('hidden', !visible);
      if (!visible || !prompt) {
        setAttribute(panel.root, 'data-step', null);
        continue;
      }
      setAttribute(panel.root, 'data-step', prompt.stepId);
      setText(
        panel.progress,
        `首次值班 ${prompt.stepNumber} / ${prompt.totalSteps}`,
      );
      setText(panel.title, prompt.title);
      setText(panel.body, prompt.body);
    }

    const speedLabel = formatBattleSpeed(model.speed.current);
    const unlockLevel = model.speed.nextUnlockLevel;
    const showUnlock = model.speed.available.length <= 1 && unlockLevel !== null;
    setText(nodes.speedValue, speedLabel);
    setText(nodes.speedUnlock, showUnlock ? `Lv.${unlockLevel}` : '');
    nodes.speedUnlock.toggleAttribute('hidden', !showUnlock);
    setAttribute(
      nodes.speedButton,
      'aria-label',
      `战斗速度 ${speedLabel}${unlockLevel === null ? '' : `，账号 Lv.${unlockLevel} 解锁下一档倍速`}`,
    );
    const speedEnabled = this.callbacks.onBattleSpeed !== undefined
      && model.speed.available.length > 1;
    nodes.speedButton.toggleAttribute('disabled', !speedEnabled);
    setAttribute(nodes.speedButton, 'aria-disabled', String(!speedEnabled));

    for (const skill of model.skills) {
      const control = nodes.skillButtons.get(skill.id);
      if (!control) continue;
      const { button } = control;
      setAttribute(button, 'data-rank', String(skill.rank));
      setStyle(button, '--cooldown', `${100 - skill.rechargePercent}%`);
      setText(control.rank, `潮阶 ${skill.rank}`);
      setAttribute(control.icon, 'src', skill.iconUrl);
      control.glyphs.forEach((glyph, index) => {
        const variantId = skill.variantIds[index];
        glyph.toggleAttribute('hidden', !variantId);
        setAttribute(glyph, 'data-skill-variant-id', variantId ?? null);
        setAttribute(glyph, 'src', variantId ? BATTLE_VARIANT_GLYPH_URLS[variantId] : null);
        setAttribute(glyph, 'alt', variantId ? getBattleUpgradeCopy(variantId).name : null);
      });
      setText(
        control.cooldown,
        skill.ready ? '点击释放' : skill.energyRequired ? '命中蓄能' : '冷却回复',
      );
      setText(control.charge, skill.cooldownLabel);
      button.classList.toggle('is-ready', skill.ready);
      button.classList.toggle('is-charging', !skill.ready);
      button.toggleAttribute(
        'disabled',
        model.status !== 'running'
        || !skill.ready
        || model.pendingActions.has(`skill:${skill.id}`),
      );
      const variantStatus = skill.variantIds.length > 0
        ? `，进化 ${skill.variantIds.map((id) => getBattleUpgradeCopy(id).name).join('、')}`
        : '';
      const status = `${skill.name}，潮阶 ${skill.rank}${variantStatus}，${skill.cooldownLabel}`;
      setText(control.status, status);
      setAttribute(button, 'aria-label', status);
    }

    nodes.skillRefreshButton.toggleAttribute('hidden', !model.skillRefreshVisible);
    nodes.skillRefreshButton.toggleAttribute('disabled', model.pendingActions.has('skill-refresh'));
    nodes.upgradeOverlay.toggleAttribute('hidden', !model.upgradeVisible);
    nodes.upgradeOptions.toggleAttribute('hidden', model.upgradeCountdownVisible);
    const hasEvolution = model.upgradeCards.some((card) => card.isEvolution);
    const evolutionVisible = model.upgradeVisible && !model.upgradeCountdownVisible && hasEvolution;
    nodes.upgradeDialog.classList.toggle(
      'battle-dialog--evolution',
      evolutionVisible,
    );
    nodes.evolutionCrest.toggleAttribute('hidden', !evolutionVisible);
    nodes.evolutionRibbon.toggleAttribute('hidden', !hasEvolution || model.upgradeCountdownVisible);
    nodes.upgradeCountdown.toggleAttribute('hidden', !model.upgradeCountdownVisible);
    for (const overview of nodes.buildOverviews) {
      if (overview.placement === 'pause' && !model.pauseOverlayVisible) continue;
      if (overview.placement === 'upgrade' && !model.upgradeVisible) continue;
      if (overview.placement === 'settlement' && !model.voyageReport) continue;
      setText(overview.summary, `${model.runLevelLabel} · ${model.buildSummary}`);
      for (const skill of model.skills) {
        const track = overview.tracks.get(skill.id);
        if (!track) continue;
        setText(track.rank, `潮阶 ${skill.rank}`);
        const variants = skill.variantIds.map((id) => getBattleUpgradeCopy(id).name);
        setText(track.variants, variants.length ? variants.join(' / ') : '尚未进化');
        setAttribute(track.root, 'aria-label', `${skill.name}，潮阶 ${skill.rank}，${variants.length ? variants.join('、') : '尚未进化'}`);
        track.pips.forEach((pip, index) => {
          pip.classList.toggle('is-filled', index < skill.rank);
        });
      }
    }
    if (model.pauseOverlayVisible) {
      setText(nodes.acquiredBuild, model.acquiredUpgrades.length
        ? model.acquiredUpgrades.join(' / ') : '还没装上强化，下一次升级就能选择。');
    }
    nodes.upgradeCards.forEach((control, index) => {
      const { button } = control;
      const card = model.upgradeCards[index];
      button.toggleAttribute('hidden', !card);
      if (!card) {
        setAttribute(button, 'data-upgrade-id', null);
        setAttribute(button, 'data-upgrade-kind', null);
        setAttribute(button, 'data-upgrade-skill', null);
        button.classList.toggle('is-evolution', false);
        return;
      }
      setAttribute(button, 'data-upgrade-id', card.id);
      setAttribute(button, 'data-upgrade-kind', card.kind);
      setAttribute(button, 'data-build-family', card.family);
      button.classList.toggle('has-build-connection', card.connection !== null);
      setText(control.family, `${card.familyLabel}${card.connection ? ' · 连携' : ''}`);
      setAttribute(button, 'data-upgrade-skill', card.skillId);
      button.toggleAttribute('disabled', model.pendingActions.has('upgrade-choice'));
      button.classList.toggle('is-evolution', card.isEvolution);
      setText(control.kind, card.kindLabel);
      setText(control.name, card.name);
      setText(control.level, card.levelLabel);
      control.icon.toggleAttribute('hidden', card.iconUrl === null);
      control.sigil.toggleAttribute('hidden', card.iconUrl !== null);
      setAttribute(control.icon, 'src', card.iconUrl);
      setText(control.sigil, card.sigil);
      setText(control.effect, card.effect);
      setText(control.synergy, card.connection ?? card.synergy);
    });
    nodes.rerollButton.toggleAttribute('hidden', !model.upgradeRerollVisible);
    nodes.rerollButton.toggleAttribute('disabled', model.pendingActions.has('upgrade-reroll'));

    nodes.interactionCard.toggleAttribute('hidden', model.interaction === null);
    if (model.interaction) {
      setAttribute(nodes.interactionCard, 'data-interaction-id', model.interaction.actionId);
      setAttribute(nodes.interactionCard, 'data-interaction-attempt', String(model.interaction.attempt));
      nodes.interactionCard.toggleAttribute('disabled', model.pendingActions.has('interaction'));
      setText(nodes.interactionTitle, model.interaction.label);
      setText(
        nodes.interactionMeta,
        `本局 ${model.interaction.attempt}/${model.interaction.maxClaims} · +${model.interaction.amount} ${model.interaction.currencyLabel}`,
      );
    } else {
      setAttribute(nodes.interactionCard, 'data-interaction-id', null);
      setAttribute(nodes.interactionCard, 'data-interaction-attempt', null);
    }
    setText(nodes.interactionNotice, model.interactionNotice);

    nodes.pauseOverlay.toggleAttribute('hidden', !model.pauseOverlayVisible);
    nodes.failureOverlay.toggleAttribute('hidden', !model.failureVisible);
    setText(nodes.failureSummary, model.failureSummary);
    nodes.reviveButton.toggleAttribute('hidden', !model.reviveAvailable);
    nodes.reviveButton.toggleAttribute('disabled', model.pendingActions.has('revive'));

    nodes.settlementOverlay.toggleAttribute('hidden', !model.settlementVisible);
    nodes.voyageLog.toggleAttribute('hidden', model.voyageReport === null);
    if (model.voyageReport) {
      setText(nodes.voyageSummary, `${model.runLevelLabel} · 击破 ${model.voyageReport.kills}`);
      setText(nodes.voyageTime, model.timerLabel);
      setText(nodes.voyageWave, String(model.voyageReport.wave));
      setText(nodes.voyageHp, model.hpLabel);
      setText(nodes.voyageInventory, model.acquiredUpgrades.length
        ? model.acquiredUpgrades.join(' / ') : '本局未装配强化。');
    } else if (nodes.voyageLog.open) {
      nodes.voyageLog.open = false;
    }
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
    nodes.firstClearTicket.toggleAttribute('hidden', !firstClearSettlement);
    nodes.repeatClearTicket.toggleAttribute('hidden', !repeatClearSettlement);
    nodes.settlementRewards.toggleAttribute('hidden', trialSettlement);
    const settlementArchiveDiscoveries =
      model.settlement?.archiveDiscoveries ?? null;
    if (
      settlementArchiveDiscoveries
      !== this.lastSettlementArchiveDiscoveries
    ) {
      const hadDiscoveries =
        (this.lastSettlementArchiveDiscoveries?.length ?? 0) > 0;
      const hasDiscoveries =
        (settlementArchiveDiscoveries?.length ?? 0) > 0;
      if (hadDiscoveries || hasDiscoveries) {
        renderSettlementArchiveDiscoveries(
          nodes.settlementArchive,
          settlementArchiveDiscoveries ?? [],
        );
      }
      this.lastSettlementArchiveDiscoveries = settlementArchiveDiscoveries;
    }
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
      nodes.settlementAccount.toggleAttribute('hidden', !account || account.gainedXp <= 0);
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
      nodes.settlementMastery.toggleAttribute('hidden', mastery.length === 0);
      setText(nodes.settlementMastery, mastery);
      nodes.settlementProgression.toggleAttribute(
        'hidden',
        nodes.settlementAccount.hidden && nodes.settlementMastery.hidden,
      );
      nodes.expedition.toggleAttribute('hidden', model.settlement.expeditionPoints <= 0);
      setText(
        nodes.expedition,
        `军团远征贡献 +${model.settlement.expeditionPoints}`,
      );
      nodes.dailyScore.toggleAttribute('hidden', model.settlement.dailyTrialScore === null);
      setText(
        nodes.dailyScore,
        model.settlement.dailyTrialScore === null
          ? ''
          : `本局得分 ${model.settlement.dailyTrialScore}`,
      );
    }
    nodes.doubleButton.toggleAttribute('hidden', !model.doubleSettlementVisible);
    nodes.doubleButton.toggleAttribute('disabled', model.pendingActions.has('double-settlement'));
    nodes.returnButton.toggleAttribute('disabled', this.exitRequested);
  }

  public dispose(): void {
    if (!this.host) return;
    this.host.removeEventListener('click', this.onClick);
    this.keyboardTarget?.removeEventListener('keydown', this.onKeyDown);
    this.host.innerHTML = '';
    this.host = null;
    this.nodes = null;
    this.model = null;
    this.lastSettlementArchiveDiscoveries = null;
  }
}

function skillButton(
  id: BattleSkillId,
  label: string,
  shortcut: string,
  iconUrl: string,
): string {
  return `<button class="battle-skill" type="button" data-battle-skill="${id}" data-rank="1" aria-label="${label}，潮阶 1">
    <span class="battle-skill__key">${shortcut}</span>
    <span class="battle-skill__icon"><img data-skill-icon src="${iconUrl}" alt="" /></span>
    <span class="battle-skill__charge" data-skill-charge aria-hidden="true">就绪</span>
    <span class="battle-skill__rank" data-skill-rank>潮阶 1</span>
    <span class="battle-skill__variants" data-skill-variants aria-hidden="true"><img data-skill-variant hidden /><img data-skill-variant hidden /></span>
    <span class="battle-skill__copy"><b>${label}</b><small data-skill-cooldown>就绪</small></span>
    <span class="sr-only" data-skill-status>${label}，潮阶 1</span>
  </button>`;
}

function tutorialTicket(placement: 'battle' | 'upgrade'): string {
  return `<aside class="battle-tutorial-ticket battle-tutorial-ticket--${placement}" data-battle-tutorial="${placement}" aria-live="polite" hidden>
    <span data-tutorial-progress></span>
    <strong data-tutorial-title></strong>
    <p data-tutorial-body></p>
    <button type="button" data-battle-action="skip-tutorial" aria-label="跳过首次战斗引导">跳过引导</button>
  </aside>`;
}

function upgradeSlot(index: number): string {
  return `<button class="battle-upgrade-card reward-crate" type="button" data-upgrade-slot="${index}" style="--reward-index:${index}" hidden>
    <span class="battle-upgrade-card__mark" aria-hidden="true"><img data-upgrade-icon alt="" hidden /><i data-upgrade-sigil></i></span>
    <span class="battle-upgrade-card__kind" data-upgrade-kind></span>
    <span data-upgrade-level></span>
    <b data-upgrade-name></b>
    <p data-upgrade-effect></p>
    <small data-upgrade-synergy></small>
    <span class="upgrade-family-seal" data-upgrade-family></span>
  </button>`;
}

function buildOverview(placement: 'pause' | 'upgrade' | 'settlement'): string {
  const skills = [
    ['tidal-volley', '齐射', BATTLE_ART_URLS.skillTidalVolley],
    ['bubble-barrier', '屏障', BATTLE_ART_URLS.skillBubbleBarrier],
    ['extreme-tide', '极潮', BATTLE_ART_URLS.skillExtremeTide],
  ] as const;
  return `<aside class="battle-build" data-build-overview="${placement}" aria-label="本局构筑">
    <div class="battle-build__heading"><b>本局配装</b><span data-build-summary></span></div>
    <div class="battle-build__tracks">${skills.map(([id, name, icon]) => `<div class="battle-build__track" data-build-skill="${id}">
      <img src="${icon}" alt="" /><span>${name}<b data-build-rank>潮阶 1</b></span>
      <div class="battle-build__pips" aria-hidden="true">${Array.from({length: 5}, () => '<i data-build-pip></i>').join('')}</div>
      <small data-build-variants>尚未进化</small>
    </div>`).join('')}</div>
  </aside>`;
}

function collectNodes(host: HTMLElement): HudNodes {
  const skillButtons = new Map<BattleSkillId, SkillButtonNodes>();
  for (const button of host.querySelectorAll<HTMLButtonElement>(
    '[data-battle-skill]',
  )) {
    const id = button.dataset.battleSkill as BattleSkillId;
    skillButtons.set(id, {
      button,
      rank: requireElement(button, '[data-skill-rank]'),
      icon: requireElement<HTMLImageElement>(button, '[data-skill-icon]'),
      glyphs: [...button.querySelectorAll<HTMLImageElement>('[data-skill-variant]')],
      cooldown: requireElement(button, '[data-skill-cooldown]'),
      charge: requireElement(button, '[data-skill-charge]'),
      status: requireElement(button, '[data-skill-status]'),
    });
  }
  const tutorialPanels = [
    ...host.querySelectorAll<HTMLElement>('[data-battle-tutorial]'),
  ].map((root): TutorialPanelNodes => ({
    root,
    progress: requireElement(root, '[data-tutorial-progress]'),
    title: requireElement(root, '[data-tutorial-title]'),
    body: requireElement(root, '[data-tutorial-body]'),
  }));
  const upgradeCards = [...host.querySelectorAll<HTMLButtonElement>('[data-upgrade-slot]')]
    .map((button): UpgradeCardNodes => ({
      button,
      family: requireElement(button, '[data-upgrade-family]'),
      kind: requireElement(button, '[data-upgrade-kind]'),
      name: requireElement(button, '[data-upgrade-name]'),
      level: requireElement(button, '[data-upgrade-level]'),
      icon: requireElement<HTMLImageElement>(button, '[data-upgrade-icon]'),
      sigil: requireElement(button, '[data-upgrade-sigil]'),
      effect: requireElement(button, '[data-upgrade-effect]'),
      synergy: requireElement(button, '[data-upgrade-synergy]'),
    }));
  const buildOverviews = [...host.querySelectorAll<HTMLElement>('[data-build-overview]')]
    .map((root): BuildOverviewNodes => {
      const tracks = new Map<BattleSkillId, BuildTrackNodes>();
      for (const id of SKILL_IDS) {
        const track = requireElement<HTMLElement>(root, `[data-build-skill="${id}"]`);
        tracks.set(id, {
          root: track,
          rank: requireElement(track, '[data-build-rank]'),
          variants: requireElement(track, '[data-build-variants]'),
          pips: [...track.querySelectorAll<HTMLElement>('[data-build-pip]')],
        });
      }
      return {
        placement: root.dataset.buildOverview,
        summary: requireElement(root, '[data-build-summary]'),
        tracks,
      };
    });
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
    speedValue: requireElement(host, '[data-speed-value]'),
    speedUnlock: requireElement(host, '[data-speed-unlock]'),
    tutorialPanels,
    archiveDiscovery: requireElement(host, '[data-archive-discovery]'),
    archiveDiscoveryArt: requireElement<HTMLImageElement>(
      host,
      '[data-archive-discovery-art]',
    ),
    archiveDiscoveryType: requireElement(
      host,
      '[data-archive-discovery-type]',
    ),
    archiveDiscoveryName: requireElement(
      host,
      '[data-archive-discovery-name]',
    ),
    upgradeOverlay: requireElement(host, '[data-upgrade-overlay]'),
    upgradeDialog: requireElement(host, '.battle-dialog--upgrade'),
    upgradeOptions: requireElement(host, '[data-upgrade-options]'),
    evolutionRibbon: requireElement(host, '[data-evolution-ribbon]'),
    evolutionCrest: requireElement(host, '[data-evolution-crest]'),
    upgradeCards,
    upgradeCountdown: requireElement(host, '[data-upgrade-countdown]'),
    buildOverviews,
    acquiredBuild: requireElement(host, '[data-acquired-build]'),
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
    resetAimButton: requireElement(host, '[data-battle-action="reset-aim"]'),
    voyageLog: requireElement(host, '[data-voyage-log]'),
    voyageSummary: requireElement(host, '[data-voyage-summary]'),
    voyageTime: requireElement(host, '[data-voyage-time]'),
    voyageWave: requireElement(host, '[data-voyage-wave]'),
    voyageHp: requireElement(host, '[data-voyage-hp]'),
    voyageInventory: requireElement(host, '[data-voyage-inventory]'),
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
    settlementArchive: requireElement(host, '[data-settlement-archive]'),
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

function renderSettlementArchiveDiscoveries(
  root: HTMLElement,
  discoveries: readonly TidalArchiveDiscoveryPresentation[],
): void {
  root.replaceChildren();
  root.hidden = discoveries.length === 0;
  if (discoveries.length === 0) return;

  const document = root.ownerDocument;
  const heading = document.createElement('h3');
  heading.textContent = '本局新档案';
  root.append(heading);

  for (const discovery of discoveries) {
    const entry = document.createElement('article');
    entry.dataset.settlementArchiveEntry = discovery.key;

    const image = document.createElement('img');
    image.src = discovery.artUrl;
    image.alt = discovery.name;

    const type = document.createElement('small');
    type.textContent = discovery.entryType === 'enemy'
      ? '潮兽目击'
      : '技能进化';

    const name = document.createElement('b');
    name.textContent = discovery.name;
    entry.append(image, type, name);
    root.append(entry);
  }
}

function setText(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function setAttribute(node: Element, name: string, value: string | null): void {
  // Compare the raw attribute: img.src resolves a relative Vite URL to an
  // absolute one, which would otherwise look different on every render.
  if (node.getAttribute(name) === value) return;
  if (value === null) node.removeAttribute(name);
  else node.setAttribute(name, value);
}

function setStyle(node: HTMLElement, name: string, value: string): void {
  if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
}

function skillLabel(skillId: string): string {
  return ({
    'tidal-volley': '潮汐齐射',
    'bubble-barrier': '泡泡屏障',
    'extreme-tide': '极潮爆发',
  } as Readonly<Record<string, string>>)[skillId] ?? skillId;
}

function setWidth(node: HTMLElement, percent: number): void {
  // CSSOM strips redundant trailing zeros (e.g. "72.00%" becomes "72%").
  const value = `${Number(Math.min(100, Math.max(0, percent)).toFixed(2))}%`;
  setStyle(node, 'width', value);
}

function formatBattleSpeed(speed: BattleSpeed): string {
  return `${speed}×`;
}
