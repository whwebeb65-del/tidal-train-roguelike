import {
  CAPTAIN_CATALOG,
  getCaptainDefinition,
  type CaptainId,
} from './CaptainCatalog';

export interface CaptainProfileState {
  readonly selectedCaptainId: CaptainId | null;
  readonly equippedSkinIds: Readonly<Partial<Record<CaptainId, string>>>;
}

export function createCaptainProfileState(): CaptainProfileState {
  return {
    selectedCaptainId: null,
    equippedSkinIds: Object.fromEntries(
      CAPTAIN_CATALOG.map((captain) => [captain.id, captain.baseSkinId]),
    ),
  };
}

export function normalizeCaptainProfileState(
  candidate: CaptainProfileState,
): CaptainProfileState {
  const selectedCaptainId = candidate.selectedCaptainId;
  if (selectedCaptainId !== null) getCaptainDefinition(selectedCaptainId);

  return {
    selectedCaptainId,
    equippedSkinIds: Object.fromEntries(
      CAPTAIN_CATALOG.map((captain) => [
        captain.id,
        candidate.equippedSkinIds[captain.id] ?? captain.baseSkinId,
      ]),
    ),
  };
}

export function selectCaptain(
  state: CaptainProfileState,
  captainId: CaptainId,
): CaptainProfileState {
  getCaptainDefinition(captainId);
  return normalizeCaptainProfileState({
    ...state,
    selectedCaptainId: captainId,
  });
}

export function equipCaptainSkin(
  state: CaptainProfileState,
  captainId: CaptainId,
  skinId: string,
): CaptainProfileState {
  getCaptainDefinition(captainId);
  return normalizeCaptainProfileState({
    ...state,
    equippedSkinIds: {
      ...state.equippedSkinIds,
      [captainId]: skinId,
    },
  });
}
