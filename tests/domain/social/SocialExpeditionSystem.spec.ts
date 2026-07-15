import { describe, expect, it } from 'vitest';
import {
  claimExpeditionMilestone,
  contributeToExpedition,
  createSocialExpeditionState,
  getIsoWeekCycleId,
  getSquadBonuses,
  joinLegion,
  normalizeSocialExpeditionState,
  toggleSquadMember,
} from '../../../src/domain/social/SocialExpeditionSystem';

describe('SocialExpeditionSystem', () => {
  it('requires a legion and limits the squad to two unique supports', () => {
    const empty = createSocialExpeditionState('2026-W29');
    expect(toggleSquadMember(empty, 'navigator').reason).toBe('legion-required');

    let state = joinLegion(empty, 'tide-beacon');
    state = toggleSquadMember(state, 'navigator').state;
    state = toggleSquadMember(state, 'gunner').state;

    expect(toggleSquadMember(state, 'engineer').reason).toBe('squad-full');
    expect(state.squadMemberIds).toEqual(['navigator', 'gunner']);
  });

  it('removes an already selected support', () => {
    let state = joinLegion(createSocialExpeditionState('2026-W29'), 'tide-beacon');
    state = toggleSquadMember(state, 'navigator').state;

    const removed = toggleSquadMember(state, 'navigator');

    expect(removed.accepted).toBe(true);
    expect(removed.state.squadMemberIds).toEqual([]);
  });

  it('combines the three support bonus types', () => {
    let state = joinLegion(createSocialExpeditionState('2026-W29'), 'tide-beacon');
    state = toggleSquadMember(state, 'navigator').state;
    state = toggleSquadMember(state, 'engineer').state;

    expect(getSquadBonuses(state)).toEqual({
      initialMomentum: 20,
      damageBonus: 0,
      maxPlayerHpBonus: 20,
    });
  });

  it('grants one contribution per run with a capped node bonus', () => {
    const joined = joinLegion(createSocialExpeditionState('2026-W29'), 'tide-beacon');
    const first = contributeToExpedition(joined, {
      runId: 'r1',
      outcome: 'victory',
      completedNodes: 9,
    });
    const repeated = contributeToExpedition(first.state, {
      runId: 'r1',
      outcome: 'victory',
      completedNodes: 9,
    });

    expect(first.pointsGranted).toBe(42);
    expect(repeated).toMatchObject({
      accepted: false,
      pointsGranted: 0,
      reason: 'run-already-contributed',
    });
  });

  it('uses different base contribution for extract and defeat', () => {
    const joined = joinLegion(createSocialExpeditionState('2026-W29'), 'tide-beacon');

    expect(contributeToExpedition(joined, {
      runId: 'e',
      outcome: 'extract',
      completedNodes: 1,
    }).pointsGranted).toBe(17);
    expect(contributeToExpedition(joined, {
      runId: 'd',
      outcome: 'defeat',
      completedNodes: 1,
    }).pointsGranted).toBe(10);
  });

  it('claims each reached milestone once', () => {
    const joined = joinLegion(createSocialExpeditionState('2026-W29'), 'tide-beacon');
    const contributed = contributeToExpedition(joined, {
      runId: 'r1',
      outcome: 'victory',
      completedNodes: 0,
    }).state;
    const claimed = claimExpeditionMilestone(contributed, 'supply-20');

    expect(claimed.reward).toEqual({ gears: 30, routeMarks: 0, starTickets: 0 });
    expect(claimExpeditionMilestone(claimed.state, 'supply-20').reason).toBe('already-claimed');
    expect(claimExpeditionMilestone(contributed, 'supply-50').reason).toBe('threshold-not-reached');
  });

  it('resets weekly progress but preserves legion and squad', () => {
    let state = joinLegion(createSocialExpeditionState('2026-W28'), 'tide-beacon');
    state = toggleSquadMember(state, 'navigator').state;
    state = contributeToExpedition(state, {
      runId: 'r1',
      outcome: 'victory',
      completedNodes: 0,
    }).state;

    expect(normalizeSocialExpeditionState(state, '2026-W29')).toMatchObject({
      cycleId: '2026-W29',
      legionId: 'tide-beacon',
      squadMemberIds: ['navigator'],
      contribution: 0,
      contributedRunIds: [],
      claimedMilestoneIds: [],
    });
  });

  it('creates stable ISO week identifiers', () => {
    expect(getIsoWeekCycleId(new Date('2026-07-16T00:00:00Z'))).toBe('2026-W29');
    expect(getIsoWeekCycleId(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
  });
});
