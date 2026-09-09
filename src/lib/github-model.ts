import type {Project, PortfolioImage} from '../data/projects';
export const repository = 'davidtaotao0711/bo-photography';
export class EditorError extends Error { constructor(message: string, public status = 400) { super(message); } }
type RemotePhoto = { id: string; image: string; series?: string; alt?: string; title?: string; order?: number };
type RemoteSeries = { slug: string; title: string; year?: string; description?: string; coverImage?: string; order?: number };
export type Group = { key: string; title: string; year: string; description: string; cover?: string; photos: RemotePhoto[] };
export function samePhoto(a: PortfolioImage, b: PortfolioImage) {
  return a.id === b.id || Boolean(a.github && b.github && a.github.repository === b.github.repository && a.github.photoId === b.github.photoId);
}
export function setArrangement(projects: Project[], slug: string, value: unknown) {
  const project = projects.find(p => p.slug === slug);
  if (!project || project.github?.key === 'unassigned') throw new EditorError('请选择一个作品项目。');
  if (value !== 'color' && value !== 'theme') throw new EditorError('请选择颜色或主题分类。');
  project.arrangement = value;
}
export function createProject(projects: Project[], title: unknown, fallbackId: string, arrangement: unknown = 'color') {
  if (arrangement !== 'color' && arrangement !== 'theme') throw new EditorError('请选择颜色或主题分类。');
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 80) throw new EditorError('请输入 1–80 个字的项目名称。');
  title = title.trim();
  if (String(title).toLowerCase() === 'unassigned') throw new EditorError('Unassigned 是照片总库，请使用其他名称。');
  const base = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '') || fallbackId;
  let slug = base, suffix = 2;
  const reserved = ['editor', 'information', 'images', 'assets', 'api', 'unassigned', 'unsorted-by-color', 'unsorted-by-theme'];
  while (reserved.includes(slug) || projects.some(p => p.id === slug || p.slug === slug)) slug = `${base}-${suffix++}`;
  const project: Project = {id:slug,slug,title:String(title),year:'',location:'',description:'',cover:'',images:[],arrangement};
  const libraryIndex = projects.findIndex(p => p.github?.key === 'unassigned');
  projects.splice(libraryIndex < 0 ? projects.length : libraryIndex, 0, project);
  return project;
}
function preserveInLibrary(projects: Project[], images: PortfolioImage[]) {
  let library = projects.find(p => p.github?.repository === repository && p.github.key === 'unassigned');
  if (!library) {
    let id = 'unassigned';
    while (projects.some(p => p.id === id || p.slug === id)) id += '-library';
    library = {id,slug:id,title:'Unassigned',year:'',location:'',description:'',cover:'',images:[],github:{repository,key:'unassigned'}};
    projects.push(library);
  }
  for (const image of images) if (!image.placeholderColor && !library.images.some(p => samePhoto(p, image))) library.images.push(structuredClone(image));
  if (!library.images.some(p => p.id === library.cover)) library.cover = library.images[0]?.id ?? '';
}
export function deleteProject(projects: Project[], slug: string) {
  const target = projects.find(p => p.slug === slug);
  if (!target) throw new EditorError('项目不存在，请刷新编辑器。', 404);
  if (target.github?.key === 'unassigned') throw new EditorError('Unassigned 是照片总库，不能删除。');
  preserveInLibrary(projects, target.images);
  projects.splice(projects.indexOf(target), 1);
}
export function removePhotos(projects: Project[], slug: string, ids: unknown) {
  const target = projects.find(p => p.slug === slug);
  if (!target) throw new EditorError('项目不存在。', 404);
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !target.images.some(p => p.id === id))) throw new EditorError('照片已发生变化，请刷新后重试。');
  const removed = target.images.filter(p => ids.includes(p.id));
  if (target.github?.key !== 'unassigned') preserveInLibrary(projects, removed);
  target.images = target.images.filter(p => !ids.includes(p.id));
  if (!target.images.some(p => p.id === target.cover)) target.cover = target.images[0]?.id ?? '';
}
export function groupsFromData(photos: RemotePhoto[], series: RemoteSeries[]): Group[] {
  if (!Array.isArray(photos) || !Array.isArray(series) || !photos.length || photos.length > 10000) throw new EditorError('GitHub 照片数据格式不正确。');
  if (new Set(photos.map(p => p.id)).size !== photos.length || photos.some(p => !p.id || typeof p.id !== 'string' || typeof p.image !== 'string')) throw new EditorError('GitHub 照片编号或路径无效。');
  if (new Set(series.map(s => s.slug)).size !== series.length || series.some(s => !s.slug || typeof s.slug !== 'string' || !s.title)) throw new EditorError('GitHub 系列数据格式不正确。');
  const ordered = [...photos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return [{ key: 'unassigned', title: 'Unassigned', year: '', description: '', photos: ordered }];
}

export function addFromUnassigned(projects: Project[], slug: string, ids: unknown) {
  const target = projects.find(p => p.slug === slug);
  const library = projects.find(p => p.github?.repository === repository && p.github.key === 'unassigned');
  if (!target || !library || target === library) throw new EditorError('请选择接收照片的项目。');
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !library.images.some(image => image.id === id))) throw new EditorError('请选择 Unassigned 中的照片。');
  for (const id of ids) {
    const photo = library.images.find(image => image.id === id)!;
    if (!target.images.some(image => samePhoto(image, photo))) target.images.push(structuredClone(photo));
  }
  if (!target.images.some(image => image.id === target.cover)) target.cover = target.images[0].id;
}

// Existing local choices win. Remote removal is deliberately non-destructive.
export function mergeGroup(projects: Project[], group: Group, incoming: PortfolioImage[], projectId: string) {
  let project = projects.find(p => p.github?.repository === repository && p.github.key === group.key);
  let added = 0, updated = 0;
  if (!project) {
    const id = projectId;
    let slug = id;
    while (projects.some(p => p.slug === slug || p.id === slug)) slug += '-import';
    project = { id: slug, slug, title: group.title, year: group.year, location: '', description: group.description, cover: incoming.find(p => p.github?.photoId === group.cover)?.id ?? incoming[0].id, images: [], github: { repository, key: group.key } };
    projects.push(project);
  }
  for (const image of incoming) {
    // Refresh every use of a library photo without changing project order or covers.
    for (const other of projects.filter(p => p !== project)) {
      const copy = other.images.find(p => p.github?.repository === repository && p.github.photoId === image.github?.photoId);
      if (copy) Object.assign(copy, { src: image.src, width: image.width, height: image.height, github: structuredClone(image.github) });
    }
    const existing = project.images.find(p => p.github?.repository === repository && p.github.photoId === image.github?.photoId);
    if (!existing) { project.images.push(image); added++; }
    else if (existing.github?.blob !== image.github?.blob || existing.github?.path !== image.github?.path) {
      Object.assign(existing, { src: image.src, width: image.width, height: image.height, github: image.github }); updated++;
    }
  }
  return { added, updated };
}
