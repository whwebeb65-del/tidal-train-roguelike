# 技能进化专属演出链 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让三种主动技能的 Rank 1–5 与十二种已选进化在真实战斗中呈现稳定、可辨识、受画质预算约束且支持减少动态的专属 Canvas 演出。

**Architecture:** 新增冻结的纯视觉签名目录作为颜色与 motif 的唯一来源；`BattleEngine` 只补充濒海自启的表现事件，`EffectSystem` 继续独占事件到对象池视图的转换，`BattleRenderer` 只负责确定性 Canvas 命令。真实 Chrome 通过权威精通存档、固定种子和真实升级选择取得代表进化，不增加直接改写局内构筑的测试后门。

**Tech Stack:** TypeScript、Vitest、Canvas 2D、现有 `EntityPool`／`EffectSystem`／`BattleRenderer`、Vite、Chrome DevTools Protocol、GitHub Pages。

## Global Constraints

- 十二种 `SkillVariantId` 必须全部且只映射一次，名称与所属技能以现有 `SKILL_VARIANTS_BY_SKILL` 和 `BATTLE_UPGRADE_COPY` 为权威。
- 本轮不改变伤害、治疗、护盾、冷却、能量、敌人、奖励、存档、广告、支付或经济规则。
- 不新增位图、音频、货币、技能、进化、付费商品或存档字段。
- Rank 只改变表现密度、尺寸与层次；高／中／低画质单次技能事件新增粒子上限为 30／20／12。
- 每个已选进化至少保留一个优先级不低于 6 的独有主轮廓；低画质不得完全移除进化识别。
- 减少动态时不得生成位移粒子、旋转螺旋、镜头震动或持续扩张环；必须保留 320–480ms 的静态颜色轮廓。
- 新效果继续使用对象池和固定步长消费，不新增持续业务定时器，不用随机数决定签名形状。
- 所有 E2E 行为只在 URL 参数精确满足 `e2e=1` 时可用；普通 URL 不暴露 `window.__TIDAL_TRAIN_E2E__`。
- 360／390／412／430 视口不得出现横向溢出、控件遮挡或小于 44×44 的新增可操作元素；本轮不新增可点击战斗控件。
- 每个任务提交后推送 `agent/skill-evolution-signature-vfx`；最终审查通过后快进 `main` 并验证本次提交对应的 GitHub Pages 工作流。

---

### Task 1: 建立十二种进化的纯视觉签名目录

**Files:**
- Create: `web/battle/SkillEvolutionVisualCatalog.ts`
- Create: `tests/web/battle/SkillEvolutionVisualCatalog.spec.ts`

**Interfaces:**
- Consumes: `SkillVariantId`、`BattleSkillId`、`SKILL_VARIANT_IDS`、`SKILL_VARIANTS_BY_SKILL`。
- Produces: `SkillEvolutionParticleKind`、`SkillEvolutionVisualSignature`、`SKILL_EVOLUTION_VISUAL_SIGNATURES`、`getSkillEvolutionVisualSignature(id)`。

- [ ] **Step 1: Write the failing completeness and immutability test**

```ts
import {
  SKILL_VARIANT_IDS,
  SKILL_VARIANTS_BY_SKILL,
} from '../../../src/domain/skill/SkillProgressionTypes';
import {
  getSkillEvolutionVisualSignature,
  SKILL_EVOLUTION_VISUAL_SIGNATURES,
} from '../../../web/battle/SkillEvolutionVisualCatalog';

it('maps every authoritative evolution once into a frozen signature', () => {
  expect(Object.keys(SKILL_EVOLUTION_VISUAL_SIGNATURES)).toEqual(SKILL_VARIANT_IDS);
  expect(Object.isFrozen(SKILL_EVOLUTION_VISUAL_SIGNATURES)).toBe(true);
  for (const id of SKILL_VARIANT_IDS) {
    const signature = getSkillEvolutionVisualSignature(id);
    expect(signature.id).toBe(id);
    expect(Object.isFrozen(signature)).toBe(true);
    expect(signature.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(signature.secondary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(SKILL_VARIANTS_BY_SKILL[signature.skillId]).toContain(id);
  }
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/web/battle/SkillEvolutionVisualCatalog.spec.ts`

