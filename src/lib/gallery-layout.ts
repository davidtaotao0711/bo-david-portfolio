import type { Project, PortfolioImage } from '../data/projects';
export type Orientation = 'portrait' | 'landscape' | 'square';
export type LayoutSlot = {kind:'photo';id:string} | {kind:'blank';id:string;orientation:'portrait'|'landscape'};
export const orientation = (image: Pick<PortfolioImage,'width'|'height'>): Orientation => image.width < image.height ? 'portrait' : image.width > image.height ? 'landscape' : 'square';
export const frameRatio = (image: Pick<PortfolioImage,'width'|'height'>) => ({portrait:'2/3',landscape:'3/2',square:'1/1'})[orientation(image)];

// Keep blank positions while ordinary sorting, additions and removals update real photos.
export function projectLayout(project: Project): LayoutSlot[] {
  const ids = new Set(project.images.map(image => image.id));
  const seen = new Set<string>();
  let index = 0;
  const result: LayoutSlot[] = [];
  for (const slot of project.layout ?? []) {
    if (seen.has(slot.id)) continue;
    seen.add(slot.id);
    if (slot.kind === 'blank') result.push({...slot});
    else if (ids.has(slot.id) && index < project.images.length) result.push({kind:'photo',id:project.images[index++].id});
  }
  for (; index < project.images.length; index++) result.push({kind:'photo',id:project.images[index].id});
  return result;
}
export function galleryRuns(project: Project, slots = projectLayout(project)) {
  const images = new Map(project.images.map(image => [image.id,image]));
  const runs: {orientation:Orientation;slots:LayoutSlot[]}[] = [];
  for (const slot of slots) {
    const image = images.get(slot.id);
    if (slot.kind === 'photo' && !image) continue;
    const direction = slot.kind === 'blank' ? slot.orientation : orientation(image!);
    if (runs.at(-1)?.orientation !== direction) runs.push({orientation:direction,slots:[]});
    runs.at(-1)!.slots.push(slot);
  }
  return runs;
}
export function saveProjectLayout(project: Project, value: unknown) {
  if (project.github?.key === 'unassigned') throw new Error('总库不需要排版，请选择作品项目。');
  if (!Array.isArray(value) || value.length > project.images.length + 500) throw new Error('排版数据不正确或空白过多。');
  const ids = new Set<string>();
  const photos = new Map(project.images.map(image => [image.id,image]));
  const layout: LayoutSlot[] = value.map(slot => {
    if (!slot || typeof slot.id !== 'string' || slot.id.length > 180 || ids.has(slot.id)) throw new Error('排版位置重复或无效。');
    ids.add(slot.id);
    if (slot.kind === 'photo' && photos.has(slot.id)) return {kind:'photo',id:slot.id};
    if (slot.kind === 'blank' && /^blank-[a-zA-Z0-9-]+$/.test(slot.id) && !photos.has(slot.id) && ['portrait','landscape'].includes(slot.orientation)) return {kind:'blank',id:slot.id,orientation:slot.orientation};
    throw new Error('排版包含无效照片或空白位置。');
  });
  const ordered = layout.filter(slot => slot.kind === 'photo').map(slot => photos.get(slot.id)!);
  if (ordered.length !== project.images.length) throw new Error('排版必须保留项目中的每张照片。');
  project.layout = layout; project.images = ordered;
}
