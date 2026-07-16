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
  'station-ocean-bg.webp': 350 * 1024,
  'captain-female-base.webp': 450 * 1024,
  'captain-male-base.webp': 450 * 1024,
  'battle-ocean-bg.webp': 700 * 1024,
  'needle-jelly-enemy.webp': 450 * 1024,
  'storm-ray-elite.webp': 550 * 1024,
  'tidal-boss.webp': 450 * 1024,
};

const files = await readdir(root);
const failures = [];
const sizes = new Map();

for (const name of files) {
  const info = await stat(path.join(root, name));
  if (info.isFile()) sizes.set(name, info.size);
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
  'station-ocean-bg.webp',
  'bubble-train.webp',
  'captain-female-base.webp',
  'otter-mechanic.webp',
  'jellyfish-medic.webp',
];
const battleScreen = [
  'battle-ocean-bg.webp',
  'bubble-train.webp',
  'captain-female-aurora.webp',
  'otter-mechanic.webp',
  'jellyfish-medic.webp',
  'puffer-dragon.webp',
  'needle-jelly-enemy.webp',
  'crystal-crab.webp',
];
const firstScreenBytes = sumFiles(firstScreen, sizes, failures);
const battleScreenBytes = sumFiles(battleScreen, sizes, failures);
const allChibiBytes = [...sizes.values()].reduce(
  (total, size) => total + size,
  0,
);

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

const audioExtensions = new Set(['.mp3', '.wav', '.ogg']);
for (const name of files) {
  if (audioExtensions.has(path.extname(name).toLowerCase())) {
    failures.push(`${name}: large audio loops are not approved assets`);
  }
}

console.log(`first-screen bytes: ${firstScreenBytes}`);
console.log(`battle-screen bytes: ${battleScreenBytes}`);
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
