import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'web',
  'assets',
  'chibi',
);

const limits = {
  'captain-female-base.webp': 450 * 1024,
  'captain-male-base.webp': 450 * 1024,
  'needle-jelly-enemy.webp': 450 * 1024,
  'storm-ray-elite.webp': 550 * 1024,
  'tidal-boss.webp': 450 * 1024,
};

const failures = [];
const sizes = new Map();
const requiredSkillAssets = [
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

for (const [name, size] of await collectFiles(root)) {
  sizes.set(name, size);
}

for (const [name, limit] of Object.entries(limits)) {
  const size = sizes.get(name);
  if (size === undefined) {
    failures.push(`${name}: missing`);
    continue;
  }
  if (size > limit) {
    failures.push(`${name}: ${size} bytes exceeds ${limit}`);
  }
}

const firstScreen = [
  'station-sky-dusk.webp',
  'station-horizon-dusk.webp',
  'station-platform-dusk.webp',
  'station-foreground-dusk.webp',
  'bubble-train.webp',
  'captain-female-base.webp',
  'otter-mechanic.webp',
  'jellyfish-medic.webp',
  'flying-fish-post.webp',
  'station-distant-train.webp',
];
const battleScreen = [
  'battle-sky-dusk.webp',
  'battle-horizon-dusk.webp',
  'battle-track-dusk.webp',
  'battle-foreground-dusk.webp',
  'bubble-train.webp',
  'captain-female-aurora.webp',
  'otter-mechanic.webp',
  'jellyfish-medic.webp',
  'puffer-dragon.webp',
  'needle-jelly-enemy.webp',
  'crystal-crab.webp',
  'skills/tidal-volley-badge.webp',
  'skills/bubble-barrier-badge.webp',
  'skills/extreme-tide-badge.webp',
];
const firstScreenBytes = sumFiles(firstScreen, sizes, failures);
const battleScreenBytes = sumFiles(battleScreen, sizes, failures);
const totalSkillAssetBytes = sumFiles(
  requiredSkillAssets.map((name) => `skills/${name}`),
  sizes,
  failures,
);
const allChibiBytes = [...sizes.values()].reduce(
  (total, size) => total + size,
  0,
);

const actualSkillAssets = [...sizes.keys()]
  .filter((name) => name.startsWith('skills/'))
  .map((name) => name.slice('skills/'.length))
  .sort();
const expectedSkillAssets = [...requiredSkillAssets].sort();
if (
  actualSkillAssets.length !== expectedSkillAssets.length
  || actualSkillAssets.some((name, index) => name !== expectedSkillAssets[index])
) {
  failures.push(
    `skills: expected exactly ${expectedSkillAssets.join(', ')}, found ${actualSkillAssets.join(', ')}`,
  );
}

if (firstScreenBytes > 1.5 * 1024 * 1024) {
  failures.push(`first-screen: ${firstScreenBytes} bytes exceeds 1.5 MB`);
}
if (battleScreenBytes > 2.5 * 1024 * 1024) {
  failures.push(
    `battle-screen: ${battleScreenBytes} bytes exceeds 2.5 MB`,
  );
}
if (allChibiBytes > 5.5 * 1024 * 1024) {
  failures.push(`all-chibi: ${allChibiBytes} bytes exceeds 5.5 MB`);
}
if (totalSkillAssetBytes > 650 * 1024) {
  failures.push(
    `skill-assets: ${totalSkillAssetBytes} bytes exceeds 650 KiB`,
  );
}

const audioExtensions = new Set(['.mp3', '.wav', '.ogg']);
for (const name of sizes.keys()) {
  if (audioExtensions.has(path.extname(name).toLowerCase())) {
    failures.push(`${name}: large audio loops are not approved assets`);
  }
}

console.log(`first-screen bytes: ${firstScreenBytes}`);
console.log(`battle-screen bytes: ${battleScreenBytes}`);
console.log(`total skill asset bytes: ${totalSkillAssetBytes}`);
console.log(`all chibi bytes: ${allChibiBytes}`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('asset budget ok');

function sumFiles(names, sizeMap, errors) {
  let total = 0;
  for (const name of names) {
    const size = sizeMap.get(name);
    if (size === undefined) {
      errors.push(`${name}: missing from collection`);
      continue;
    }
    total += size;
  }
  return total;
}

async function collectFiles(directory, relativeDirectory = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const collected = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collected.push(...await collectFiles(fullPath, relativePath));
      continue;
    }
    if (entry.isFile()) {
      const info = await stat(fullPath);
      collected.push([relativePath, info.size]);
    }
  }

  return collected;
}
