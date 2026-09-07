import type {Project, PortfolioImage} from '../data/projects';
export const repository = 'davidtaotao0711/bo-photography';
export class EditorError extends Error { constructor(message: string, public status = 400) { super(message); } }
type RemotePhoto = { id: string; image: string; series?: string; alt?: string; title?: string; order?: number };
type RemoteSeries = { slug: string; title: string; year?: string; description?: string; coverImage?: string; order?: number };
export type Group = { key: string; title: string; year: string; description: string; cover?: string; photos: RemotePhoto[] };
export function samePhoto(a: PortfolioImage, b: PortfolioImage) {
  return a.id === b.id || Boolean(a.github && b.github && a.github.repository === b.github.repository && a.github.photoId === b.github.photoId);
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
