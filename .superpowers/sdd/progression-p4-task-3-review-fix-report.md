# P4 Task 3 Review Fix Report

- The normal-run candidate save is now committed only after the candidate engine and battle scene have both been constructed and the router has mounted the scene.
- The router consumes the prepared scene, so the committed run does not construct a second battle scene.
- Any constructor, renderer, HUD, mount, asset, or navigation failure returns to station without stamina or account-XP persistence and clears prepared run state.
- Battle-speed availability is calculated from the candidate account level so a start-time level-up is reflected immediately.
- Runtime integration coverage drives `start()` and the public station click path with injected station preparation and scene construction seams. It verifies the normal successful commit and a throwing scene constructor rollback.
