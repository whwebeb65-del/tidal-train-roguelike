import { describe, expect, it } from 'vitest';
import {
  completeFirstRunBattleTutorialStep,
  createFirstRunBattleTutorialState,
  getFirstRunBattleTutorialPrompt,
  normalizeFirstRunBattleTutorialState,
  skipFirstRunBattleTutorial,
} from '../../../src/domain/onboarding/FirstRunBattleTutorial';

describe('FirstRunBattleTutorial', () => {
  it('starts at aim and advances only in catalog order', () => {
    const initial = createFirstRunBattleTutorialState();

    expect(getFirstRunBattleTutorialPrompt(initial)).toMatchObject({
      stepId: 'aim',
      stepNumber: 1,
      totalSteps: 3,
      placement: 'battle',
    });
    expect(completeFirstRunBattleTutorialStep(initial, 'skill')).toBe(initial);

    const aimed = completeFirstRunBattleTutorialStep(initial, 'aim');
    expect(getFirstRunBattleTutorialPrompt(aimed)?.stepId).toBe('skill');
    expect(completeFirstRunBattleTutorialStep(aimed, 'aim')).toBe(aimed);

    const skilled = completeFirstRunBattleTutorialStep(aimed, 'skill');
    expect(getFirstRunBattleTutorialPrompt(skilled)).toMatchObject({
      stepId: 'upgrade',
      stepNumber: 3,
      placement: 'upgrade',
    });

    const complete = completeFirstRunBattleTutorialStep(skilled, 'upgrade');
    expect(getFirstRunBattleTutorialPrompt(complete)).toBeNull();
    expect(completeFirstRunBattleTutorialStep(complete, 'upgrade')).toBe(complete);
  });

  it('normalizes known steps without accepting forged gaps', () => {
    expect(normalizeFirstRunBattleTutorialState({
      version: 99,
      completedStepIds: ['aim', 'skill', 'bad', 'skill'],
      skipped: false,
    })).toEqual({
      version: 1,
      completedStepIds: ['aim', 'skill'],
      skipped: false,
    });
    expect(normalizeFirstRunBattleTutorialState({
      version: 1,
      completedStepIds: ['aim', 'upgrade'],
      skipped: false,
    })).toEqual({
      version: 1,
      completedStepIds: ['aim'],
      skipped: false,
    });
    expect(normalizeFirstRunBattleTutorialState({
      version: 1,
      completedStepIds: ['skill', 'upgrade'],
      skipped: false,
    })).toEqual(createFirstRunBattleTutorialState());
    expect(normalizeFirstRunBattleTutorialState(null))
      .toEqual(createFirstRunBattleTutorialState());
  });

  it('skips idempotently without forging completed steps', () => {
    const initial = createFirstRunBattleTutorialState();
    const skipped = skipFirstRunBattleTutorial(initial);

    expect(skipped).toEqual({
      version: 1,
      completedStepIds: [],
      skipped: true,
    });
    expect(getFirstRunBattleTutorialPrompt(skipped)).toBeNull();
    expect(skipFirstRunBattleTutorial(skipped)).toBe(skipped);
    expect(completeFirstRunBattleTutorialStep(skipped, 'aim')).toBe(skipped);
  });

  it('keeps a fully completed tutorial complete instead of changing it to skipped', () => {
    const complete = normalizeFirstRunBattleTutorialState({
      version: 1,
      completedStepIds: ['aim', 'skill', 'upgrade'],
      skipped: false,
    });

    expect(skipFirstRunBattleTutorial(complete)).toBe(complete);
    expect(getFirstRunBattleTutorialPrompt(complete)).toBeNull();
  });
});
