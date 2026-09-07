import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { generateAsset } from './image-pipeline';
import { projects } from '../src/data/projects';

const root = resolve('public');
const output = resolve(root, 'images/generated');
await mkdir(output, { recursive: true });
await mkdir('src/data', { recursive: true });
const manifest: Record<string, { width: number; height: number; tiny: string; base: string; widths: number[] }> = {};
const usedIds = new Set<string>();
const slugs = new Set<string>();
for (const project of projects) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.slug) || slugs.has(project.slug) || !project.images.length) throw new Error(`Invalid project: ${project.slug}`);
  slugs.add(project.slug);
  if (!project.images.some(image => image.id === project.cover)) throw new Error(`Missing cover in ${project.slug}`);
  for (const photo of project.images) {
    if (!/^[a-z0-9-]+$/.test(photo.id) || usedIds.has(photo.id) || !photo.alt.trim()) throw new Error(`Invalid image: ${photo.id}`);
    usedIds.add(photo.id);
    manifest[photo.id] = await generateAsset(photo, root);

  }
}
const destination = 'src/data/image-manifest.json';
await mkdir(dirname(destination), { recursive: true });
const json = JSON.stringify(manifest);
if (await readFile(destination, 'utf8').catch(() => '') !== json) await writeFile(destination, json);
console.log(`Images: ${usedIds.size} validated; variants ready (AVIF / WebP / JPEG, five widths).`);
