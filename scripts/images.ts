import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { generateAsset } from './image-pipeline';
import { allProjects as projects } from '../src/data/projects';

const root = resolve('public');
const output = resolve(root, 'images/generated');
await mkdir(output, { recursive: true });
const buildCache = process.env.VERCEL === '1' ? resolve('node_modules/.cache/bo-david-images') : undefined;
if (buildCache) await cp(buildCache, output, { recursive: true, force: false, errorOnExist: false }).catch(error => { if (error.code !== 'ENOENT') throw error; });
await mkdir('src/data', { recursive: true });
const manifest: Record<string, { width: number; height: number; tiny: string; base: string; widths: number[] }> = {};
const usedIds = new Set<string>();
const imageSources = new Map<string, string>();
const uniquePhotos = [];
const slugs = new Set<string>();
for (const project of projects) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.slug) || slugs.has(project.slug)) throw new Error(`Invalid project: ${project.slug}`);
  slugs.add(project.slug);
  if (!project.images.length && !project.cover) continue;
  if (!project.images.some(image => image.id === project.cover)) throw new Error(`Missing cover in ${project.slug}`);
  for (const photo of project.images) {
    if (!/^[a-z0-9-]+$/.test(photo.id) || !photo.alt.trim()) throw new Error(`Invalid image: ${photo.id}`);
    const source = JSON.stringify([photo.src, photo.width, photo.height]);
    if (usedIds.has(photo.id)) {
      if (imageSources.get(photo.id) !== source) throw new Error(`Conflicting image: ${photo.id}`);
      continue;
    }
    usedIds.add(photo.id);
    imageSources.set(photo.id, source);
    uniquePhotos.push(photo);
  }
}
let completed = 0;
const queue = [...uniquePhotos];
await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
  while (queue.length) {
    const photo = queue.shift()!;
    manifest[photo.id] = await generateAsset(photo, root);
    completed++;
    if (process.env.VERCEL === '1' && (completed % 25 === 0 || completed === uniquePhotos.length)) console.log(`Images: ${completed}/${uniquePhotos.length}`);
  }
}));
const destination = 'src/data/image-manifest.json';
await mkdir(dirname(destination), { recursive: true });
const json = JSON.stringify(manifest);
if (await readFile(destination, 'utf8').catch(() => '') !== json) await writeFile(destination, json);
if (buildCache) await cp(output, buildCache, { recursive: true });
console.log(`Images: ${usedIds.size} validated; variants ready (WebP / JPEG, five widths).`);