Expected: FAIL because `SkillEvolutionVisualCatalog.ts` does not exist.

- [ ] **Step 3: Implement the frozen authoritative catalog**

Define this exact motif union:

```ts
export type SkillEvolutionParticleKind =
  | 'split-chevron'
  | 'coral-pierce'
  | 'returning-arc'
  | 'rainstorm-fin'
  | 'bubble-fracture'
  | 'reflection'
  | 'overflow-droplet'
  | 'emergency-beacon'
  | 'undertow-eye'
  | 'extreme-vortex'
  | 'energy-return'
  | 'second-crest';
```

Use these exact primary/secondary pairs and kinds:

```ts
const INPUT = {
  'split-tide-arrow': ['tidal-volley', '#59e9ff', '#f1ffff', 'split-chevron'],
  'reef-piercer': ['tidal-volley', '#ff8d73', '#ffe6ad', 'coral-pierce'],
  'returning-volley': ['tidal-volley', '#746fff', '#9df6ff', 'returning-arc'],
  'rainstorm-school': ['tidal-volley', '#4ecfff', '#d9fbff', 'rainstorm-fin'],
  'bursting-bubble': ['bubble-barrier', '#ff735f', '#ffd58a', 'bubble-fracture'],
  'reflective-spines': ['bubble-barrier', '#f5d77b', '#fff5bd', 'reflection'],
  'overflow-membrane': ['bubble-barrier', '#67efc3', '#f0ffe0', 'overflow-droplet'],
  'emergency-trigger': ['bubble-barrier', '#ff6f68', '#fff1a4', 'emergency-beacon'],
  'undertow-eye': ['extreme-tide', '#456fe8', '#78e8ff', 'undertow-eye'],
  'lingering-vortex': ['extreme-tide', '#9877ff', '#d8c6ff', 'extreme-vortex'],
  'energy-return': ['extreme-tide', '#71f3c0', '#eaffc8', 'energy-return'],
  'double-crest': ['extreme-tide', '#ffb77d', '#fff0a8', 'second-crest'],
} as const;
```

Build the exported record in `SKILL_VARIANT_IDS` order, freeze every signature and root, and throw only for an impossible internal missing ID.

- [ ] **Step 4: Run GREEN and typecheck**

Run:

```powershell
npm test -- tests/web/battle/SkillEvolutionVisualCatalog.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit and push**

```powershell
git add web/battle/SkillEvolutionVisualCatalog.ts tests/web/battle/SkillEvolutionVisualCatalog.spec.ts
git commit -m "feat: define skill evolution visual signatures"
git push -u origin agent/skill-evolution-signature-vfx
```

---

### Task 2: 从真实事件生成 Rank 与十二种进化效果视图

**Files:**
- Modify: `web/battle/BattleTypes.ts`
- Modify: `web/battle/BattleEngine.ts`
- Modify: `web/battle/EffectSystem.ts`
- Modify: `tests/web/battle/BattleEngineSkills.spec.ts`
- Modify: `tests/web/battle/EffectSystem.spec.ts`
- Modify: `tests/web/battle/BattleQualityDeterminism.spec.ts`

**Interfaces:**
- Consumes: Task 1 `getSkillEvolutionVisualSignature` and `SkillEvolutionParticleKind`.
- Produces: `BattleEvent` member `{ type: 'barrier-emergency-triggered'; effectRatio: number }`; `EffectParticleKind` includes `SkillEvolutionParticleKind`; deterministic rank/signature `EffectFrameView`.

- [ ] **Step 1: Write failing real-event tests**

Add an engine regression that applies a build containing only `emergency-trigger`, damages the train below 25%, and requires exactly one event:

```ts
expect(events.filter((event) => event.type === 'barrier-emergency-triggered'))
  .toEqual([{ type: 'barrier-emergency-triggered', effectRatio: 0.6 }]);
