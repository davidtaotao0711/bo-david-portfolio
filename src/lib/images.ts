import manifestData from '../data/image-manifest.json';
import type { PortfolioImage } from '../data/projects';
import { withBase } from './base-path';
export type ImageAsset = { width: number; height: number; tiny: string; base: string; widths: number[] };
const manifest = manifestData as Record<string, ImageAsset>;
export function asset(image: PortfolioImage) { return manifest[image.id]; }
export function imageUrl(image: ImageAsset, width: number, format: string, base = '/') {
  return withBase(`${image.base}-${width}.${format}`, base);
}
export function srcset(image: ImageAsset, format: string, thumbnail = false, base = '/') {
  return image.widths.filter(w => !thumbnail || w <= 640).map(w => `${imageUrl(image, w, format, base)} ${w}w`).join(', ');
}
export const overviewSizes = (image: Pick<PortfolioImage, 'width' | 'height'>) => image.width > image.height
  ? '(max-width: 600px) calc((90vw - 27px) / 2), (max-width: 1000px) calc((97vw - 52px) / 4), calc((97vw - 78px) / 6)'
  : '(max-width: 600px) calc((90vw - 39px) / 3), (max-width: 1000px) calc((97vw - 78px) / 6), calc((97vw - 117px) / 9)';
export const indexSizes = '(max-width: 600px) calc((90vw - 24px) / 2), (max-width: 1000px) 31vw, 19vw';
