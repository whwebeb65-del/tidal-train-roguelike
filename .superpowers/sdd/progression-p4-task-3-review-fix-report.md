# P4 Task 3 Review Fix Report

- The normal-run candidate save is now committed only after the candidate engine and battle scene have both been constructed and the router has mounted the scene.
- The router consumes the prepared scene, so the committed run does not construct a second battle scene.
- Any constructor, renderer, HUD, mount, asset, or navigation failure returns to station without stamina or account-XP persistence and clears prepared run state.
- Battle-speed availability is calculated from the candidate account level so a start-time level-up is reflected immediately.
- Runtime integration coverage drives `start()` and the public station click path with injected station preparation and scene construction seams. It verifies the normal successful commit and a throwing scene constructor rollback.
- The same harness covers local preparation abort, insufficient stamina, daily trial zero-cost behavior, locked-speed clamping, and the Lv.20 speed set.
- Clock-injected station synchronization asserts the completed-interval recovery timestamp preserves the partial-regeneration baseline. A mount-failure/retry test asserts failed prepared scenes are discarded and the retry creates one fresh scene and charges only once.
