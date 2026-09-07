import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Project } from '../src/data/projects';
import { generateAsset, type GeneratedAsset } from './image-pipeline';

export class EditorError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function reorder<T extends { id: string }>(items: T[], ids: unknown): T[] {
  if (!Array.isArray(ids) || ids.length !== items.length || new Set(ids).size !== items.length || ids.some(id => typeof id !== 'string' || !items.some(item => item.id === id))) throw new EditorError('顺序数据不完整，请刷新后重试。');
  return ids.map(id => items.find(item => item.id === id)!);
}
export async function atomicWrite(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, content);
  await rename(temp, path);
}
export class EditorStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private root: string) {}
  private get dataPath() { return resolve(this.root, 'src/data/projects.json'); }
  private get manifestPath() { return resolve(this.root, 'src/data/image-manifest.json'); }
  async snapshot() {
    const raw = await readFile(this.dataPath, 'utf8');
    const projects: Project[] = JSON.parse(raw);
    const manifest: Record<string, GeneratedAsset> = JSON.parse(await readFile(this.manifestPath, 'utf8'));
    return { projects, revision: createHash('sha256').update(raw).digest('hex'), thumbnails: Object.fromEntries(Object.entries(manifest).map(([id, image]) => [id, `${image.base}-320.webp`])) };
  }
  mutate(revision: string | undefined, action: (projects: Project[]) => Promise<void> | void) {
    const operation = this.queue.then(async () => {
      const state = await this.snapshot();
      if (state.revision !== revision) throw new EditorError('内容已在另一个窗口更新。请刷新编辑器后重试。', 409);
      const before = JSON.stringify(state.projects, null, 2) + '\n';
      await action(state.projects);
      // Do not overwrite manual edits made while an upload was being processed.
      if ((await this.snapshot()).revision !== state.revision) throw new EditorError('处理期间项目数据发生变化，请刷新后重试。', 409);
      if (JSON.stringify(state.projects, null, 2) + '\n' === before) return this.snapshot();
      await atomicWrite(resolve(this.root, `.cache/editor-history/${Date.now()}-${randomUUID()}.json`), before);
      await atomicWrite(this.dataPath, JSON.stringify(state.projects, null, 2) + '\n');
      return this.snapshot();
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  private project(projects: Project[], slug: string) {
    const project = projects.find(item => item.slug === slug);
    if (!project) throw new EditorError('项目不存在。', 404);
    return project;
  }
  saveOrder(revision: string | undefined, slug: string, ids: unknown, cover: unknown) {
    return this.mutate(revision, projects => {
      const project = this.project(projects, slug);
      const images = reorder(project.images, ids);
      if (typeof cover !== 'string' || !images.some(image => image.id === cover)) throw new EditorError('请选择项目中的照片作为封面。');
      project.images = images; project.cover = cover;
    });
  }
  saveProjectOrder(revision: string | undefined, ids: unknown) {
    return this.mutate(revision, projects => { const sorted = reorder(projects, ids); projects.splice(0, projects.length, ...sorted); });
  }
  clearPlaceholders(revision: string | undefined, slug: string) {
    return this.mutate(revision, projects => {
      const project = this.project(projects, slug);
      const images = project.images.filter(image => !image.placeholderColor);
      if (!images.length) throw new EditorError('请先上传至少一张照片，再移除测试色块。');
      project.images = images;
      if (!images.some(image => image.id === project.cover)) project.cover = images[0].id;
    });
  }
  upload(revision: string | undefined, slug: string, buffer: Buffer, filename: string) {
    return this.mutate(revision, async projects => {
      const project = this.project(projects, slug);
      let metadata;
      try { metadata = await sharp(buffer, { limitInputPixels: 100_000_000 }).metadata(); }
      catch { throw new EditorError('无法读取照片。请使用 JPEG、PNG、WebP 或 AVIF。'); }
      const extensions: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', heif: 'avif', avif: 'avif' };
      const extension = extensions[metadata.format ?? ''];
      if (!extension || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1 || (metadata.format === 'heif' && metadata.compression !== 'av1')) throw new EditorError('只支持静态 JPEG、PNG、WebP 和 AVIF 照片。');
      const swap = [5,6,7,8].includes(metadata.orientation ?? 1);
      const id = `${project.slug}-${randomUUID()}`;
      const image = { id, src: `/images/originals/${project.slug}/${id}.${extension}`, width: swap ? metadata.height : metadata.width, height: swap ? metadata.width : metadata.height, alt: `${project.title} — ${filename.replace(/\.[^.]+$/, '').slice(0, 150) || 'Photograph'}` };
      const path = resolve(this.root, 'public', `.${image.src}`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buffer, { flag: 'wx' });
      const asset = await generateAsset(image, resolve(this.root, 'public'));
      const manifest = JSON.parse(await readFile(this.manifestPath, 'utf8'));
      manifest[id] = asset;
      // Publish assets before data so the live portfolio never references a missing variant.
      await atomicWrite(this.manifestPath, JSON.stringify(manifest));
      project.images.push(image);
    });
  }
}
