# 正式版玩法增强包实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有十分钟固定步长战斗中交付独立潮兽美术、精准弱点、节拍化波次、技能进化保底、动态音乐和四地图差异化内容。

**Architecture:** 保持 `BattleEngine` 为唯一权威状态，把弱点、音乐强度和地图档案拆成纯模块；渲染、特效与音频只消费状态和事件。资源使用独立 WebP，并保留代码绘制降级。

**Tech Stack:** TypeScript 5、Vitest、Canvas 2D、Web Audio、Vite、WebP、Chrome DevTools Protocol smoke。

## Global Constraints

- 单局逻辑硬上限保持 480000ms，1×/1.5×/2×/3× 结果确定性等价。
- 不新增货币、不升级存档版本、不接入真实支付或服务端。
- 三张新增运行时怪物资源合计目标不超过 360KB。
- 所有生产行为先观察对应测试 RED，再写最小实现至 GREEN。
- 每个通过验证的任务单独提交并推送 GitHub `main`。

---

### Task 1: 独立潮兽资源与加载降级

**Files:**
- Create: `web/assets/chibi/tide-shell-hatchling.webp`
- Create: `web/assets/chibi/lantern-ray.webp`
- Create: `web/assets/chibi/tide-parasite-snail.webp`
- Modify: `web/assets/BattleArtCatalog.ts`
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `scripts/check-asset-budget.mjs`
- Test: `tests/smoke/battle-assets.spec.ts`
- Test: `tests/web/battle/BattleRenderer.spec.ts`

**Interfaces:**
- Produces: `BattleArtId` values `tideShellHatchling`, `lanternRay`, `tideParasiteSnail`.
- Consumes: existing `AssetLoader` and Canvas fallback overlays.

- [ ] **Step 1: Write the failing catalog and renderer tests**

```ts
expect(BATTLE_ART_URLS.tideShellHatchling).toContain('tide-shell-hatchling');
expect(BATTLE_ART_URLS.lanternRay).toContain('lantern-ray');
expect(BATTLE_ART_URLS.tideParasiteSnail).toContain('tide-parasite-snail');
expect(drawImageIds).toEqual(expect.arrayContaining([
  'tideShellHatchling', 'lanternRay', 'tideParasiteSnail',
]));
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/smoke/battle-assets.spec.ts tests/web/battle/BattleRenderer.spec.ts`
Expected: FAIL because the three art IDs do not exist.

- [ ] **Step 3: Generate and integrate the three assets**

Use three separate image-generation calls with the existing chibi battle references, flat chroma background, no text, no shadow and clearly different silhouettes. Remove the key locally, convert to WebP, then map each enemy kind directly to its art ID. Preserve Canvas attachments when the image is unavailable.

- [ ] **Step 4: Run GREEN and budgets**

Run: `npm test -- tests/smoke/battle-assets.spec.ts tests/web/battle/BattleRenderer.spec.ts; npm run check:assets; npm run build`
Expected: PASS and the three files together are at most 360KB.

- [ ] **Step 5: Commit and push**

```powershell
git add web/assets web/battle/BattleRenderer.ts scripts/check-asset-budget.mjs tests
git commit -m "art: give tide beasts distinct silhouettes"
git push origin HEAD:main
```

### Task 2: 手动弹道精准弱点

**Files:**
- Create: `web/battle/BossWeakPointSystem.ts`
- Modify: `web/battle/BattleTypes.ts`
- Modify: `web/battle/BattleEngine.ts`
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `web/battle/EffectSystem.ts`
- Test: `tests/web/battle/BossWeakPointSystem.spec.ts`
- Test: `tests/web/battle/BattleEngineManualAim.spec.ts`
- Test: `tests/web/battle/EffectSystem.spec.ts`

**Interfaces:**
- Produces: `getBossWeakPoint(enemy): { x: number; y: number; radius: number } | null` and event `boss-precision-hit`.
- Consumes: projectile segment start/end, `trajectory === 'manual'`, Boss `weakPointOpen`.

- [ ] **Step 1: Write failing geometry and engine tests**

```ts
expect(segmentHitsCircle({ x: 280, y: 220 }, { x: 300, y: 180 }, weakPoint)).toBe(true);
expect(manualHit.damage).toBeCloseTo(baseDamage * 1.75);
expect(engine.frame.energy).toBe(beforeEnergy + 4);
expect(automaticEvents.some((event) => event.type === 'boss-precision-hit')).toBe(false);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/battle/BossWeakPointSystem.spec.ts tests/web/battle/BattleEngineManualAim.spec.ts tests/web/battle/EffectSystem.spec.ts`
Expected: FAIL because the pure geometry API and precision event do not exist.

