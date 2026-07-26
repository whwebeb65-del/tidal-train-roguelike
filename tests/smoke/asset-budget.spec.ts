import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type AssetBudgetValidation = {
  readonly failures: readonly string[];
};

const assetBudgetModuleUrl = new URL(
  '../../scripts/check-asset-budget.mjs',
  import.meta.url,
).href;
const { validateAssetBudget } = await import(assetBudgetModuleUrl) as {
  validateAssetBudget(root: string): Promise<AssetBudgetValidation>;
};

describe('asset budget', () => {
  it('keeps launch art inside the approved byte budget', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/check-asset-budget.mjs'],
      { encoding: 'utf8' },
    );

    expect(output).toContain('first-screen bytes');
    expect(output).toContain('battle-screen bytes');
    expect(output).toContain('total skill asset bytes');
    expect(output).toContain('asset budget ok');

    const totalSkillAssetBytes = Number(
      output.match(/total skill asset bytes: (\d+)/)?.[1],
    );
    expect(totalSkillAssetBytes).toBeLessThanOrEqual(650 * 1024);
  });

  it('always checks the repository asset root when an override is supplied', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'tidal-train-assets-'));

    try {
      const output = execFileSync(
        process.execPath,
        ['scripts/check-asset-budget.mjs'],
        {
          encoding: 'utf8',
          env: { ...process.env, ASSET_BUDGET_ROOT: fixtureRoot },
        },
      );

      expect(output).toContain('first-screen bytes: 581204');
      expect(output).toContain('asset budget ok');
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('rejects symbolic links in the skill asset directory', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'tidal-train-assets-'));
    const skillRoot = join(fixtureRoot, 'skills');
    const rootAssets = [
      'captain-female-base.webp',
      'captain-male-base.webp',
      'needle-jelly-enemy.webp',
      'storm-ray-elite.webp',
      'tidal-boss.webp',
      'station-sky-dusk.webp',
      'station-horizon-dusk.webp',
      'station-platform-dusk.webp',
      'station-foreground-dusk.webp',
      'bubble-train.webp',
      'otter-mechanic.webp',
      'jellyfish-medic.webp',
      'flying-fish-post.webp',
      'station-distant-train.webp',
      'battle-sky-dusk.webp',
      'battle-horizon-dusk.webp',
      'battle-track-dusk.webp',
      'battle-foreground-dusk.webp',
      'captain-female-aurora.webp',
      'puffer-dragon.webp',
      'crystal-crab.webp',
    ];
    const skillAssets = [
      'tidal-volley-badge.webp',
      'bubble-barrier-badge.webp',
      'extreme-tide-badge.webp',
      'split-tide-arrow-glyph.webp',
      'reef-piercer-glyph.webp',
      'returning-volley-glyph.webp',
      'rainstorm-school-glyph.webp',
      'bursting-bubble-glyph.webp',
      'reflective-spines-glyph.webp',
      'overflow-membrane-glyph.webp',
      'emergency-trigger-glyph.webp',
      'undertow-eye-glyph.webp',
      'lingering-vortex-glyph.webp',
      'energy-return-glyph.webp',
      'double-crest-glyph.webp',
    ];

    try {
      await mkdir(skillRoot);
      await Promise.all(rootAssets.map((name) => writeFile(join(fixtureRoot, name), '')));
      await Promise.all(skillAssets.map((name) => writeFile(join(skillRoot, name), '')));
      const junctionTarget = join(fixtureRoot, 'external-skill-assets');
      await mkdir(junctionTarget);
      await symlink(
        junctionTarget,
        join(skillRoot, 'unapproved-glyph.webp'),
        'junction',
      );

      const result = await validateAssetBudget(fixtureRoot);
      expect(result.failures).toContain(
        'skills/unapproved-glyph.webp: symbolic links are not approved assets',
      );
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });
});