expect(manualBarrierEvents.some(
  (event) => event.type === 'barrier-emergency-triggered',
)).toBe(false);
```

Add table-driven effect tests over all twelve IDs. Create a frame with one selected variant, consume its authoritative event, then require its catalog kind and color. For `bursting-bubble`, `emergency-trigger`, `undertow-eye`, `lingering-vortex`, `energy-return`, and `double-crest`, use their dedicated events; for the other six use `skill-used`.

- [ ] **Step 2: Write failing budget, stacking, and reduced-motion tests**

```ts
it.each(['high', 'medium', 'low'] as const)(
  'keeps every selected motif while respecting the %s signature budget',
  (quality) => {
    const effects = createEffectsForQuality(quality);
    const frame = createAllVariantsFrame();
    effects.consume(allSkillUseEvents(), frame);
    const kinds = new Set(effects.view.particles.map((item) => item.kind));
    for (const id of SKILL_VARIANT_IDS) {
      expect(kinds).toContain(getSkillEvolutionVisualSignature(id).particleKind);
    }
    expect(effects.view.particles).toHaveLengthLessThanOrEqual(
      quality === 'high' ? 30 : quality === 'medium' ? 20 : 12,
    );
  },
);
```

Use one skill per assertion when the global `particleLimit` cannot hold all twelve simultaneously; the invariant is that every selected variant for the triggered skill retains one priority-6 motif before decorations. Reduced-motion assertions require `particles: []`, `camera.amplitude: 0`, and one `static-skill-silhouette` ring per selected variant with distinct radii and catalog colors.

- [ ] **Step 3: Run RED**

Run:

```powershell
npm test -- tests/web/battle/BattleEngineSkills.spec.ts tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleQualityDeterminism.spec.ts
```

Expected: FAIL for the absent event, absent motif kinds, incomplete matrix, and static reduced-motion signatures.

- [ ] **Step 4: Add the emergency presentation event without changing rules**

Immediately after the existing emergency barrier successfully applies, emit:

```ts
this.events.push({
  type: 'barrier-emergency-triggered',
  effectRatio: profile.emergencyEffectRatio,
});
```

Do not move the threshold check, consumed flag, heal, shield, damage, or finish order. Add the event to `BattleEvent` only.

- [ ] **Step 5: Implement deterministic signature generation**

Type-import `SkillEvolutionParticleKind` into `EffectSystem` and extend `EffectParticleKind`. Add helpers with these responsibilities:

```ts
private spawnEvolutionSignature(
  id: SkillVariantId,
  x: number,
  y: number,
  rank: number,
): void;

