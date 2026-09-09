import type { Project, PortfolioImage } from '../data/projects';
export type Arrangement = 'color' | 'theme';
export const photoKey = (photo: PortfolioImage) => photo.github ? `${photo.github.repository}:${photo.github.photoId}` : photo.id;
export function arrangedProjects(all: Project[], arrangement: Arrangement): Project[] {
  return all.filter(p => p.github?.key !== 'unassigned' && !['unassigned','unsorted-by-color','unsorted-by-theme'].includes(p.slug) && p.images.length > 0 && (p.arrangement ?? 'color') === arrangement);
}
