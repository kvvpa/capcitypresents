import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const assetDirs = [
  ['logo', 'public/logo'],
  ['images', 'public/images'],
];

await mkdir('public', { recursive: true });

for (const [source, destination] of assetDirs) {
  if (!existsSync(source)) continue;

  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
}