private addReducedEvolutionSignatures(
  ids: readonly SkillVariantId[],
  x: number,
  y: number,
): void;
```

`spawnEvolutionSignature` must use the catalog, assign priority at least 6, and use deterministic position offsets derived from catalog index rather than randomness. `skill-used` creates the rank base plus immediate signatures for variants without later authoritative events. Dedicated events create the remaining signatures exactly once. Add `extreme-energy-refunded` handling for `energy-return` and the new emergency event for `emergency-trigger`.

Refactor Rank layering to five monotonic levels. For a triggered skill, compute a signature budget capped at high 30, medium 20, low 12; allocate one particle per selected motif first, then rank and decorative particles.

- [ ] **Step 6: Run GREEN, determinism, and full battle focus**

Run:

```powershell
npm test -- tests/web/battle/BattleEngineSkills.spec.ts tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleQualityDeterminism.spec.ts tests/web/battle/BattleIntegration.spec.ts
npm run typecheck
```

Expected: PASS; identical input events produce deep-equal effect views at every quality.

- [ ] **Step 7: Commit and push**

```powershell
git add web/battle/BattleTypes.ts web/battle/BattleEngine.ts web/battle/EffectSystem.ts tests/web/battle/BattleEngineSkills.spec.ts tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleQualityDeterminism.spec.ts
git commit -m "feat: generate evolution signature effects"
git push
```

---

### Task 3: 绘制十二类专属 Canvas motif 与像素证据

**Files:**
- Modify: `web/battle/BattleRenderer.ts`
- Modify: `tests/web/battle/BattleRenderer.spec.ts`
- Modify: `tests/smoke/battle-pixel-evidence.spec.ts`
- Modify: `tests/web/battle/helpers/RecordingPainter.ts` only if a missing painter command is required

**Interfaces:**
- Consumes: Task 2 `EffectParticleView.kind`, catalog colors, existing `BattlePainter.line`／`ellipse`／`text`／`image` commands.
- Produces: stable draw kinds `effect-split-chevron`, `effect-returning-arc`, `effect-rainstorm-fin`, `effect-bubble-fracture`, `effect-overflow-droplet`, `effect-emergency-beacon`, `effect-undertow-eye`, `effect-energy-return`, plus strengthened existing `effect-coral-pierce`, `effect-reflection`, `effect-extreme-vortex`, `effect-second-crest`.

- [ ] **Step 1: Write failing RecordingPainter shape tests**

For each new kind, render an `EffectFrameView` containing one particle and require nonzero, bounded commands. Representative assertions:

```ts
expect(commands.filter((item) => item.kind === 'effect-split-chevron'))
  .toHaveLength(2);
expect(commandBounds(commands, 'effect-returning-arc')).toSatisfy(
  (bounds) => bounds.width > bounds.height && bounds.width < 180,
);
expect(commands.filter((item) => item.kind === 'effect-rainstorm-fin').length)
  .toBeGreaterThanOrEqual(3);
expect(commandBounds(commands, 'effect-emergency-beacon').height).toBeLessThan(140);
```

- [ ] **Step 2: Write failing pixel evidence**

Add pixel fixtures for split chevrons, returning arc, rainstorm fan, bubble fracture, overflow double membrane, emergency beacon, undertow eye, and double crest. Each fixture must assert colored-pixel presence in its expected region and reject any single filled rectangular component larger than 35% of the logical battle area.

- [ ] **Step 3: Run RED**

Run:

```powershell
npm test -- tests/web/battle/BattleRenderer.spec.ts tests/smoke/battle-pixel-evidence.spec.ts
```

Expected: FAIL because new particle kinds fall through to generic ellipses.

- [ ] **Step 4: Implement bounded deterministic drawing branches**

Add explicit branches before the generic particle fallback:

- `split-chevron`: two angled `line` commands forming a V, mirrored by particle rotation;
- `returning-arc`: 5–7 connected `line` segments forming a shallow Bézier approximation;
- `rainstorm-fin`: three short diagonal fin lines sharing a fan origin;
- `bubble-fracture`: four radial shard lines and one small hollow ellipse;
- `overflow-droplet`: paired hollow ellipses plus one droplet line, never a filled rectangle;
- `emergency-beacon`: coral diamond outline plus two short light rays;
- `undertow-eye`: two nested ellipses and four inward lines;
- `energy-return`: small mint ellipse with a line toward the train;
- existing vortex and second crest retain their paths but take catalog colors and stable kinds.

Every coordinate must be derived from particle `x`, `y`, `size`, `rotation`, and `progress`. Do not access engine state or random numbers.

- [ ] **Step 5: Run GREEN and asset budget**

Run:

```powershell
npm test -- tests/web/battle/BattleRenderer.spec.ts tests/smoke/battle-pixel-evidence.spec.ts tests/web/battle/EffectSystem.spec.ts
npm run check:assets
npm run typecheck
```

Expected: PASS; asset bytes remain unchanged because no assets were added.

- [ ] **Step 6: Commit and push**

```powershell
git add web/battle/BattleRenderer.ts tests/web/battle/BattleRenderer.spec.ts tests/smoke/battle-pixel-evidence.spec.ts tests/web/battle/helpers/RecordingPainter.ts
git commit -m "style: draw distinct evolution battle motifs"
git push
```

---

### Task 4: 将真实代表进化纳入 Chrome 生命周期门禁

**Files:**
- Modify: `web/battle/BattleE2EHooks.ts`
- Modify: `web/LegacyGameRuntime.ts`
- Modify: `tests/web/GameApp.spec.ts`
- Modify: `scripts/smoke-browser.mjs`
- Modify: `tests/smoke/browser-script.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 catalog、Task 2 effect kinds、Task 3 Canvas draw kinds、现有精确 E2E gate、权威精通存档和真实升级选择。
- Produces: E2E snapshot verification field `effectKinds: readonly string[]`; permanent `assertSkillEvolutionSignatures(client, viewport)` browser audit. No method may directly add a skill variant to an active build.

