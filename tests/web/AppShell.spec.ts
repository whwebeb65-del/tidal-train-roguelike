import { describe, expect, it } from 'vitest';
import { renderAppShell } from '../../web/app/AppShell';

describe('AppShell', () => {
  it('renders five independent scene actions and one scene host', () => {
    const html = renderAppShell({
      gears: 7,
      routeMarks: 2,
      starTickets: 1,
    });

    expect(html.match(/data-nav-scene=/g)).toHaveLength(5);
    expect(html).toContain('data-nav-scene="station"');
    expect(html).toContain('data-nav-scene="captain"');
    expect(html).toContain('data-nav-scene="equipment"');
    expect(html).toContain('data-nav-scene="legion"');
    expect(html).toContain('data-nav-scene="store"');
    expect(html).toContain('id="scene-host"');
    expect(html).toContain('data-action="reset-save"');
    expect(html).not.toContain('open-hub-anchor');
  });
});
