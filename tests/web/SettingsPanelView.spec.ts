// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { defaultGameSettings } from '../../web/app/SettingsRepository';
import { renderSettingsPanel, updateSettingsPanel } from '../../web/views/SettingsPanelView';

describe('SettingsPanelView', () => {
  it('renders independent audio, motion and quality controls', () => {
    const html = renderSettingsPanel({
      settings: {
        ...defaultGameSettings(),
        musicEnabled: false,
        reducedMotion: true,
        qualityPreference: 'medium',
      },
      audioAvailable: false,
      effectiveReducedMotion: true,
    });

    expect(html).toContain('data-setting="musicEnabled"');
    expect(html).toContain('data-setting="sfxEnabled"');
    expect(html).toContain('data-setting="reducedMotion"');
    expect(html).toContain('data-setting="qualityPreference"');
    expect(html).not.toContain('data-setting="preferredBattleSpeed"');
    expect(html).toContain('战斗速度由战斗内控制按钮管理');
    expect(html).toContain('<option value="auto"');
    expect(html).toContain('<option value="high"');
    expect(html).toContain('<option value="medium" selected');
    expect(html).toContain('<option value="low"');
    expect(html).toContain('当前浏览器未提供 Web Audio');
    expect(html).toContain('data-action="close-settings"');
    expect(html).toContain('<dialog id="game-settings-dialog"');
    expect(html).toContain('aria-label="关闭设置" autofocus');
    expect(html).not.toContain('data-settings-backdrop');
    expect(html).toContain('settings-sheet conductor-cabinet');
    expect(html).toContain('cabinet-gauge');
    expect(html).toContain('cabinet-switch');
    expect(html).toContain('sealed-maintenance-note');
  });

  it('updates controls and status copy without rebuilding the focused form', () => {
    const fixture = document.createElement('div');
    const settings = defaultGameSettings();
    fixture.innerHTML = renderSettingsPanel({ settings, audioAvailable: true, effectiveReducedMotion: false });
    document.body.append(fixture);
    try {
      const dialog = fixture.querySelector('dialog')!;
      dialog.open = true;
      const sheet = dialog.querySelector<HTMLElement>('.settings-sheet')!;
      const quality = dialog.querySelector<HTMLSelectElement>('[data-setting="qualityPreference"]')!;
      quality.focus();
      sheet.scrollTop = 48;
      updateSettingsPanel(dialog, {
        settings: { ...settings, qualityPreference: 'low', reducedMotion: true },
        audioAvailable: false,
        effectiveReducedMotion: true,
      });
      expect(dialog.querySelector('[data-setting="qualityPreference"]')).toBe(quality);
      expect(document.activeElement).toBe(quality);
      expect(quality.value).toBe('low');
      expect(sheet.scrollTop).toBe(48);
      expect(dialog.querySelector<HTMLInputElement>('[data-setting="musicEnabled"]')?.disabled).toBe(true);
      expect(dialog.querySelector<HTMLInputElement>('[data-setting="reducedMotion"]')?.checked).toBe(true);
      expect(dialog.querySelector('[data-settings-motion-note]')?.textContent).toContain('当前已使用');
    } finally {
      fixture.remove();
    }
  });
});