- [ ] **Step 1: Write failing E2E exposure and ordinary-isolation tests**

Extend `GameApp.spec.ts` to start through `?e2e=1`, use a real mastery save and deterministic upgrade choice, then require the snapshot to expose only currently rendered effect kinds:

```ts
expect(runtime.e2eSnapshot().verification.effectKinds)
  .toContain('split-chevron');
```

Also keep ordinary URL coverage:

```ts
window.history.replaceState({}, '', '/');
expect(window.__TIDAL_TRAIN_E2E__).toBeUndefined();
```

- [ ] **Step 2: Write failing smoke source contracts**

Require the browser script to contain:

```ts
expect(source).toContain('assertSkillEvolutionSignatures');
expect(source).toContain('effectKinds');
expect(source).toContain('split-chevron');
expect(source).toContain('emergency-beacon');
expect(source).toContain('undertow-eye');
expect(source).toContain('victory/victory');
```

The contract must also reject strings such as `e2eApplySkillVariant`, `forceSkillVariant`, or direct mutation of `skillVariants` through the E2E hook.

- [ ] **Step 3: Run RED**

Run:

```powershell
npm test -- tests/web/GameApp.spec.ts tests/smoke/browser-script.spec.ts
```

Expected: FAIL because effect kinds and the new Chrome audit are absent.

- [ ] **Step 4: Expose read-only effect diagnostics**

Add to the E2E verification snapshot:

```ts
readonly effectKinds: readonly string[];
```

Populate it from the current scene effect view using a frozen, deduplicated array of particle and ring kinds. Do not expose effect mutation or a build setter. The field exists only on the already exact-gated E2E global.

- [ ] **Step 5: Add three representative real-choice Chrome paths**

For each skill, reload an isolated legal save with mastery sufficient to unlock its first variant, use the existing fixed seed and real `e2eChooseFirstUpgrade()` loop until the expected authoritative variant is selected, then click the real skill control:

- 潮汐齐射 → `split-tide-arrow` → `split-chevron`;
- 泡泡屏障 → `bursting-bubble` → `bubble-fracture` after the real barrier breaks;
- 极潮爆发 → `undertow-eye` → `undertow-eye`.

Require the upgrade card/button glyph to show the selected variant, a nonempty Canvas pixel-diff in the protected battle region, the expected `effectKinds` entry, no overlap with HUD/interaction/skills, and continued battle progress. Do not call a direct build-mutation hook.

Under CDP reduced-motion emulation, repeat the three casts and require `static-skill-silhouette`, no camera movement, and no moving signature particles. Restore media emulation in `finally`.

