import { describe, expect, it } from 'vitest';
import { BattleRenderer } from '../../../web/battle/BattleRenderer';
import {
  byBattleLayer,
  createPresentationFixture,
} from './helpers/BattleFixtures';
import { createRecordingPainter } from './helpers/RecordingPainter';
import { getRenderBudget } from '../../../web/battle/QualityMonitor';

describe('BattleRenderer', () => {
  it('draws stable layers and falls back for failed art', () => {
    const painter = createRecordingPainter();
    const renderer = new BattleRenderer(painter);

    renderer.render(createPresentationFixture({
      failedArtIds: ['needleJelly'],
    }));

    expect(painter.layers()).toEqual(
      [...painter.layers()].sort(byBattleLayer),
    );
    expect(painter.commands).toContainEqual(
      expect.objectContaining({
        kind: 'fallback-silhouette',
        enemyKind: 'needle-jelly',
      }),
    );
    expect(painter.commands).toContainEqual(
      expect.objectContaining({
        kind: 'sprite-part',
        actor: 'captain',
      }),
    );
  });

  it('keeps the train and companions below combat effects', () => {
    const painter = createRecordingPainter();
    const renderer = new BattleRenderer(painter);

    renderer.render(createPresentationFixture());

    const trainIndex = painter.commands.findIndex(
      (command) => command.kind === 'train',
    );
    const captainIndex = painter.commands.findIndex(
      (command) => command.actor === 'captain',
    );
    expect(trainIndex).toBeGreaterThan(-1);
    expect(captainIndex).toBeGreaterThan(trainIndex);
  });

  it('scales only decorative particles and trails with visual quality', () => {
    const painter = createRecordingPainter();
    const renderer = new BattleRenderer(painter);
    const budget = {
      ...getRenderBudget('low'),
      backgroundParticles: 3,
      visibleProjectileTrails: 0,
    };

    renderer.render({
      ...createPresentationFixture(),
      renderBudget: budget,
    });

    expect(
      painter.commands.filter(
        (command) => command.kind === 'background-particle',
      ),
    ).toHaveLength(3);
    expect(
      painter.commands.filter(
        (command) => command.kind === 'projectile-trail',
      ),
    ).toHaveLength(0);
    expect(
      painter.commands.filter(
        (command) => command.kind === 'projectile',
      ),
    ).toHaveLength(1);
  });
});
