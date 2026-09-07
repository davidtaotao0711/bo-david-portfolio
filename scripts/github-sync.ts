import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, stat, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Project, PortfolioImage } from '../src/data/projects';
import { EditorStore, EditorError, atomicWrite } from './editor-store';
import { generateAsset, type GeneratedAsset } from './image-pipeline';

export const repository = 'davidtaotao0711/bo-photography';
const remote = `https://github.com/${repository}.git`;
const run = promisify(execFile);
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 20);
import { groupsFromData, mergeGroup as mergeGroupData, type Group } from '../src/lib/github-model';
export { groupsFromData } from '../src/lib/github-model';
export function mergeGroup(projects: Project[], group: Group, incoming: PortfolioImage[]) { return mergeGroupData(projects, group, incoming, 'github-' + hash(group.key)); }

export type SyncStatus = { state: 'idle' | 'running' | 'complete' | 'error'; message: string; completed: number; total: number; commit?: string; added?: number; updated?: number };
export class GitHubSync {
  status: SyncStatus = { state: 'idle', message: '', completed: 0, total: 0 };
  constructor(private root: string, private store: EditorStore) {}
  private async git(args: string[], binary = false) {
    try {
      const result = await run('git', args, { cwd: this.root, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }, timeout: 180000, maxBuffer: 100 * 1024 * 1024, encoding: 'buffer' });
      return binary ? result.stdout : result.stdout.toString('utf8');
    } catch { throw new EditorError('GitHub 读取失败。请检查网络及本机 Git 对此仓库的登录权限，然后重试；已完成的图片会复用。'); }
  }
  async start(revision: string | undefined) {
    if (this.status.state === 'running') throw new EditorError('已有同步任务正在运行。', 409);
    // Reserve before awaiting, so simultaneous requests cannot start two jobs.
    const previous = this.status;
    this.status = { state: 'running', message: '正在连接 GitHub…', completed: 0, total: 0 };
    try {
      if ((await this.store.snapshot()).revision !== revision) throw new EditorError('内容已更新，请刷新编辑器后重试。', 409);
    } catch (error) { this.status = previous; throw error; }
    void this.store.mutate(revision, projects => this.import(projects)).then(() => {
      this.status = { ...this.status, state: 'complete', message: `同步完成：新增 ${this.status.added} 张，更新 ${this.status.updated} 张。顺序与封面已保留。` };
    }).catch(error => {
      this.status = { ...this.status, state: 'error', message: `${error instanceof EditorError ? error.message : '图片处理失败，请重试。'} 本地项目数据未被覆盖。` };
    });
    return this.status;
  }
  private async import(projects: Project[]) {
    const cache = resolve(this.root, '.cache/github-source');
    await mkdir(dirname(cache), { recursive: true });
    if (!await stat(resolve(cache, '.git')).catch(() => null)) await this.git(['clone', '--depth=1', '--filter=blob:none', '--no-checkout', remote, cache]);
    const git = (args: string[], binary = false) => this.git(['-C', cache, ...args], binary);
    if (String(await git(['remote', 'get-url', 'origin'])).trim() !== remote) throw new EditorError('同步缓存的仓库地址不匹配，请检查 .cache/github-source。');
    await git(['fetch', '--depth=1', '--filter=blob:none', 'origin', 'HEAD']);
    const commit = String(await git(['rev-parse', 'FETCH_HEAD'])).trim();
    this.status.commit = commit;
    const photos = JSON.parse(String(await git(['show', `${commit}:src/data/photos.json`])));
    const series = JSON.parse(String(await git(['show', `${commit}:src/data/series.json`])));
    const groups = groupsFromData(photos, series);
    const tree = new Map(String(await git(['ls-tree', '-r', '-z', commit])).split('\0').filter(Boolean).map(line => {
      const [header, path] = line.split('\t'); const [mode, type, oid] = header.split(' ');
      return [path, { mode, type, oid }] as const;
    }));
    // Batch object requests: a separate authenticated Git fetch per image is slow.
    const objects = [...new Set(groups.flatMap(g => g.photos).map(photo => {
      const entry = tree.get(`public${photo.image}`);
      if (!entry || entry.type !== 'blob' || entry.mode !== '100644') throw new EditorError(`仓库中找不到原图：${photo.id}`);
      return entry.oid;
    }))];
    for (let offset = 0; offset < objects.length; offset += 32) {
      this.status.message = `正在下载原图 ${offset + 1}–${Math.min(offset + 32, objects.length)} / ${objects.length}…`;
      await git(['-c', 'fetch.negotiationAlgorithm=noop', 'fetch', '--filter=blob:none', '--no-tags', '--no-write-fetch-head', '--recurse-submodules=no', 'origin', ...objects.slice(offset, offset + 32)]);
    }
    const manifestPath = resolve(this.root, 'src/data/image-manifest.json');
    const manifest: Record<string, GeneratedAsset> = JSON.parse(await readFile(manifestPath, 'utf8'));
    this.status.total = groups.reduce((n,g) => n + g.photos.length, 0);
    this.status.added = 0; this.status.updated = 0;
    const originals = new Map<string, Promise<void>>();
    for (const group of groups) {
      const incoming: PortfolioImage[] = new Array(group.photos.length);
      let cursor = 0, stopped = false;
      const worker = async () => { try { while (!stopped && cursor < group.photos.length) {
        const index = cursor++; const photo = group.photos[index];
        this.status.message = `正在下载和处理 ${this.status.completed + 1} / ${this.status.total}：${group.title}`;
        if (!/^\/images\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.(jpe?g|png|webp|avif)$/i.test(photo.image) || photo.image.split('/').some(p => p === '.' || p === '..')) throw new EditorError(`不支持的图片路径：${photo.id}`);
        const entry = tree.get(`public${photo.image}`);
        if (!entry || entry.type !== 'blob' || entry.mode !== '100644') throw new EditorError(`仓库中找不到原图：${photo.id}`);
        const id = `gh-${hash(`${repository}:${group.key}:${photo.id}`)}`;
        const src = `/images/originals/github/${entry.oid}.${photo.image.split('.').pop()!.toLowerCase()}`;
        const path = resolve(this.root, 'public', `.${src}`);
        if (!originals.has(path)) originals.set(path, (async () => { if (!await stat(path).catch(() => null)) {
          const buffer = await git(['cat-file', 'blob', entry.oid], true) as Buffer;
          // Verify content before persisting; do not treat Git LFS pointers as photos.
          if (buffer.subarray(0, 80).toString().startsWith('version https://git-lfs.github.com')) throw new EditorError(`照片 ${photo.id} 使用 Git LFS，目前请通过本地上传导入。`);
          await mkdir(dirname(path), { recursive: true });
          const temp = `${path}.${randomUUID()}.tmp`; await writeFile(temp, buffer); await rename(temp, path);
        } })());
        await originals.get(path);
        const metadata = await sharp(path, { limitInputPixels: 100_000_000 }).metadata();
        if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) throw new EditorError(`照片 ${photo.id} 不是支持的静态图片。`);
        const swap = [5,6,7,8].includes(metadata.orientation ?? 1);
        const image: PortfolioImage = { id, src, width: swap ? metadata.height : metadata.width, height: swap ? metadata.width : metadata.height, alt: photo.alt || photo.title || group.title, github: { repository, photoId: photo.id, path: photo.image, blob: entry.oid } };
        const existing = projects.flatMap(p => p.images).find(p => p.id === id);
        if (existing?.github?.blob !== entry.oid || !manifest[id] || !await stat(resolve(this.root, 'public', `.${manifest[id].base}-2000.jpg`)).catch(() => null)) {
          manifest[id] = await generateAsset(image, resolve(this.root, 'public'));
        }
        incoming[index] = image; this.status.completed++;
      } } catch (error) { stopped = true; throw error; } };
      const results = await Promise.allSettled([worker(), worker()]);
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      const counts = mergeGroup(projects, group, incoming);
      this.status.added! += counts.added; this.status.updated! += counts.updated;
    }
    this.status.message = '正在保存同步结果…';
    await atomicWrite(manifestPath, JSON.stringify(manifest));
  }
}