- [ ] **Step 3: Implement minimal precision path**

Add a 20px weak-point circle offset above the Boss center, test the manual projectile segment before body damage, apply `1.75` damage and capped `+4` energy, then emit `boss-precision-hit`. Automatic and skill projectiles continue through the normal body path.

- [ ] **Step 4: Run GREEN and speed equivalence**

Run: `npm test -- tests/web/battle/BossWeakPointSystem.spec.ts tests/web/battle/BattleEngineManualAim.spec.ts tests/web/battle/BattleSpeedEquivalence.spec.ts tests/web/battle/EffectSystem.spec.ts`
Expected: PASS at all four simulation rates.

- [ ] **Step 5: Commit and push**

```powershell
git add web/battle tests/web/battle
git commit -m "feat: reward precise manual boss shots"
git push origin HEAD:main
```

### Task 3: 节拍化波次与四地图战斗档案

**Files:**
- Create: `web/battle/MapCombatProfiles.ts`
- Modify: `web/battle/WaveScheduler.ts`
- Modify: `web/battle/BattleEngine.ts`
- Modify: `web/battle/BattleTypes.ts`
- Test: `tests/web/battle/MapCombatProfiles.spec.ts`
- Test: `tests/web/battle/WaveScheduler.spec.ts`
- Test: `tests/web/battle/BattleIntegration.spec.ts`

**Interfaces:**
- Produces: `getMapCombatProfile(mapId)` with enemy weights, hp/speed/damage, weak-point and warning multipliers.
- Produces: `SpawnInstruction.segment` and exported nine-segment schedule metadata.

- [ ] **Step 1: Write failing profile and rest-window tests**

```ts
expect(getMapCombatProfile('deep-tunnel').bossHpMultiplier).toBe(1.18);
expect(getMapCombatProfile('glass-city').weakPointRewardMultiplier).toBe(1.2);
expect(restWindows(schedule)).toEqual(expect.arrayContaining([
  expect.objectContaining({ durationMs: expect.any(Number) }),
]));
expect(new Set(schedule.map((spawn) => spawn.segment)).size).toBeGreaterThanOrEqual(7);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/battle/MapCombatProfiles.spec.ts tests/web/battle/WaveScheduler.spec.ts tests/web/battle/BattleIntegration.spec.ts`
Expected: FAIL because profiles and segments are absent.

- [ ] **Step 3: Implement profiles and deterministic segments**

Define four frozen profiles and nine fixed time segments. `createWaveSchedule(seed, mapId)` applies map weights without wall-clock randomness. Spawn-time enemy stats receive profile multipliers once; Boss intro remains 360000ms and hard cap remains 480000ms.

- [ ] **Step 4: Run GREEN and deterministic suites**

Run: `npm test -- tests/web/battle/MapCombatProfiles.spec.ts tests/web/battle/WaveScheduler.spec.ts tests/web/battle/BattleIntegration.spec.ts tests/web/battle/BattleQualityDeterminism.spec.ts tests/web/battle/BattleSpeedEquivalence.spec.ts`
Expected: PASS with at least two rest windows and four distinct route profiles.

- [ ] **Step 5: Commit and push**

```powershell
git add web/battle tests/web/battle
git commit -m "feat: pace four distinct tidal routes"
git push origin HEAD:main
```

### Task 4: 技能进化保底与成长展示

**Files:**
- Modify: `src/domain/progression/SkillMasterySystem.ts`
- Modify: `web/battle/UpgradeSystem.ts`
- Modify: `web/battle/BattleHUD.ts`
- Modify: `web/styles/battle-hud.css`
- Test: `tests/domain/progression/SkillMasterySystem.spec.ts`
- Test: `tests/web/battle/UpgradeSystem.spec.ts`
- Test: `tests/web/battle/BattleHUD.spec.ts`

**Interfaces:**
- Produces: first variant unlocked at mastery 1 and `isEvolutionMilestone(runLevel)` for 5/10/15/20.
- Consumes: existing legal variant filtering, rank requirement and two-variant-per-skill cap.

- [ ] **Step 1: Write failing mastery, offer and HUD tests**

```ts
expect(unlockedSkillVariants('tidal-volley', 1)).toEqual(['split-tide-arrow']);
for (const level of [5, 10, 15, 20]) {
  expect(createUpgradeOffer(seed, level, build, unlocked).some(isSkillVariant)).toBe(true);
}
expect(html).toContain('技能进化');
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/domain/progression/SkillMasterySystem.spec.ts tests/web/battle/UpgradeSystem.spec.ts tests/web/battle/BattleHUD.spec.ts`
Expected: FAIL at mastery 1 and evolution milestones.

