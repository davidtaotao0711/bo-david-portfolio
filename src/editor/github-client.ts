import type { Project, PortfolioImage } from '../data/projects';
import { groupsFromData, mergeGroup, repository as sourceRepository } from '../lib/github-model';
export type Snapshot = { projects: Project[]; revision: string; thumbnails: Record<string, string> };
export type Job = { state: 'idle' | 'running' | 'complete' | 'error'; message: string; completed: number; total: number };
type PublishedAsset = { base: string; original: string };
const contentRepository = 'davidtaotao0711/bo-david-portfolio';
const dataPath = 'src/data/projects.json';
const text = new TextDecoder();
const base64 = (bytes: Uint8Array) => { let value = ''; for (let i = 0; i < bytes.length; i += 32768) value += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(value); };
const sha = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 20);
const decodeImage = async (blob: Blob) => { const bitmap = await createImageBitmap(blob); const size = { width: bitmap.width, height: bitmap.height }; bitmap.close(); if (size.width * size.height > 100_000_000) throw new Error('照片像素过大，请控制在一亿像素以内。'); return size; };
function reorder<T extends { id: string }>(items: T[], ids: string[]) {
  if (ids.length !== items.length || new Set(ids).size !== items.length || ids.some(id => !items.some(item => item.id === id))) throw new Error('排序数据不完整，请刷新后重试。');
  return ids.map(id => items.find(item => item.id === id)!);
}
export class GitHubEditor {
  private token = '';
  private sourceToken = '';
  private state!: Snapshot;
  private previews = new Map<string, string>();
  job: Job = { state: 'idle', message: '', completed: 0, total: 0 };
  constructor(private published: Record<string, PublishedAsset>, private fetcher: typeof fetch = globalThis.fetch.bind(globalThis), private decode = decodeImage) {}
  disconnect() { this.token = ''; this.sourceToken = ''; for (const url of this.previews.values()) URL.revokeObjectURL(url); this.previews.clear(); }
  private async api(path: string, method = 'GET', body?: unknown, raw = false) {
    const token = path.startsWith(sourceRepository + '/') ? this.sourceToken || this.token : this.token;
    const response = await this.fetcher(`https://api.github.com/repos/${path}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) {
      if ([401, 403, 404].includes(response.status)) throw new Error('GitHub 连接失败或权限不足。请检查令牌是否有效，并允许访问所需仓库。');
      if ([409, 422].includes(response.status)) throw new Error('仓库内容已更新或提交被拒绝。请刷新内容后重试，已有内容不会被覆盖。');
      throw new Error(`GitHub 暂时无法完成操作（${response.status}），请重试。`);
    }
    return raw ? new Uint8Array(await response.arrayBuffer()) : response.json();
  }
  private async json(path: string, repository = contentRepository, ref = 'main') {
    const response = await this.api(`${repository}/contents/${path}?ref=${encodeURIComponent(ref)}`);
    if (response.encoding !== 'base64' || typeof response.content !== 'string') throw new Error('仓库数据格式不正确。');
    return JSON.parse(text.decode(Uint8Array.from(atob(response.content.replace(/\s/g, '')), char => char.charCodeAt(0))));
  }
  async connect(token: string, sourceToken = '') {
    this.token = token.trim();
    this.sourceToken = sourceToken.trim();
    if (!this.token) throw new Error('请输入 GitHub 访问令牌。');
    try { const repo = await this.api(contentRepository); if (!repo.permissions?.push) throw new Error('当前 GitHub 账号没有此仓库的编辑权限。'); return await this.load(); }
    catch (error) { this.disconnect(); throw error; }
  }
  async load(): Promise<Snapshot> {
    const ref = await this.api(`${contentRepository}/git/ref/heads/main`);
    const projects: Project[] = await this.json(dataPath, contentRepository, ref.object.sha);
    const thumbnails: Record<string, string> = {};
    for (const photo of projects.flatMap(p => p.images)) {
      const asset = this.published[photo.id];
      if (asset?.original === photo.src) thumbnails[photo.id] = `${asset.base}-320.webp`;
      else {
        if (!this.previews.has(photo.src)) {
          const bytes = await this.api(`${contentRepository}/contents/public${photo.src}?ref=${ref.object.sha}`, 'GET', undefined, true);
          this.previews.set(photo.src, URL.createObjectURL(new Blob([bytes])));
        }
        thumbnails[photo.id] = this.previews.get(photo.src)!;
      }
    }
    return this.state = { projects, revision: ref.object.sha, thumbnails };
  }
  private async commit(projects: Project[], message: string, files: Array<{path: string; sha: string}> = []) {
    if (JSON.stringify(projects) === JSON.stringify(this.state.projects) && !files.length) return this.state;
    const head = await this.api(`${contentRepository}/git/ref/heads/main`);
    if (head.object.sha !== this.state.revision) throw new Error('另一个窗口已更新仓库，请刷新内容后重试。');
    const commit = await this.api(`${contentRepository}/git/commits/${head.object.sha}`);
    const tree = await this.api(`${contentRepository}/git/trees`, 'POST', { base_tree: commit.tree.sha, tree: [ ...files.map(file => ({ ...file, mode: '100644', type: 'blob' })), { path: dataPath, mode: '100644', type: 'blob', content: JSON.stringify(projects, null, 2) + '\n' } ] });
    const next = await this.api(`${contentRepository}/git/commits`, 'POST', { message, tree: tree.sha, parents: [head.object.sha] });
    await this.api(`${contentRepository}/git/refs/heads/main`, 'PATCH', { sha: next.sha, force: false });
    return this.load();
  }
  async edit(path: string, slug: string, data: {ids?: string[]; cover?: string}, file?: File) {
    const projects = structuredClone(this.state.projects);
    const project = projects.find(p => p.slug === slug);
    if (!project) throw new Error('项目不存在，请刷新内容。');
    if (path === '/projects-order') return this.commit(reorder(projects, data.ids!), 'Update project order from online editor');
    if (path === '/order') {
      project.images = reorder(project.images, data.ids!);
      if (!project.images.some(p => p.id === data.cover)) throw new Error('封面必须属于当前项目。');
      project.cover = data.cover!;
    } else if (path === '/clear-placeholders') {
      const images = project.images.filter(p => !p.placeholderColor);
      if (!images.length) throw new Error('请先上传照片，再移除色块。');
      project.images = images;
      if (!images.some(p => p.id === project.cover)) project.cover = images[0].id;
    } else if (path === '/upload' && file) {
      const extensions: Record<string, string> = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'};
      const extension = extensions[file.type];
      if (!extension || file.size > 40 * 1024 * 1024) throw new Error('请选择不超过 40 MB 的 JPEG、PNG、WebP 或 AVIF。');
      const size = await this.decode(file); const id = `${slug}-${crypto.randomUUID()}`;
      const image = {id,src:`/images/originals/${slug}/${id}.${extension}`,...size,alt:`${project.title} — ${file.name.replace(/\.[^.]+$/, '').slice(0,150)}`};
      const blob = await this.api(`${contentRepository}/git/blobs`, 'POST', {encoding:'base64',content:base64(new Uint8Array(await file.arrayBuffer()))});
      project.images.push(image); this.previews.set(image.src,URL.createObjectURL(file));
      return this.commit(projects, 'Upload photo from online editor', [{path:`public${image.src}`,sha:blob.sha}]);
    } else throw new Error('不支持的操作。');
    return this.commit(projects, 'Update photo order and cover from online editor');
  }
  startSync() {
    if (this.job.state === 'running') throw new Error('同步正在进行。');
    this.job = {state:'running',message:'正在读取来源仓库…',completed:0,total:0};
    void this.sync().catch(error => { this.job = {...this.job,state:'error',message:error instanceof Error ? error.message : '同步失败，请重试。'}; });
    return this.job;
  }
  private async sync() {
    const ref = await this.api(`${sourceRepository}/git/ref/heads/main`);
    const photos = await this.json('src/data/photos.json',sourceRepository,ref.object.sha);
    const series = await this.json('src/data/series.json',sourceRepository,ref.object.sha);
    const groups = groupsFromData(photos,series);
    const tree = await this.api(`${sourceRepository}/git/trees/${ref.object.sha}?recursive=1`);
    if(tree.truncated) throw new Error('来源仓库目录过大，请使用本地同步。');
    const entries = new Map<string,{sha:string;type:string;mode:string}>(tree.tree.map((entry: {path:string;sha:string;type:string;mode:string})=>[entry.path,entry]));
    const projects = structuredClone(this.state.projects); const files = new Map<string,string>();
    this.job.total = groups.reduce((n,g)=>n+g.photos.length,0); let added=0,updated=0;
    for(const group of groups) {
      const incoming: PortfolioImage[]=[];
      for(const photo of group.photos) {
        this.job.message=`正在同步 ${this.job.completed+1} / ${this.job.total}：${group.title}`;
        const entry=entries.get(`public${photo.image}`);
        if(!entry || entry.type!=='blob' || entry.mode!=='100644' || !/^\/images\/[^\x00-\x1f\\]+\.(jpe?g|png|webp|avif)$/i.test(photo.image) || photo.image.split('/').includes('..')) throw new Error(`原图路径无效：${photo.id}`);
        const id=`gh-${await sha(`${sourceRepository}:${group.key}:${photo.id}`)}`;
        const existing=projects.flatMap(p=>p.images).find(p=>p.id===id);
        if(existing?.github?.blob===entry.sha && existing.github.path===photo.image) incoming.push(existing);
        else {
          const bytes:Uint8Array=await this.api(`${sourceRepository}/git/blobs/${entry.sha}`,'GET',undefined,true);
          if(bytes.length>40*1024*1024) throw new Error('来源照片超过 40 MB，请使用本地同步。');
          const blob=new Blob([bytes as BlobPart]); const size=await this.decode(blob);
          const src=`/images/originals/github/${entry.sha}.${photo.image.split('.').pop()!.toLowerCase()}`;
          const file=await this.api(`${contentRepository}/git/blobs`,'POST',{encoding:'base64',content:base64(bytes)});
          files.set(`public${src}`,file.sha); this.previews.set(src,URL.createObjectURL(blob));
          incoming.push({id,src,...size,alt:photo.alt||photo.title||group.title,github:{repository:sourceRepository,photoId:photo.id,path:photo.image,blob:entry.sha}});
        }
        this.job.completed++;
      }
      const counts=mergeGroup(projects,group,incoming,`github-${await sha(group.key)}`); added+=counts.added;updated+=counts.updated;
    }
    await this.commit(projects,'Sync source photographs from GitHub',Array.from(files,([path,sha])=>({path,sha})));
    this.job={...this.job,state:'complete',message:`已保存到 GitHub：新增 ${added} 张，更新 ${updated} 张。本地顺序和封面已保留。网站将在部署完成后更新。`};
  }
}
