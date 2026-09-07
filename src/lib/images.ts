import manifestData from '../data/image-manifest.json';
import type { PortfolioImage } from '../data/projects';
export type ImageAsset = { width: number; height: number; tiny: string; base: string; widths: number[] };
const manifest = manifestData as Record<string, ImageAsset>;
export function asset(image: PortfolioImage) { return manifest[image.id]; }
export function srcset(image: ImageAsset, format: string, thumbnail = false) {
  return image.widths.filter(w => !thumbnail || w <= 320).map(w => `${image.base}-${w}.${format} ${w}w`).join(', ');
}
export const overviewSizes = '(max-width: 600px) calc((90vw - 48px) / 4), (max-width: 1000px) calc((97vw - 78px) / 6), calc((97vw - 130px) / 10)';
export const indexSizes = '(max-width: 600px) calc((90vw - 24px) / 2), (max-width: 1000px) 31vw, 19vw';
