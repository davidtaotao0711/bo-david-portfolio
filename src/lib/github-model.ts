import type {Project, PortfolioImage} from '../data/projects';
export const repository = 'davidtaotao0711/bo-photography';
export class EditorError extends Error { constructor(message: string, public status = 400) { super(message); } }
type RemotePhoto = { id: string; image: string; series?: string; alt?: string; title?: string; order?: number };
type RemoteSeries = { slug: string; title: string; year?: string; description?: string; coverImage?: string; order?: number };
export type Group = { key: string; title: string; year: string; description: string; cover?: string; photos: RemotePhoto[] };
export function groupsFromData(photos: RemotePhoto[], series: RemoteSeries[]): Group[] {
  if (!Array.isArray(photos) || !Array.isArray(series) || !photos.length || photos.length > 10000) throw new EditorError('GitHub 照片数据格式不正确。');
  if (new Set(photos.map(p => p.id)).size !== photos.length || photos.some(p => !p.id || typeof p.id !== 'string' || typeof p.image !== 'string')) throw new EditorError('GitHub 照片编号或路径无效。');
  if (new Set(series.map(s => s.slug)).size !== series.length || series.some(s => !s.slug || typeof s.slug !== 'string' || !s.title)) throw new EditorError('GitHub 系列数据格式不正确。');
  const ordered = [...photos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const groups: Group[] = [...series].sort((a,b) => (a.order ?? 0) - (b.order ?? 0)).map(s => {
    const members = ordered.filter(p => p.series === s.slug);
    const cover = photos.find(p => p.image === s.coverImage);
    if (cover && !members.some(p => p.id === cover.id)) members.unshift(cover);
    return { key: `series:${s.slug}`, title: s.title, year: s.year ?? '', description: s.description ?? '', cover: cover?.id, photos: members };
  });
  const unassigned = ordered.filter(p => !series.some(s => s.slug === p.series));
  if (unassigned.length) groups.push({ key: 'unassigned', title: 'Unassigned', year: '', description: '', photos: unassigned });
  return groups.filter(g => g.photos.length);
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
    const existing = project.images.find(p => p.github?.repository === repository && p.github.photoId === image.github?.photoId);
    if (!existing) { project.images.push(image); added++; }
    else if (existing.github?.blob !== image.github?.blob || existing.github?.path !== image.github?.path) {
      Object.assign(existing, { src: image.src, width: image.width, height: image.height, github: image.github }); updated++;
    }
  }
  return { added, updated };
}