Keep 390×844 on a full real run through victory and retain the existing second full run, explicitly logging `victory/victory`. Keep 360/412/430 existing battle/archive/layout audits and ordinary URL isolation.

- [ ] **Step 6: Document player-visible behavior**

Append one README paragraph under “正式玩法增强包”：技能 Rank 1–5 会增加演出层次，十二种进化各有独立颜色与轮廓；低画质保留主签名，减少动态改为静态轮廓；所有变化只影响画面，不改变数值与奖励。

- [ ] **Step 7: Run focused GREEN and real smoke**

Run:

```powershell
npm test -- tests/web/GameApp.spec.ts tests/smoke/browser-script.spec.ts tests/web/battle/EffectSystem.spec.ts tests/web/battle/BattleRenderer.spec.ts
npm run typecheck
npm run build
npm run smoke:browser
```

Expected: PASS at 360×800, 390×844, 412×915, 430×932; 390 reports `victory/victory`; ordinary URL has no E2E global.

- [ ] **Step 8: Commit and push**

```powershell
git add web/battle/BattleE2EHooks.ts web/LegacyGameRuntime.ts tests/web/GameApp.spec.ts scripts/smoke-browser.mjs tests/smoke/browser-script.spec.ts README.md
git commit -m "test: guard skill evolution signature effects"
git push
```

---

### Task 5: 全量门禁、独立审查与 GitHub Pages 发布

**Files:**
- Modify only files required by review findings, each with a preceding failing regression
- Local report: `.superpowers/sdd/skill-evolution-signature-vfx-final-report.md` (do not commit)

**Interfaces:**
- Consumes: Tasks 1–4 complete feature branch.
- Produces: independently reviewed `main`, exact deployed SHA, successful Pages run, and verified public asset marker.

- [ ] **Step 1: Run the complete release gate**

```powershell
npm test
npm run typecheck
npm run check:assets
npm run build
npm audit --audit-level=high
npm run smoke:browser
git diff --check
git status --short
```

Expected: all pass; audit reports zero high vulnerabilities; 390 reports `victory/victory`; ordinary URL has no E2E global; worktree has no tracked changes.

- [ ] **Step 2: Request independent full-range review**

Review from the merge base through feature HEAD against `docs/superpowers/specs/2026-08-13-skill-evolution-signature-vfx-design.md`. The reviewer must inspect all twelve signatures, event uniqueness, emergency event ordering, budget preservation, reduced-motion behavior, Canvas bounds, E2E no-backdoor rule, ordinary isolation, and absence of numeric/economic changes.

- [ ] **Step 3: Fix every Critical, Important, and timing/accessibility Minor finding with TDD**

Dispatch one fix wave containing the full findings list. Each product fix must first reproduce the scenario in a failing test. Rerun affected focus, then the entire Step 1 gate. Repeat read-only review until `Ready to merge: Yes` with no Critical or Important findings.

- [ ] **Step 4: Fast-forward main and verify merged tests**

From the main checkout:

```powershell
git fetch origin
git pull --ff-only origin main
git merge --ff-only agent/skill-evolution-signature-vfx
npm test
git push origin master:main
```

Expected: fast-forward succeeds; merged test suite passes; local `HEAD`, `origin/main`, and reviewed feature SHA match.

- [ ] **Step 5: Verify the exact Pages deployment**

Find the `Deploy GitHub Pages` run whose `headSha` exactly matches the merged SHA, wait with `gh run watch <run-id> --exit-status`, then request the public page and its hashed JS asset with a cache-busting query. Require HTTP 200 and a deployed marker for `split-chevron` or `SKILL_EVOLUTION_VISUAL_SIGNATURES`.

- [ ] **Step 6: Clean the owned worktree only after deployment succeeds**

Resolve and verify the target remains under the project `.worktrees` directory, run `git worktree remove`, `git worktree prune`, and delete the merged local feature branch. Preserve the remote commits and report the public URL, SHA, Pages run, and validation results.