- [ ] **Step 3: Implement deterministic guaranteed slot**

Change mastery milestones to `[1, 5, 10, 15]`. At run levels 5/10/15/20, select one legal skill variant before rank/general slots; if none is legal, preserve normal offer behavior. Render a non-interactive evolution ribbon only when the offer contains a variant.

- [ ] **Step 4: Run GREEN and twenty-level run**

Run: `npm test -- tests/domain/progression/SkillMasterySystem.spec.ts tests/web/battle/UpgradeSystem.spec.ts tests/web/battle/BattleHUD.spec.ts tests/web/battle/TwentyLevelRun.spec.ts`
Expected: PASS and a normal fresh run has at least three qualitative evolution opportunities.

- [ ] **Step 5: Commit and push**

```powershell
git add src/domain/progression web/battle web/styles tests
git commit -m "feat: guarantee skill evolution moments"
git push origin HEAD:main
```

### Task 5: 四级动态战斗音乐

**Files:**
- Create: `web/audio/BattleMusicDirector.ts`
- Modify: `web/audio/ProceduralScore.ts`
- Modify: `web/audio/AudioManager.ts`
- Modify: `web/battle/BattleSoundPort.ts`
- Test: `tests/web/audio/BattleMusicDirector.spec.ts`
- Test: `tests/web/audio/ProceduralScore.spec.ts`
- Test: `tests/web/audio/AudioManager.spec.ts`

**Interfaces:**
- Produces: `BattleMusicIntensity = 0 | 1 | 2 | 3` and `selectBattleMusicIntensity(frame)`.
- Produces: `BattleSoundPort.setBattleIntensity(intensity)`.

- [ ] **Step 1: Write failing director and clock-preservation tests**

```ts
expect(selectBattleMusicIntensity(calmFrame)).toBe(0);
expect(selectBattleMusicIntensity(dangerFrame)).toBe(2);
expect(selectBattleMusicIntensity(bossWeakPointFrame)).toBe(3);
score.setIntensity(3, now);
expect(score.debugState.stepIndex).toBe(stepBefore);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/audio/BattleMusicDirector.spec.ts tests/web/audio/ProceduralScore.spec.ts tests/web/audio/AudioManager.spec.ts`
Expected: FAIL because intensity APIs are absent.

- [ ] **Step 3: Implement intensity layers**

Calculate intensity from wave, alive threat, elite/Boss phase and train HP. Apply BPM 112/122/132/142 plus progressively enabled bass, percussion and pulse layers without resetting `stepIndex`; require 2000ms before lowering intensity.

- [ ] **Step 4: Run GREEN and pause tests**

Run: `npm test -- tests/web/audio/BattleMusicDirector.spec.ts tests/web/audio/ProceduralScore.spec.ts tests/web/audio/AudioManager.spec.ts tests/web/battle/BattleScene.spec.ts`
Expected: PASS; pause prevents scheduling and resume preserves current intensity.

- [ ] **Step 5: Commit and push**

```powershell
git add web/audio web/battle/BattleSoundPort.ts tests/web/audio tests/web/battle
git commit -m "feat: score battles by rising threat"
git push origin HEAD:main
```

### Task 6: 产品文案、真实浏览器回归与发布

**Files:**
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `README.md`
- Modify: `scripts/smoke-browser.mjs`
- Modify: `tests/smoke/browser-script.spec.ts`

**Interfaces:**
- Consumes: route profiles, evolution ribbon, precision events, three independent art IDs and audio intensity debug state.
- Produces: browser assertions and screenshots for precision weak point, independent enemies and evolution offer.

- [ ] **Step 1: Write failing smoke contract test**

```ts
expect(source).toContain('precisionWeakPointSeen');
expect(source).toContain('evolutionOfferSeen');
expect(source).toContain('distinctTideBeastArtSeen');
expect(source).toContain('battleMusicIntensitySeen');
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/smoke/browser-script.spec.ts`
Expected: FAIL because final browser guards are absent.

- [ ] **Step 3: Add bounded real-browser assertions and update docs**

Record the four signals during the existing 390×844 full battle without test-only production behavior. Capture a representative enemy/evolution/weakpoint screenshot, keep ordinary URL E2E isolation, and document four route identities plus permanent mastery milestones.

- [ ] **Step 4: Run final gates**

Run: `npm test; npm run typecheck; npm run check:assets; npm run build; npm audit --audit-level=high; npm run smoke:browser; git diff --check`
Expected: all commands exit 0; 360/390/412/430 pass and 390 completes two battles.

- [ ] **Step 5: Commit and push**

```powershell
git add README.md web scripts tests
git commit -m "test: guard formal gameplay enhancement pack"
git push origin HEAD:main
```

