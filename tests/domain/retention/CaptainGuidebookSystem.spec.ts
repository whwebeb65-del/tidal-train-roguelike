import { describe, expect, it } from 'vitest';
import {
  claimCaptainGuidebookReward,
  defaultCaptainGuidebookState,
  getCaptainGuidebookSnapshot,
  normalizeCaptainGuidebookState,
  type CaptainGuidebookProgressSource,
} from '../../../src/domain/retention/CaptainGuidebookSystem';
import { defaultSave } from '../../../src/save/SaveRepository';

function source(
  patch: Partial<CaptainGuidebookProgressSource> = {},
): CaptainGuidebookProgressSource {
  return {
    firstClearCount: 0,
    stationLevel: 1,
    highestEquipmentLevel: 1,
    highestSkillMasteryLevel: 1,
    legionId: null,
    accountLevel: 1,
    ...patch,
  };
}

describe('CaptainGuidebookSystem', () => {
  it('normalizes unknown and duplicate claims in catalog order', () => {
    expect(normalizeCaptainGuidebookState({
      version: 1,
      claimedObjectiveIds: [
        'station-level-2',
        'bad',
        'first-clear',
        'station-level-2',
      ],
    })).toEqual({
      version: 1,
      claimedObjectiveIds: ['first-clear', 'station-level-2'],
    });
    expect(normalizeCaptainGuidebookState(null))
      .toEqual(defaultCaptainGuidebookState());
  });

  it('shows one current objective and the next two previews', () => {
    const snapshot = getCaptainGuidebookSnapshot(
      defaultCaptainGuidebookState(),
      source({ firstClearCount: 1 }),
    );

    expect(snapshot.map((entry) => [
      entry.id,
      entry.presentation,
      entry.completed,
    ])).toEqual([
      ['first-clear', 'current', true],
      ['station-level-2', 'preview', false],
      ['equipment-level-2', 'preview', false],
    ]);
  });

  it('advances only after claiming the current completed objective', () => {
    const state = normalizeCaptainGuidebookState({
      version: 1,
      claimedObjectiveIds: ['first-clear'],
    });
    expect(getCaptainGuidebookSnapshot(
      state,
      source({ stationLevel: 2 }),
    )[0]).toMatchObject({
      id: 'station-level-2',
      presentation: 'current',
      progress: 2,
      target: 2,
      completed: true,
    });
  });

  it('grants every fixed reward exactly once and rejects out-of-order claims', () => {
    const base = defaultSave();
    const completed = source({ firstClearCount: 1, stationLevel: 2 });
    const blocked = claimCaptainGuidebookReward(
      defaultCaptainGuidebookState(),
      completed,
      'station-level-2',
      base,
    );
    expect(blocked).toMatchObject({ accepted: false, reason: 'not-current' });
    expect(blocked.save).toEqual(base);

    const first = claimCaptainGuidebookReward(
      defaultCaptainGuidebookState(),
      completed,
      'first-clear',
      base,
    );
    expect(first).toMatchObject({ accepted: true, reason: null });
    expect(first.save.gears).toBe(base.gears + 60);
    expect(first.save.routeMarks).toBe(base.routeMarks);

    const repeated = claimCaptainGuidebookReward(
      first.state,
      completed,
      'first-clear',
      first.save,
    );
    expect(repeated).toMatchObject({ accepted: false, reason: 'claimed' });
    expect(repeated.save).toEqual(first.save);

    const second = claimCaptainGuidebookReward(
      first.state,
      completed,
      'station-level-2',
      first.save,
    );
    expect(second.accepted).toBe(true);
    expect(second.save.routeMarks).toBe(base.routeMarks + 2);
  });

  it('rejects the current objective until its authoritative progress is complete', () => {
    const result = claimCaptainGuidebookReward(
      defaultCaptainGuidebookState(),
      source(),
      'first-clear',
      defaultSave(),
    );
    expect(result).toMatchObject({ accepted: false, reason: 'incomplete' });
  });
});
