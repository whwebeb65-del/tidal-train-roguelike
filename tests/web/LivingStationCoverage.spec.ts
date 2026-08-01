import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const view = (name: string) =>
  readFileSync(new URL(`../../web/views/${name}`, import.meta.url), 'utf8');

describe('living station non-battle coverage', () => {
  it.each([
    ['DailyCheckInView.ts', 'daily-check-in'],
    ['DailyTrialView.ts', 'tide-trial-yard'],
    ['LaunchCampaignView.ts', 'founder-ticket-office'],
    ['CommerceView.ts', 'supply-market'],
    ['SocialHubView.ts', 'lighthouse-dock'],
    ['CaptainSelectionView.ts', 'captain-platform'],
    ['WardrobeView.ts', 'wardrobe-carriage'],
    ['EquipmentView.ts', 'otter-workshop'],
    ['SettingsPanelView.ts', 'conductor-cabinet'],
    ['RunSceneView.ts', 'dispatch-table'],
  ])('%s exposes %s', (file, className) => {
    expect(view(file)).toContain(className);
  });

  it('does not leave generic system-card roots in redesigned views', () => {
    for (const file of [
      'DailyTrialView.ts',
      'LaunchCampaignView.ts',
      'CommerceView.ts',
      'SocialHubView.ts',
    ]) {
      expect(view(file)).not.toContain('class="system-card ');
    }
  });
});
