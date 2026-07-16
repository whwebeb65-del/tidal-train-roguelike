import { describe, expect, it } from 'vitest';
import { renderCaptainSelection } from '../../web/views/CaptainSelectionView';

describe('CaptainSelectionView', () => {
  it('shows both equal captains and one explicit selection action each', () => {
    const html = renderCaptainSelection();

    expect(html).toContain('女列车长');
    expect(html).toContain('男列车长');
    expect(html.match(/data-action="select-captain"/g)).toHaveLength(2);
    expect(html).toContain('基础能力一致');
    expect(html).not.toContain('攻击更高');
    expect(html).not.toContain('生命更高');
  });
});
