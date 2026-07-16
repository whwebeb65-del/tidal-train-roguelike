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
};

const files = await readdir(root);
const failures = [];

for (const [name, limit] of Object.entries(limits)) {
  if (!files.includes(name)) {
    failures.push(`${name}: missing`);
    continue;
  }
  const info = await stat(path.join(root, name));
  if (info.size > limit) {
    failures.push(`${name}: ${info.size} bytes exceeds ${limit}`);
  }
}

const firstScreen = [
  'station-ocean-bg.webp',
  'bubble-train.webp',
  'captain-female-base.webp',
  'otter-mechanic.webp',
  'jellyfish-medic.webp',
];
let firstScreenBytes = 0;
for (const name of firstScreen) {
  const info = await stat(path.join(root, name));
  firstScreenBytes += info.size;
}
if (firstScreenBytes > 1.5 * 1024 * 1024) {
  failures.push(`first-screen: ${firstScreenBytes} bytes exceeds 1.5 MB`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`asset budget ok: ${firstScreenBytes} first-screen bytes`);
