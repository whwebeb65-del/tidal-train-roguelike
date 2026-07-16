import { describe, expect, it } from 'vitest';
import { BattleRenderer } from '../../../web/battle/BattleRenderer';
import {
  byBattleLayer,
  createPresentationFixture,
} from './helpers/BattleFixtures';
import { createRecordingPainter } from './helpers/RecordingPainter';

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
});
