import type {
  GameSettings,
  QualityPreference,
} from '../app/SettingsRepository';

export interface SettingsPanelModel {
  readonly settings: GameSettings;
  readonly audioAvailable: boolean;
  readonly effectiveReducedMotion: boolean;
}

function toggleRow(input: {
  readonly setting: 'musicEnabled' | 'sfxEnabled' | 'reducedMotion';
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
}): string {
  return `<label class="settings-row settings-row--toggle">
    <span><b>${input.label}</b><small>${input.description}</small></span>
    <input type="checkbox" data-setting="${input.setting}"
      ${input.checked ? 'checked' : ''}
      ${input.disabled ? 'disabled' : ''} />
    <i aria-hidden="true"></i>
  </label>`;
}

function qualityOption(
  value: QualityPreference,
  label: string,
  selected: QualityPreference,
): string {
  return `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`;
}

export function renderSettingsPanel(model: SettingsPanelModel): string {
  const audioNotice = model.audioAvailable
    ? '声音会在第一次点击“出发”后解锁；音乐与音效互不影响。'
    : '当前浏览器未提供 Web Audio，所有玩法仍可完整使用。';
  const motionNotice = model.effectiveReducedMotion
    ? '当前已使用减弱动态模式。系统偏好也可能强制启用。'
    : '保留角色浮动、镜头冲击与粒子动画。';
  return `<div class="settings-panel" data-settings-panel>
    <button class="settings-panel__backdrop" type="button"
      data-settings-backdrop data-action="close-settings"
      aria-label="关闭设置"></button>
    <aside class="settings-sheet" role="dialog" aria-modal="true"
      aria-labelledby="settings-title">
      <header class="settings-sheet__header">
        <div><small>GAME SETTINGS</small><h2 id="settings-title">游戏设置</h2></div>
        <button type="button" class="settings-sheet__close"
          data-action="close-settings" aria-label="关闭设置">×</button>
      </header>
      <section class="settings-section">
        <h3>声音</h3>
        ${toggleRow({
          setting: 'musicEnabled',
          label: '音乐',
          description: '车站、战斗和 Boss 程序化配乐',
          checked: model.settings.musicEnabled,
          disabled: !model.audioAvailable,
        })}
        ${toggleRow({
          setting: 'sfxEnabled',
          label: '音效',
          description: '炮击、技能、击败、掉落和界面反馈',
          checked: model.settings.sfxEnabled,
          disabled: !model.audioAvailable,
        })}
        <p class="settings-note">${audioNotice}</p>
      </section>
      <section class="settings-section">
        <h3>显示</h3>
        ${toggleRow({
          setting: 'reducedMotion',
          label: '减少动态效果',
          description: '降低镜头震动、漂浮和密集粒子',
          checked: model.settings.reducedMotion,
        })}
        <p class="settings-note">${motionNotice}</p>
        <label class="settings-row settings-row--select">
          <span><b>画质</b><small>自动模式会根据设备和帧率调整</small></span>
          <select data-setting="qualityPreference">
            ${qualityOption('auto', '自动', model.settings.qualityPreference)}
            ${qualityOption('high', '高', model.settings.qualityPreference)}
            ${qualityOption('medium', '中', model.settings.qualityPreference)}
            ${qualityOption('low', '低', model.settings.qualityPreference)}
          </select>
        </label>
      </section>
      <footer class="settings-sheet__footer">
        设置会立即生效并保存在当前设备。
      </footer>
    </aside>
  </div>`;
}
