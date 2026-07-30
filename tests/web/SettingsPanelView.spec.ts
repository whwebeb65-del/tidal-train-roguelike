import { describe, expect, it } from 'vitest';
import { defaultGameSettings } from '../../web/app/SettingsRepository';
import { renderSettingsPanel } from '../../web/views/SettingsPanelView';

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
    expect(html).toContain('data-settings-backdrop');
    expect(html).toContain('settings-sheet conductor-cabinet');
    expect(html).toContain('cabinet-gauge');
    expect(html).toContain('cabinet-switch');
    expect(html).toContain('sealed-maintenance-note');
  });
});
